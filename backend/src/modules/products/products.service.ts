import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Product, ProductVariant, Category, PriceHistory, Inventory, User } from '../../entities';
import { ProductImage } from '../../entities/product-image.entity';
import { EventsGateway } from '../events/events.gateway';
import { ActivityLogService } from '../activity-log/activity-log.service';

// Round UP to nearest 5 LYD (Libya pricing convention)
const roundUp5 = (price: number): number => Math.ceil(price / 5) * 5;

@Injectable()
export class ProductsService {
    constructor(
        @InjectRepository(Product) private productRepo: Repository<Product>,
        @InjectRepository(ProductVariant) private variantRepo: Repository<ProductVariant>,
        @InjectRepository(Category) private categoryRepo: Repository<Category>,
        @InjectRepository(PriceHistory) private priceHistoryRepo: Repository<PriceHistory>,
        @InjectRepository(Inventory) private invRepo: Repository<Inventory>,
        @InjectRepository(ProductImage) private imageRepo: Repository<ProductImage>,
        private dataSource: DataSource,
        private events: EventsGateway,
        private activityLog: ActivityLogService,
    ) { }

    // ── Categories ──
    findAllCategories() { return this.categoryRepo.find(); }
    createCategory(data: Partial<Category>) { return this.categoryRepo.save(this.categoryRepo.create(data)); }

    // ── Products ──
    findAll(query?: { categoryId?: string; brand?: string; search?: string }) {
        const qb = this.productRepo.createQueryBuilder('p')
            .leftJoinAndSelect('p.variants', 'v')
            .leftJoinAndSelect('p.category', 'c')
            .leftJoinAndSelect('p.images', 'img')
            .where('p.isActive = true');
        if (query?.categoryId) qb.andWhere('p.categoryId = :cid', { cid: query.categoryId });
        if (query?.brand) qb.andWhere('p.brand ILIKE :brand', { brand: `%${query.brand}%` });
        if (query?.search) qb.andWhere('(p.name ILIKE :s OR p.brand ILIKE :s)', { s: `%${query.search}%` });
        return qb.orderBy('p.createdAt', 'DESC').addOrderBy('img.sortOrder', 'ASC').getMany();
    }

    async findOne(id: string) {
        const product = await this.productRepo.findOne({
            where: { id },
            relations: ['variants', 'category', 'images'],
        });
        if (!product) throw new NotFoundException('Product not found');
        return product;
    }

    async findBySku(sku: string) {
        const variant = await this.variantRepo.findOne({
            where: { sku },
            relations: ['product', 'product.category', 'product.images'],
        });
        if (!variant) throw new NotFoundException('Product variant not found');
        return variant;
    }

    async create(data: {
        name: string; nameAr?: string; brand?: string; categoryId?: string; imageUrl?: string;
        variants?: Partial<ProductVariant>[];
        initialStock?: { branchId: string; quantities?: Record<string, number> };
    }) {
        const product = this.productRepo.create({
            name: data.name, nameAr: data.nameAr, brand: data.brand,
            categoryId: data.categoryId, imageUrl: data.imageUrl,
        });
        const saved = await this.productRepo.save(product);

        if (data.variants?.length) {
            for (const v of data.variants) {
                const cp = Number(v.costPrice || 0);
                const sp = roundUp5(Number(v.salePrice || 0));
                const margin = sp && cp ? ((sp - cp) / sp) * 100 : null;

                const variant = await this.variantRepo.save(this.variantRepo.create({
                    ...v,
                    productId: saved.id,
                    salePrice: sp as any, // Always use rounded value
                    profitMargin: margin != null ? Math.round(margin * 100) / 100 : undefined,
                    // Preserve purchase data
                    purchaseUsdRate: v.purchaseUsdRate ? Number(v.purchaseUsdRate) : undefined,
                    costLydAtPurchase: v.costLydAtPurchase ? Number(v.costLydAtPurchase) : (cp || undefined),
                    purchaseDate: v.purchaseDate || undefined,
                }));

                // Create inventory batch with purchase cost data for this variant
                if (data.initialStock?.branchId) {
                    const qty = data.initialStock.quantities?.[variant.id] ||
                        data.initialStock.quantities?.[v.sku as string] || 0;
                    await this.invRepo.save(this.invRepo.create({
                        variantId: variant.id,
                        branchId: data.initialStock.branchId,
                        quantity: qty,
                        // Propagate purchase cost to inventory batch
                        costUsd: v.costUsd ? Number(v.costUsd) : undefined,
                        purchaseUsdRate: v.purchaseUsdRate ? Number(v.purchaseUsdRate) : undefined,
                        costLydAtPurchase: v.costLydAtPurchase ? Number(v.costLydAtPurchase) : (cp || undefined),
                        purchaseDate: v.purchaseDate || new Date().toISOString().slice(0, 10),
                    }));
                }
            }
        }
        const result = await this.findOne(saved.id);
        this.events.emitProductChanged({ productId: saved.id, action: 'created' });
        this.activityLog.log({
            action: 'PRODUCT_CREATE',
            entityType: 'product',
            entityId: saved.id,
            description: `إنشاء منتج: ${data.name} — ${data.variants?.length || 0} متغير`,
            details: { name: data.name, brand: data.brand, variants: data.variants?.length },
        }).catch(() => {});
        return result;
    }

