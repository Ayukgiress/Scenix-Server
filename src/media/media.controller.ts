import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { MediaService } from './media.service';
import { CreateMediaDto } from './dto/create-media.dto';
import { CreateCloudinaryUploadDto } from './dto/create-cloudinary-upload.dto';
import { FindMediaDto } from './dto/find-media.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  create(
    @Body() dto: CreateMediaDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.media.create(req.user.id, dto);
  }

  @Post('uploads/cloudinary')
  createCloudinaryUpload(
    @Body() dto: CreateCloudinaryUploadDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.media.createCloudinaryUpload(req.user.id, dto);
  }

  @Get()
  findAll(
    @Req() req: Request & { user: { id: string } },
    @Query() query: FindMediaDto,
  ) {
    return this.media.findAll(req.user.id, query);
  }

  @Get(':id/url')
  getUrl(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.media.getUrl(id, req.user.id);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.media.findOne(id, req.user.id);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.media.remove(id, req.user.id);
  }
}
