import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsPositive,
  IsDateString,
} from 'class-validator';
import { TicketStatus, TicketPriority, TicketType } from '../ticket.entity';

export class CreateTicketDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsEnum(TicketType)
  type: TicketType;

  @IsInt()
  @IsPositive()
  projectId: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  assigneeId?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