    async update(id: string, data: Partial<Product>) {
        await this.findOne(id);
        await this.productRepo.update(id, data);
        const result = await this.findOne(id);
        this.events.emitProductChanged({ productId: id, action: 'updated' });
        this.activityLog.log({
            action: 'PRODUCT_EDIT',
            entityType: 'product',
            entityId: id,
            description: `تعديل منتج: ${result.name}`,
            details: { changes: data },
        }).catch(() => {});
        return result;
    }

    // ── Variants ──
    async addVariant(productId: string, data: Partial<ProductVariant>) {
        await this.findOne(productId);
        const margin = data.salePrice && data.costPrice
            ? ((Number(data.salePrice) - Number(data.costPrice)) / Number(data.salePrice)) * 100
            : null;
        const result = await this.variantRepo.save(this.variantRepo.create({
            ...data, productId, profitMargin: margin ?? undefined,
        }));
        this.events.emitProductChanged({ productId, action: 'updated' });
        return result;
    }

    async updateVariant(variantId: string, data: Partial<ProductVariant>, changedBy: string, reason?: string) {
        const variant = await this.variantRepo.findOne({ where: { id: variantId } });
        if (!variant) throw new NotFoundException('Variant not found');

        // Log price change if price is being updated
        const priceChanged = (data.salePrice && roundUp5(Number(data.salePrice)) !== Number(variant.salePrice))
            || (data.costPrice && Number(data.costPrice) !== Number(variant.costPrice));

        // Always round sale price to nearest 5
        if (data.salePrice) {
            data.salePrice = roundUp5(Number(data.salePrice)) as any;
        }

        if (priceChanged) {
            await this.priceHistoryRepo.save(this.priceHistoryRepo.create({
                variantId,
                oldCostPrice: variant.costPrice,
                newCostPrice: data.costPrice ? Number(data.costPrice) : variant.costPrice,
                oldSalePrice: variant.salePrice,
                newSalePrice: data.salePrice ? Number(data.salePrice) : variant.salePrice,
                changedBy,
                reason,
            }));
        }

        if (data.salePrice || data.costPrice) {
            const sp = Number(data.salePrice ?? variant.salePrice);
            const cp = Number(data.costPrice ?? variant.costPrice);
            data.profitMargin = ((sp - cp) / sp) * 100;
        }

        // Never allow changing historical purchase data through price updates
        delete (data as any).purchaseUsdRate;
        delete (data as any).costLydAtPurchase;
        delete (data as any).purchaseDate;
        delete (data as any).reason; // reason is for price history, not a variant column

        await this.variantRepo.update(variantId, data);
        const result = await this.variantRepo.findOne({ where: { id: variantId }, relations: ['product'] });
        if (result?.product?.id) {
            this.events.emitProductChanged({ productId: result.product.id, action: 'updated' });
        }
        return result;
    }

    // ── Bulk Price Update ──
    async bulkPriceUpdate(
        percentChange: number,
        userId: string,
        filters?: { categoryId?: string; brand?: string },
        reason?: string,
    ) {
        const qb = this.variantRepo.createQueryBuilder('v')
            .leftJoinAndSelect('v.product', 'p');
        if (filters?.categoryId) qb.andWhere('p.categoryId = :cid', { cid: filters.categoryId });
        if (filters?.brand) qb.andWhere('p.brand ILIKE :b', { b: `%${filters.brand}%` });

        const variants = await qb.getMany();
        const multiplier = 1 + (percentChange / 100);
        let updated = 0;

        for (const v of variants) {
            const oldSalePrice = Number(v.salePrice);
            const newSalePrice = roundUp5(oldSalePrice * multiplier);

            await this.priceHistoryRepo.save(this.priceHistoryRepo.create({
                variantId: v.id,
                oldCostPrice: v.costPrice,
                newCostPrice: v.costPrice, // Cost never changes with bulk update
                oldSalePrice,
                newSalePrice,
                changedBy: userId,
                reason: reason || `Bulk ${percentChange > 0 ? '+' : ''}${percentChange}% adjustment`,
            }));

            const cp = Number(v.costPrice);
            const margin = ((newSalePrice - cp) / newSalePrice) * 100;
            await this.variantRepo.update(v.id, {
                salePrice: newSalePrice,
                profitMargin: Math.round(margin * 100) / 100,
            });
            updated++;
        }

        return { updated, percentChange };
    }

