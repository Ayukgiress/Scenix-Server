import { IsString, IsOptional, IsInt, IsObject, IsEnum } from 'class-validator';
import { ProjectStatus } from '@prisma/client';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsInt()
  hue?: number;

  @IsOptional()
  @IsObject()
  editorState?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
