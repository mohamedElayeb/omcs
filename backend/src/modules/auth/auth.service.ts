import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../entities';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User) private userRepo: Repository<User>,
        private jwtService: JwtService,
    ) { }

    async login(dto: LoginDto) {
        const user = await this.userRepo.findOne({
            where: { email: dto.email, isActive: true },
            relations: ['branch'],
        });
        if (!user) throw new UnauthorizedException('Invalid credentials');

        const valid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!valid) throw new UnauthorizedException('Invalid credentials');

        const payload = { sub: user.id, role: user.role, branchId: user.branchId };
        return {
            accessToken: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                branch: user.branch,
                maxDiscountPercent: user.maxDiscountPercent,
                maxDiscountValue: user.maxDiscountValue,
            },
        };
    }

    async verifyManagerPin(branchId: string, pin: string) {
        const manager = await this.userRepo.findOne({
            where: { overridePin: pin, isActive: true, role: 'MANAGER' as any },
        });
        if (!manager) throw new UnauthorizedException('Invalid manager PIN');
        return { managerId: manager.id, managerName: manager.fullName };
    }

    async getProfile(userId: string) {
        return this.userRepo.findOne({
            where: { id: userId },
            relations: ['branch'],
            select: ['id', 'email', 'fullName', 'role', 'branchId', 'createdAt', 'maxDiscountPercent', 'maxDiscountValue'],
        });
    }
}
