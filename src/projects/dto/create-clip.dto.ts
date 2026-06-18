import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  Min,
  Max,
  IsObject,
} from 'class-validator';

export class CreateClipDto {
  @IsOptional()
  @IsString()
  mediaAssetId?: string;

  @IsOptional()
  @IsInt()
  trackIndex?: number;

  @IsOptional()
  @IsInt()
  zIndex?: number;

  @IsOptional()
  @IsInt()
  startTimeMs?: number;

  @IsOptional()
  @IsInt()
  durationMs?: number;

  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  rotation?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  opacity?: number;

  @IsOptional()
  @IsObject()
  transform?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
