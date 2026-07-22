import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubtitlesService } from './subtitles.service';
import { CreateSubtitleDto } from './dto/create-subtitle.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:id/subtitles')
export class SubtitlesController {
  constructor(private readonly subtitles: SubtitlesService) {}

  @Post()
  create(
    @Param('id') projectId: string,
    @Body() dto: CreateSubtitleDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.subtitles.create(projectId, req.user.id, dto);
  }

  @Get()
  findAll(
    @Param('id') projectId: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.subtitles.findAll(projectId, req.user.id);
  }

  @Get(':trackId')
  findOne(
    @Param('id') projectId: string,
    @Param('trackId') trackId: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.subtitles.findOne(projectId, trackId, req.user.id);
  }

  @Get(':trackId/export.vtt')
  @Header('Content-Type', 'text/vtt')
  @Header('Content-Disposition', 'attachment; filename="subtitles.vtt"')
  async exportVtt(
    @Param('id') projectId: string,
    @Param('trackId') trackId: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.subtitles.exportVtt(projectId, trackId, req.user.id);
  }

  @Delete(':trackId')
  remove(
    @Param('id') projectId: string,
    @Param('trackId') trackId: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.subtitles.remove(projectId, trackId, req.user.id);
  }
}
