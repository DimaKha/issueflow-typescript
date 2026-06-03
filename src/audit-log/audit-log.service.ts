import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

export interface AuditLogEntry {
  performedBy: number | null;
  actor: 'USER' | 'SYSTEM';
  action: string;
  entityType: string;
  entityId: number;
  payload?: Record<string, any>;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(entry: AuditLogEntry): Promise<void> {
    const record = this.repo.create({
      performedBy: entry.performedBy,
      actor: entry.actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      payload: entry.payload ?? null,
    });
    await this.repo.save(record);
  }

  async findAll(query: QueryAuditLogDto): Promise<AuditLog[]> {
    const where: Partial<AuditLog> = {};
    if (query.entityType !== undefined) where.entityType = query.entityType;
    if (query.entityId !== undefined) where.entityId = query.entityId;
    if (query.action !== undefined) where.action = query.action;
    if (query.actor !== undefined) where.actor = query.actor;
    return this.repo.find({ where, order: { timestamp: 'DESC' } });
  }
}
