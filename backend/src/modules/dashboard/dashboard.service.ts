import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { Sale, SaleItem, Inventory, Branch, User } from '../../entities';

@Injectable()
export class DashboardService {
    constructor(
        @InjectRepository(Sale) private saleRepo: Repository<Sale>,
        @InjectRepository(SaleItem) private itemRepo: Repository<SaleItem>,
        @InjectRepository(Inventory) private invRepo: Repository<Inventory>,
        @InjectRepository(Branch) private branchRepo: Repository<Branch>,
        @InjectRepository(User) private userRepo: Repository<User>,
    ) { }

    private dateRange(days: number) {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);
        start.setHours(0, 0, 0, 0);
        return { start, end };
    }

    async getOverview() {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const { start: weekStart } = this.dateRange(7);
        const { start: monthStart } = this.dateRange(30);

        const [todaySales, weekSales, monthSales, inventory, branches, lowStock] = await Promise.all([
            this.saleRepo.find({ where: { createdAt: Between(today, todayEnd) } }),
            this.saleRepo.find({ where: { createdAt: MoreThanOrEqual(weekStart) } }),
            this.saleRepo.find({ where: { createdAt: MoreThanOrEqual(monthStart) } }),
            this.invRepo.createQueryBuilder('i')
                .leftJoin('i.variant', 'v')
                .select('SUM(i.quantity)', 'totalItems')
                // Inventory value = quantity × historical purchase cost ONLY
                // Fallback to variant.cost_lyd_at_purchase (immutable), NEVER v.cost_price (mutable)
                .addSelect('SUM(i.quantity * COALESCE(i.cost_lyd_at_purchase, v.cost_lyd_at_purchase, 0))', 'totalValue')
                .getRawOne(),
            this.branchRepo.count({ where: { isActive: true } }),
            this.invRepo.count({ where: { quantity: MoreThanOrEqual(0) } }),
        ]);

        const sum = (arr: Sale[], key: 'total' | 'profit') => arr.reduce((s, x) => s + Number(x[key]), 0);

        const lowStockItems = await this.invRepo.createQueryBuilder('i')
            .where('i.quantity <= i.lowStockThreshold')
            .getCount();

        return {
            today: { sales: sum(todaySales, 'total'), profit: sum(todaySales, 'profit'), count: todaySales.length },
            week: { sales: sum(weekSales, 'total'), profit: sum(weekSales, 'profit'), count: weekSales.length },
            month: { sales: sum(monthSales, 'total'), profit: sum(monthSales, 'profit'), count: monthSales.length },
            inventory: {
                totalItems: Number(inventory?.totalItems || 0),
                totalValue: Number(inventory?.totalValue || 0),  // = quantity × costLydAtPurchase
                lowStockCount: lowStockItems,
            },
            branches,
        };
    }

    async getRevenueTrend(days = 7) {
        const { start } = this.dateRange(days);
        const sales = await this.saleRepo.find({ where: { createdAt: MoreThanOrEqual(start) } });

        const trend: Record<string, { sales: number; profit: number }> = {};
        for (let i = 0; i < days; i++) {
            const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
            trend[d.toISOString().slice(0, 10)] = { sales: 0, profit: 0 };
        }
        for (const s of sales) {
            const key = new Date(s.createdAt).toISOString().slice(0, 10);
            if (trend[key]) {
                trend[key].sales += Number(s.total);
                trend[key].profit += Number(s.profit);
            }
        }
        return Object.entries(trend).map(([date, data]) => ({ date, ...data }));
    }

    async getTopProducts(limit = 10) {
        return this.itemRepo.createQueryBuilder('si')
            .select('si.variantId', 'variantId')
            .addSelect('v.sku', 'sku')
            .addSelect('p.name', 'productName')
            .addSelect('v.size', 'size')
            .addSelect('v.color', 'color')
            .addSelect('SUM(si.quantity)', 'totalQty')
            .addSelect('SUM(si.lineTotal)', 'totalRevenue')
            .leftJoin('si.variant', 'v')
            .leftJoin('v.product', 'p')
            .groupBy('si.variantId')
            .addGroupBy('v.sku').addGroupBy('p.name').addGroupBy('v.size').addGroupBy('v.color')
            .orderBy('"totalQty"', 'DESC')
            .limit(limit)
            .getRawMany();
    }

    async getBranchComparison() {
        const branches = await this.branchRepo.find({ where: { isActive: true } });
        const { start: monthStart } = this.dateRange(30);
        const result: { branchId: string; branchName: string; branchNameEn: string; totalSales: number; totalProfit: number; transactionCount: number }[] = [];
        for (const b of branches) {
            const sales = await this.saleRepo.find({
                where: { branchId: b.id, createdAt: MoreThanOrEqual(monthStart) },
            });
            result.push({
                branchId: b.id, branchName: b.name, branchNameEn: b.nameEn,
                totalSales: sales.reduce((s, x) => s + Number(x.total), 0),
                totalProfit: sales.reduce((s, x) => s + Number(x.profit), 0),
                transactionCount: sales.length,
            });
        }
        return result;
    }

    async getEmployeeRanking() {
        const { start: monthStart } = this.dateRange(30);
        return this.saleRepo.createQueryBuilder('s')
            .select('s.cashierId', 'userId')
            .addSelect('u.fullName', 'fullName')
            .addSelect('b.name', 'branchName')
            .addSelect('COUNT(s.id)', 'transactionCount')
            .addSelect('SUM(s.total)', 'totalSales')
            .leftJoin('s.cashier', 'u')
            .leftJoin('u.branch', 'b')
            .where('s.createdAt >= :start', { start: monthStart })
            .groupBy('s.cashierId').addGroupBy('u.fullName').addGroupBy('b.name')
            .orderBy('"totalSales"', 'DESC')
            .getRawMany();
    }
}