    // ── Price History ──
    getPriceHistory(variantId?: string) {
        const qb = this.priceHistoryRepo.createQueryBuilder('ph')
            .leftJoinAndSelect('ph.variant', 'v')
            .leftJoinAndSelect('v.product', 'p')
            .leftJoinAndSelect('ph.changedByUser', 'u');
        if (variantId) qb.where('ph.variantId = :vid', { vid: variantId });
        return qb.orderBy('ph.changedAt', 'DESC').limit(100).getMany();
    }

    // ── Ensure inventory rows exist ──
    async ensureInventoryRows(variantIds: string[], branchId: string) {
        for (const variantId of variantIds) {
            const existing = await this.invRepo.findOne({ where: { variantId, branchId } });
            if (!existing) {
                await this.invRepo.save(this.invRepo.create({ variantId, branchId, quantity: 0 }));
            }
        }
    }

    // ── Product Images ──
    async addImage(productId: string, imageUrl: string, isPrimary = false) {
        await this.findOne(productId);
        const maxOrder = await this.imageRepo.createQueryBuilder('img')
            .where('img.productId = :pid', { pid: productId })
            .select('MAX(img.sortOrder)', 'maxSort')
            .getRawOne();
        const sortOrder = (maxOrder?.maxSort ?? -1) + 1;

        // If isPrimary, unset other primaries
        if (isPrimary) {
            await this.imageRepo.update({ productId }, { isPrimary: false });
            // Also update product.imageUrl for backward compat
            await this.productRepo.update(productId, { imageUrl });
        }

        // If this is the first image, make it primary automatically
        const count = await this.imageRepo.count({ where: { productId } });
        if (count === 0) {
            isPrimary = true;
            await this.productRepo.update(productId, { imageUrl });
        }

        const img = await this.imageRepo.save(this.imageRepo.create({
            productId, imageUrl, sortOrder, isPrimary,
        }));
        this.events.emitProductChanged({ productId, action: 'updated' });
        return img;
    }

    async removeImage(imageId: string) {
        const img = await this.imageRepo.findOne({ where: { id: imageId } });
        if (!img) throw new NotFoundException('Image not found');
        await this.imageRepo.remove(img);

        // If removed image was primary, promote next image
        if (img.isPrimary) {
            const next = await this.imageRepo.findOne({
                where: { productId: img.productId },
                order: { sortOrder: 'ASC' },
            });
            if (next) {
                await this.imageRepo.update(next.id, { isPrimary: true });
                await this.productRepo.update(img.productId, { imageUrl: next.imageUrl });
            } else {
                await this.productRepo.update(img.productId, { imageUrl: null as any });
            }
        }
        this.events.emitProductChanged({ productId: img.productId, action: 'updated' });
        return { deleted: true };
    }

    async getImages(productId: string) {
        return this.imageRepo.find({
            where: { productId },
            order: { sortOrder: 'ASC' },
        });
    }

    async deleteProduct(productId: string) {
        const product = await this.productRepo.findOne({
            where: { id: productId },
            relations: ['variants', 'images'],
        });
        if (!product) throw new NotFoundException('Product not found');

        // Delete in order: images → inventory → variants → product
        await this.imageRepo.delete({ productId });
        for (const v of product.variants || []) {
            await this.invRepo.delete({ variantId: v.id });
        }
        await this.variantRepo.delete({ productId });
        await this.productRepo.remove(product);

        return { deleted: true, id: productId };
    }

    async deleteVariant(variantId: string) {
        const variant = await this.variantRepo.findOne({ where: { id: variantId } });
        if (!variant) throw new NotFoundException('Variant not found');
        await this.invRepo.delete({ variantId });
        await this.variantRepo.remove(variant);
        return { deleted: true, id: variantId };
    }
}
