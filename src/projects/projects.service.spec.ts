import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Project } from './project.entity';
import { Ticket } from '../tickets/ticket.entity';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const mockProject = (overrides: Partial<Project> = {}): Project =>
  ({
    id: 1,
    name: 'Alpha',
    description: 'First project',
    ownerId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }) as Project;

describe('ProjectsService', () => {
  let service: ProjectsService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    softRemove: jest.Mock;
    restore: jest.Mock;
  };
  let ticketRepo: { count: jest.Mock };
  let userRepo: { find: jest.Mock };
  let usersService: { findOne: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      softRemove: jest.fn(),
      restore: jest.fn(),
    };
    ticketRepo = { count: jest.fn().mockResolvedValue(0) };
    userRepo = { find: jest.fn().mockResolvedValue([]) };
    usersService = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(Project), useValue: repo },
        { provide: getRepositoryToken(Ticket), useValue: ticketRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: UsersService, useValue: usersService },
        { provide: AuditLogService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  describe('create', () => {
    it('should create a project after verifying owner exists', async () => {
      usersService.findOne.mockResolvedValue({ id: 1 });
      const project = mockProject();
      repo.create.mockReturnValue(project);
      repo.save.mockResolvedValue(project);

      const result = await service.create({ name: 'Alpha', ownerId: 1 });

      expect(usersService.findOne).toHaveBeenCalledWith(1);
      expect(result.name).toBe('Alpha');
    });

    it('should throw NotFoundException when owner does not exist', async () => {
      usersService.findOne.mockRejectedValue(new NotFoundException());

      await expect(service.create({ name: 'Beta', ownerId: 99 })).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all active projects', async () => {
      const projects = [mockProject(), mockProject({ id: 2, name: 'Beta' })];
      repo.find.mockResolvedValue(projects);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(repo.find).toHaveBeenCalledWith();
    });
  });

  describe('findDeleted', () => {
    it('should return only soft-deleted projects', async () => {
      const deleted = mockProject({ deletedAt: new Date() });
      repo.find.mockResolvedValue([deleted]);

      const result = await service.findDeleted();

      expect(result).toHaveLength(1);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
    });
  });

  describe('findOne', () => {
    it('should return project when found', async () => {
      repo.findOne.mockResolvedValue(mockProject());

      const result = await service.findOne(1);

      expect(result.id).toBe(1);
    });

    it('should throw NotFoundException when project not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update and return project', async () => {
      const project = mockProject();
      repo.findOne.mockResolvedValue(project);
      repo.save.mockResolvedValue({ ...project, name: 'Updated' });

      const result = await service.update(1, { name: 'Updated' });

      expect(result.name).toBe('Updated');
    });

    it('should validate new ownerId when provided', async () => {
      repo.findOne.mockResolvedValue(mockProject());
      usersService.findOne.mockRejectedValue(new NotFoundException());

      await expect(service.update(1, { ownerId: 99 })).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when project not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(99, { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft-delete the project', async () => {
      const project = mockProject();
      repo.findOne.mockResolvedValue(project);
      repo.softRemove.mockResolvedValue(undefined);

      await service.remove(1);

      expect(repo.softRemove).toHaveBeenCalledWith(project);
    });

    it('should throw NotFoundException when project not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted project', async () => {
      const deleted = mockProject({ deletedAt: new Date() });
      repo.findOne
        .mockResolvedValueOnce(deleted)   // withDeleted: true (inside restore)
        .mockResolvedValueOnce({ ...deleted, deletedAt: null }); // after restore
      repo.restore.mockResolvedValue(undefined);

      const result = await service.restore(1);

      expect(repo.restore).toHaveBeenCalledWith(1);
      expect(result.deletedAt).toBeNull();
    });

    it('should throw NotFoundException when project does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.restore(99)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when project is not deleted', async () => {
      repo.findOne.mockResolvedValue(mockProject({ deletedAt: null }));

      await expect(service.restore(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────
  // getWorkload
  // ──────────────────────────────────────────────
  describe('getWorkload', () => {
    const dev = (id: number, username: string, fullName: string) => ({
      id,
      username,
      fullName,
      role: 'DEVELOPER',
    });

    it('should return open ticket counts for all developers in the project', async () => {
      repo.findOne.mockResolvedValue(mockProject());
      userRepo.find.mockResolvedValue([
        dev(2, 'dev1', 'Dev One'),
        dev(3, 'dev2', 'Dev Two'),
      ]);
      ticketRepo.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);

      const result = await service.getWorkload(1);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ userId: 2, username: 'dev1', fullName: 'Dev One', openTicketCount: 3 });
      expect(result[1]).toEqual({ userId: 3, username: 'dev2', fullName: 'Dev Two', openTicketCount: 1 });
    });

    it('should return empty array when no developers exist', async () => {
      repo.findOne.mockResolvedValue(mockProject());
      userRepo.find.mockResolvedValue([]);

      const result = await service.getWorkload(1);

      expect(result).toEqual([]);
      expect(ticketRepo.count).not.toHaveBeenCalled();
    });

    it('should return developers sorted by userId', async () => {
      repo.findOne.mockResolvedValue(mockProject());
      userRepo.find.mockResolvedValue([dev(5, 'devE', 'E'), dev(2, 'devB', 'B')]);
      ticketRepo.count.mockResolvedValue(1);

      const result = await service.getWorkload(1);

      expect(result[0].userId).toBe(2);
      expect(result[1].userId).toBe(5);
    });

    it('should throw NotFoundException when project does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.getWorkload(99)).rejects.toThrow(NotFoundException);
      expect(userRepo.find).not.toHaveBeenCalled();
    });
  });
});
