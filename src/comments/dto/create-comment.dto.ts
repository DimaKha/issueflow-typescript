import { IsInt, IsPositive, IsString } from 'class-validator';

export class CreateCommentDto {
  @IsInt()
  @IsPositive()
  authorId: number;

  @IsString()
  content: string;
}
