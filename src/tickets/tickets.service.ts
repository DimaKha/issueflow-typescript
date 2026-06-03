import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { Ticket, TicketStatus, TicketPriority, TicketType } from './ticket.entity';
import { TicketDependency } from './ticket-dependency.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';
import { User, UserRole } from '../users/user.entity';
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
    @InjectRepository(TicketDependency)
    private readonly depRepo: Repository<TicketDependency>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateTicketDto, performedBy?: number | null): Promise<Ticket> {
    await this.projectsService.findOne(dto.projectId);

    let autoAssignedId: number | null = null;

    if (dto.assigneeId !== undefined) {
      await this.usersService.findOne(dto.assigneeId);
    } else {
      const developers = await this.userRepo.find({ where: { role: UserRole.DEVELOPER } });
      if (developers.length > 0) {
        const counts = await Promise.all(
          developers.map(async (dev) => ({
            devId: dev.id,
            count: await this.repo.count({
              where: { assigneeId: dev.id, projectId: dto.projectId, status: Not(TicketStatus.DONE) },
            }),
          })),
        );
        counts.sort((a, b) => a.count - b.count || a.devId - b.devId);
        autoAssignedId = counts[0].devId;
      }
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    const status = dto.status ?? TicketStatus.TODO;
    const assigneeId = dto.assigneeId ?? autoAssignedId;

    const ticket = this.repo.create({
      title: dto.title,
      description: dto.description,
      status,
      priority: dto.priority ?? TicketPriority.MEDIUM,
      type: dto.type,
      projectId: dto.projectId,
      assigneeId,
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

    if (autoAssignedId !== null) {
      try {
        await this.auditLog.log({
          performedBy: null,
          actor: 'SYSTEM',
          action: 'AUTO_ASSIGN',
          entityType: 'TICKET',
          entityId: saved.id,
          payload: { ticketId: saved.id, assigneeId: autoAssignedId },
        });
      } catch { /* audit log failure must not break main operation */ }
    }

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

    // Cannot update a DONE ticket
    if (existing.status === TicketStatus.DONE) {
      throw new BadRequestException('Cannot update a ticket with status DONE');
    }

    // Validate status transition if status is changing
    if (dto.status !== undefined) {
      if (!allowedTransitions[existing.status].includes(dto.status)) {
        throw new BadRequestException(
          `Invalid status transition: ${existing.status} → ${dto.status}`,
        );
      }
    }

    // Validate assignee if changing
    if (dto.assigneeId !== undefined) {
      await this.usersService.findOne(dto.assigneeId);
    }

    // Block DONE transition if any blocker is not yet DONE
    if (dto.status === TicketStatus.DONE) {
      const blockerDeps = await this.depRepo.find({ where: { ticketId: id } });
      for (const dep of blockerDeps) {
        const blockerTicket = await this.repo.findOne({ where: { id: dep.blockerId } });
        if (blockerTicket && blockerTicket.status !== TicketStatus.DONE) {
          throw new BadRequestException(
            `Ticket ${dep.blockerId} is still blocking this ticket (status: ${blockerTicket.status})`,
          );
        }
      }
    }

    // Resolve effective post-update values for isOverdue
    const effectiveDueDate =
      dto.dueDate !== undefined
        ? dto.dueDate === null
          ? null
          : new Date(dto.dueDate as string)
        : existing.dueDate;
    const effectiveStatus = dto.status ?? existing.status;

    // Build changes object (never include version here — handled separately)
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

  async exportCsv(projectId?: number): Promise<string> {
    if (projectId === undefined) {
      throw new BadRequestException('projectId query parameter is required for export');
    }
    await this.projectsService.findOne(projectId);
    const tickets = await this.repo.find({ where: { projectId } });
    const rows = tickets.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? '',
      status: t.status,
      priority: t.priority,
      type: t.type,
      projectId: t.projectId,
      assigneeId: t.assigneeId ?? '',
      dueDate: t.dueDate ? t.dueDate.toISOString() : '',
      isOverdue: String(computeIsOverdue(t.dueDate, t.status)),
      version: t.version,
    }));
    return stringify(rows, { header: true });
  }

  async importCsv(
    projectId: number,
    buffer: Buffer,
    performedBy?: number | null,
  ): Promise<{ created: number; failed: number; errors: { row: number; message: string }[] }> {
    await this.projectsService.findOne(projectId);

    let records: Record<string, string>[];
    try {
      records = parse(buffer, { columns: true, skip_empty_lines: true, cast: false, trim: true });
    } catch (err: any) {
      throw new BadRequestException(`Failed to parse CSV: ${err.message}`);
    }

    let created = 0;
    let failed = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < records.length; i++) {
      const rowNum = i + 2; // header is row 1
      const row = records[i];

      try {
        if (!row.title || row.title.trim() === '') {
          throw new Error('Missing required field: title');
        }
        if (!row.type) {
          throw new Error('Missing required field: type');
        }

        const validTypes = Object.values(TicketType) as string[];
        if (!validTypes.includes(row.type)) {
          throw new Error(`Invalid type: "${row.type}". Must be one of: ${validTypes.join(', ')}`);
        }

        let status: TicketStatus | undefined;
        if (row.status) {
          const validStatuses = Object.values(TicketStatus) as string[];
          if (!validStatuses.includes(row.status)) {
            throw new Error(`Invalid status: "${row.status}". Must be one of: ${validStatuses.join(', ')}`);
          }
          status = row.status as TicketStatus;
        }

        let priority: TicketPriority | undefined;
        if (row.priority) {
          const validPriorities = Object.values(TicketPriority) as string[];
          if (!validPriorities.includes(row.priority)) {
            throw new Error(`Invalid priority: "${row.priority}". Must be one of: ${validPriorities.join(', ')}`);
          }
          priority = row.priority as TicketPriority;
        }

        let assigneeId: number | undefined;
        if (row.assigneeId && row.assigneeId.trim() !== '') {
          const parsed = parseInt(row.assigneeId, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error(`Invalid assigneeId: "${row.assigneeId}"`);
          }
          assigneeId = parsed;
        }

        let dueDate: string | undefined;
        if (row.dueDate && row.dueDate.trim() !== '') {
          dueDate = row.dueDate;
        }

        const dto: CreateTicketDto = {
          title: row.title.trim(),
          ...(row.description?.trim() && { description: row.description.trim() }),
          type: row.type as TicketType,
          projectId,
          ...(status !== undefined && { status }),
          ...(priority !== undefined && { priority }),
          ...(assigneeId !== undefined && { assigneeId }),
          ...(dueDate !== undefined && { dueDate }),
        };

        await this.create(dto, performedBy);
        created++;
      } catch (err: any) {
        failed++;
        errors.push({ row: rowNum, message: err.message ?? 'Unknown error' });
      }
    }

    return { created, failed, errors };
  }
}
