import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale, SaleItem, Inventory, Branch, User } from '../../entities';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
    imports: [TypeOrmModule.forFeature([Sale, SaleItem, Inventory, Branch, User])],
    controllers: [DashboardController],
    providers: [DashboardService],
})
export class DashboardModule { }
