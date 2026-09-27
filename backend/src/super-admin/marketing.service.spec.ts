import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { PrismaService } from '../prisma.service';

type Campaign = {
    id: string;
    name: string;
    type: string;
    status: string;
    createdAt: Date;
    shop: { name: string } | null;
};

type Attribution = {
    source: string;
    createdAt: Date;
    order: { totalAmount: number; status: string } | null;
};

type Announcement = {
    id: string;
    title: string;
    body: string;
    audience: string;
    status: string;
    publishedAt: Date | null;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
};

function buildPrismaStub(options: {
    campaigns?: Campaign[];
    attributions?: Attribution[];
    announcements?: Announcement[];
    ordersInWindow?: number;
    shopCounts?: { all: number; byStatus: Record<string, number> };
}) {
    const {
        campaigns = [],
        attributions = [],
        announcements = [],
        ordersInWindow = 0,
        shopCounts = { all: 0, byStatus: {} },
    } = options;

    return {
        campaign: { findMany: jest.fn(async () => campaigns) },
        attribution: { findMany: jest.fn(async () => attributions) },
        order: { count: jest.fn(async () => ordersInWindow) },
        shop: {
            count: jest.fn(async ({ where }: any = {}) => {
                const statuses: string[] | undefined = where?.subscription?.status?.in;
                if (!statuses) return shopCounts.all;
                return statuses.reduce(
                    (sum, status) => sum + (shopCounts.byStatus[status] ?? 0),
                    0,
                );
            }),
        },
        announcement: {
            findMany: jest.fn(async () => announcements),
            findUnique: jest.fn(async ({ where }: any) =>
                announcements.find((item) => item.id === where.id) ?? null,
            ),
            create: jest.fn(async ({ data }: any) => {
                const created: Announcement = {
                    id: `a-${announcements.length + 1}`,
                    publishedAt: null,
                    createdById: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    ...data,
                };
                announcements.push(created);
                return created;
            }),
            update: jest.fn(async ({ where, data }: any) => {
                const found = announcements.find((item) => item.id === where.id);
                if (!found) throw new Error('missing');
                Object.assign(found, data);
                return found;
            }),
            delete: jest.fn(async ({ where }: any) => {
                const index = announcements.findIndex((item) => item.id === where.id);
                return announcements.splice(index, 1)[0];
            }),
        },
    } as unknown as PrismaService;
}

function campaign(overrides: Partial<Campaign> = {}): Campaign {
    return {
        id: 'c-1',
        name: 'Monsoon push',
        type: 'WHATSAPP',
        status: 'ACTIVE',
        createdAt: new Date(),
        shop: { name: 'Cafe One' },
        ...overrides,
    };
}

function attribution(overrides: Partial<Attribution> = {}): Attribution {
    return {
        source: 'INSTAGRAM',
        createdAt: new Date(),
        order: { totalAmount: 100, status: 'COMPLETED' },
        ...overrides,
    };
}

