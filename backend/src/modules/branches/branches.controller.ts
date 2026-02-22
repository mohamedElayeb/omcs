import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/enums';

@ApiTags('Branches')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('api/branches')
export class BranchesController {
    constructor(private service: BranchesService) { }

    @Get()
    findAll() { return this.service.findAll(); }

    @Get(':id')
    findOne(@Param('id') id: string) { return this.service.findOne(id); }

    @Post()
    @Roles(UserRole.OWNER)
    create(@Body() data: any) { return this.service.create(data); }

    @Patch(':id')
    @Roles(UserRole.OWNER)
    update(@Param('id') id: string, @Body() data: any) { return this.service.update(id, data); }
}
