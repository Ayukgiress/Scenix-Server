import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

export const EXPORT_QUEUE = 'export';

export interface ExportJobPayload {
  exportJobId: string;
  userId: string;
  projectId: string;
}

interface ClipMeta {
  sourceUrl: string;
  startTimeMs: number;
  durationMs: number;
  speed: number;
  metadata?: Record<string, unknown>;
  keyframes?: Record<string, unknown>;
}

const RESOLUTION_MAP: Record<string, string> = {
  HD_1080P: '1920x1080',
  QHD_1440P: '2560x1440',
  UHD_4K: '3840x2160',
  UHD_8K: '7680x4320',
};

const FPS_MAP: Record<string, number> = {
  FPS_24: 24,
  FPS_30: 30,
  FPS_60: 60,
};

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', ...args], { stdio: 'pipe' });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function buildClipFilter(
  clip: ClipMeta,
  idx: number,
): { inputArgs: string[]; filterParts: string[]; outLabel: string } {
  const meta = clip.metadata ?? {};
  const speed = clip.speed ?? 1;

  const inputArgs = [
    '-ss',
    String(clip.startTimeMs / 1000),
    '-t',
    String(clip.durationMs / 1000),
    '-i',
    clip.sourceUrl,
  ];

  const filters: string[] = [];
  const vIn = `[${idx}:v]`;

  // Speed via setpts + atempo
  if (speed !== 1) {
    filters.push(`${vIn}setpts=${(1 / speed).toFixed(4)}*PTS[v${idx}speed]`);
  }

  const vAfterSpeed = speed !== 1 ? `[v${idx}speed]` : vIn;

  // Chroma key
  const chroma = meta.chromaKey as
    | { color?: string; similarity?: number; blend?: number }
    | undefined;
  if (chroma?.color) {
    const similarity = chroma.similarity ?? 0.3;
    const blend = chroma.blend ?? 0.1;
    filters.push(
      `${vAfterSpeed}chromakey=${chroma.color}:${similarity}:${blend}[v${idx}chroma]`,
    );
  }

  const vAfterChroma = chroma?.color ? `[v${idx}chroma]` : vAfterSpeed;

  // Color grade (curves / eq)
  const grade = meta.colorGrade as
    | {
        brightness?: number;
        contrast?: number;
        saturation?: number;
        hue?: number;
      }
    | undefined;

  if (grade) {
    const brightness = grade.brightness ?? 0;
    const contrast = grade.contrast ?? 1;
    const saturation = grade.saturation ?? 1;
    const hue = grade.hue ?? 0;
    filters.push(
      `${vAfterChroma}eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}:hue=${hue}[v${idx}grade]`,
    );
  }

  const outLabel = grade
    ? `[v${idx}grade]`
    : chroma?.color
      ? `[v${idx}chroma]`
      : speed !== 1
        ? `[v${idx}speed]`
        : vIn;

  return { inputArgs, filterParts: filters, outLabel };
}

