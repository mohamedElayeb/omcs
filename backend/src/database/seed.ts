import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import * as path from 'path';

config();

import { UserRole, StockMovementAction } from '../common/enums';

function buildDataSource() {
  // ✅ Railway غالباً يعطي DATABASE_URL (أفضل خيار)
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_PUBLIC ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;

  // ✅ اجمع كل الـ entities تلقائياً (حل نهائي لمشاكل metadata)
  // يلقط: src/entities/*.entity.ts + أي entity داخل modules أيضاً
  const entitiesGlob = path.join(__dirname, '..', '**', '*.entity.{ts,js}');

  const base: any = {
    type: 'postgres' as const,
    entities: [entitiesGlob],
    synchronize: true,
    logging: false,
  };

  if (databaseUrl) {
    return new DataSource({
      ...base,
      url: databaseUrl,
      // ملاحظة: Railway internal DB غالباً ما يحتاج SSL، لكن لو واجهت SSL error فعّل هذا:
      // ssl: { rejectUnauthorized: false },
    });
  }

  // ✅ fallback لو شغال محلياً
  return new DataSource({
    ...base,
    host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10),
    username: process.env.DB_USERNAME || process.env.PGUSER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres',
    database: process.env.DB_NAME || process.env.PGDATABASE || 'omcs',
  });
}

async function seed() {
  const ds = buildDataSource();

  try {
    await ds.initialize();
    console.log('✅ DataSource initialized');
    console.log('🌱 Seeding database...');

    // repositories (نجيبهم بالاسم لأننا لم نعد نستورد Entities يدوياً)
    const branchRepo = ds.getRepository('Branch');
    const userRepo = ds.getRepository('User');
    const catRepo = ds.getRepository('Category');
    const prodRepo = ds.getRepository('Product');
    const varRepo = ds.getRepository('ProductVariant');
    const invRepo = ds.getRepository('Inventory');
    const movRepo = ds.getRepository('StockMovement');

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
    console.log('✅ Branches created');

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
    console.log('✅ Users created');

    // ----- Categories -----
    const cats: any[] = await catRepo.save([
      catRepo.create({ name: 'Shoes', nameAr: 'أحذية' }),
      catRepo.create({ name: 'Jeans', nameAr: 'جينز' }),
      catRepo.create({ name: 'T-Shirts', nameAr: 'تيشيرتات' }),
      catRepo.create({ name: 'Jackets', nameAr: 'جاكيتات' }),
      catRepo.create({ name: 'Polo Shirts', nameAr: 'بولو' }),
    ]);
    console.log('✅ Categories created');

    // ----- Products + Variants + Inventory -----
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

    console.log('✅ Products, variants, inventory seeded');
    console.log('🎉 Seed complete!');
  } catch (e) {
    console.error('❌ Seed failed:', e);
    process.exitCode = 1;
  } finally {
    try {
      await ds.destroy();
    } catch {}
  }
}

seed();
