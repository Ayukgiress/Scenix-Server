import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ExportFormat, ExportResolution, FrameRate } from '@prisma/client';

export class CreateExportDto {
  @IsString()
  projectId: string;

  @IsString()
  filename: string;

  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat;

  @IsOptional()
  @IsEnum(ExportResolution)
  resolution?: ExportResolution;

  @IsOptional()
  @IsEnum(FrameRate)
  fps?: FrameRate;

  @IsOptional()
  @IsBoolean()
  proRes?: boolean;

  @IsOptional()
  @IsBoolean()
  twoPass?: boolean;
}
