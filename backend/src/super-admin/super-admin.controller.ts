import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Request,
    UseGuards,
    ValidationPipe,
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { RevenueService } from './revenue.service';
import { AffiliatesService } from './affiliates.service';
import { SettingsService } from './settings.service';
import { SupportService } from './support.service';
import { MarketingService } from './marketing.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { ReplyToTicketDto, UpdateTicketDto } from './dto/support.dto';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/marketing.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

const bodyPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
});

@Controller('super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class SuperAdminController {
    constructor(
        private readonly superAdminService: SuperAdminService,
        private readonly revenueService: RevenueService,
        private readonly affiliatesService: AffiliatesService,
        private readonly settingsService: SettingsService,
        private readonly supportService: SupportService,
        private readonly marketingService: MarketingService,
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

    @Get('settings')
    getSettings() {
        return this.settingsService.getSettings();
    }

    // The app registers no global ValidationPipe, so it is applied here explicitly.
    @Patch('settings')
    updateSettings(
        @Body(bodyPipe) dto: UpdatePlatformSettingsDto,
    ) {
        return this.settingsService.updateSettings(dto);
    }

    @Get('support')
    listTickets(@Query('status') status?: string, @Query('priority') priority?: string) {
        return this.supportService.listTickets({ status, priority });
    }

    @Get('support/stats')
    getSupportStats() {
        return this.supportService.getStats();
    }

    @Get('support/:id')
    getTicket(@Param('id') id: string) {
        return this.supportService.getTicket(id);
    }

    @Post('support/:id/replies')
    replyToTicket(
        @Param('id') id: string,
        @Body(bodyPipe) dto: ReplyToTicketDto,
        @Request() req,
    ) {
        return this.supportService.replyToTicket(id, dto, {
            userId: req.user?.userId,
            role: req.user?.role,
        });
    }

    @Patch('support/:id')
    updateTicket(@Param('id') id: string, @Body(bodyPipe) dto: UpdateTicketDto) {
        return this.supportService.updateTicket(id, dto);
    }

    @Get('marketing')
    getMarketingOverview() {
        return this.marketingService.getOverview();
    }

    @Post('marketing/announcements')
    createAnnouncement(@Body(bodyPipe) dto: CreateAnnouncementDto, @Request() req) {
        return this.marketingService.createAnnouncement(dto, req.user?.userId);
    }

    @Patch('marketing/announcements/:id')
    updateAnnouncement(@Param('id') id: string, @Body(bodyPipe) dto: UpdateAnnouncementDto) {
        return this.marketingService.updateAnnouncement(id, dto);
    }

    @Delete('marketing/announcements/:id')
    deleteAnnouncement(@Param('id') id: string) {
        return this.marketingService.deleteAnnouncement(id);
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