@Processor(EXPORT_QUEUE)
export class ExportProcessor {
  private readonly logger = new Logger(ExportProcessor.name);

  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
  ) {}

  @Process()
  async handleExport(job: Job<ExportJobPayload>) {
    const { exportJobId, userId, projectId } = job.data;
    this.logger.log(`Processing export job ${exportJobId}`);

    await this.prisma.exportJob.update({
      where: { id: exportJobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    this.events.emitToUser(userId, 'export:progress', {
      exportJobId,
      progress: 0,
      status: 'RUNNING',
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenix-export-'));
    const outputFile = path.join(tmpDir, `${exportJobId}.mp4`);

    try {
      const exportJob = await this.prisma.exportJob.findUniqueOrThrow({
        where: { id: exportJobId },
      });
      const clips = await this.prisma.timelineClip.findMany({
        where: { projectId },
        orderBy: [{ trackIndex: 'asc' }, { startTimeMs: 'asc' }],
        include: { mediaAsset: true },
      });

      const subtitles = await this.prisma.subtitleTrack.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
      });

      const resolution = RESOLUTION_MAP[exportJob.resolution] ?? '3840x2160';
      const fps = FPS_MAP[exportJob.fps] ?? 30;
      const [width, height] = resolution.split('x').map(Number);

      // Write subtitle VTT if present
      let vttPath: string | null = null;
      if (subtitles.length > 0) {
        vttPath = path.join(tmpDir, 'subtitles.vtt');
        fs.writeFileSync(vttPath, subtitles[0].vttContent, 'utf8');
      }

      await job.progress(10);
      await this.prisma.exportJob.update({
        where: { id: exportJobId },
        data: { progress: 10 },
      });
      this.events.emitToUser(userId, 'export:progress', {
        exportJobId,
        progress: 10,
        status: 'RUNNING',
      });

      const videoClips: ClipMeta[] = clips
        .filter(
          (c) =>
            c.mediaAsset?.type === 'VIDEO' &&
            c.mediaAsset.sourceUrl &&
            c.durationMs,
        )
        .map((c) => ({
          sourceUrl: c.mediaAsset!.sourceUrl,
          startTimeMs: c.startTimeMs,
          durationMs: c.durationMs!,
          speed: (c as unknown as { speed: number }).speed ?? 1,
          metadata: (c.metadata as Record<string, unknown>) ?? {},
        }));

      if (videoClips.length === 0) {
        throw new Error('No video clips found in project');
      }

      // Build FFmpeg complex filter
      const allInputArgs: string[] = [];
      const allFilterParts: string[] = [];
      const outLabels: string[] = [];

      for (let i = 0; i < videoClips.length; i++) {
        const { inputArgs, filterParts, outLabel } = buildClipFilter(
          videoClips[i],
          i,
        );
        allInputArgs.push(...inputArgs);
        allFilterParts.push(...filterParts);
        outLabels.push(outLabel);
      }

      // Concat all clips
      const concatInputs = outLabels.join('');
      const filterComplex =
        (allFilterParts.length ? allFilterParts.join(';') + ';' : '') +
        `${concatInputs}concat=n=${videoClips.length}:v=1:a=0[vout]`;

      const ffmpegArgs: string[] = [
        ...allInputArgs,
        '-filter_complex',
        filterComplex,
        '-map',
        '[vout]',
        '-s',
        resolution,
        '-r',
        String(fps),
        '-c:v',
        exportJob.proRes ? 'prores_ks' : 'libx264',
        ...(exportJob.proRes
          ? ['-profile:v', '3']
          : ['-preset', exportJob.twoPass ? 'slow' : 'medium', '-crf', '18']),
      ];

      // Burn subtitles if present
      if (vttPath) {
        ffmpegArgs.push('-vf', `subtitles=${vttPath}`);
      }

      ffmpegArgs.push(outputFile);

      if (exportJob.twoPass && !exportJob.proRes) {
        const passLog = path.join(tmpDir, 'ffmpeg2pass');
        await runFfmpeg([
          ...allInputArgs,
          '-filter_complex',
          filterComplex,
          '-map',
          '[vout]',
          '-s',
          resolution,
          '-r',
          String(fps),
          '-c:v',
          'libx264',
          '-b:v',
          '8M',
          '-pass',
          '1',
          '-passlogfile',
          passLog,
          '-an',
          '-f',
          'null',
          '/dev/null',
        ]);
        await job.progress(55);
        this.events.emitToUser(userId, 'export:progress', {
          exportJobId,
          progress: 55,
          status: 'RUNNING',
        });

        await runFfmpeg([
          ...allInputArgs,
          '-filter_complex',
          filterComplex,
          '-map',
          '[vout]',
          '-s',
          resolution,
          '-r',
          String(fps),
          '-c:v',
          'libx264',
          '-b:v',
          '8M',
          '-pass',
          '2',
          '-passlogfile',
          passLog,
          outputFile,
        ]);
      } else {
        await runFfmpeg(ffmpegArgs);
      }

      await job.progress(90);
      this.events.emitToUser(userId, 'export:progress', {
        exportJobId,
        progress: 90,
        status: 'RUNNING',
      });

      // TODO: upload outputFile to storage and get outputUrl
      const outputUrl = `/exports/${exportJobId}.mp4`;

      await this.prisma.exportJob.update({
        where: { id: exportJobId },
        data: {
          status: 'SUCCEEDED',
          progress: 100,
          completedAt: new Date(),
          outputUrl,
        },
      });

      await this.prisma.activity.create({
        data: {
          userId,
          projectId,
          action: 'EXPORT_COMPLETED',
          metadata: { exportJobId },
        },
      });

      this.events.emitToUser(userId, 'export:completed', {
        exportJobId,
        outputUrl,
      });
      this.logger.log(`Export job ${exportJobId} succeeded`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Export job ${exportJobId} failed: ${errorMessage}`);

      await this.prisma.exportJob.update({
        where: { id: exportJobId },
        data: { status: 'FAILED', errorMessage, completedAt: new Date() },
      });

      await this.prisma.activity.create({
        data: {
          userId,
          projectId,
          action: 'EXPORT_FAILED',
          metadata: { exportJobId, errorMessage },
        },
      });

      this.events.emitToUser(userId, 'export:failed', {
        exportJobId,
        errorMessage,
      });
      throw err;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
