import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubtitleDto } from './dto/create-subtitle.dto';

@Injectable()
export class SubtitlesService {
  constructor(private prisma: PrismaService) {}

  private srtToVtt(srt: string): string {
    return (
      'WEBVTT\n\n' +
      srt
        .trim()
        .replace(/\r\n/g, '\n')
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
        .replace(/^\d+\n/gm, '')
        .trim()
    );
  }

  private async assertProjectOwner(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.userId !== userId) throw new ForbiddenException();
  }

  async create(projectId: string, userId: string, dto: CreateSubtitleDto) {
    await this.assertProjectOwner(projectId, userId);

    if (!dto.srtContent.trim())
      throw new BadRequestException('srtContent is empty');

    return this.prisma.subtitleTrack.create({
      data: {
        projectId,
        label: dto.label ?? 'Subtitles',
        language: dto.language ?? 'en',
        srtContent: dto.srtContent,
        vttContent: this.srtToVtt(dto.srtContent),
      },
    });
  }

  async findAll(projectId: string, userId: string) {
    await this.assertProjectOwner(projectId, userId);
    return this.prisma.subtitleTrack.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(projectId: string, trackId: string, userId: string) {
    await this.assertProjectOwner(projectId, userId);
    const track = await this.prisma.subtitleTrack.findFirst({
      where: { id: trackId, projectId },
    });
    if (!track) throw new NotFoundException('Subtitle track not found');
    return track;
  }

  async remove(projectId: string, trackId: string, userId: string) {
    await this.findOne(projectId, trackId, userId);
    await this.prisma.subtitleTrack.delete({ where: { id: trackId } });
    return { message: 'Subtitle track deleted' };
  }

  async exportVtt(
    projectId: string,
    trackId: string,
    userId: string,
  ): Promise<string> {
    const track = await this.findOne(projectId, trackId, userId);
    return track.vttContent;
  }
}
