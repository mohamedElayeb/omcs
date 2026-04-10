import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config();

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
    synchronize: false,
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

async function reset() {
  const ds = buildDataSource();

  try {
    await ds.initialize();
    console.log('✅ DataSource initialized');
    console.log('🗑️  Resetting database — deleting ALL data...');

    // Tables in correct order (respecting FK constraints via CASCADE)
    const tables = [
      'stock_ledger',
      'stock_reservations',
      'order_items',
      'orders',
      'customers',
      'return_items',
      'returns',
      'delivery_logs',
      'bank_transfer_logs',
      'daily_closings',
      'price_histories',
      'sale_items',
      'sales',
      'stock_movements',
      'inventories',
      'stock_transfers',
      'product_images',
      'product_variants',
      'products',
      'categories',
      'users',
      'branches',
      'system_settings',
    ];

    for (const table of tables) {
      try {
        await ds.query(`TRUNCATE TABLE "${table}" CASCADE`);
        console.log(`  ✅ Truncated: ${table}`);
      } catch (e: any) {
        // Table might not exist yet, skip
        console.log(`  ⚠️  Skipped: ${table} (${e.message?.substring(0, 60)})`);
      }
    }

    console.log('');
    console.log('🎉 Database reset complete! All data has been deleted.');
    console.log('   Run "npm run seed:prod" to create production accounts.');
  } catch (e) {
    console.error('❌ Reset failed:', e);
    process.exitCode = 1;
  } finally {
    try {
      await ds.destroy();
    } catch {}
  }
}

reset();
