import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductVariant, Inventory, Category } from '../../entities';
import { ProductImage } from '../../entities/product-image.entity';

@Injectable()
export class StorefrontService {
    constructor(
        @InjectRepository(Product) private productRepo: Repository<Product>,
        @InjectRepository(ProductVariant) private variantRepo: Repository<ProductVariant>,
        @InjectRepository(Inventory) private invRepo: Repository<Inventory>,
        @InjectRepository(Category) private catRepo: Repository<Category>,
        @InjectRepository(ProductImage) private imageRepo: Repository<ProductImage>,
    ) { }

    /**
     * Public catalog — returns products with available stock.
     * NEVER exposes cost data (costUsd, costPrice, costLydAtPurchase, purchaseUsdRate, marginPercent, profitMargin).
     */
    async getProducts(query: {
        page?: number; limit?: number;
        category?: string; brand?: string;
        search?: string; size?: string; color?: string;
        sort?: 'price_asc' | 'price_desc' | 'newest' | 'name';
    }) {
        const page = Math.max(1, query.page || 1);
        const limit = Math.min(50, Math.max(1, query.limit || 24));
        const skip = (page - 1) * limit;

        const qb = this.productRepo.createQueryBuilder('p')
            .leftJoinAndSelect('p.variants', 'v', 'v.is_active = true')
            .leftJoinAndSelect('p.category', 'c')
            .where('p.isActive = true');

        if (query.category) qb.andWhere('p.categoryId = :cid', { cid: query.category });
        if (query.brand) qb.andWhere('LOWER(p.brand) LIKE :brand', { brand: `%${query.brand.toLowerCase()}%` });
        if (query.search) {
            const s = `%${query.search.toLowerCase()}%`;
            qb.andWhere('(LOWER(p.name) LIKE :s OR LOWER(p.brand) LIKE :s OR LOWER(v.sku) LIKE :s)', { s });
        }
        if (query.size) qb.andWhere('LOWER(v.size) = :size', { size: query.size.toLowerCase() });
        if (query.color) qb.andWhere('LOWER(v.color) = :color', { color: query.color.toLowerCase() });

        // Sorting
        switch (query.sort) {
            case 'price_asc': qb.orderBy('v.salePrice', 'ASC'); break;
            case 'price_desc': qb.orderBy('v.salePrice', 'DESC'); break;
            case 'newest': qb.orderBy('p.createdAt', 'DESC'); break;
            default: qb.orderBy('p.name', 'ASC');
        }

        const [products, total] = await qb.skip(skip).take(limit).getManyAndCount();

        // For each product, calculate total available stock across all branches
        const result = await Promise.all(products.map(async (p) => {
            const variants = await Promise.all((p.variants || []).map(async (v) => {
                const stockRows = await this.invRepo.find({ where: { variantId: v.id } });
                const totalStock = stockRows.reduce((s, r) => s + r.quantity, 0);
                return {
                    id: v.id,
                    sku: v.sku,
                    size: v.size,
                    color: v.color,
                    salePrice: Number(v.salePrice),
                    inStock: totalStock > 0,
                    stockQuantity: totalStock,
                    // NO cost data exposed
                };
            }));

            return {
                id: p.id,
                name: p.name,
                nameAr: p.nameAr,
                brand: p.brand,
                imageUrl: p.imageUrl,
                category: p.category ? { id: p.category.id, name: p.category.name, nameAr: p.category.nameAr } : null,
                minPrice: variants.filter(v => v.salePrice > 0).length > 0
                    ? Math.min(...variants.filter(v => v.salePrice > 0).map(v => v.salePrice))
                    : 0,
                maxPrice: variants.length > 0
                    ? Math.max(...variants.map(v => v.salePrice))
                    : 0,
                totalStock: variants.reduce((s, v) => s + v.stockQuantity, 0),
                inStock: variants.some(v => v.inStock),
                variants,  // Show all variants including out-of-stock
            };
        }));

        return {
            products: result,
            pagination: {
                page, limit,
                total: result.length,
                totalAll: total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Single product detail — full variant list with stock info.
     */
    async getProduct(productId: string) {
        const product = await this.productRepo.findOne({
            where: { id: productId, isActive: true },
            relations: ['variants', 'category', 'images'],
        });
        if (!product) return null;

        const variants = await Promise.all(
            (product.variants || []).filter(v => v.isActive).map(async (v) => {
                const stockRows = await this.invRepo.find({
                    where: { variantId: v.id },
                    relations: ['branch'],
                });
                // Aggregate stock per branch (show availability per location)
                const branches = stockRows
                    .filter(r => r.quantity > 0)
                    .map(r => ({
                        branchId: r.branchId,
                        branchName: r.branch?.name || '',
                        quantity: r.quantity,
                    }));

                return {
                    id: v.id,
                    sku: v.sku,
                    size: v.size,
                    color: v.color,
                    salePrice: Number(v.salePrice),
                    inStock: branches.length > 0,
                    totalStock: branches.reduce((s, b) => s + b.quantity, 0),
                    branches,
                };
            }),
        );

        const images = (product.images || []).sort((a, b) => a.sortOrder - b.sortOrder).map(img => ({
            id: img.id, imageUrl: img.imageUrl, sortOrder: img.sortOrder, isPrimary: img.isPrimary,
        }));

        return {
            id: product.id,
            name: product.name,
            nameAr: product.nameAr,
            brand: product.brand,
            imageUrl: product.imageUrl,
            images,
            category: product.category ? { id: product.category.id, name: product.category.name, nameAr: product.category.nameAr } : null,
            variants,
        };
    }

    /**
     * All categories for the storefront sidebar/filter.
     */
    async getCategories() {
        return this.catRepo.find({ order: { name: 'ASC' } });
    }

    /**
     * All unique brands for the filter.
     */
    async getBrands() {
        const raw = await this.productRepo
            .createQueryBuilder('p')
            .select('DISTINCT p.brand', 'brand')
            .where('p.isActive = true AND p.brand IS NOT NULL')
            .orderBy('p.brand', 'ASC')
            .getRawMany();
        return raw.map(r => r.brand).filter(Boolean);
    }

    /**
     * Available sizes for a category/brand (for filter chips).
     */
    async getSizes(categoryId?: string, brand?: string) {
        const qb = this.variantRepo.createQueryBuilder('v')
            .leftJoin('v.product', 'p')
            .select('DISTINCT v.size', 'size')
            .where('v.isActive = true AND v.size IS NOT NULL');
        if (categoryId) qb.andWhere('p.categoryId = :cid', { cid: categoryId });
        if (brand) qb.andWhere('LOWER(p.brand) = :b', { b: brand.toLowerCase() });
        const raw = await qb.orderBy('v.size', 'ASC').getRawMany();
        return raw.map(r => r.size).filter(Boolean);
    }

    /**
     * Available colors for a category/brand.
     */
    async getColors(categoryId?: string, brand?: string) {
        const qb = this.variantRepo.createQueryBuilder('v')
            .leftJoin('v.product', 'p')
            .select('DISTINCT v.color', 'color')
            .where('v.isActive = true AND v.color IS NOT NULL');
        if (categoryId) qb.andWhere('p.categoryId = :cid', { cid: categoryId });
        if (brand) qb.andWhere('LOWER(p.brand) = :b', { b: brand.toLowerCase() });
        const raw = await qb.orderBy('v.color', 'ASC').getRawMany();
        return raw.map(r => r.color).filter(Boolean);
    }
}
