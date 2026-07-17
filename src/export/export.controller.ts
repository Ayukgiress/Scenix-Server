import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ExportService } from './export.service';
import { CreateExportDto } from './dto/create-export.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationDto } from '../common/pagination.dto';

@UseGuards(JwtAuthGuard)
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post()
  create(
    @Body() dto: CreateExportDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.exportService.create(req.user.id, dto);
  }

  @Get()
  findAll(
    @Req() req: Request & { user: { id: string } },
    @Query() pagination: PaginationDto,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
  ) {
    return this.exportService.findAll(req.user.id, {
      projectId,
      status,
      limit: pagination.limit,
      offset: pagination.offset,
    });
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.exportService.findOne(id, req.user.id);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.exportService.cancel(id, req.user.id);
  }
}
