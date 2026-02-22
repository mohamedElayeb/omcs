import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale, SaleItem, Inventory, StockMovement, ProductVariant, DeliveryLog, SystemSetting, BankTransferLog, StockLedger } from '../../entities';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
    imports: [TypeOrmModule.forFeature([Sale, SaleItem, Inventory, StockMovement, ProductVariant, DeliveryLog, SystemSetting, BankTransferLog, StockLedger])],
    controllers: [SalesController],
    providers: [SalesService],
    exports: [SalesService],
})
export class SalesModule { }
