import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Ticket, TicketStatus, TicketPriority } from './ticket.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.TODO]: [TicketStatus.IN_PROGRESS],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.IN_REVIEW],
  [TicketStatus.IN_REVIEW]: [TicketStatus.DONE],
  [TicketStatus.DONE]: [],
};

function computeIsOverdue(dueDate: Date | null, status: TicketStatus): boolean {
  return dueDate !== null && dueDate < new Date() && status !== TicketStatus.DONE;
}

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly repo: Repository<Ticket>,
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateTicketDto, performedBy?: number | null): Promise<Ticket> {
    await this.projectsService.findOne(dto.projectId);

    if (dto.assigneeId !== undefined) {
      await this.usersService.findOne(dto.assigneeId);
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    const status = dto.status ?? TicketStatus.TODO;

    const ticket = this.repo.create({
      title: dto.title,
      description: dto.description,
      status,
      priority: dto.priority ?? TicketPriority.MEDIUM,
      type: dto.type,
      projectId: dto.projectId,
      assigneeId: dto.assigneeId ?? null,
      dueDate,
      isOverdue: computeIsOverdue(dueDate, status),
    });

    const saved = await this.repo.save(ticket);
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'CREATE',
        entityType: 'TICKET',
        entityId: saved.id,
        payload: { id: saved.id, title: saved.title, status: saved.status, priority: saved.priority, type: saved.type, projectId: saved.projectId, assigneeId: saved.assigneeId },
      });
    } catch { /* audit log failure must not break main operation */ }
    return saved;
  }

  async findAll(query: QueryTicketsDto): Promise<Ticket[]> {
    const where: any = {};
    if (query.projectId !== undefined) where.projectId = query.projectId;
    return this.repo.find({ where });
  }

  async findDeleted(query: QueryTicketsDto): Promise<Ticket[]> {
    const where: any = { deletedAt: Not(IsNull()) };
    if (query.projectId !== undefined) where.projectId = query.projectId;
    return this.repo.find({ where, withDeleted: true });
  }

  async findOne(id: number): Promise<Ticket> {
    const ticket = await this.repo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  async update(id: number, dto: UpdateTicketDto, performedBy?: number | null): Promise<Ticket> {
    const existing = await this.findOne(id);

    if (existing.status === TicketStatus.DONE) {
      throw new BadRequestException('Cannot update a ticket with status DONE');
    }

    if (dto.status !== undefined) {
      if (!allowedTransitions[existing.status].includes(dto.status)) {
        throw new BadRequestException(
          `Invalid status transition: ${existing.status} → ${dto.status}`,
        );
      }
    }

    if (dto.assigneeId !== undefined) {
      await this.usersService.findOne(dto.assigneeId);
    }

    const effectiveDueDate =
      dto.dueDate !== undefined
        ? dto.dueDate === null
          ? null
          : new Date(dto.dueDate as string)
        : existing.dueDate;
    const effectiveStatus = dto.status ?? existing.status;

    const { version: clientVersion, ...fields } = dto;
    const changes: Partial<Ticket> = {
      ...fields,
      dueDate: effectiveDueDate,
      isOverdue: computeIsOverdue(effectiveDueDate, effectiveStatus),
    };

    const result = await this.repo.update(
      { id, version: clientVersion },
      { ...changes, version: clientVersion + 1 },
    );
    if (result.affected === 0) {
      const still = await this.repo.findOne({ where: { id } });
      if (!still) throw new NotFoundException(`Ticket ${id} not found`);
      throw new ConflictException('Concurrent modification detected — please refresh and retry');
    }

    const updated = await this.findOne(id);
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'UPDATE',
        entityType: 'TICKET',
        entityId: id,
        payload: { id: updated.id, title: updated.title, status: updated.status, priority: updated.priority, assigneeId: updated.assigneeId, version: updated.version },
      });
    } catch { /* audit log failure must not break main operation */ }
    return updated;
  }

  async remove(id: number, performedBy?: number | null): Promise<void> {
    const ticket = await this.findOne(id);
    await this.repo.softRemove(ticket);
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'DELETE',
        entityType: 'TICKET',
        entityId: id,
        payload: { id, title: ticket.title, projectId: ticket.projectId },
      });
    } catch { /* audit log failure must not break main operation */ }
  }

  async restore(id: number, performedBy?: number | null): Promise<Ticket> {
    const ticket = await this.repo.findOne({ where: { id }, withDeleted: true });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    if (!ticket.deletedAt) throw new BadRequestException(`Ticket ${id} is not deleted`);
    await this.repo.restore(id);
    const restored = await this.repo.findOne({ where: { id } }) as Ticket;
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'RESTORE',
        entityType: 'TICKET',
        entityId: id,
        payload: { id: restored.id, title: restored.title, projectId: restored.projectId },
      });
    } catch { /* audit log failure must not break main operation */ }
    return restored;
  }
}
