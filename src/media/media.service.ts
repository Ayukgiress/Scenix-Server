import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCloudinaryUploadDto } from './dto/create-cloudinary-upload.dto';
import { CreateMediaDto } from './dto/create-media.dto';
import { CloudinaryStorageService } from '../storage/cloudinary-storage.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class MediaService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryStorageService,
    private events: EventsGateway,
  ) {}

  async create(userId: string, dto: CreateMediaDto) {
    const asset = await this.prisma.mediaAsset.create({
      data: {
        userId,
        projectId: dto.projectId,
        type: dto.type,
        provider: dto.provider ?? 'local',
        providerAssetId: dto.providerAssetId,
        sourceUrl: dto.sourceUrl,
        thumbnailUrl: dto.thumbnailUrl,
        durationMs: dto.durationMs,
        width: dto.width,
        height: dto.height,
        fileSizeBytes:
          dto.fileSizeBytes !== undefined
            ? BigInt(dto.fileSizeBytes)
            : undefined,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    await this.prisma.activity.create({
      data: {
        userId,
        projectId: dto.projectId,
        action: 'MEDIA_UPLOADED',
        metadata: { mediaId: asset.id },
      },
    });

    if (asset.projectId) {
      this.events.emitToProject(asset.projectId, 'media:created', asset);
    }

    return asset;
  }

  async createCloudinaryUpload(userId: string, dto: CreateCloudinaryUploadDto) {
    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        select: { userId: true },
      });

      if (!project) throw new NotFoundException('Project not found');
      if (project.userId !== userId) throw new ForbiddenException();
    }

    return this.cloudinary.createUpload({
      userId,
      type: dto.type,
      filename: dto.filename,
      projectId: dto.projectId,
      fileSizeBytes: dto.fileSizeBytes,
    });
  }

  async getUrl(assetId: string, userId: string) {
    const asset = await this.findOne(assetId, userId);

    if (asset.provider === 'cloudinary' && asset.providerAssetId) {
      return {
        url:
          asset.sourceUrl ||
          this.cloudinary.getSourceUrl(asset.providerAssetId, asset.type),
        provider: asset.provider,
      };
    }

    return {
      url: asset.sourceUrl,
      provider: asset.provider,
    };
  }

  async findAll(
    userId: string,
    query: {
      type?: string;
      projectId?: string;
      search?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Record<string, unknown> = { userId };
    if (query.type) where.type = query.type;
    if (query.projectId) where.projectId = query.projectId;
    if (query.search) {
      where.OR = [
        { sourceUrl: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [assets, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 50,
        skip: query.offset ?? 0,
      }),
      this.prisma.mediaAsset.count({
        where,
      }),
    ]);

    return {
      assets,
      total,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
  }

  async findOne(assetId: string, userId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset) throw new NotFoundException('Media asset not found');
    if (asset.userId !== userId) throw new ForbiddenException();
    return asset;
  }

  async remove(assetId: string, userId: string) {
    const asset = await this.findOne(assetId, userId);

    if (asset.provider === 'cloudinary' && asset.providerAssetId) {
      await this.cloudinary.deleteFile(asset.providerAssetId, asset.type);
    }

    await this.prisma.mediaAsset.delete({ where: { id: assetId } });

    await this.prisma.activity.create({
      data: {
        userId,
        action: 'MEDIA_DELETED',
        metadata: { mediaId: assetId },
      },
    });

    if (asset.projectId) {
      this.events.emitToProject(asset.projectId, 'media:deleted', { id: assetId });
    }

    return { message: 'Media asset deleted' };
  }
}
