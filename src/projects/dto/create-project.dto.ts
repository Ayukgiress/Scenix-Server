import {
  IsString,
  IsOptional,
  IsInt,
  IsObject,
  MinLength,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  title: string;

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
}
