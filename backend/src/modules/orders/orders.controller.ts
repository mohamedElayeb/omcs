import {
    Controller, Get, Post, Patch, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OrdersService } from './orders.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole, OrderStatus } from '../../common/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/orders')
export class OrdersController {
    constructor(private readonly service: OrdersService) { }

    // ═══════════════════════════════════════════
    // PUBLIC ENDPOINTS (no auth)
    // ═══════════════════════════════════════════

    @Post()
    createOrder(@Body() dto: any) {
        return this.service.createOrder(dto);
    }

    @Post(':id/payment-proof')
    uploadPaymentProof(@Param('id') id: string, @Body() data: { proofUrl: string }) {
        return this.service.uploadPaymentProof(id, data.proofUrl);
    }

    @Get('track/:orderNumber')
    trackOrder(@Param('orderNumber') orderNumber: string) {
        return this.service.trackOrder(orderNumber);
    }

    // ═══════════════════════════════════════════
    // ADMIN ENDPOINTS (auth required)
    // ═══════════════════════════════════════════

    @Get('admin')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    findAll(
        @Query('status') status: string,
        @Query('city') city: string,
        @Query('paymentMethod') paymentMethod: string,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
        @Query('page') page: string,
        @Query('limit') limit: string,
    ) {
        return this.service.findAll({
            status, city, paymentMethod, startDate, endDate,
            page: Number(page) || 1,
            limit: Number(limit) || 20,
        });
    }

    @Get('admin/stats')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    getStats() {
        return this.service.getStats();
    }

    @Get('admin/:id')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    @Patch('admin/:id/status')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    updateStatus(@Param('id') id: string, @Body() data: { status: OrderStatus; notes?: string }, @CurrentUser() user: any) {
        return this.service.updateStatus(id, data.status, data.notes, user?.id);
    }

    @Patch('admin/:id/payment/confirm')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    confirmPayment(@Param('id') id: string, @Body() data: { note?: string }, @CurrentUser() user: any) {
        return this.service.confirmPayment(id, data.note, user?.id);
    }

    @Patch('admin/:id/payment/reject')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    rejectPayment(@Param('id') id: string, @Body() data: { note?: string }, @CurrentUser() user: any) {
        return this.service.rejectPayment(id, data.note, user?.id);
    }

    @Patch('admin/:id/delivery')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    updateDelivery(@Param('id') id: string, @Body() data: any) {
        return this.service.updateDelivery(id, data);
    }

    @Post('admin/release-expired')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.OWNER)
    releaseExpired() {
        return this.service.releaseExpiredReservations();
    }
}
