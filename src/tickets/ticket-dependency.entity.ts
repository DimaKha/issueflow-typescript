import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

@Entity('ticket_dependencies')
@Unique(['ticketId', 'blockerId'])
export class TicketDependency {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'ticket_id' })
  ticketId: number;

  @Column({ name: 'blocker_id' })
  blockerId: number;
}
