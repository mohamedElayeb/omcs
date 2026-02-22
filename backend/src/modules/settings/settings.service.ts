import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting, ProductVariant, PriceHistory } from '../../entities';

// Default settings
const DEFAULTS: Record<string, string> = {
    parallelUsdRate: '6.30',
    sellingUsdRate: '6.30',
    defaultMarginPercent: '35',
};

@Injectable()
export class SettingsService {
    constructor(
        @InjectRepository(SystemSetting) private settingsRepo: Repository<SystemSetting>,
        @InjectRepository(ProductVariant) private variantRepo: Repository<ProductVariant>,
        @InjectRepository(PriceHistory) private priceHistoryRepo: Repository<PriceHistory>,
    ) { }

    async getAll(): Promise<Record<string, string>> {
        const rows = await this.settingsRepo.find();
        const result: Record<string, string> = { ...DEFAULTS };
        for (const r of rows) result[r.key] = r.value;
        return result;
    }

    async get(key: string): Promise<string> {
        const row = await this.settingsRepo.findOne({ where: { key } });
        return row?.value ?? DEFAULTS[key] ?? '';
    }

    async getNumber(key: string): Promise<number> {
        return Number(await this.get(key)) || 0;
    }

    async set(key: string, value: string, userId: string): Promise<SystemSetting> {
        let row = await this.settingsRepo.findOne({ where: { key } });
        if (row) {
            row.value = value;
            row.updatedBy = userId;
        } else {
            row = this.settingsRepo.create({ key, value, updatedBy: userId });
        }
        return this.settingsRepo.save(row);
    }

    /**
     * Update the PURCHASE USD rate. This does NOT trigger any recalculation.
     * It's just stored as the default rate for new purchases.
     * Historical purchase costs are NEVER changed.
     */
    async updatePurchaseUsdRate(
        newRate: number,
        userId: string,
    ): Promise<{ rate: number }> {
        await this.set('parallelUsdRate', String(newRate), userId);
        return { rate: newRate };
    }

    /**
     * Update the SELLING USD rate and recalculate ALL sale prices.
     * salePrice = sellUsd × sellingUsdRate, rounded UP to nearest 5 LYD.
     * 
     * NEVER touches: costUsd, costPrice, costLydAtPurchase, purchaseUsdRate
     */
    async updateSellingUsdRate(
        newRate: number,
        userId: string,
        recalculate: boolean,
        filters?: { categoryId?: string; brand?: string },
    ): Promise<{ rate: number; updated: number }> {
        const oldRate = await this.getNumber('sellingUsdRate');
        await this.set('sellingUsdRate', String(newRate), userId);

        let updated = 0;
        if (recalculate) {
            updated = await this.recalculateSalePrices(newRate, userId, filters, oldRate);
        }
        return { rate: newRate, updated };
    }

    /**
     * Legacy alias: update USD rate (updates sellingUsdRate and recalculates).
     */
    async updateUsdRate(
        newRate: number,
        userId: string,
        recalculate: boolean,
        filters?: { categoryId?: string; brand?: string },
    ): Promise<{ rate: number; updated: number }> {
        return this.updateSellingUsdRate(newRate, userId, recalculate, filters);
    }

    /**
     * Recalculate ONLY salePrice for variants that have sellUsd set.
     * Formula: salePrice = sellUsd × sellingUsdRate, rounded UP to nearest 5 LYD.
     * 
     * For variants without sellUsd but with costUsd, falls back to margin-based:
     *   salePrice = (costUsd × sellingUsdRate) / (1 - margin/100)
     * 
     * costPrice and costLydAtPurchase are NEVER touched — they are historical purchase data.
     */
    async recalculateSalePrices(
        sellingRate: number,
        userId: string,
        filters?: { categoryId?: string; brand?: string },
        oldRate?: number,
    ): Promise<number> {
        const defaultMargin = await this.getNumber('defaultMarginPercent');

        const qb = this.variantRepo.createQueryBuilder('v')
            .leftJoinAndSelect('v.product', 'p')
            .where('(v.sellUsd IS NOT NULL OR v.costUsd IS NOT NULL)');
        if (filters?.categoryId) qb.andWhere('p.categoryId = :cid', { cid: filters.categoryId });
        if (filters?.brand) qb.andWhere('p.brand ILIKE :b', { b: `%${filters.brand}%` });

        const variants = await qb.getMany();
        let updated = 0;

        for (const v of variants) {
            let newSalePrice: number;

            const sellUsd = Number(v.sellUsd);
            if (sellUsd > 0) {
                // Primary: sellUsd × sellingUsdRate
                newSalePrice = Math.ceil((sellUsd * sellingRate) / 5) * 5;
            } else {
                // Fallback: margin-based from costUsd
                const costUsd = Number(v.costUsd);
                if (!costUsd || costUsd <= 0) continue;
                const margin = Number(v.marginPercent) || defaultMargin;
                const rawSalePrice = (costUsd * sellingRate) / (1 - margin / 100);
                newSalePrice = Math.ceil(rawSalePrice / 5) * 5;
            }

            const oldSalePrice = Number(v.salePrice);
            const oldCostPrice = Number(v.costPrice);

            // Only log and update if sale price actually changed
            if (newSalePrice !== oldSalePrice) {
                await this.priceHistoryRepo.save(this.priceHistoryRepo.create({
                    variantId: v.id,
                    oldCostPrice: oldCostPrice,
                    newCostPrice: oldCostPrice, // Cost price NEVER changes
                    oldSalePrice: oldSalePrice,
                    newSalePrice: newSalePrice,
                    changedBy: userId,
                    reason: `Selling USD rate update: ${oldRate ?? '?'} → ${sellingRate} (sale price only)`,
                }));

                const profitMargin = oldCostPrice > 0
                    ? ((newSalePrice - oldCostPrice) / newSalePrice) * 100
                    : 0;
                await this.variantRepo.update(v.id, {
                    salePrice: newSalePrice,
                    profitMargin: Math.round(profitMargin * 100) / 100,
                    // costPrice is NOT updated
                    // costLydAtPurchase is NOT updated
                    // costUsd is NOT updated
                    // purchaseUsdRate is NOT updated
                });
                updated++;
            }
        }

        return updated;
    }
}
