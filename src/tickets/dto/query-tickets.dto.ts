import { IsOptional, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryTicketsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  projectId?: number;
}
