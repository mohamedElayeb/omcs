import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { existsSync, mkdirSync } from 'fs';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';

async function autoSeed(app: NestExpressApplication) {
  try {
    const ds = app.get(DataSource);
    const userCount = await ds.query('SELECT COUNT(*) as cnt FROM users');
    const count = parseInt(userCount[0]?.cnt || '0', 10);
    if (count > 0) {
      console.log(`✅ Database already has ${count} users, skipping seed.`);
      return;
    }

    console.log('🌱 Empty database detected — auto-seeding...');

    // Branches
    const [b1] = await ds.query(
      `INSERT INTO branches (name, name_en, address, phone) VALUES ($1,$2,$3,$4) RETURNING id`,
      ['السياحية', 'Al-Siyahiya', 'Tripoli, Libya', '+218-91-0000001'],
    );
    const [b2] = await ds.query(
      `INSERT INTO branches (name, name_en, address, phone) VALUES ($1,$2,$3,$4) RETURNING id`,
      ['النوفليين', 'Al-Nawfaliyeen', 'Tripoli, Libya', '+218-91-0000002'],
    );
    console.log('  ✅ Branches created');

    // Users
    const adminHash = await bcrypt.hash('Admin123!', 10);
    const cashierHash = await bcrypt.hash('Cashier123!', 10);

    const users = [
      ['admin@outletmaster.ly', adminHash, 'Admin', 'OWNER', null, null, 100, 999999],
      ['mohamed@outletmaster.ly', adminHash, 'Mohamed Elayeb', 'OWNER', null, null, 100, 999999],
      ['manager1@outletmaster.ly', adminHash, 'محمد الكيلاني', 'MANAGER', b1.id, '1234', 50, 500],
      ['manager2@outletmaster.ly', adminHash, 'سالم العريبي', 'MANAGER', b2.id, '5678', 50, 500],
      ['cashier1@outletmaster.ly', cashierHash, 'أحمد بن علي', 'CASHIER', b1.id, null, 10, 50],
      ['cashier2@outletmaster.ly', cashierHash, 'عمر الشريف', 'CASHIER', b2.id, null, 10, 50],
    ];

    for (const u of users) {
      await ds.query(
        `INSERT INTO users (email, password_hash, full_name, role, branch_id, override_pin, max_discount_percent, max_discount_value) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        u,
      );
    }
    console.log('  ✅ 6 Users created');

    // Categories
    const catRows: any[] = [];
    for (const [name, nameAr] of [['Shoes', 'أحذية'], ['Jeans', 'جينز'], ['T-Shirts', 'تيشيرتات'], ['Jackets', 'جاكيتات'], ['Polo Shirts', 'بولو']]) {
      const [row] = await ds.query(`INSERT INTO categories (name, name_ar) VALUES ($1,$2) RETURNING id`, [name, nameAr]);
      catRows.push(row);
    }
    console.log('  ✅ 5 Categories created');

    // Products + Variants + Inventory
    const products = [
      {
        name: 'Nike Air Max 90', brand: 'Nike', catIdx: 0, variants: [
          { sku: 'OM-NK-001-42', size: '42', color: 'Black', cost: 180, sale: 300 },
          { sku: 'OM-NK-001-43', size: '43', color: 'Black', cost: 180, sale: 300 },
          { sku: 'OM-NK-001-44', size: '44', color: 'White', cost: 180, sale: 300 },
        ]
      },
      {
        name: "Levi's 501 Original", brand: "Levi's", catIdx: 1, variants: [
          { sku: 'OM-LV-002-32', size: '32', color: 'Blue', cost: 150, sale: 280 },
          { sku: 'OM-LV-002-34', size: '34', color: 'Blue', cost: 150, sale: 280 },
        ]
      },
      {
        name: 'Adidas Ultraboost', brand: 'Adidas', catIdx: 0, variants: [
          { sku: 'OM-AD-003-42', size: '42', color: 'Grey', cost: 200, sale: 350 },
          { sku: 'OM-AD-003-43', size: '43', color: 'Grey', cost: 200, sale: 350 },
        ]
      },
      {
        name: 'Tommy Hilfiger Polo', brand: 'Tommy Hilfiger', catIdx: 4, variants: [
          { sku: 'OM-TH-004-M', size: 'M', color: 'Navy', cost: 120, sale: 250 },
          { sku: 'OM-TH-004-L', size: 'L', color: 'Navy', cost: 120, sale: 250 },
        ]
      },
      {
        name: 'Zara Basic Tee', brand: 'Zara', catIdx: 2, variants: [
          { sku: 'OM-ZR-005-M', size: 'M', color: 'White', cost: 50, sale: 120 },
          { sku: 'OM-ZR-005-L', size: 'L', color: 'Black', cost: 50, sale: 120 },
          { sku: 'OM-ZR-005-XL', size: 'XL', color: 'White', cost: 50, sale: 120 },
        ]
      },
      {
        name: 'H&M Bomber Jacket', brand: 'H&M', catIdx: 3, variants: [
          { sku: 'OM-HM-006-M', size: 'M', color: 'Olive', cost: 200, sale: 420 },
          { sku: 'OM-HM-006-L', size: 'L', color: 'Olive', cost: 200, sale: 420 },
        ]
      },
    ];

    for (const p of products) {
      const [prod] = await ds.query(
        `INSERT INTO products (name, brand, category_id) VALUES ($1,$2,$3) RETURNING id`,
        [p.name, p.brand, catRows[p.catIdx].id],
      );
      for (const v of p.variants) {
        const margin = Math.round(((v.sale - v.cost) / v.sale) * 10000) / 100;
        const [variant] = await ds.query(
          `INSERT INTO product_variants (sku, product_id, size, color, cost_price, sale_price, profit_margin) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [v.sku, prod.id, v.size, v.color, v.cost, v.sale, margin],
        );
        for (const branch of [b1, b2] as any[]) {
          const qty = Math.floor(Math.random() * 30) + 5;
          await ds.query(
            `INSERT INTO inventory (variant_id, branch_id, quantity, last_restocked) VALUES ($1,$2,$3,$4)`,
            [variant.id, branch.id, qty, new Date()],
          );
          await ds.query(
            `INSERT INTO stock_movements (variant_id, branch_id, action, quantity_change, quantity_after) VALUES ($1,$2,$3,$4,$5)`,
            [variant.id, branch.id, 'RESTOCK', qty, qty],
          );
        }
      }
    }
    console.log('  ✅ Products, variants & inventory created');
    console.log('🎉 Auto-seed complete!');
  } catch (e) {
    console.error('⚠️ Auto-seed skipped/failed:', e.message);
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CORS – use CORS_ORIGINS env in production, allow any in dev
  const corsOrigins = process.env.CORS_ORIGINS;
  app.enableCors({
    origin: corsOrigins ? corsOrigins.split(',').map(o => o.trim()) : true,
    credentials: true,
  });

  // Ensure uploads directory exists
  const uploadsDir = join(__dirname, '..', 'uploads');
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  // Serve uploaded files as static
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

  // Validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // Swagger — always enable (useful for production debugging too)
  const config = new DocumentBuilder()
    .setTitle('OMCS API')
    .setDescription('Outlet Master Control System – Retail Management API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Auto-seed if database is empty
  await autoSeed(app);

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 OMCS Backend running on port ${port} [${process.env.NODE_ENV || 'development'}]`);
}
bootstrap();
