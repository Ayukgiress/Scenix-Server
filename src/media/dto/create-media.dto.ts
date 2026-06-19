import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsObject,
  Min,
} from 'class-validator';
import { MediaType } from '@prisma/client';

export class CreateMediaDto {
  @IsEnum(MediaType)
  type: MediaType;

  @IsString()
  sourceUrl: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  providerAssetId?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsInt()
  durationMs?: number;

  @IsOptional()
  @IsInt()
  width?: number;

  @IsOptional()
  @IsInt()
  height?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  fileSizeBytes?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
