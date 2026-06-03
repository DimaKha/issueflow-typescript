import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class MentionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
