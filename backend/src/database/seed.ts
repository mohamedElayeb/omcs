import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { config } from 'dotenv';

config();

import { Branch } from '../entities/branch.entity';
import { User } from '../entities/user.entity';
import { Category } from '../entities/category.entity';
import { Product } from '../entities/product.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { ProductImage } from '../entities/product-image.entity'; // ✅ IMPORTANT
import { Inventory } from '../entities/inventory.entity';
import { StockMovement } from '../entities/stock-movement.entity';
import { StockTransfer } from '../entities/stock-transfer.entity';
import { Sale } from '../entities/sale.entity';
import { SaleItem } from '../entities/sale-item.entity';
import { Return } from '../entities/return.entity';
import { ReturnItem } from '../entities/return-item.entity';
import { DailyClosing } from '../entities/daily-closing.entity';
import { PriceHistory } from '../entities/price-history.entity';
import { UserRole, StockMovementAction } from '../common/enums';

function buildDataSource() {
  // ✅ Prefer Railway DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    return new DataSource({
      type: 'postgres',
      url: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      entities: [
        Branch,
        User,
        Category,
        Product,
        ProductVariant,
        ProductImage, // ✅ FIX for Product#images metadata
        Inventory,
        StockMovement,
        StockTransfer,
        Sale,
        SaleItem,
        Return,
        ReturnItem,
        DailyClosing,
        PriceHistory,
      ],
      synchronize: true,
      logging: false,
    });
  }

  // ✅ Local fallback
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'omcs',
    entities: [
      Branch,
      User,
      Category,
      Product,
      ProductVariant,
      ProductImage, // ✅ FIX
      Inventory,
      StockMovement,
      StockTransfer,
      Sale,
      SaleItem,
      Return,
      ReturnItem,
      DailyClosing,
      PriceHistory,
    ],
    synchronize: true,
    logging: false,
  });
}

async function seed() {
  const ds = buildDataSource();

  try {
    await ds.initialize();
    console.log('🌱 Seeding database...');

    // --------------------
    // Branches
    // --------------------
    const branchRepo = ds.getRepository(Branch);
    const b1 = await branchRepo.save(
      branchRepo.create({
        name: 'السياحية',
        nameEn: 'Al-Siyahiya',
        address: 'Tripoli, Libya',
        phone: '+218-91-0000001',
      }),
    );
    const b2 = await branchRepo.save(
      branchRepo.create({
        name: 'النوفليين',
        nameEn: 'Al-Nawfaliyeen',
        address: 'Tripoli, Libya',
        phone: '+218-91-0000002',
      }),
    );
    console.log('✅ Branches created');

    // --------------------
    // Users
    // --------------------
    const userRepo = ds.getRepository(User);
    const hash = await bcrypt.hash('Admin123!', 10);
    const cashierHash = await bcrypt.hash('Cashier123!', 10);

    await userRepo.save([
      userRepo.create({
        email: 'mohamed@outletmaster.ly',
        passwordHash: hash,
        fullName: 'Mohamed Elayeb',
        role: UserRole.OWNER,
        maxDiscountPercent: 100,
        maxDiscountValue: 999999,
      }),
      userRepo.create({
        email: 'manager1@outletmaster.ly',
        passwordHash: hash,
        fullName: 'محمد الكيلاني',
        role: UserRole.MANAGER,
        branchId: b1.id,
        overridePin: '1234',
        maxDiscountPercent: 50,
        maxDiscountValue: 500,
      }),
      userRepo.create({
        email: 'manager2@outletmaster.ly',
        passwordHash: hash,
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
    console.log('✅ Users created');

    // --------------------
    // Categories
    // --------------------
    const catRepo = ds.getRepository(Category);
    const cats = await catRepo.save([
      catRepo.create({ name: 'Shoes', nameAr: 'أحذية' }),
      catRepo.create({ name: 'Jeans', nameAr: 'جينز' }),
      catRepo.create({ name: 'T-Shirts', nameAr: 'تيشيرتات' }),
      catRepo.create({ name: 'Jackets', nameAr: 'جاكيتات' }),
      catRepo.create({ name: 'Polo Shirts', nameAr: 'بولو' }),
    ]);
    console.log('✅ Categories created');

    // --------------------
    // Products + Variants + Inventory + Movements
    // --------------------
    const prodRepo = ds.getRepository(Product);
    const varRepo = ds.getRepository(ProductVariant);
    const invRepo = ds.getRepository(Inventory);
    const movRepo = ds.getRepository(StockMovement);

    const products = [
      {
        name: 'Nike Air Max 90',
        brand: 'Nike',
        catIdx: 0,
        variants: [
          { sku: 'OM-NK-001-42', size: '42', color: 'Black', cost: 180, sale: 300 },
          { sku: 'OM-NK-001-43', size: '43', color: 'Black', cost: 180, sale: 300 },
          { sku: 'OM-NK-001-44', size: '44', color: 'White', cost: 180, sale: 300 },
        ],
      },
      {
        name: "Levi's 501 Original",
        brand: "Levi's",
        catIdx: 1,
        variants: [
          { sku: 'OM-LV-002-32', size: '32', color: 'Blue', cost: 150, sale: 280 },
          { sku: 'OM-LV-002-34', size: '34', color: 'Blue', cost: 150, sale: 280 },
        ],
      },
      {
        name: 'Adidas Ultraboost',
        brand: 'Adidas',
        catIdx: 0,
        variants: [
          { sku: 'OM-AD-003-42', size: '42', color: 'Grey', cost: 200, sale: 350 },
          { sku: 'OM-AD-003-43', size: '43', color: 'Grey', cost: 200, sale: 350 },
        ],
      },
      {
        name: 'Tommy Hilfiger Polo',
        brand: 'Tommy Hilfiger',
        catIdx: 4,
        variants: [
          { sku: 'OM-TH-004-M', size: 'M', color: 'Navy', cost: 120, sale: 250 },
          { sku: 'OM-TH-004-L', size: 'L', color: 'Navy', cost: 120, sale: 250 },
        ],
      },
      {
        name: 'Zara Basic Tee',
        brand: 'Zara',
        catIdx: 2,
        variants: [
          { sku: 'OM-ZR-005-M', size: 'M', color: 'White', cost: 50, sale: 120 },
          { sku: 'OM-ZR-005-L', size: 'L', color: 'Black', cost: 50, sale: 120 },
          { sku: 'OM-ZR-005-XL', size: 'XL', color: 'White', cost: 50, sale: 120 },
        ],
      },
      {
        name: 'H&M Bomber Jacket',
        brand: 'H&M',
        catIdx: 3,
        variants: [
          { sku: 'OM-HM-006-M', size: 'M', color: 'Olive', cost: 200, sale: 420 },
          { sku: 'OM-HM-006-L', size: 'L', color: 'Olive', cost: 200, sale: 420 },
        ],
      },
    ];

    for (const p of products) {
      const product = await prodRepo.save(
        prodRepo.create({
          name: p.name,
          brand: p.brand,
          categoryId: cats[p.catIdx].id,
        }),
      );

      for (const v of p.variants) {
        const margin = ((v.sale - v.cost) / v.sale) * 100;

        const variant = await varRepo.save(
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

        // Add stock to both branches
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

    console.log('✅ Products, variants, inventory seeded');
    console.log('🎉 Seed complete!');
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await ds.destroy().catch(() => null);
  }
}

seed();
