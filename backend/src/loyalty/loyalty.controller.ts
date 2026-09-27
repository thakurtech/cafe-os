import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('loyalty')
export class LoyaltyController {
    constructor(private readonly loyaltyService: LoyaltyService) { }

    @UseGuards(JwtAuthGuard)
    @Get('stats')
    async getStats(@Request() req) {
        return this.loyaltyService.getUserStats(req.user.userId);
    }

    @UseGuards(JwtAuthGuard)
    @Get('leaderboard')
    async getLeaderboard() {
        return this.loyaltyService.getLeaderboard();
    }

    @UseGuards(JwtAuthGuard)
    @Post('referral/create')
    async createReferralCode(@Request() req) {
        return this.loyaltyService.createReferralCode(req.user.userId);
    }
}
