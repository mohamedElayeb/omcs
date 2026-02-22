import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/enums';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.OWNER, UserRole.MANAGER)
@Controller('api/dashboard')
export class DashboardController {
    constructor(private service: DashboardService) { }

    @Get('overview')
    getOverview() { return this.service.getOverview(); }

    @Get('revenue-trend')
    getRevenueTrend(@Query('days') days: string) {
        return this.service.getRevenueTrend(days ? parseInt(days) : 7);
    }

    @Get('top-products')
    getTopProducts(@Query('limit') limit: string) {
        return this.service.getTopProducts(limit ? parseInt(limit) : 10);
    }

    @Get('branch-comparison')
    getBranchComparison() { return this.service.getBranchComparison(); }

    @Get('employee-ranking')
    getEmployeeRanking() { return this.service.getEmployeeRanking(); }
}
