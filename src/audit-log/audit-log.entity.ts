import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'performed_by', nullable: true })
  performedBy: number | null;

  @Column()
  actor: string;

  @Column()
  action: string;

  @Column({ name: 'entity_type' })
  entityType: string;

  @Column({ name: 'entity_id' })
  entityId: number;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, any> | null;

  @CreateDateColumn({ name: 'timestamp' })
  timestamp: Date;
}
