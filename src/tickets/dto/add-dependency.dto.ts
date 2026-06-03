import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddDependencyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  blockedBy: number;
}
