import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateSubtitleDto {
  @IsNotEmpty()
  @IsString()
  srtContent: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  language?: string;
}
