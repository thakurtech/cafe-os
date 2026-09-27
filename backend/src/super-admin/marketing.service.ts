import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
    AnnouncementAudience,
    CreateAnnouncementDto,
    UpdateAnnouncementDto,
} from './dto/marketing.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const ATTRIBUTION_WINDOW_DAYS = 30;

/** Maps an announcement audience onto the subscription states it covers. */
const AUDIENCE_SUBSCRIPTION_STATUSES: Record<AnnouncementAudience, string[] | null> = {
    ALL: null,
    TRIAL: ['TRIAL'],
    ACTIVE: ['ACTIVE'],
    PAST_DUE: ['PAST_DUE', 'GRACE'],
};

export interface MarketingOverview {
    campaigns: {
        total: number;
        byStatus: { key: string; count: number }[];
        byType: { key: string; count: number }[];
        recent: {
            id: string;
            name: string;
            type: string;
            status: string;
            shopName: string;
            createdAt: string;
        }[];
    };
    attribution: {
        windowDays: number;
        attributedOrders: number;
        attributedRevenue: number;
        /** Share of all orders in the window that carry an attribution row. */
        coverage: number;
        bySource: { key: string; orders: number; revenue: number }[];
    };
    announcements: AnnouncementRow[];
}

export interface AnnouncementRow {
    id: string;
    title: string;
    body: string;
    audience: string;
    status: string;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    /** How many cafes currently match this announcement's audience. */
    reach: number;
}

@Injectable()
export class MarketingService {
    constructor(private prisma: PrismaService) { }

    async getOverview(): Promise<MarketingOverview> {
        const since = new Date(Date.now() - ATTRIBUTION_WINDOW_DAYS * DAY_MS);

        const [campaigns, attributions, totalOrdersInWindow, announcements] = await Promise.all([
            this.prisma.campaign.findMany({
                include: { shop: { select: { name: true } } },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.attribution.findMany({
                where: { createdAt: { gte: since } },
                include: { order: { select: { totalAmount: true, status: true } } },
            }),
            this.prisma.order.count({
                where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
            }),
            this.prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } }),
        ]);

        // Cancelled orders must not inflate attributed revenue.
        const billable = attributions.filter(
            (row) => row.order !== null && row.order.status !== 'CANCELLED',
        );
        const attributedRevenue = billable.reduce((sum, row) => sum + row.order.totalAmount, 0);

        return {
            campaigns: {
                total: campaigns.length,
                byStatus: this.tally(campaigns.map((campaign) => campaign.status)),
                byType: this.tally(campaigns.map((campaign) => campaign.type)),
                recent: campaigns.slice(0, 10).map((campaign) => ({
                    id: campaign.id,
                    name: campaign.name,
                    type: campaign.type,
                    status: campaign.status,
                    shopName: campaign.shop?.name ?? 'Unlinked',
                    createdAt: campaign.createdAt.toISOString(),
                })),
            },
            attribution: {
                windowDays: ATTRIBUTION_WINDOW_DAYS,
                attributedOrders: billable.length,
                attributedRevenue: this.round(attributedRevenue),
                coverage:
                    totalOrdersInWindow > 0
                        ? this.round((billable.length / totalOrdersInWindow) * 100, 1)
                        : 0,
                bySource: this.tallyRevenue(billable),
            },
            announcements: await this.decorateAnnouncements(announcements),
        };
    }

    async createAnnouncement(dto: CreateAnnouncementDto, createdById?: string) {
        const status = dto.status ?? 'DRAFT';

        const created = await this.prisma.announcement.create({
            data: {
                title: dto.title,
                body: dto.body,
                audience: dto.audience ?? 'ALL',
                status,
                // Publishing straight away stamps the time; a draft has none.
                publishedAt: status === 'PUBLISHED' ? new Date() : null,
                createdById: createdById ?? null,
            },
        });

        return (await this.decorateAnnouncements([created]))[0];
    }

    async updateAnnouncement(id: string, dto: UpdateAnnouncementDto) {
        const existing = await this.prisma.announcement.findUnique({ where: { id } });

        if (!existing) {
            throw new NotFoundException('Announcement not found');
        }

        const patch = Object.fromEntries(
            Object.entries(dto).filter(([, value]) => value !== undefined),
        ) as Record<string, unknown>;

        if (Object.keys(patch).length === 0) {
            throw new BadRequestException('Nothing to update');
        }

        if (dto.status !== undefined) {
            // Keep the original publish time when re-publishing; clear it on unpublish.
            patch.publishedAt =
                dto.status === 'PUBLISHED' ? (existing.publishedAt ?? new Date()) : null;
        }

        const updated = await this.prisma.announcement.update({ where: { id }, data: patch });
        return (await this.decorateAnnouncements([updated]))[0];
    }

    async deleteAnnouncement(id: string) {
        const existing = await this.prisma.announcement.findUnique({ where: { id } });

        if (!existing) {
            throw new NotFoundException('Announcement not found');
        }

        await this.prisma.announcement.delete({ where: { id } });
        return { success: true, id };
    }

    // ==================== helpers ====================

    /** Attaches the live audience size to each announcement. */
    private async decorateAnnouncements(
        announcements: {
            id: string;
            title: string;
            body: string;
            audience: string;
            status: string;
            publishedAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
        }[],
    ): Promise<AnnouncementRow[]> {
        const audiences = [...new Set(announcements.map((item) => item.audience))];
        const reachByAudience = new Map<string, number>();

        await Promise.all(
            audiences.map(async (audience) => {
                reachByAudience.set(audience, await this.countAudience(audience));
            }),
        );

        return announcements.map((item) => ({
            id: item.id,
            title: item.title,
            body: item.body,
            audience: item.audience,
            status: item.status,
            publishedAt: item.publishedAt?.toISOString() ?? null,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
            reach: reachByAudience.get(item.audience) ?? 0,
        }));
    }

    private async countAudience(audience: string): Promise<number> {
        const statuses = AUDIENCE_SUBSCRIPTION_STATUSES[audience as AnnouncementAudience];

        if (statuses === null || statuses === undefined) {
            return this.prisma.shop.count({ where: { isActive: true } });
        }

        return this.prisma.shop.count({
            where: { isActive: true, subscription: { status: { in: statuses as never } } },
        });
    }

    private tally(values: string[]) {
        const counts = new Map<string, number>();
        values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));

        return [...counts.entries()]
            .map(([key, count]) => ({ key, count }))
            .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    }

    private tallyRevenue(rows: { source: string; order: { totalAmount: number } }[]) {
        const totals = new Map<string, { key: string; orders: number; revenue: number }>();

        rows.forEach((row) => {
            const entry = totals.get(row.source) ?? { key: row.source, orders: 0, revenue: 0 };
            entry.orders++;
            entry.revenue += row.order.totalAmount;
            totals.set(row.source, entry);
        });

        return [...totals.values()]
            .map((entry) => ({ ...entry, revenue: this.round(entry.revenue) }))
            .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders);
    }

    private round(value: number, decimals = 2): number {
        const factor = 10 ** decimals;
        return Math.round(value * factor) / factor;
    }
}
