import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCommentDto {
  @IsOptional()
  @IsString()
  content?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}
