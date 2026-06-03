import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  VersionColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export enum TicketStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  DONE = 'DONE',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum TicketType {
  BUG = 'BUG',
  FEATURE = 'FEATURE',
  TECHNICAL = 'TECHNICAL',
}

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.TODO })
  status: TicketStatus;

  @Column({ type: 'enum', enum: TicketPriority, default: TicketPriority.MEDIUM })
  priority: TicketPriority;

  @Column({ type: 'enum', enum: TicketType })
  type: TicketType;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'assignee_id', nullable: true })
  assigneeId: number | null;

  @Column({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'is_overdue', default: false })
  isOverdue: boolean;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
