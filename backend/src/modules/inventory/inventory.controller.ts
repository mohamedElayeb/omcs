import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../entities';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('api/inventory')
export class InventoryController {
    constructor(private service: InventoryService) { }

    @Get()
    findAll(@Query('branchId') branchId: string) { return this.service.findAll(branchId); }

    @Get('alerts')
    getAlerts() { return this.service.getAlerts(); }

    @Get('grouped')
    getGrouped(
        @Query('branchId') branchId: string,
        @Query('search') search: string,
        @Query('sku') sku: string,
        @Query('name') name: string,
        @Query('brand') brand: string,
        @Query('size') size: string,
        @Query('color') color: string,
        @Query('status') status: string,
        @Query('lowStock') lowStock: string,
    ) {
        const filters = { search, sku, name, brand, size, color, status, lowStock: lowStock === 'true' };
        return this.service.getGrouped(branchId, filters);
    }

    @Post('restock')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    restock(@Body() data: any, @CurrentUser() user: User) {
        const costData = (data.costUsd && data.purchaseUsdRate) ? {
            costUsd: data.costUsd,
            purchaseUsdRate: data.purchaseUsdRate,
            costLydAtPurchase: data.costLydAtPurchase,
            purchaseDate: data.purchaseDate,
        } : undefined;
        return this.service.restock(data.variantId, data.branchId, data.quantity, user.id, costData);
    }

    @Get('valuation')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    getValuation(@Query('branchId') branchId: string) {
        return this.service.getInventoryValuation(branchId);
    }

    // ─── Transfers ───
    @Get('transfers')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    findAllTransfers(@Query() query: any) { return this.service.findAllTransfers(query); }

    @Get('transfers/:id')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    findTransfer(@Param('id') id: string) { return this.service.findTransfer(id); }

    @Post('transfers')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    initiateTransfer(@Body() data: any, @CurrentUser() user: User) {
        return this.service.initiateTransfer(
            data.variantId, data.fromBranchId, data.toBranchId, data.quantity, user.id, data.notes,
        );
    }

    @Patch('transfers/:id/dispatch')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    dispatchTransfer(@Param('id') id: string, @CurrentUser() user: User) {
        return this.service.dispatchTransfer(id, user.id);
    }

    @Patch('transfers/:id/receive')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    receiveTransfer(@Param('id') id: string, @CurrentUser() user: User) {
        return this.service.receiveTransfer(id, user.id);
    }

    @Patch('transfers/:id/cancel')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    cancelTransfer(@Param('id') id: string, @CurrentUser() user: User) {
        return this.service.cancelTransfer(id, user.id);
    }

    @Get('movements')
    getMovements(@Query('branchId') branchId: string, @Query('variantId') variantId: string) {
        return this.service.getMovements(branchId, variantId);
    }

    // ─── Immediate Transfer (Feature D — default for this business) ───
    @Post('transfers/immediate')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    immediateTransfer(@Body() data: any, @CurrentUser() user: User) {
        return this.service.immediateTransfer(
            data.variantId, data.fromBranchId, data.toBranchId,
            data.quantity, user.id, data.notes,
        );
    }

    // ─── Low Stock Alerts (Phase 3 — consolidated across batches) ───
    @Get('low-stock')
    getLowStock(@Query('branchId') branchId: string) {
        return this.service.getLowStockAlerts(branchId);
    }

    // ─── Update Low Stock Threshold ───
    @Patch('threshold')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    updateThreshold(@Body() data: { variantId: string; branchId: string; threshold: number }) {
        return this.service.updateThreshold(data.variantId, data.branchId, data.threshold);
    }

    // ─── Stock Ledger (Phase 3 — full audit trail) ───
    @Get('ledger')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    getLedger(@Query() query: any) {
        return this.service.getStockLedger(query);
    }
}
