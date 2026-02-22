import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../entities';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('login')
    login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    @Get('me')
    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    getProfile(@CurrentUser() user: User) {
        return this.authService.getProfile(user.id);
    }

    @Post('verify-pin')
    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    verifyManagerPin(@Body() data: { branchId: string; pin: string }) {
        return this.authService.verifyManagerPin(data.branchId, data.pin);
    }
}
