import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (
  config: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: config.get<string>('DATABASE_URL'),
  autoLoadEntities: true,
  synchronize: true,
  ssl:
    config.get<string>('NODE_ENV') === 'production'
      ? { rejectUnauthorized: false }
      : false,
});