function announcement(overrides: Partial<Announcement> = {}): Announcement {
    return {
        id: 'a-1',
        title: 'New POS shortcuts',
        body: 'Details inside',
        audience: 'ALL',
        status: 'DRAFT',
        publishedAt: null,
        createdById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

describe('MarketingService.getOverview', () => {
    it('tallies campaigns by status and type, busiest first', async () => {
        const prisma = buildPrismaStub({
            campaigns: [
                campaign({ id: 'c1', status: 'ACTIVE', type: 'WHATSAPP' }),
                campaign({ id: 'c2', status: 'ACTIVE', type: 'EMAIL' }),
                campaign({ id: 'c3', status: 'DRAFT', type: 'WHATSAPP' }),
            ],
        });

        const result = await new MarketingService(prisma).getOverview();

        expect(result.campaigns.total).toBe(3);
        expect(result.campaigns.byStatus).toEqual([
            { key: 'ACTIVE', count: 2 },
            { key: 'DRAFT', count: 1 },
        ]);
        expect(result.campaigns.byType[0]).toEqual({ key: 'WHATSAPP', count: 2 });
    });

    it('excludes cancelled orders from attributed revenue', async () => {
        const prisma = buildPrismaStub({
            attributions: [
                attribution({ source: 'INSTAGRAM', order: { totalAmount: 300, status: 'COMPLETED' } }),
                attribution({ source: 'INSTAGRAM', order: { totalAmount: 999, status: 'CANCELLED' } }),
                attribution({ source: 'AFFILIATE', order: { totalAmount: 200, status: 'READY' } }),
            ],
            ordersInWindow: 10,
        });

        const result = await new MarketingService(prisma).getOverview();

        expect(result.attribution.attributedOrders).toBe(2);
        expect(result.attribution.attributedRevenue).toBe(500);
        expect(result.attribution.bySource).toEqual([
            { key: 'INSTAGRAM', orders: 1, revenue: 300 },
            { key: 'AFFILIATE', orders: 1, revenue: 200 },
        ]);
    });

    it('reports attribution coverage against all orders in the window', async () => {
        const prisma = buildPrismaStub({
            attributions: [attribution(), attribution()],
            ordersInWindow: 8,
        });

        const result = await new MarketingService(prisma).getOverview();

        // 2 of 8 orders carry an attribution row.
        expect(result.attribution.coverage).toBe(25);
    });

    it('reports zero coverage rather than dividing by zero', async () => {
        const result = await new MarketingService(
            buildPrismaStub({ attributions: [], ordersInWindow: 0 }),
        ).getOverview();

        expect(result.attribution.coverage).toBe(0);
        expect(result.attribution.attributedRevenue).toBe(0);
    });

    it('tolerates an attribution whose order has gone missing', async () => {
        const prisma = buildPrismaStub({
            attributions: [attribution({ order: null }), attribution()],
            ordersInWindow: 2,
        });

        const result = await new MarketingService(prisma).getOverview();

        expect(result.attribution.attributedOrders).toBe(1);
    });

    it('resolves the live audience size for each announcement', async () => {
        const prisma = buildPrismaStub({
            announcements: [
                announcement({ id: 'a1', audience: 'ALL' }),
                announcement({ id: 'a2', audience: 'TRIAL' }),
                announcement({ id: 'a3', audience: 'PAST_DUE' }),
            ],
            shopCounts: { all: 20, byStatus: { TRIAL: 5, ACTIVE: 12, PAST_DUE: 2, GRACE: 1 } },
        });

        const result = await new MarketingService(prisma).getOverview();
        const reach = (id: string) => result.announcements.find((a) => a.id === id)!.reach;

        expect(reach('a1')).toBe(20);
        expect(reach('a2')).toBe(5);
        // PAST_DUE covers both past-due and grace.
        expect(reach('a3')).toBe(3);
    });
});

describe('MarketingService.createAnnouncement', () => {
    it('creates a draft with no publish timestamp', async () => {
        const service = new MarketingService(buildPrismaStub({ announcements: [] }));

        const created = await service.createAnnouncement({
            title: 'Heads up',
            body: 'Maintenance Sunday',
        });

        expect(created).toMatchObject({ status: 'DRAFT', audience: 'ALL' });
        expect(created.publishedAt).toBeNull();
    });

    it('stamps the publish time when published immediately', async () => {
        const service = new MarketingService(buildPrismaStub({ announcements: [] }));

        const created = await service.createAnnouncement({
            title: 'Live now',
            body: 'Out today',
            status: 'PUBLISHED',
        });

        expect(created.status).toBe('PUBLISHED');
        expect(created.publishedAt).not.toBeNull();
    });
});

describe('MarketingService.updateAnnouncement', () => {
    it('stamps publishedAt when a draft is published', async () => {
        const rows = [announcement({ id: 'a1', status: 'DRAFT', publishedAt: null })];
        const service = new MarketingService(buildPrismaStub({ announcements: rows }));

        const updated = await service.updateAnnouncement('a1', { status: 'PUBLISHED' });

        expect(updated.status).toBe('PUBLISHED');
        expect(updated.publishedAt).not.toBeNull();
    });

    it('keeps the original publish time when re-published', async () => {
        const original = new Date(Date.now() - 86_400_000);
        const rows = [announcement({ id: 'a1', status: 'PUBLISHED', publishedAt: original })];
        const service = new MarketingService(buildPrismaStub({ announcements: rows }));

        const updated = await service.updateAnnouncement('a1', { status: 'PUBLISHED' });

        expect(updated.publishedAt).toBe(original.toISOString());
    });

    it('clears publishedAt when unpublished back to draft', async () => {
        const rows = [announcement({ id: 'a1', status: 'PUBLISHED', publishedAt: new Date() })];
        const service = new MarketingService(buildPrismaStub({ announcements: rows }));

        const updated = await service.updateAnnouncement('a1', { status: 'DRAFT' });

        expect(updated.publishedAt).toBeNull();
    });

    it('edits copy without disturbing the publish timestamp', async () => {
        const original = new Date(Date.now() - 86_400_000);
        const rows = [announcement({ id: 'a1', status: 'PUBLISHED', publishedAt: original })];
        const service = new MarketingService(buildPrismaStub({ announcements: rows }));

        const updated = await service.updateAnnouncement('a1', { title: 'Reworded' });

        expect(updated.title).toBe('Reworded');
        expect(updated.publishedAt).toBe(original.toISOString());
    });

    it('rejects an empty update and an unknown id', async () => {
        const rows = [announcement({ id: 'a1' })];
        const service = new MarketingService(buildPrismaStub({ announcements: rows }));

        await expect(service.updateAnnouncement('a1', {})).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(
            service.updateAnnouncement('nope', { title: 'Hello there' }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('MarketingService.deleteAnnouncement', () => {
    it('deletes an existing announcement', async () => {
        const rows = [announcement({ id: 'a1' })];
        const service = new MarketingService(buildPrismaStub({ announcements: rows }));

        await expect(service.deleteAnnouncement('a1')).resolves.toMatchObject({ success: true });
        expect(rows).toHaveLength(0);
    });

    it('rejects an unknown announcement', async () => {
        const service = new MarketingService(buildPrismaStub({ announcements: [] }));

        await expect(service.deleteAnnouncement('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
});
