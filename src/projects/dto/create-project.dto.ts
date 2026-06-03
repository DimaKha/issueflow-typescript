import { IsString, IsOptional, IsInt, IsPositive } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @IsPositive()
  ownerId: number;
}
