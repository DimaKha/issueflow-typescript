import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DependenciesService } from './dependencies.service';
import { TicketDependency } from './ticket-dependency.entity';
import { Ticket, TicketStatus, TicketType, TicketPriority } from './ticket.entity';
import { TicketsService } from './tickets.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const mockTicket = (id: number, projectId: number, status = TicketStatus.TODO) =>
  ({
    id,
    title: `Ticket ${id}`,
    status,
    priority: TicketPriority.MEDIUM,
    type: TicketType.BUG,
    projectId,
    assigneeId: null,
    dueDate: null,
    isOverdue: false,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }) as Ticket;

describe('DependenciesService', () => {
  let service: DependenciesService;
  let depRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let ticketRepo: { find: jest.Mock };
  let ticketsService: { findOne: jest.Mock };
  let auditLog: { log: jest.Mock };

  beforeEach(async () => {
    depRepo = {
      create: jest.fn().mockImplementation((dto) => ({ ...dto })),
      save: jest.fn().mockImplementation((e) => Promise.resolve({ id: 100, ...e })),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    ticketRepo = { find: jest.fn() };
    ticketsService = { findOne: jest.fn() };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DependenciesService,
        { provide: getRepositoryToken(TicketDependency), useValue: depRepo },
        { provide: getRepositoryToken(Ticket), useValue: ticketRepo },
        { provide: TicketsService, useValue: ticketsService },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<DependenciesService>(DependenciesService);
  });

  // ──────────────────────────────────────────────
  // addDependency
  // ──────────────────────────────────────────────
  describe('addDependency', () => {
    it('should throw BadRequestException when ticketId === blockerId (self-dependency)', async () => {
      await expect(service.addDependency(5, 5)).rejects.toThrow(BadRequestException);
      expect(ticketsService.findOne).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      ticketsService.findOne.mockRejectedValue(new NotFoundException());

      await expect(service.addDependency(1, 2)).rejects.toThrow(NotFoundException);
      expect(depRepo.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for cross-project dependency', async () => {
      ticketsService.findOne
        .mockResolvedValueOnce(mockTicket(1, 10))  // ticket in project 10
        .mockResolvedValueOnce(mockTicket(2, 20)); // blocker in project 20

      await expect(service.addDependency(1, 2)).rejects.toThrow(BadRequestException);
      expect(depRepo.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for duplicate dependency', async () => {
      ticketsService.findOne
        .mockResolvedValueOnce(mockTicket(1, 10))
        .mockResolvedValueOnce(mockTicket(2, 10));
      depRepo.save.mockRejectedValue({ code: '23505' });

      await expect(service.addDependency(1, 2)).rejects.toThrow(BadRequestException);
    });

    it('should create a valid dependency between tickets in the same project', async () => {
      ticketsService.findOne
        .mockResolvedValueOnce(mockTicket(1, 10))
        .mockResolvedValueOnce(mockTicket(2, 10));
      depRepo.save.mockResolvedValue({ id: 1, ticketId: 1, blockerId: 2 });

      await service.addDependency(1, 2, 5);

      expect(depRepo.create).toHaveBeenCalledWith({ ticketId: 1, blockerId: 2 });
      expect(depRepo.save).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // getDependencies
  // ──────────────────────────────────────────────
  describe('getDependencies', () => {
    it('should return empty array when no blockers exist', async () => {
      depRepo.find.mockResolvedValue([]);
      const result = await service.getDependencies(1);
      expect(result).toEqual([]);
    });

    it('should return blocker info with id, title, and status', async () => {
      depRepo.find.mockResolvedValue([{ ticketId: 1, blockerId: 3 }]);
      ticketRepo.find.mockResolvedValue([
        mockTicket(3, 10, TicketStatus.IN_PROGRESS),
      ]);

      const result = await service.getDependencies(1);

      expect(result).toEqual([
        { id: 3, title: 'Ticket 3', status: TicketStatus.IN_PROGRESS },
      ]);
    });
  });

  // ──────────────────────────────────────────────
  // removeDependency
  // ──────────────────────────────────────────────
  describe('removeDependency', () => {
    it('should remove the dependency', async () => {
      const dep = { id: 1, ticketId: 1, blockerId: 2 };
      depRepo.findOne.mockResolvedValue(dep);

      await service.removeDependency(1, 2, 5);

      expect(depRepo.remove).toHaveBeenCalledWith(dep);
    });

    it('should throw NotFoundException when dependency does not exist', async () => {
      depRepo.findOne.mockResolvedValue(null);

      await expect(service.removeDependency(1, 99)).rejects.toThrow(NotFoundException);
      expect(depRepo.remove).not.toHaveBeenCalled();
    });
  });
});
