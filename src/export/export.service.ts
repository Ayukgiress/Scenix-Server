import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExportDto } from './dto/create-export.dto';
import { EXPORT_QUEUE, ExportJobPayload } from './export.processor';

@Injectable()
export class ExportService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue(EXPORT_QUEUE) private exportQueue: Queue<ExportJobPayload>,
  ) {}

  async create(userId: string, dto: CreateExportDto) {
    // Verify the project exists and belongs to user
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.userId !== userId) throw new ForbiddenException();

    const job = await this.prisma.exportJob.create({
      data: {
        userId,
        projectId: dto.projectId,
        filename: dto.filename,
        format: dto.format ?? 'MP4',
        resolution: dto.resolution ?? 'UHD_4K',
        fps: dto.fps ?? 'FPS_30',
        proRes: dto.proRes ?? false,
        twoPass: dto.twoPass ?? false,
      },
    });

    await this.prisma.activity.create({
      data: {
        userId,
        projectId: dto.projectId,
        action: 'EXPORT_STARTED',
        metadata: { exportJobId: job.id },
      },
    });

    await this.exportQueue.add(
      { exportJobId: job.id, userId, projectId: dto.projectId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true },
    );

    return job;
  }

  async findAll(
    userId: string,
    query: {
      projectId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Record<string, unknown> = { userId };
    if (query.projectId) where.projectId = query.projectId;
    if (query.status) where.status = query.status;

    const [jobs, total] = await Promise.all([
      this.prisma.exportJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 20,
        skip: query.offset ?? 0,
      }),
      this.prisma.exportJob.count({ where }),
    ]);

    return { jobs, total, limit: query.limit ?? 20, offset: query.offset ?? 0 };
  }

  async findOne(jobId: string, userId: string) {
    const job = await this.prisma.exportJob.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Export job not found');
    if (job.userId !== userId) throw new ForbiddenException();
    return job;
  }

  async cancel(jobId: string, userId: string) {
    const job = await this.findOne(jobId, userId);

    if (job.status === 'SUCCEEDED' || job.status === 'FAILED') {
      throw new BadRequestException('Cannot cancel a completed export job');
    }
    if (job.status === 'CANCELED') {
      throw new BadRequestException('Export job is already canceled');
    }

    const updated = await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'CANCELED' },
    });

    await this.prisma.activity.create({
      data: {
        userId,
        projectId: job.projectId,
        action: 'EXPORT_CANCELED',
        metadata: {
          exportJobId: jobId,
          reason: 'canceled_by_user',
        },
      },
    });

    return updated;
  }
}
