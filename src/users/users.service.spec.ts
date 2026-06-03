import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User, UserRole } from './user.entity';
import { Comment } from '../comments/comment.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true),
}));

describe('UsersService', () => {
  let service: UsersService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let commentRepo: {
    createQueryBuilder: jest.Mock;
    find: jest.Mock;
  };
  // Reusable chainable QB mock — reset getManyAndCount per test
  let mockQbGetManyAndCount: jest.Mock;
  let mockQb: Record<string, jest.Mock>;

  const mockUser: User = {
    id: 1,
    username: 'jdoe',
    email: 'jdoe@test.com',
    fullName: 'John Doe',
    passwordHash: 'hashed_password',
    role: UserRole.DEVELOPER,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    mockQbGetManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    mockQb = {
      innerJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: mockQbGetManyAndCount,
    } as unknown as Record<string, jest.Mock>;
    commentRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: getRepositoryToken(Comment), useValue: commentRepo },
        { provide: AuditLogService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
  });

  describe('create', () => {
    it('should hash password and save user', async () => {
      repo.create.mockReturnValue(mockUser);
      repo.save.mockResolvedValue(mockUser);

      const result = await service.create({
        username: 'jdoe',
        email: 'jdoe@test.com',
        fullName: 'John Doe',
        role: UserRole.DEVELOPER,
        password: 'secret123',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('secret123', 10);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'hashed_password' }),
      );
      expect(result).toEqual(mockUser);
    });

    it('should throw ConflictException on duplicate username or email', async () => {
      repo.create.mockReturnValue(mockUser);
      repo.save.mockRejectedValue({ code: '23505' });

      await expect(
        service.create({
          username: 'jdoe',
          email: 'jdoe@test.com',
          fullName: 'John Doe',
          role: UserRole.DEVELOPER,
          password: 'secret123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should rethrow unknown errors from save', async () => {
      repo.create.mockReturnValue(mockUser);
      repo.save.mockRejectedValue(new Error('unexpected'));

      await expect(
        service.create({
          username: 'jdoe',
          email: 'jdoe@test.com',
          fullName: 'John Doe',
          role: UserRole.DEVELOPER,
          password: 'secret123',
        }),
      ).rejects.toThrow('unexpected');
    });
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      repo.find.mockResolvedValue([mockUser]);
      expect(await service.findAll()).toEqual([mockUser]);
      expect(repo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('should return user by id', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      expect(await service.findOne(1)).toEqual(mockUser);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should throw NotFoundException for missing id', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update non-password fields', async () => {
      repo.findOne.mockResolvedValue({ ...mockUser });
      repo.save.mockResolvedValue({ ...mockUser, fullName: 'Jane Doe' });

      const result = await service.update(1, { fullName: 'Jane Doe' });

      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(result.fullName).toBe('Jane Doe');
    });

    it('should hash password if provided in update body', async () => {
      repo.findOne.mockResolvedValue({ ...mockUser });
      repo.save.mockResolvedValue({ ...mockUser });

      await service.update(1, { password: 'newpassword' });

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword', 10);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update(999, { fullName: 'Jane' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException on duplicate username in update', async () => {
      repo.findOne.mockResolvedValue({ ...mockUser });
      repo.save.mockRejectedValue({ code: '23505' });

      await expect(
        service.update(1, { username: 'existing_user' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should remove the user', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      repo.remove.mockResolvedValue(mockUser);

      await expect(service.remove(1)).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith(mockUser);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────
  // getMentions
  // ──────────────────────────────────────────────
  describe('getMentions', () => {
    const mockComment = {
      id: 10,
      ticketId: 5,
      content: 'Fix this @jdoe',
      authorId: 2,
      mentionedUsers: [
        { id: 1, username: 'jdoe', fullName: 'John Doe', passwordHash: 'secret' },
      ],
      createdAt: new Date('2024-01-01'),
      deletedAt: null,
    };

    it('should return { data, total, page } with correct item shape', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      mockQbGetManyAndCount.mockResolvedValue([[{ id: 10 }], 1]);
      commentRepo.find.mockResolvedValue([mockComment]);

      const result = await service.getMentions(1);

      expect(result.page).toBe(1);
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      const item = result.data[0];
      expect(item.id).toBe(10);
      expect(item.ticketId).toBe(5);
      expect(item.content).toBe('Fix this @jdoe');
      expect(item.authorId).toBe(2);
      expect(item.mentionedUsers[0]).toEqual({ id: 1, username: 'jdoe', fullName: 'John Doe' });
      expect(item.mentionedUsers[0]).not.toHaveProperty('passwordHash');
      expect(item).not.toHaveProperty('commentId');
    });

    it('should use default page=1 and pageSize=20', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      mockQbGetManyAndCount.mockResolvedValue([[], 0]);

      await service.getMentions(1);

      expect(mockQb.skip).toHaveBeenCalledWith(0);   // (1 - 1) * 20
      expect(mockQb.take).toHaveBeenCalledWith(20);
    });

    it('should apply custom page and pageSize', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      mockQbGetManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.getMentions(1, 3, 5);

      expect(mockQb.skip).toHaveBeenCalledWith(10);  // (3 - 1) * 5
      expect(mockQb.take).toHaveBeenCalledWith(5);
      expect(result.page).toBe(3);
    });

    it('should return { data: [], total: 0, page } when no mentions exist (deleted filtered by TypeORM)', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      mockQbGetManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.getMentions(1);

      expect(result).toEqual({ data: [], total: 0, page: 1 });
      expect(commentRepo.find).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.getMentions(99)).rejects.toThrow(NotFoundException);
      expect(commentRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should filter on non-deleted tickets via innerJoin condition', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      mockQbGetManyAndCount.mockResolvedValue([[], 0]);

      await service.getMentions(1);

      // Verify the tickets join includes the deleted_at IS NULL guard
      // innerJoin('tickets', 't', 'condition') → args[0]='tickets', args[2]=condition
      const joinCalls = (mockQb.innerJoin as jest.Mock).mock.calls;
      const ticketJoin = joinCalls.find((args: any[]) =>
        typeof args[0] === 'string' && args[0].includes('ticket'),
      );
      expect(ticketJoin).toBeDefined();
      expect(ticketJoin![2]).toContain('deleted_at IS NULL');
    });
  });
});
