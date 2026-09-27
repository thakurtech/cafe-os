import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { RevenueService } from './revenue.service';
import { AffiliatesService } from './affiliates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class SuperAdminController {
    constructor(
        private readonly superAdminService: SuperAdminService,
        private readonly revenueService: RevenueService,
        private readonly affiliatesService: AffiliatesService,
    ) { }

    @Get('platform-stats')
    getPlatformStats() {
        return this.superAdminService.getPlatformStats();
    }

    @Get('analytics')
    getPlatformAnalytics(@Query('days') days?: string) {
        const parsed = days === undefined ? NaN : Number(days);
        return this.superAdminService.getPlatformAnalytics(Number.isNaN(parsed) ? 30 : parsed);
    }

    @Get('revenue')
    getRevenueOverview() {
        return this.revenueService.getRevenueOverview();
    }

    @Get('affiliates')
    getAffiliateOverview() {
        return this.affiliatesService.getOverview();
    }

    @Post('affiliates/payouts/:id/approve')
    approvePayout(@Param('id') id: string) {
        return this.affiliatesService.approvePayout(id);
    }

    @Post('affiliates/payouts/:id/reject')
    rejectPayout(@Param('id') id: string) {
        return this.affiliatesService.rejectPayout(id);
    }

    @Get('cafes')
    getAllCafes() {
        return this.superAdminService.getAllCafes();
    }

    @Get('recent-signups')
    getRecentSignups() {
        return this.superAdminService.getRecentSignups();
    }
}
