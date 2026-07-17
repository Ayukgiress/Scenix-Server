import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { MediaType } from '@prisma/client';

export class CreateCloudinaryUploadDto {
  @IsEnum(MediaType)
  type: MediaType;

  @IsString()
  filename: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  fileSizeBytes?: number;

  @IsOptional()
  @IsString()
  folder?: string;
}
