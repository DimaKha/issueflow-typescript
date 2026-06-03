import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CommentsService } from './comments.service';
import { Comment } from './comment.entity';
import { TicketsService } from '../tickets/tickets.service';
import { UsersService } from '../users/users.service';

const mockUser = (id: number, username: string) => ({
  id,
  username,
  fullName: `User ${username}`,
  email: `${username}@test.com`,
  passwordHash: 'hashed',
});

const mockComment = (overrides: Partial<Comment> = {}): Comment =>
  ({
    id: 1,
    ticketId: 10,
    authorId: 1,
    content: 'Hello world',
    mentionedUsers: [],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }) as Comment;

describe('CommentsService', () => {
  let service: CommentsService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    softRemove: jest.Mock;
  };
  let manager: {
    findOne: jest.Mock;
    update: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let ticketsService: { findOne: jest.Mock };
  let usersService: { findOne: jest.Mock; findByUsername: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      softRemove: jest.fn(),
    };

    manager = {
      findOne: jest.fn(),
      update: jest.fn(),
      save: jest.fn(),
    };

    // transaction mock: immediately calls the callback with the mock manager
    dataSource = {
      transaction: jest.fn().mockImplementation((cb: any) => cb(manager)),
    };

    ticketsService = { findOne: jest.fn().mockResolvedValue({ id: 10 }) };
    usersService = {
      findOne: jest.fn().mockResolvedValue({ id: 1 }),
      findByUsername: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: repo },
        { provide: DataSource, useValue: dataSource },
        { provide: TicketsService, useValue: ticketsService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
  });

  // ──────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────
  describe('create', () => {
    it('should create comment without mentions', async () => {
      const saved = mockComment();
      repo.create.mockReturnValue(saved);
      repo.save.mockResolvedValue(saved);
      repo.findOne.mockResolvedValue({ ...saved, mentionedUsers: [] });

      const result = await service.create(10, { authorId: 1, content: 'Hello world' });

      expect(ticketsService.findOne).toHaveBeenCalledWith(10);
      expect(usersService.findOne).toHaveBeenCalledWith(1);
      expect(result.mentionedUsers).toEqual([]);
    });

    it('should resolve and include valid @mentions in mentionedUsers', async () => {
      const jane = mockUser(2, 'jane');
      usersService.findByUsername.mockResolvedValue(jane);

      const saved = mockComment({ content: 'Hi @jane', mentionedUsers: [jane] as any });
      repo.create.mockReturnValue(saved);
      repo.save.mockResolvedValue(saved);
      repo.findOne.mockResolvedValue({ ...saved, mentionedUsers: [jane] });

      const result = await service.create(10, { authorId: 1, content: 'Hi @jane' });

      expect(result.mentionedUsers).toEqual([
        { id: 2, username: 'jane', fullName: 'User jane' },
      ]);
    });

    it('should throw 400 for unknown @mention', async () => {
      usersService.findByUsername.mockResolvedValue(null);

      await expect(
        service.create(10, { authorId: 1, content: 'Hey @ghost' }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      ticketsService.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.create(99, { authorId: 1, content: 'Hello' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when author does not exist', async () => {
      usersService.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.create(10, { authorId: 99, content: 'Hello' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────
  // findAll
  // ──────────────────────────────────────────────
  describe('findAll', () => {
    it('should return comments for the given ticket with projected mentionedUsers', async () => {
      const user = mockUser(2, 'alice');
      const comment = mockComment({ mentionedUsers: [user] as any });
      repo.find.mockResolvedValue([comment]);

      const result = await service.findAll(10);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ticketId: 10 }, relations: ['mentionedUsers'] }),
      );
      expect(result[0].mentionedUsers).toEqual([
        { id: 2, username: 'alice', fullName: 'User alice' },
      ]);
      // passwordHash must not appear
      expect((result[0].mentionedUsers[0] as any).passwordHash).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────
  // update — optimistic locking
  // ──────────────────────────────────────────────
  describe('update — optimistic locking', () => {
    it('should update with matching version and increment to version+1', async () => {
      const existing    = mockComment({ version: 3 });
      const withRelations = mockComment({ version: 4, content: 'Updated', mentionedUsers: [] });
      const afterSave   = mockComment({ version: 4, content: 'Updated', mentionedUsers: [] });

      manager.findOne
        .mockResolvedValueOnce(existing)       // existence check
        .mockResolvedValueOnce(withRelations); // load with relations before save
      manager.update.mockResolvedValue({ affected: 1 });
      manager.save.mockResolvedValue(afterSave);

      const result = await service.update(10, 1, { content: 'Updated', version: 3 });

      expect(manager.update).toHaveBeenCalledWith(
        Comment,
        { id: 1, version: 3 },
        expect.objectContaining({ version: 4 }),
      );
      expect(result.version).toBe(4);
    });

    it('should throw ConflictException on stale version (entity still exists)', async () => {
      // mockResolvedValue (not Once) returns the same value for all calls:
      // 1st call = existence check, 2nd call = re-check inside 0-affected branch → entity exists → 409
      manager.findOne.mockResolvedValue(mockComment({ version: 5 }));
      manager.update.mockResolvedValue({ affected: 0 });

      await expect(service.update(10, 1, { content: 'X', version: 2 })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException when comment is deleted between check and update', async () => {
      manager.findOne
        .mockResolvedValueOnce(mockComment()) // existence check passes
        .mockResolvedValueOnce(null);          // re-check inside 0-affected branch → gone → 404
      manager.update.mockResolvedValue({ affected: 0 });

      await expect(service.update(10, 1, { content: 'X', version: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('UpdateCommentDto should require version — missing version fails DTO validation', async () => {
      const { validate } = await import('class-validator');
      const { plainToInstance } = await import('class-transformer');
      const { UpdateCommentDto: Dto } = await import('./dto/update-comment.dto');
      const dto = plainToInstance(Dto, { content: 'Hello' });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'version')).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────
  // update — mention replacement
  // ──────────────────────────────────────────────
  describe('update — mention replacement', () => {
    it('should replace mentionedUsers with those from updated content', async () => {
      const bob = mockUser(3, 'bob');
      usersService.findByUsername.mockResolvedValue(bob);

      const existing      = mockComment();
      const withRelations = mockComment({ mentionedUsers: [] as any });
      const afterSave     = mockComment({ mentionedUsers: [bob] as any });

      manager.findOne
        .mockResolvedValueOnce(existing)       // existence check
        .mockResolvedValueOnce(withRelations); // load with relations before save
      manager.update.mockResolvedValue({ affected: 1 });
      manager.save.mockResolvedValue(afterSave);

      const result = await service.update(10, 1, { content: 'Hey @bob', version: 1 });

      expect(result.mentionedUsers).toEqual([
        { id: 3, username: 'bob', fullName: 'User bob' },
      ]);
    });

    it('should throw 400 when updated content mentions unknown user', async () => {
      usersService.findByUsername.mockResolvedValue(null);

      await expect(
        service.update(10, 1, { content: 'Hi @nobody', version: 1 }),
      ).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // update — ticket mismatch
  // ──────────────────────────────────────────────
  describe('update — ticket / comment mismatch', () => {
    it('should throw NotFoundException when comment belongs to a different ticket', async () => {
      manager.findOne.mockResolvedValue(mockComment({ ticketId: 999 }));

      await expect(service.update(10, 1, { content: 'X', version: 1 })).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when comment does not exist', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(service.update(10, 99, { content: 'X', version: 1 })).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────
  // remove
  // ──────────────────────────────────────────────
  describe('remove', () => {
    it('should soft-delete the comment', async () => {
      const comment = mockComment();
      repo.findOne.mockResolvedValue(comment);
      repo.softRemove.mockResolvedValue(undefined);

      await service.remove(10, 1);

      expect(repo.softRemove).toHaveBeenCalledWith(comment);
    });

    it('should throw NotFoundException when comment does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove(10, 99)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when comment belongs to a different ticket', async () => {
      repo.findOne.mockResolvedValue(mockComment({ ticketId: 999 }));

      await expect(service.remove(10, 1)).rejects.toThrow(NotFoundException);
    });
  });
});
