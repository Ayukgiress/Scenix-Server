import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateClipDto } from './dto/create-clip.dto';
import { UpdateClipDto } from './dto/update-clip.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationDto } from '../common/pagination.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(
    @Body() dto: CreateProjectDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.projects.create(req.user.id, dto);
  }

  @Get()
  findAll(
    @Req() req: Request & { user: { id: string } },
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: 'asc' | 'desc',
  ) {
    return this.projects.findAll(req.user.id, {
      status,
      search,
      sort,
      limit: pagination.limit,
      offset: pagination.offset,
    });
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.projects.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.projects.update(id, req.user.id, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.projects.remove(id, req.user.id);
  }

  @Post(':id/clips')
  createClip(
    @Param('id') id: string,
    @Body() dto: CreateClipDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.projects.createClip(id, req.user.id, dto);
  }

  @Get(':id/clips')
  findAllClips(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.projects.findAllClips(id, req.user.id);
  }

  @Patch(':id/clips/:clipId')
  updateClip(
    @Param('id') id: string,
    @Param('clipId') clipId: string,
    @Body() dto: UpdateClipDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.projects.updateClip(clipId, id, req.user.id, dto);
  }

  @Delete(':id/clips/:clipId')
  removeClip(
    @Param('id') id: string,
    @Param('clipId') clipId: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.projects.removeClip(clipId, id, req.user.id);
  }

  @Post(':id/clips/:clipId/keyframes')
  setKeyframes(
    @Param('id') id: string,
    @Param('clipId') clipId: string,
    @Body() body: { keyframes: Record<string, unknown> },
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.projects.updateClip(clipId, id, req.user.id, {
      keyframes: body.keyframes,
    });
  }

  @Patch(':id/clips/:clipId/keyframes')
  patchKeyframes(
    @Param('id') id: string,
    @Param('clipId') clipId: string,
    @Body() body: { keyframes: Record<string, unknown> },
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.projects.updateClip(clipId, id, req.user.id, {
      keyframes: body.keyframes,
    });
  }

  @Get(':id/activity')
  findAllActivity(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
    @Query() pagination: PaginationDto,
  ) {
    return this.projects.findAllActivity(id, req.user.id, {
      limit: pagination.limit,
      offset: pagination.offset,
    });
  }
}
