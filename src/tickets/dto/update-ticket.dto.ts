import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsPositive,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TicketStatus, TicketPriority, TicketType } from '../ticket.entity';

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsEnum(TicketType)
  type?: TicketType;

  @IsOptional()
  @IsInt()
  @IsPositive()
  assigneeId?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}
