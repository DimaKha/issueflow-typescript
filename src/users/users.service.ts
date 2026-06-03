import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { Comment } from '../comments/comment.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface MentionItem {
  id: number;
  ticketId: number;
  content: string;
  authorId: number;
  mentionedUsers: { id: number; username: string; fullName: string }[];
}

export interface MentionResponse {
  data: MentionItem[];
  total: number;
  page: number;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateUserDto, performedBy?: number | null): Promise<User> {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.repo.create({
      username: dto.username,
      email: dto.email,
      fullName: dto.fullName,
      role: dto.role,
      passwordHash,
    });
    let saved: User;
    try {
      saved = await this.repo.save(user);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException('Username or email already exists');
      }
      throw err;
    }
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'CREATE',
        entityType: 'USER',
        entityId: saved.id,
        payload: { id: saved.id, username: saved.username, email: saved.email, fullName: saved.fullName, role: saved.role },
      });
    } catch { /* audit log failure must not break main operation */ }
    return saved;
  }

  async findAll(): Promise<User[]> {
    return this.repo.find();
  }

  async findOne(id: number): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({ where: { username } });
  }

  async update(id: number, dto: UpdateUserDto, performedBy?: number | null): Promise<User> {
    const user = await this.findOne(id);

    if (dto.password !== undefined) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.username !== undefined) user.username = dto.username;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.role !== undefined) user.role = dto.role;

    let saved: User;
    try {
      saved = await this.repo.save(user);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException('Username or email already exists');
      }
      throw err;
    }
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'UPDATE',
        entityType: 'USER',
        entityId: id,
        payload: { id: saved.id, username: saved.username, email: saved.email, fullName: saved.fullName, role: saved.role },
      });
    } catch { /* audit log failure must not break main operation */ }
    return saved;
  }

  async getMentions(userId: number, page = 1, pageSize = 20): Promise<MentionResponse> {
    await this.findOne(userId);

    // Step 1: paginated IDs of non-deleted comments mentioning this user,
    // joined to non-deleted tickets. TypeORM auto-adds `c.deleted_at IS NULL`
    // for the main alias because Comment has @DeleteDateColumn.
    const [matched, total] = await this.commentRepo
      .createQueryBuilder('c')
      .innerJoin('c.mentionedUsers', 'u', 'u.id = :userId', { userId })
      .innerJoin('tickets', 't', 't.id = c.ticket_id AND t.deleted_at IS NULL')
      .orderBy('c.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    if (matched.length === 0) return { data: [], total, page };

    // Step 2: reload the page with full mentionedUsers relation
    const ids = matched.map((c) => c.id);
    const comments = await this.commentRepo.find({
      where: { id: In(ids) },
      relations: ['mentionedUsers'],
      order: { createdAt: 'DESC' },
    });

    return {
      data: comments.map((c) => ({
        id: c.id,
        ticketId: c.ticketId,
        content: c.content,
        authorId: c.authorId,
        // Explicit field list — no passwordHash, email, or timestamps
        mentionedUsers: (c.mentionedUsers ?? []).map((u) => ({
          id: u.id,
          username: u.username,
          fullName: u.fullName,
        })),
      })),
      total,
      page,
    };
  }

  async remove(id: number, performedBy?: number | null): Promise<void> {
    const user = await this.findOne(id);
    await this.repo.remove(user);
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'DELETE',
        entityType: 'USER',
        entityId: id,
        payload: { id, username: user.username },
      });
    } catch { /* audit log failure must not break main operation */ }
  }
}
