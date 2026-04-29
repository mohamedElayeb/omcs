import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLog } from '../../entities';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogController } from './activity-log.controller';

@Global() // Make ActivityLogService injectable everywhere
@Module({
    imports: [TypeOrmModule.forFeature([ActivityLog])],
    controllers: [ActivityLogController],
    providers: [ActivityLogService],
    exports: [ActivityLogService],
})
export class ActivityLogModule {}
