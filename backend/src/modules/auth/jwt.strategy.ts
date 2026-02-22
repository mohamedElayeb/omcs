import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService,
        @InjectRepository(User) private userRepo: Repository<User>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: configService.get('JWT_SECRET') || 'fallback-secret',
        } as any);
    }

    async validate(payload: { sub: string; role: string }) {
        const user = await this.userRepo.findOne({
            where: { id: payload.sub, isActive: true },
            relations: ['branch'],
        });
        if (!user) throw new UnauthorizedException();
        return user;
    }
}
