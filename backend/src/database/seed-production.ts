import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import * as path from 'path';

config();

import { UserRole } from '../common/enums';

function buildDataSource() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_PUBLIC ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;

  const entitiesGlob = path.join(__dirname, '..', '**', '*.entity.{ts,js}');

  const base: any = {
    type: 'postgres' as const,
    entities: [entitiesGlob],
    synchronize: true,
    logging: false,
  };

  if (databaseUrl) {
    return new DataSource({ ...base, url: databaseUrl });
  }

  return new DataSource({
    ...base,
    host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10),
    username: process.env.DB_USERNAME || process.env.PGUSER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres',
    database: process.env.DB_NAME || process.env.PGDATABASE || 'omcs',
  });
}

async function seedProduction() {
  const ds = buildDataSource();

  try {
    await ds.initialize();
    console.log('✅ DataSource initialized');
    console.log('🌱 Seeding production accounts...');

    const branchRepo = ds.getRepository('Branch');
    const userRepo = ds.getRepository('User');

    // ═══════════════════════════════════════════
    // ─── Branches ───
    // ═══════════════════════════════════════════
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
    console.log(`   📍 ${b1.name} (${b1.nameEn}) — ID: ${b1.id}`);
    console.log(`   📍 ${b2.name} (${b2.nameEn}) — ID: ${b2.id}`);

    // ═══════════════════════════════════════════
    // ─── Passwords ───
    // ═══════════════════════════════════════════
    const ownerPassword = 'Owner@2026!';
    const managerPassword = 'Manager@2026!';
    const cashierPassword = 'Cashier@2026!';

    const ownerHash = await bcrypt.hash(ownerPassword, 10);
    const managerHash = await bcrypt.hash(managerPassword, 10);
    const cashierHash = await bcrypt.hash(cashierPassword, 10);

    // ═══════════════════════════════════════════
    // ─── 1 Owner ───
    // ═══════════════════════════════════════════
    const owner = await userRepo.save(
      userRepo.create({
        email: 'owner@omcs.com.ly',
        passwordHash: ownerHash,
        fullName: 'Owner',
        role: UserRole.OWNER,
        maxDiscountPercent: 100,
        maxDiscountValue: 999999,
      }),
    );
    console.log('');
    console.log('✅ Owner account created');
    console.log(`   👤 Email: owner@omcs.com.ly`);
    console.log(`   🔑 Password: ${ownerPassword}`);

    // ═══════════════════════════════════════════
    // ─── 1 Manager (assigned to branch 1) ───
    // ═══════════════════════════════════════════
    const manager = await userRepo.save(
      userRepo.create({
        email: 'manager@omcs.com.ly',
        passwordHash: managerHash,
        fullName: 'Manager',
        role: UserRole.MANAGER,
        branchId: b1.id,
        overridePin: '1234',
        maxDiscountPercent: 50,
        maxDiscountValue: 500,
      }),
    );
    console.log('');
    console.log('✅ Manager account created');
    console.log(`   👤 Email: manager@omcs.com.ly`);
    console.log(`   🔑 Password: ${managerPassword}`);
    console.log(`   📍 Branch: ${b1.name}`);
    console.log(`   🔐 Override PIN: 1234`);

    // ═══════════════════════════════════════════
    // ─── 4 Cashiers ───
    // ═══════════════════════════════════════════
    const cashiers = [
      { email: 'cashier1@omcs.com.ly', fullName: 'Cashier 1', branchId: b1.id, branchName: b1.name },
      { email: 'cashier2@omcs.com.ly', fullName: 'Cashier 2', branchId: b1.id, branchName: b1.name },
      { email: 'cashier3@omcs.com.ly', fullName: 'Cashier 3', branchId: b2.id, branchName: b2.name },
      { email: 'cashier4@omcs.com.ly', fullName: 'Cashier 4', branchId: b2.id, branchName: b2.name },
    ];

    console.log('');
    console.log('✅ Cashier accounts created');

    for (const c of cashiers) {
      await userRepo.save(
        userRepo.create({
          email: c.email,
          passwordHash: cashierHash,
          fullName: c.fullName,
          role: UserRole.CASHIER,
          branchId: c.branchId,
          maxDiscountPercent: 10,
          maxDiscountValue: 50,
        }),
      );
      console.log(`   👤 ${c.email} → ${c.branchName}`);
    }
    console.log(`   🔑 Password (all cashiers): ${cashierPassword}`);

    // ═══════════════════════════════════════════
    // ─── Summary ───
    // ═══════════════════════════════════════════
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('🎉 Production seed complete!');
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log('📋 Account Summary:');
    console.log('┌──────────┬─────────────────────────┬──────────────────┐');
    console.log('│ Role     │ Email                   │ Password         │');
    console.log('├──────────┼─────────────────────────┼──────────────────┤');
    console.log(`│ Owner    │ owner@omcs.com.ly       │ ${ownerPassword.padEnd(16)} │`);
    console.log(`│ Manager  │ manager@omcs.com.ly     │ ${managerPassword.padEnd(16)} │`);
    console.log(`│ Cashier  │ cashier1@omcs.com.ly    │ ${cashierPassword.padEnd(16)} │`);
    console.log(`│ Cashier  │ cashier2@omcs.com.ly    │ ${cashierPassword.padEnd(16)} │`);
    console.log(`│ Cashier  │ cashier3@omcs.com.ly    │ ${cashierPassword.padEnd(16)} │`);
    console.log(`│ Cashier  │ cashier4@omcs.com.ly    │ ${cashierPassword.padEnd(16)} │`);
    console.log('└──────────┴─────────────────────────┴──────────────────┘');
    console.log('');
    console.log('⚠️  IMPORTANT: Change these passwords after first login!');
  } catch (e) {
    console.error('❌ Production seed failed:', e);
    process.exitCode = 1;
  } finally {
    try {
      await ds.destroy();
    } catch {}
  }
}

seedProduction();
