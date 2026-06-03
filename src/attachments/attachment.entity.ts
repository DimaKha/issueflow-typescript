import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'ticket_id' })
  ticketId: number;

  @Column()
  filename: string;

  @Column({ name: 'original_name' })
  originalName: string;

  @Column({ name: 'content_type' })
  contentType: string;

  @Column({ name: 'file_path' })
  filePath: string;

  @Column()
  size: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
