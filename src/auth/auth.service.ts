import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

export interface AuthTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly tokenDenyList = new Set<string>();

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<AuthTokenResponse> {
    const user = await this.usersService.findByUsername(dto.username);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const jti = randomUUID();
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      jti,
    };

    const accessToken = this.jwtService.sign(payload);
    return { accessToken, tokenType: 'Bearer', expiresIn: 3600 };
  }

  logout(jti: string): void {
    this.tokenDenyList.add(jti);
  }

  isBlacklisted(jti: string): boolean {
    return this.tokenDenyList.has(jti);
  }
}
