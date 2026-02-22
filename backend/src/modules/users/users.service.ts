import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../entities';

@Injectable()
export class UsersService {
    constructor(@InjectRepository(User) private repo: Repository<User>) { }

    findAll() {
        return this.repo.find({
            relations: ['branch'],
            select: ['id', 'email', 'fullName', 'role', 'branchId', 'isActive', 'createdAt'],
            order: { createdAt: 'DESC' },
        });
    }

    async findOne(id: string) {
        const user = await this.repo.findOne({ where: { id }, relations: ['branch'] });
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async create(data: { email: string; password: string; fullName: string; role: string; branchId?: string }) {
        const exists = await this.repo.findOne({ where: { email: data.email } });
        if (exists) throw new ConflictException('Email already registered');
        const hash = await bcrypt.hash(data.password, 10);
        const user = this.repo.create({
            email: data.email, passwordHash: hash,
            fullName: data.fullName, role: data.role as any,
            branchId: data.branchId,
        });
        const saved = await this.repo.save(user);
        return this.findOne(saved.id);
    }

    async update(id: string, data: Partial<User> & { password?: string }) {
        await this.findOne(id);
        if (data.password) {
            (data as any).passwordHash = await bcrypt.hash(data.password, 10);
            delete data.password;
        }
        await this.repo.update(id, data);
        return this.findOne(id);
    }

    async deactivate(id: string) {
        await this.repo.update(id, { isActive: false });
        return { message: 'User deactivated' };
    }
}
