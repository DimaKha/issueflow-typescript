import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './audit-log.entity';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: { create: jest.Mock; save: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockImplementation((dto) => ({ ...dto })),
      save: jest.fn().mockImplementation((e) => Promise.resolve({ id: 1, ...e })),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useValue: repo },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  // ──────────────────────────────────────────────
  // log
  // ──────────────────────────────────────────────
  describe('log', () => {
    it('should persist an audit log entry with all fields', async () => {
      await service.log({
        performedBy: 5,
        actor: 'USER',
        action: 'CREATE',
        entityType: 'TICKET',
        entityId: 42,
        payload: { title: 'Fix login' },
      });

      expect(repo.create).toHaveBeenCalledWith({
        performedBy: 5,
        actor: 'USER',
        action: 'CREATE',
        entityType: 'TICKET',
        entityId: 42,
        payload: { title: 'Fix login' },
      });
      expect(repo.save).toHaveBeenCalled();
    });

    it('should allow null performedBy for SYSTEM actions', async () => {
      await service.log({
        performedBy: null,
        actor: 'SYSTEM',
        action: 'ESCALATE',
        entityType: 'TICKET',
        entityId: 1,
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ performedBy: null, actor: 'SYSTEM' }),
      );
    });

    it('should set payload to null when not provided', async () => {
      await service.log({
        performedBy: 1,
        actor: 'USER',
        action: 'DELETE',
        entityType: 'USER',
        entityId: 3,
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ payload: null }),
      );
    });
  });

  // ──────────────────────────────────────────────
  // findAll
  // ──────────────────────────────────────────────
  describe('findAll', () => {
    it('should return all logs when no filter is provided', async () => {
      const logs = [{ id: 1, action: 'CREATE' }] as AuditLog[];
      repo.find.mockResolvedValue(logs);

      const result = await service.findAll({});

      expect(repo.find).toHaveBeenCalledWith({
        where: {},
        order: { timestamp: 'DESC' },
      });
      expect(result).toBe(logs);
    });

    it('should filter by entityType', async () => {
      repo.find.mockResolvedValue([]);
      await service.findAll({ entityType: 'TICKET' });
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entityType: 'TICKET' } }),
      );
    });

    it('should filter by entityId', async () => {
      repo.find.mockResolvedValue([]);
      await service.findAll({ entityId: 7 });
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entityId: 7 } }),
      );
    });

    it('should filter by action', async () => {
      repo.find.mockResolvedValue([]);
      await service.findAll({ action: 'DELETE' });
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { action: 'DELETE' } }),
      );
    });

    it('should filter by actor', async () => {
      repo.find.mockResolvedValue([]);
      await service.findAll({ actor: 'SYSTEM' });
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { actor: 'SYSTEM' } }),
      );
    });

    it('should combine multiple filters', async () => {
      repo.find.mockResolvedValue([]);
      await service.findAll({ entityType: 'PROJECT', action: 'RESTORE', actor: 'USER' });
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'PROJECT', action: 'RESTORE', actor: 'USER' },
        }),
      );
    });
  });
});
