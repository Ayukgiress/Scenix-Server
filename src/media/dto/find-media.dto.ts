import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MediaType } from '@prisma/client';
import { PaginationDto } from '../../common/pagination.dto';

export class FindMediaDto extends PaginationDto {
  @IsOptional()
  @IsEnum(MediaType)
  type?: MediaType;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
