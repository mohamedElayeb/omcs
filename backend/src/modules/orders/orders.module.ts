import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
    Customer, Order, OrderItem, StockReservation,
    Inventory, ProductVariant, StockLedger,
} from '../../entities';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { EventsModule } from '../events/events.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Customer, Order, OrderItem, StockReservation,
            Inventory, ProductVariant, StockLedger,
        ]),
        EventsModule,
    ],
    controllers: [OrdersController],
    providers: [OrdersService],
    exports: [OrdersService],
})
export class OrdersModule { }
