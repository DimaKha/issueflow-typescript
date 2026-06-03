import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/user.entity';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { findByUsername: jest.Mock };
  let jwtService: { sign: jest.Mock };

  const mockUser: Partial<User> = {
    id: 1,
    username: 'admin',
    passwordHash: 'hashed_pw',
    role: UserRole.ADMIN,
  };

  beforeEach(async () => {
    usersService = { findByUsername: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('mock.jwt.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    jwtService.sign.mockReturnValue('mock.jwt.token');
  });

  describe('login', () => {
    it('should return accessToken, tokenType, and expiresIn on valid credentials', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        username: 'admin',
        password: 'secret123',
      });

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.tokenType).toBe('Bearer');
      expect(result.expiresIn).toBe(3600);
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 1,
          username: 'admin',
          role: UserRole.ADMIN,
        }),
      );
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      usersService.findByUsername.mockResolvedValue(null);

      await expect(
        service.login({ username: 'ghost', password: 'any' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ username: 'admin', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('should include a unique jti in each token payload', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login({ username: 'admin', password: 'secret123' });
      await service.login({ username: 'admin', password: 'secret123' });

      const calls = jwtService.sign.mock.calls;
      expect(calls[0][0].jti).toBeDefined();
      expect(calls[1][0].jti).toBeDefined();
      expect(calls[0][0].jti).not.toBe(calls[1][0].jti);
    });
  });

  describe('logout / isBlacklisted', () => {
    it('should blacklist the jti on logout', () => {
      service.logout('test-jti-abc');
      expect(service.isBlacklisted('test-jti-abc')).toBe(true);
    });

    it('should return false for a jti that was never blacklisted', () => {
      expect(service.isBlacklisted('never-seen-jti')).toBe(false);
    });

    it('should not blacklist unrelated jtis', () => {
      service.logout('jti-A');
      expect(service.isBlacklisted('jti-B')).toBe(false);
    });
  });
});
