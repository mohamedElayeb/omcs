import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import { PosReturnsService } from './pos-returns.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BranchGuard } from '../../common/guards/branch.guard';
import { UserRole, ReturnStatus } from '../../common/enums';
import { User } from '../../entities';
import { CreatePosReturnDto } from './dto/create-pos-return.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';

@ApiTags('Returns')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('api/returns')
export class ReturnsController {
    constructor(
        private service: ReturnsService,
        private posReturnsService: PosReturnsService,
    ) { }

    // ═══════════════════════════════════════════════════════════
    //  POS RETURNS — Invoice-Based
    // ═══════════════════════════════════════════════════════════

    /**
     * Preview sale by invoice — shows items with return availability
     * GET /api/returns/pos/preview?invoiceNo=OMC-XXXX
     */
    @Get('pos/preview')
    @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
    previewInvoice(
        @Query('invoiceNo') invoiceNo: string,
        @CurrentUser() user: User,
    ) {
        if (!invoiceNo) {
            throw new Error('invoiceNo query parameter is required');
        }
        return this.posReturnsService.previewSaleByInvoice(invoiceNo, user);
    }

    /**
     * Create POS return request
     * POST /api/returns/pos
     */
    @Post('pos')
    @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
    @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
    createPosReturn(
        @Body() dto: CreatePosReturnDto,
        @CurrentUser() user: User,
    ) {
        return this.posReturnsService.createPosReturn(dto, user);
    }

    /**
     * Update POS return status (approve/reject/complete)
     * PATCH /api/returns/pos/:id/status
     */
    @Patch('pos/:id/status')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
    updatePosReturnStatus(
        @Param('id') id: string,
        @Body() dto: UpdateReturnStatusDto,
        @CurrentUser() user: User,
    ) {
        return this.posReturnsService.updatePosReturnStatus(id, dto, user);
    }

    /**
     * Get POS return details
     * GET /api/returns/pos/:id
     */
    @Get('pos/:id')
    @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
    findOnePosReturn(@Param('id') id: string) {
        return this.posReturnsService.findOnePosReturn(id);
    }

    /**
     * List POS returns (with branch scoping)
     * GET /api/returns/pos?branchId=&status=&dateFrom=&dateTo=
     */
    @Get('pos')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    findAllPosReturns(
        @Query() query: { branchId?: string; status?: string; dateFrom?: string; dateTo?: string },
        @CurrentUser() user: User,
    ) {
        return this.posReturnsService.findAllPosReturns(query, user);
    }

    // ═══════════════════════════════════════════════════════════
    //  LEGACY RETURNS — kept intact for backward compatibility
    // ═══════════════════════════════════════════════════════════

    /** Legacy: Create return (POS immediate) */
    @Post()
    @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
    create(@Body() data: any, @CurrentUser() user: User) {
        return this.service.createReturn(data, user);
    }

    /** Legacy: Order return request */
    @Post('order-return')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    requestOrderReturn(@Body() data: any, @CurrentUser() user: User) {
        return this.service.requestOrderReturn(data, user);
    }

    /** Legacy: Status transition */
    @Patch(':id/status')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    updateStatus(
        @Param('id') id: string,
        @Body() data: { status: ReturnStatus; notes?: string },
        @CurrentUser() user: User,
    ) {
        return this.service.updateStatus(id, data.status, user, data.notes);
    }

    @Get()
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    findAll(@Query() query: any) {
        return this.service.findAll(query);
    }

    // Note: This must come AFTER all specific routes to avoid conflicts
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }
}
