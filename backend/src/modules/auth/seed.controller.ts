import { Controller, Get, Query } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserRole, StockMovementAction } from '../../common/enums';

@Controller('api/seed')
export class SeedController {
    constructor(private dataSource: DataSource) { }

    @Get()
    async runSeed(@Query('key') key: string) {
        // Simple protection — must provide the right key
        if (key !== 'omcs2026') {
            return { error: 'Invalid seed key. Use ?key=omcs2026' };
        }

        // Check if already seeded
        const userRepo = this.dataSource.getRepository('User');
        const existingUsers = await userRepo.count();
        if (existingUsers > 0) {
            return { message: `Database already seeded (${existingUsers} users found). Skipping.` };
        }

        try {
            const branchRepo = this.dataSource.getRepository('Branch');
            const catRepo = this.dataSource.getRepository('Category');
            const prodRepo = this.dataSource.getRepository('Product');
            const varRepo = this.dataSource.getRepository('ProductVariant');
            const invRepo = this.dataSource.getRepository('Inventory');
            const movRepo = this.dataSource.getRepository('StockMovement');

            // ----- Branches -----
            const b1: any = await branchRepo.save(
                branchRepo.create({
                    name: 'السياحية',
                    nameEn: 'Al-Siyahiya',
                    address: 'Tripoli, Libya',
                    phone: '+218-91-0000001',
                }),
            );
            const b2: any = await branchRepo.save(
                branchRepo.create({
                    name: 'النوفليين',
                    nameEn: 'Al-Nawfaliyeen',
                    address: 'Tripoli, Libya',
                    phone: '+218-91-0000002',
                }),
            );

            // ----- Users -----
            const adminHash = await bcrypt.hash('Admin123!', 10);
            const cashierHash = await bcrypt.hash('Cashier123!', 10);

            await userRepo.save([
                userRepo.create({
                    email: 'admin@outletmaster.ly',
                    passwordHash: adminHash,
                    fullName: 'Admin',
                    role: UserRole.OWNER,
                    maxDiscountPercent: 100,
                    maxDiscountValue: 999999,
                }),
                userRepo.create({
                    email: 'mohamed@outletmaster.ly',
                    passwordHash: adminHash,
                    fullName: 'Mohamed Elayeb',
                    role: UserRole.OWNER,
                    maxDiscountPercent: 100,
                    maxDiscountValue: 999999,
                }),
                userRepo.create({
                    email: 'manager1@outletmaster.ly',
                    passwordHash: adminHash,
                    fullName: 'محمد الكيلاني',
                    role: UserRole.MANAGER,
                    branchId: b1.id,
                    overridePin: '1234',
                    maxDiscountPercent: 50,
                    maxDiscountValue: 500,
                }),
                userRepo.create({
                    email: 'manager2@outletmaster.ly',
                    passwordHash: adminHash,
                    fullName: 'سالم العريبي',
                    role: UserRole.MANAGER,
                    branchId: b2.id,
                    overridePin: '5678',
                    maxDiscountPercent: 50,
                    maxDiscountValue: 500,
                }),
                userRepo.create({
                    email: 'cashier1@outletmaster.ly',
                    passwordHash: cashierHash,
                    fullName: 'أحمد بن علي',
                    role: UserRole.CASHIER,
                    branchId: b1.id,
                    maxDiscountPercent: 10,
                    maxDiscountValue: 50,
                }),
                userRepo.create({
                    email: 'cashier2@outletmaster.ly',
                    passwordHash: cashierHash,
                    fullName: 'عمر الشريف',
                    role: UserRole.CASHIER,
                    branchId: b2.id,
                    maxDiscountPercent: 10,
                    maxDiscountValue: 50,
                }),
            ]);

            // ----- Categories -----
            const cats: any[] = await catRepo.save([
                catRepo.create({ name: 'Shoes', nameAr: 'أحذية' }),
                catRepo.create({ name: 'Jeans', nameAr: 'جينز' }),
                catRepo.create({ name: 'T-Shirts', nameAr: 'تيشيرتات' }),
                catRepo.create({ name: 'Jackets', nameAr: 'جاكيتات' }),
                catRepo.create({ name: 'Polo Shirts', nameAr: 'بولو' }),
            ]);

            // ----- Products + Variants + Inventory -----
            const products = [
                {
                    name: 'Nike Air Max 90', brand: 'Nike', catIdx: 0,
                    variants: [
                        { sku: 'OM-NK-001-42', size: '42', color: 'Black', cost: 180, sale: 300 },
                        { sku: 'OM-NK-001-43', size: '43', color: 'Black', cost: 180, sale: 300 },
                        { sku: 'OM-NK-001-44', size: '44', color: 'White', cost: 180, sale: 300 },
                    ],
                },
                {
                    name: "Levi's 501 Original", brand: "Levi's", catIdx: 1,
                    variants: [
                        { sku: 'OM-LV-002-32', size: '32', color: 'Blue', cost: 150, sale: 280 },
                        { sku: 'OM-LV-002-34', size: '34', color: 'Blue', cost: 150, sale: 280 },
                    ],
                },
                {
                    name: 'Adidas Ultraboost', brand: 'Adidas', catIdx: 0,
                    variants: [
                        { sku: 'OM-AD-003-42', size: '42', color: 'Grey', cost: 200, sale: 350 },
                        { sku: 'OM-AD-003-43', size: '43', color: 'Grey', cost: 200, sale: 350 },
                    ],
                },
                {
                    name: 'Tommy Hilfiger Polo', brand: 'Tommy Hilfiger', catIdx: 4,
                    variants: [
                        { sku: 'OM-TH-004-M', size: 'M', color: 'Navy', cost: 120, sale: 250 },
                        { sku: 'OM-TH-004-L', size: 'L', color: 'Navy', cost: 120, sale: 250 },
                    ],
                },
                {
                    name: 'Zara Basic Tee', brand: 'Zara', catIdx: 2,
                    variants: [
                        { sku: 'OM-ZR-005-M', size: 'M', color: 'White', cost: 50, sale: 120 },
                        { sku: 'OM-ZR-005-L', size: 'L', color: 'Black', cost: 50, sale: 120 },
                        { sku: 'OM-ZR-005-XL', size: 'XL', color: 'White', cost: 50, sale: 120 },
                    ],
                },
                {
                    name: 'H&M Bomber Jacket', brand: 'H&M', catIdx: 3,
                    variants: [
                        { sku: 'OM-HM-006-M', size: 'M', color: 'Olive', cost: 200, sale: 420 },
                        { sku: 'OM-HM-006-L', size: 'L', color: 'Olive', cost: 200, sale: 420 },
                    ],
                },
            ];

            for (const p of products) {
                const product: any = await prodRepo.save(
                    prodRepo.create({
                        name: p.name,
                        brand: p.brand,
                        categoryId: cats[p.catIdx].id,
                    }),
                );

                for (const v of p.variants) {
                    const margin = ((v.sale - v.cost) / v.sale) * 100;
                    const variant: any = await varRepo.save(
                        varRepo.create({
                            sku: v.sku,
                            productId: product.id,
                            size: v.size,
                            color: v.color,
                            costPrice: v.cost,
                            salePrice: v.sale,
                            profitMargin: Math.round(margin * 100) / 100,
                        }),
                    );

                    for (const branch of [b1, b2]) {
                        const qty = Math.floor(Math.random() * 30) + 5;
                        await invRepo.save(
                            invRepo.create({
                                variantId: variant.id,
                                branchId: branch.id,
                                quantity: qty,
                                lastRestocked: new Date(),
                            }),
                        );
                        await movRepo.save(
                            movRepo.create({
                                variantId: variant.id,
                                branchId: branch.id,
                                action: StockMovementAction.RESTOCK,
                                quantityChange: qty,
                                quantityAfter: qty,
                            }),
                        );
                    }
                }
            }

            return {
                success: true,
                message: '🎉 Seed complete!',
                data: {
                    branches: 2,
                    users: 6,
                    categories: 5,
                    products: products.length,
                    login: {
                        admin: 'admin@outletmaster.ly / Admin123!',
                        owner: 'mohamed@outletmaster.ly / Admin123!',
                        cashier: 'cashier1@outletmaster.ly / Cashier123!',
                    },
                },
            };
        } catch (e) {
            return { error: 'Seed failed', details: e.message };
        }
    }
}
