import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
    Return, ReturnItem, Sale, SaleItem, Order, OrderItem,
    Inventory, StockMovement, ProductVariant, StockLedger,
} from '../../entities';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { PosReturnsService } from './pos-returns.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Return, ReturnItem,
            Sale, SaleItem,
            Order, OrderItem,
            Inventory, StockMovement,
            ProductVariant, StockLedger,
        ]),
    ],
    controllers: [ReturnsController],
    providers: [ReturnsService, PosReturnsService],
    exports: [ReturnsService, PosReturnsService],
})
export class ReturnsModule { }
