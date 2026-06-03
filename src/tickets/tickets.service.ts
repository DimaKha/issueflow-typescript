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
  ) {}

  async create(dto: CreateTicketDto): Promise<Ticket> {
    // Validate project exists and is not soft-deleted
    await this.projectsService.findOne(dto.projectId);

    // Validate assignee if provided
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

    return this.repo.save(ticket);
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

  async update(id: number, dto: UpdateTicketDto): Promise<Ticket> {
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

    if (clientVersion !== undefined) {
      // Strict optimistic lock: WHERE id AND version
      const result = await this.repo.update(
        { id, version: clientVersion },
        { ...changes, version: clientVersion + 1 },
      );
      if (result.affected === 0) {
        const still = await this.repo.findOne({ where: { id } });
        if (!still) throw new NotFoundException(`Ticket ${id} not found`);
        throw new ConflictException('Concurrent modification detected — please refresh and retry');
      }
    } else {
      // Blind update — still increments version
      const result = await this.repo.update(
        { id },
        { ...changes, version: () => 'version + 1' },
      );
      if (result.affected === 0) throw new NotFoundException(`Ticket ${id} not found`);
    }

    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const ticket = await this.findOne(id);
    await this.repo.softRemove(ticket);
  }

  async restore(id: number): Promise<Ticket> {
    const ticket = await this.repo.findOne({ where: { id }, withDeleted: true });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    if (!ticket.deletedAt) throw new BadRequestException(`Ticket ${id} is not deleted`);
    await this.repo.restore(id);
    return this.repo.findOne({ where: { id } }) as Promise<Ticket>;
  }
}
