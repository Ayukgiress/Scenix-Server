import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateClipDto } from './dto/create-clip.dto';
import { UpdateClipDto } from './dto/update-clip.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
  ) {}

  async create(userId: string, dto: CreateProjectDto) {
    const project = await this.prisma.project.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        thumbnailUrl: dto.thumbnailUrl,
        hue: dto.hue,
        editorState: (dto.editorState ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.prisma.activity.create({
      data: {
        userId,
        projectId: project.id,
        action: 'PROJECT_CREATED',
      },
    });

    return project;
  }

  async findAll(
    userId: string,
    query: {
      status?: string;
      search?: string;
      sort?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Record<string, unknown> = { userId };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy: { updatedAt: query.sort ?? 'desc' },
        take: query.limit ?? 20,
        skip: query.offset ?? 0,
        include: {
          _count: { select: { clips: true, media: true, exportJobs: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      projects,
      total,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    };
  }

  async findOne(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        clips: { orderBy: { trackIndex: 'asc' } },
        media: { orderBy: { createdAt: 'desc' } },
        _count: { select: { clips: true, media: true, exportJobs: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.userId !== userId) throw new ForbiddenException();
    return project;
  }

  async update(projectId: string, userId: string, dto: UpdateProjectDto) {
    const existing = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    if (!existing) throw new NotFoundException('Project not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    const updateData: Prisma.ProjectUpdateInput = {
      lastActivityAt: new Date(),
    };
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.thumbnailUrl !== undefined)
      updateData.thumbnailUrl = dto.thumbnailUrl;
    if (dto.hue !== undefined) updateData.hue = dto.hue;
    if (dto.editorState !== undefined)
      updateData.editorState = dto.editorState as Prisma.InputJsonValue;
    if (dto.status !== undefined) updateData.status = dto.status;

    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: updateData,
    });

    await this.prisma.activity.create({
      data: {
        userId,
        projectId: project.id,
        action: 'PROJECT_UPDATED',
      },
    });

    this.events.emitToProject(projectId, 'project:updated', project);
    if (dto.title !== undefined) {
      this.events.emitToProject(projectId, 'project:renamed', {
        id: project.id,
        title: project.title,
      });
    }

    return project;
  }

  async remove(projectId: string, userId: string) {
    const existing = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    if (!existing) throw new NotFoundException('Project not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    await this.prisma.project.delete({ where: { id: projectId } });

    await this.prisma.activity.create({
      data: { userId, action: 'PROJECT_DELETED', metadata: { projectId } },
    });

    return { message: 'Project deleted' };
  }

  async createClip(projectId: string, userId: string, dto: CreateClipDto) {
    await this.findOne(projectId, userId);

    if (dto.mediaAssetId) {
      const asset = await this.prisma.mediaAsset.findUnique({
        where: { id: dto.mediaAssetId },
      });
      if (!asset) throw new NotFoundException('Media asset not found');
    }

    return this.prisma.timelineClip
      .create({
        data: {
          projectId,
          mediaAssetId: dto.mediaAssetId,
          trackIndex: dto.trackIndex ?? 0,
          zIndex: dto.zIndex ?? 0,
          startTimeMs: dto.startTimeMs ?? 0,
          durationMs: dto.durationMs,
          x: dto.x ?? 0,
          y: dto.y ?? 0,
          width: dto.width,
          height: dto.height,
          rotation: dto.rotation ?? 0,
          opacity: dto.opacity ?? 1,
          speed: dto.speed ?? 1,
          transform: dto.transform as Prisma.InputJsonValue | undefined,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
          keyframes: dto.keyframes as Prisma.InputJsonValue | undefined,
        },
      })
      .then((clip) => {
        this.events.emitToProject(projectId, 'clip:created', clip);
        return clip;
      });
  }

  async findAllClips(projectId: string, userId: string) {
    await this.findOne(projectId, userId);

    return this.prisma.timelineClip.findMany({
      where: { projectId },
      orderBy: [{ trackIndex: 'asc' }, { zIndex: 'asc' }],
      include: { mediaAsset: true },
    });
  }

  async updateClip(
    clipId: string,
    projectId: string,
    userId: string,
    dto: UpdateClipDto,
  ) {
    await this.findOne(projectId, userId);

    const clip = await this.prisma.timelineClip.findFirst({
      where: { id: clipId, projectId },
    });
    if (!clip) throw new NotFoundException('Clip not found');

    const updateData: Prisma.TimelineClipUncheckedUpdateInput = {};
    if (dto.mediaAssetId != null) updateData.mediaAssetId = dto.mediaAssetId;
    if (dto.trackIndex !== undefined) updateData.trackIndex = dto.trackIndex;
    if (dto.zIndex !== undefined) updateData.zIndex = dto.zIndex;
    if (dto.startTimeMs !== undefined) updateData.startTimeMs = dto.startTimeMs;
    if (dto.durationMs !== undefined) updateData.durationMs = dto.durationMs;
    if (dto.x !== undefined) updateData.x = dto.x;
    if (dto.y !== undefined) updateData.y = dto.y;
    if (dto.width !== undefined) updateData.width = dto.width;
    if (dto.height !== undefined) updateData.height = dto.height;
    if (dto.rotation !== undefined) updateData.rotation = dto.rotation;
    if (dto.opacity !== undefined) updateData.opacity = dto.opacity;
    if (dto.speed !== undefined) updateData.speed = dto.speed;
    if (dto.transform !== undefined)
      updateData.transform = dto.transform as Prisma.InputJsonValue;
    if (dto.metadata !== undefined)
      updateData.metadata = dto.metadata as Prisma.InputJsonValue;
    if (dto.keyframes !== undefined)
      updateData.keyframes = dto.keyframes as Prisma.InputJsonValue;

    return this.prisma.timelineClip
      .update({
        where: { id: clipId },
        data: updateData,
      })
      .then((clip) => {
        this.events.emitToProject(projectId, 'clip:updated', clip);
        return clip;
      });
  }

  async removeClip(clipId: string, projectId: string, userId: string) {
    await this.findOne(projectId, userId);

    const clip = await this.prisma.timelineClip.findFirst({
      where: { id: clipId, projectId },
    });
    if (!clip) throw new NotFoundException('Clip not found');

    await this.prisma.timelineClip.delete({ where: { id: clipId } });
    this.events.emitToProject(projectId, 'clip:deleted', { id: clipId });
    return { message: 'Clip deleted' };
  }

  async findAllActivity(
    projectId: string,
    userId: string,
    query: { limit?: number; offset?: number },
  ) {
    await this.findOne(projectId, userId);

    const [activities, total] = await Promise.all([
      this.prisma.activity.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 50,
        skip: query.offset ?? 0,
      }),
      this.prisma.activity.count({ where: { projectId } }),
    ]);

    return {
      activities,
      total,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
  }
}
