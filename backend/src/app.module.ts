import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDatabaseConfig } from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BranchesModule } from './modules/branches/branches.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SalesModule } from './modules/sales/sales.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EventsModule } from './modules/events/events.module';
import { SettingsModule } from './modules/settings/settings.module';
import { StorefrontModule } from './modules/storefront/storefront.module';
import { OrdersModule } from './modules/orders/orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    EventsModule,
    AuthModule,
    UsersModule,
    BranchesModule,
    ProductsModule,
    InventoryModule,
    SalesModule,
    ReturnsModule,
    DashboardModule,
    SettingsModule,
    StorefrontModule,
    OrdersModule,
  ],
})
export class AppModule { }
