import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ActivityLogService } from './activity-log.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/enums';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('api/activity-logs')
export class ActivityLogController {
    constructor(private readonly logService: ActivityLogService) {}

    @Get()
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    findAll(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('action') action?: string,
        @Query('entityType') entityType?: string,
        @Query('userId') userId?: string,
        @Query('branchId') branchId?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('search') search?: string,
    ) {
        return this.logService.findAll({
            page: Number(page), limit: Number(limit),
            action, entityType, userId, branchId, startDate, endDate, search,
        });
    }

    @Get('action-counts')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    getActionCounts() {
        return this.logService.getActionCounts();
    }
}
