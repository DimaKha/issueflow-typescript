import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { TicketDependency } from './ticket-dependency.entity';
import { Ticket, TicketStatus } from './ticket.entity';
import { TicketsService } from './tickets.service';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface BlockerInfo {
  id: number;
  title: string;
  status: TicketStatus;
}

@Injectable()
export class DependenciesService {
  constructor(
    @InjectRepository(TicketDependency)
    private readonly depRepo: Repository<TicketDependency>,
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    private readonly ticketsService: TicketsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async addDependency(
    ticketId: number,
    blockerId: number,
    performedBy?: number | null,
  ): Promise<void> {
    if (ticketId === blockerId) {
      throw new BadRequestException('A ticket cannot depend on itself');
    }

    // Validate both tickets exist and are not soft-deleted (findOne throws 404 if missing)
    const ticket = await this.ticketsService.findOne(ticketId);
    const blocker = await this.ticketsService.findOne(blockerId);

    if (ticket.projectId !== blocker.projectId) {
      throw new BadRequestException(
        'Both tickets must belong to the same project to create a dependency',
      );
    }

    const dep = this.depRepo.create({ ticketId, blockerId });
    try {
      await this.depRepo.save(dep);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new BadRequestException('This dependency already exists');
      }
      throw err;
    }

    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'ADD_DEPENDENCY',
        entityType: 'TICKET',
        entityId: ticketId,
        payload: { ticketId, blockerId },
      });
    } catch { /* audit log failure must not break main operation */ }
  }

  async getDependencies(ticketId: number): Promise<BlockerInfo[]> {
    const deps = await this.depRepo.find({ where: { ticketId } });
    if (deps.length === 0) return [];

    const blockerIds = deps.map((d) => d.blockerId);
    const blockers = await this.ticketRepo.find({ where: { id: In(blockerIds) } });

    return blockers.map((t) => ({ id: t.id, title: t.title, status: t.status }));
  }

  async removeDependency(
    ticketId: number,
    blockerId: number,
    performedBy?: number | null,
  ): Promise<void> {
    const dep = await this.depRepo.findOne({ where: { ticketId, blockerId } });
    if (!dep) {
      throw new NotFoundException(
        `Dependency from ticket ${ticketId} to blocker ${blockerId} not found`,
      );
    }
    await this.depRepo.remove(dep);

    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'REMOVE_DEPENDENCY',
        entityType: 'TICKET',
        entityId: ticketId,
        payload: { ticketId, blockerId },
      });
    } catch { /* audit log failure must not break main operation */ }
  }
}
