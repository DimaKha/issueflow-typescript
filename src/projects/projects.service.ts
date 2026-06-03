import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Project } from './project.entity';
import { Ticket, TicketStatus } from '../tickets/ticket.entity';
import { User, UserRole } from '../users/user.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UsersService } from '../users/users.service';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface WorkloadEntry {
  userId: number;
  username: string;
  fullName: string;
  openTicketCount: number;
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly repo: Repository<Project>,
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly usersService: UsersService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateProjectDto, performedBy?: number | null): Promise<Project> {
    await this.usersService.findOne(dto.ownerId);
    const project = this.repo.create(dto);
    const saved = await this.repo.save(project);
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'CREATE',
        entityType: 'PROJECT',
        entityId: saved.id,
        payload: { id: saved.id, name: saved.name, description: saved.description, ownerId: saved.ownerId },
      });
    } catch { /* audit log failure must not break main operation */ }
    return saved;
  }

  async findAll(): Promise<Project[]> {
    return this.repo.find();
  }

  async findDeleted(): Promise<Project[]> {
    return this.repo.find({ where: { deletedAt: Not(IsNull()) }, withDeleted: true });
  }

  async findOne(id: number): Promise<Project> {
    const project = await this.repo.findOne({ where: { id } });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async update(id: number, dto: UpdateProjectDto, performedBy?: number | null): Promise<Project> {
    const project = await this.findOne(id);
    if (dto.ownerId !== undefined) {
      await this.usersService.findOne(dto.ownerId);
    }
    Object.assign(project, dto);
    const saved = await this.repo.save(project);
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'UPDATE',
        entityType: 'PROJECT',
        entityId: id,
        payload: { id: saved.id, name: saved.name, description: saved.description, ownerId: saved.ownerId },
      });
    } catch { /* audit log failure must not break main operation */ }
    return saved;
  }

  async remove(id: number, performedBy?: number | null): Promise<void> {
    const project = await this.findOne(id);
    await this.repo.softRemove(project);
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'DELETE',
        entityType: 'PROJECT',
        entityId: id,
        payload: { id, name: project.name },
      });
    } catch { /* audit log failure must not break main operation */ }
  }

  async restore(id: number, performedBy?: number | null): Promise<Project> {
    const project = await this.repo.findOne({ where: { id }, withDeleted: true });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    if (!project.deletedAt) throw new BadRequestException(`Project ${id} is not deleted`);
    await this.repo.restore(id);
    const restored = await this.repo.findOne({ where: { id } }) as Project;
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'RESTORE',
        entityType: 'PROJECT',
        entityId: id,
        payload: { id: restored.id, name: restored.name },
      });
    } catch { /* audit log failure must not break main operation */ }
    return restored;
  }

  async findOneWithDeleted(id: number): Promise<Project | null> {
    return this.repo.findOne({ where: { id }, withDeleted: true });
  }

  async getWorkload(projectId: number): Promise<WorkloadEntry[]> {
    await this.findOne(projectId);

    const developers = await this.userRepo.find({ where: { role: UserRole.DEVELOPER } });

    const results = await Promise.all(
      developers.map(async (dev) => ({
        userId: dev.id,
        username: dev.username,
        fullName: dev.fullName,
        openTicketCount: await this.ticketRepo.count({
          where: { assigneeId: dev.id, projectId, status: Not(TicketStatus.DONE) },
        }),
      })),
    );

    return results.sort((a, b) => a.userId - b.userId);
  }
}
