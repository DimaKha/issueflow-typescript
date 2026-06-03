import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ImportTicketsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  projectId: number;
}
