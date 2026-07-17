import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

export const EXPORT_QUEUE = 'export';

export interface ExportJobPayload {
  exportJobId: string;
  userId: string;
  projectId: string;
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

    this.events.emitToUser(userId, 'export:progress', { exportJobId, progress: 0, status: 'RUNNING' });

    try {
      // Simulate progress — replace with real FFmpeg/render pipeline
      for (const progress of [25, 50, 75, 100]) {
        await job.progress(progress);
        await this.prisma.exportJob.update({
          where: { id: exportJobId },
          data: { progress },
        });
        this.events.emitToUser(userId, 'export:progress', { exportJobId, progress, status: 'RUNNING' });
        await new Promise((r) => setTimeout(r, 500));
      }

      await this.prisma.exportJob.update({
        where: { id: exportJobId },
        data: { status: 'SUCCEEDED', progress: 100, completedAt: new Date() },
      });

      await this.prisma.activity.create({
        data: { userId, projectId, action: 'EXPORT_COMPLETED', metadata: { exportJobId } },
      });

      this.events.emitToUser(userId, 'export:completed', { exportJobId });
      this.logger.log(`Export job ${exportJobId} succeeded`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Export job ${exportJobId} failed: ${errorMessage}`);

      await this.prisma.exportJob.update({
        where: { id: exportJobId },
        data: { status: 'FAILED', errorMessage, completedAt: new Date() },
      });

      await this.prisma.activity.create({
        data: { userId, projectId, action: 'EXPORT_FAILED', metadata: { exportJobId, errorMessage } },
      });

      this.events.emitToUser(userId, 'export:failed', { exportJobId, errorMessage });
      throw err;
    }
  }
}
