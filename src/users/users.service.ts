import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
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
