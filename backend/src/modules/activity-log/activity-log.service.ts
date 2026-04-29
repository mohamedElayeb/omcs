import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { ActivityLog } from '../../entities';

@Injectable()
export class ActivityLogService {
    constructor(
        @InjectRepository(ActivityLog) private logRepo: Repository<ActivityLog>,
    ) {}

    /** Log an activity — call this from any service */
    async log(data: {
        action: string;
        entityType: string;
        entityId?: string;
        description: string;
        details?: any;
        userId?: string;
        branchId?: string;
        ipAddress?: string;
    }) {
        const entry = this.logRepo.create({
            action: data.action,
            entityType: data.entityType,
            entityId: data.entityId || undefined,
            description: data.description,
            details: data.details ? JSON.stringify(data.details) : undefined,
            userId: data.userId || undefined,
            branchId: data.branchId || undefined,
            ipAddress: data.ipAddress || undefined,
        } as any);
        return this.logRepo.save(entry);
    }

    /** Query logs with pagination + filters */
    async findAll(query: {
        page?: number;
        limit?: number;
        action?: string;
        entityType?: string;
        userId?: string;
        branchId?: string;
        startDate?: string;
        endDate?: string;
        search?: string;
    }) {
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));

        const qb = this.logRepo.createQueryBuilder('l')
            .leftJoinAndSelect('l.user', 'u');

        if (query.action) qb.andWhere('l.action = :action', { action: query.action });
        if (query.entityType) qb.andWhere('l.entityType = :et', { et: query.entityType });
        if (query.userId) qb.andWhere('l.userId = :uid', { uid: query.userId });
        if (query.branchId) qb.andWhere('l.branchId = :bid', { bid: query.branchId });
        if (query.startDate) qb.andWhere('l.createdAt >= :start', { start: query.startDate });
        if (query.endDate) {
            const endPlusDay = new Date(query.endDate);
            endPlusDay.setDate(endPlusDay.getDate() + 1);
            qb.andWhere('l.createdAt < :end', { end: endPlusDay.toISOString().slice(0, 10) });
        }
        if (query.search) {
            qb.andWhere('(l.description ILIKE :q OR l.action ILIKE :q)', { q: `%${query.search}%` });
        }

        const [logs, total] = await qb.orderBy('l.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();

        return { logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    /** Get action type counts for filter chips */
    async getActionCounts() {
        const raw = await this.logRepo.createQueryBuilder('l')
            .select('l.action', 'action')
            .addSelect('COUNT(*)', 'count')
            .groupBy('l.action')
            .orderBy('count', 'DESC')
            .getRawMany();
        return raw.map(r => ({ action: r.action, count: Number(r.count) }));
    }
}
