import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../entities';

@ApiTags('Sales')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('api/sales')
export class SalesController {
    constructor(private service: SalesService) { }

    @Post()
    @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
    create(@Body() data: any, @CurrentUser() user: User) {
        return this.service.createSale(data, user);
    }

    @Get()
    @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.VIEWER)
    async findAll(@Query() query: any, @CurrentUser() user: User) {
        const result = await this.service.findAll(query);
        // Strip cost/profit fields for non-OWNER roles
        if (user.role !== UserRole.OWNER) {
            for (const sale of result.sales) {
                delete (sale as any).profit;
                delete (sale as any).usdRateAtSale;
                if (sale.items) {
                    for (const item of sale.items) {
                        delete (item as any).unitCost;
                        delete (item as any).lineProfit;
                        delete (item as any).costUsdAtPurchase;
                        delete (item as any).purchaseUsdRateAtPurchase;
                        delete (item as any).costLydAtPurchase;
                        delete (item as any).purchaseDateAtPurchase;
                        delete (item as any).usdRateAtSale;
                        delete (item as any).saleDate;
                    }
                }
            }
        }
        return result;
    }

    @Get('daily-summary')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    dailySummary(@Query('branchId') branchId: string, @Query('date') date: string) {
        return this.service.getDailySummary(branchId, date);
    }

    @Get(':id')
    @Roles(UserRole.OWNER)
    findOne(@Param('id') id: string) { return this.service.findOne(id); }

    // ─── VOID SALE (Phase 3) ───
    @Post(':id/void')
    @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
    voidSale(
        @Param('id') id: string,
        @Body() data: { reason?: string },
        @CurrentUser() user: User,
    ) {
        return this.service.voidSale(id, user, data.reason);
    }

    // ─── Bank Transfer Status (Feature A) ───
    @Patch(':id/transfer-status')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    updateTransferPaymentStatus(
        @Param('id') id: string,
        @Body() data: { status: string; note?: string },
        @CurrentUser() user: User,
    ) {
        return this.service.updateTransferPaymentStatus(id, data.status as any, user.id, data.note);
    }

    @Get(':id/bank-transfer-logs')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    getBankTransferLogs(@Param('id') id: string) {
        return this.service.getBankTransferLogs(id);
    }

    // ─── Delivery Status ───
    @Patch(':id/delivery-status')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    updateDeliveryStatus(
        @Param('id') id: string,
        @Body() data: { status: string; note?: string },
        @CurrentUser() user: User,
    ) {
        return this.service.updateDeliveryStatus(id, data.status as any, user.id, data.note);
    }

    @Get(':id/delivery-logs')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    getDeliveryLogs(@Param('id') id: string) {
        return this.service.getDeliveryLogs(id);
    }
}
