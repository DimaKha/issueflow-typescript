import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { Ticket, TicketStatus, TicketPriority, TicketType } from './ticket.entity';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';

const FUTURE = new Date(Date.now() + 86_400_000);  // tomorrow
const PAST   = new Date('2020-01-01T00:00:00Z');

const mockTicket = (overrides: Partial<Ticket> = {}): Ticket =>
  ({
    id: 1,
    title: 'Fix login',
    description: null,
    status: TicketStatus.TODO,
    priority: TicketPriority.MEDIUM,
    type: TicketType.BUG,
    projectId: 1,
    assigneeId: null,
    dueDate: null,
    isOverdue: false,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }) as Ticket;

describe('TicketsService', () => {
  let service: TicketsService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    softRemove: jest.Mock;
    restore: jest.Mock;
  };
  let projectsService: { findOne: jest.Mock };
  let usersService: { findOne: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      softRemove: jest.fn(),
      restore: jest.fn(),
    };
    projectsService = { findOne: jest.fn().mockResolvedValue({ id: 1 }) };
    usersService = { findOne: jest.fn().mockResolvedValue({ id: 1 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: repo },
        { provide: ProjectsService, useValue: projectsService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
  });

  // ──────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────
  describe('create', () => {
    it('should create a ticket with defaults and isOverdue=false for future dueDate', async () => {
      const ticket = mockTicket({ dueDate: FUTURE, isOverdue: false });
      repo.create.mockReturnValue(ticket);
      repo.save.mockResolvedValue(ticket);

      const result = await service.create({
        title: 'Fix login',
        type: TicketType.BUG,
        projectId: 1,
        dueDate: FUTURE.toISOString(),
      });

      expect(result.status).toBe(TicketStatus.TODO);
      expect(result.isOverdue).toBe(false);
      expect(projectsService.findOne).toHaveBeenCalledWith(1);
    });

    it('should set isOverdue=true when dueDate is in the past', async () => {
      const ticket = mockTicket({ dueDate: PAST, isOverdue: true });
      repo.create.mockReturnValue(ticket);
      repo.save.mockResolvedValue(ticket);

      const result = await service.create({
        title: 'Overdue',
        type: TicketType.BUG,
        projectId: 1,
        dueDate: PAST.toISOString(),
      });

      expect(result.isOverdue).toBe(true);
    });

    it('should throw NotFoundException when project does not exist', async () => {
      projectsService.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.create({ title: 'X', type: TicketType.BUG, projectId: 99 }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('should validate assigneeId when provided', async () => {
      usersService.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.create({ title: 'X', type: TicketType.BUG, projectId: 1, assigneeId: 99 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────
  // findAll / findDeleted
  // ──────────────────────────────────────────────
  describe('findAll', () => {
    it('should return active tickets filtered by projectId', async () => {
      repo.find.mockResolvedValue([mockTicket()]);
      const result = await service.findAll({ projectId: 1 });
      expect(result).toHaveLength(1);
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 1 } }));
    });

    it('should return all active tickets when no filter', async () => {
      repo.find.mockResolvedValue([mockTicket(), mockTicket({ id: 2 })]);
      const result = await service.findAll({});
      expect(result).toHaveLength(2);
    });
  });

  describe('findDeleted', () => {
    it('should return only soft-deleted tickets', async () => {
      const deleted = mockTicket({ deletedAt: new Date() });
      repo.find.mockResolvedValue([deleted]);
      const result = await service.findDeleted({});
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true }));
      expect(result).toHaveLength(1);
    });
  });

  // ──────────────────────────────────────────────
  // findOne
  // ──────────────────────────────────────────────
  describe('findOne', () => {
    it('should return ticket when found', async () => {
      repo.findOne.mockResolvedValue(mockTicket());
      const result = await service.findOne(1);
      expect(result.id).toBe(1);
    });

    it('should throw NotFoundException for missing ticket', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────
  // update — DONE immutability
  // ──────────────────────────────────────────────
  describe('update — DONE immutability', () => {
    it('should throw 400 when ticket is DONE', async () => {
      repo.findOne.mockResolvedValue(mockTicket({ status: TicketStatus.DONE }));

      await expect(service.update(1, { title: 'New title', version: 1 })).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // update — status transitions
  // ──────────────────────────────────────────────
  describe('update — status transitions', () => {
    const setupTicket = (status: TicketStatus) => {
      const ticket = mockTicket({ status });
      repo.findOne
        .mockResolvedValueOnce(ticket)   // findOne inside update
        .mockResolvedValueOnce(ticket);  // findOne at the end (reload)
      repo.update.mockResolvedValue({ affected: 1 });
    };

    it('should allow TODO → IN_PROGRESS', async () => {
      setupTicket(TicketStatus.TODO);
      await service.update(1, { status: TicketStatus.IN_PROGRESS, version: 1 });
      expect(repo.update).toHaveBeenCalled();
    });

    it('should allow IN_PROGRESS → IN_REVIEW', async () => {
      setupTicket(TicketStatus.IN_PROGRESS);
      await service.update(1, { status: TicketStatus.IN_REVIEW, version: 1 });
      expect(repo.update).toHaveBeenCalled();
    });

    it('should allow IN_REVIEW → DONE', async () => {
      setupTicket(TicketStatus.IN_REVIEW);
      await service.update(1, { status: TicketStatus.DONE, version: 1 });
      expect(repo.update).toHaveBeenCalled();
    });

    it('should reject TODO → TODO (same status)', async () => {
      repo.findOne.mockResolvedValue(mockTicket({ status: TicketStatus.TODO }));
      await expect(service.update(1, { status: TicketStatus.TODO, version: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject TODO → IN_REVIEW (skip)', async () => {
      repo.findOne.mockResolvedValue(mockTicket({ status: TicketStatus.TODO }));
      await expect(service.update(1, { status: TicketStatus.IN_REVIEW, version: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject TODO → DONE (skip)', async () => {
      repo.findOne.mockResolvedValue(mockTicket({ status: TicketStatus.TODO }));
      await expect(service.update(1, { status: TicketStatus.DONE, version: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject IN_PROGRESS → TODO (backward)', async () => {
      repo.findOne.mockResolvedValue(mockTicket({ status: TicketStatus.IN_PROGRESS }));
      await expect(service.update(1, { status: TicketStatus.TODO, version: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject IN_REVIEW → IN_PROGRESS (backward)', async () => {
      repo.findOne.mockResolvedValue(mockTicket({ status: TicketStatus.IN_REVIEW }));
      await expect(service.update(1, { status: TicketStatus.IN_PROGRESS, version: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow update with no status change', async () => {
      setupTicket(TicketStatus.TODO);
      await service.update(1, { title: 'Renamed', version: 1 });
      expect(repo.update).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // update — optimistic locking
  // ──────────────────────────────────────────────
  describe('update — optimistic locking', () => {
    it('should update when version matches and increment to version+1', async () => {
      const ticket = mockTicket({ version: 2 });
      repo.findOne
        .mockResolvedValueOnce(ticket)
        .mockResolvedValueOnce({ ...ticket, version: 3 });
      repo.update.mockResolvedValue({ affected: 1 });

      await service.update(1, { title: 'New', version: 2 });
      expect(repo.update).toHaveBeenCalledWith(
        { id: 1, version: 2 },
        expect.objectContaining({ version: 3 }),
      );
    });

    it('should throw ConflictException when version is stale (entity still exists)', async () => {
      const ticket = mockTicket({ version: 5 });
      repo.findOne
        .mockResolvedValueOnce(ticket)  // existence check
        .mockResolvedValueOnce(ticket); // re-check inside 0-affected branch (entity exists → 409)
      repo.update.mockResolvedValue({ affected: 0 });

      await expect(service.update(1, { title: 'X', version: 2 })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException when entity is deleted between check and update', async () => {
      const ticket = mockTicket({ version: 1 });
      repo.findOne
        .mockResolvedValueOnce(ticket) // existence check passes
        .mockResolvedValueOnce(null);  // re-check inside 0-affected branch → entity gone → 404
      repo.update.mockResolvedValue({ affected: 0 });

      await expect(service.update(1, { title: 'X', version: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('UpdateTicketDto should require version — missing version fails DTO validation', async () => {
      const { validate } = await import('class-validator');
      const { plainToInstance } = await import('class-transformer');
      const { UpdateTicketDto: Dto } = await import('./dto/update-ticket.dto');
      const dto = plainToInstance(Dto, { title: 'X' });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'version')).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────
  // update — isOverdue computation
  // ──────────────────────────────────────────────
  describe('update — isOverdue', () => {
    it('should set isOverdue=true when new dueDate is in the past', async () => {
      const ticket = mockTicket({ status: TicketStatus.TODO });
      repo.findOne
        .mockResolvedValueOnce(ticket)
        .mockResolvedValueOnce({ ...ticket, dueDate: PAST, isOverdue: true });
      repo.update.mockResolvedValue({ affected: 1 });

      await service.update(1, { dueDate: PAST.toISOString(), version: 1 });
      expect(repo.update).toHaveBeenCalledWith(
        { id: 1, version: 1 },
        expect.objectContaining({ isOverdue: true }),
      );
    });

    it('should set isOverdue=false when new dueDate is in the future', async () => {
      const ticket = mockTicket({ status: TicketStatus.TODO, dueDate: PAST, isOverdue: true });
      repo.findOne
        .mockResolvedValueOnce(ticket)
        .mockResolvedValueOnce({ ...ticket, dueDate: FUTURE, isOverdue: false });
      repo.update.mockResolvedValue({ affected: 1 });

      await service.update(1, { dueDate: FUTURE.toISOString(), version: 1 });
      expect(repo.update).toHaveBeenCalledWith(
        { id: 1, version: 1 },
        expect.objectContaining({ isOverdue: false }),
      );
    });
  });

  // ──────────────────────────────────────────────
  // remove / restore
  // ──────────────────────────────────────────────
  describe('remove', () => {
    it('should soft-delete the ticket', async () => {
      const ticket = mockTicket();
      repo.findOne.mockResolvedValue(ticket);
      repo.softRemove.mockResolvedValue(undefined);

      await service.remove(1);
      expect(repo.softRemove).toHaveBeenCalledWith(ticket);
    });

    it('should throw NotFoundException when ticket not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted ticket', async () => {
      const deleted = mockTicket({ deletedAt: new Date() });
      repo.findOne
        .mockResolvedValueOnce(deleted)
        .mockResolvedValueOnce({ ...deleted, deletedAt: null });
      repo.restore.mockResolvedValue(undefined);

      const result = await service.restore(1);
      expect(repo.restore).toHaveBeenCalledWith(1);
      expect(result.deletedAt).toBeNull();
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.restore(99)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when ticket is not deleted', async () => {
      repo.findOne.mockResolvedValue(mockTicket({ deletedAt: null }));
      await expect(service.restore(1)).rejects.toThrow(BadRequestException);
    });
  });
});
