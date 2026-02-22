import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inventory, StockMovement, StockTransfer, ProductVariant, StockLedger } from '../../entities';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
    imports: [TypeOrmModule.forFeature([Inventory, StockMovement, StockTransfer, ProductVariant, StockLedger])],
    controllers: [InventoryController],
    providers: [InventoryService],
    exports: [InventoryService],
})
export class InventoryModule { }
