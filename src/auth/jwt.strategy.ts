import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

export interface JwtUser {
  id: number;
  username: string;
  role: string;
  jti: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  validate(payload: {
    sub: number;
    username: string;
    role: string;
    jti: string;
  }): JwtUser {
    if (this.authService.isBlacklisted(payload.jti)) {
      throw new UnauthorizedException('Token has been revoked');
    }
    // Map sub → id so all controllers consistently use user.id
    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      jti: payload.jti,
    };
  }
}
