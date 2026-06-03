import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User, UserRole } from './user.entity';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
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
});
