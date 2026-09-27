import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('affiliate')
export class AffiliateController {
    constructor(private readonly affiliateService: AffiliateService) { }

    @UseGuards(JwtAuthGuard)
    @Get('stats')
    async getStats(@Request() req) {
        return this.affiliateService.getStats(req.user.userId);
    }

    @UseGuards(JwtAuthGuard)
    @Get('referrals')
    async getReferrals(@Request() req) {
        return this.affiliateService.getReferrals(req.user.userId);
    }

    @UseGuards(JwtAuthGuard)
    @Post('onboard')
    async onboardCafe(@Request() req, @Body() body: { shopName: string; ownerName: string; ownerPhone: string }) {
        return this.affiliateService.onboardCafe(req.user.userId, body);
    }
}
