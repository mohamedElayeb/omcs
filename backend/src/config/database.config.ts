import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (
  config: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: config.get<string>('DATABASE_URL'),
  autoLoadEntities: true,
  // synchronize: true is convenient for development but dangerous in production
  // (it can auto-alter/drop columns). Keep it true until your schema is stable,
  // then switch to migrations.
  synchronize: config.get<string>('NODE_ENV') !== 'production' || config.get<string>('DB_SYNC') === 'true',
  ssl:
    config.get<string>('DB_SSL') === 'true'
      ? { rejectUnauthorized: false }
      : false,
});
