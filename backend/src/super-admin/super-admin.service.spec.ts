import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

type OrderRow = {
    shopId: string;
    totalAmount: number;
    createdAt: Date;
    source: string;
    paymentMethod: string;
};

/**
 * Builds a PrismaService stand-in. Order queries are split into the current and
 * previous window by the shape of the createdAt filter the service sends:
 * the current window uses `lte`, the previous one uses `lt`.
 */
function buildPrismaStub(options: {
    currentOrders: OrderRow[];
    previousOrders: OrderRow[];
    shops?: { id: string; name: string; slug: string }[];
    counts?: Record<string, number>;
}) {
    const { currentOrders, previousOrders, shops = [], counts = {} } = options;

    const isPreviousWindow = (args: any) => args?.where?.createdAt?.lt !== undefined;

    return {
        order: {
            findMany: jest.fn(async (args: any) =>
                isPreviousWindow(args) ? previousOrders : currentOrders,
            ),
            count: jest.fn(async (args: any) =>
                isPreviousWindow(args) ? previousOrders.length : currentOrders.length,
            ),
        },
        shop: {
            count: jest.fn(async (args: any) => {
                if (args?.where?.isActive === true) return counts.activeCafes ?? shops.length;
                if (isPreviousWindow(args)) return counts.cafesPrevious ?? 0;
                if (args?.where?.createdAt) return counts.cafesCurrent ?? 0;
                return counts.totalCafes ?? shops.length;
            }),
            findMany: jest.fn(async () => shops),
        },
        user: {
            count: jest.fn(async (args: any) => {
                if (!args?.where?.createdAt) return counts.totalUsers ?? 0;
                return isPreviousWindow(args)
                    ? (counts.customersPrevious ?? 0)
                    : (counts.customersCurrent ?? 0);
            }),
        },
        subscription: {
            aggregate: jest.fn(async (args: any) => ({
                _sum: {
                    priceMonthly: args?.where?.createdAt
                        ? (counts.mrrPrevious ?? 0)
                        : (counts.mrrCurrent ?? 0),
                },
            })),
        },
    } as unknown as PrismaService;
}

function order(overrides: Partial<OrderRow> = {}): OrderRow {
    return {
        shopId: 'shop-a',
        totalAmount: 100,
        createdAt: new Date(),
        source: 'POS',
        paymentMethod: 'CASH',
        ...overrides,
    };
}

describe('SuperAdminService.getPlatformAnalytics', () => {
    it('includes orders placed today in the timeseries', async () => {
        const today = new Date();
        const prisma = buildPrismaStub({
            currentOrders: [order({ createdAt: today, totalAmount: 250 })],
            previousOrders: [],
        });

        const result = await new SuperAdminService(prisma).getPlatformAnalytics(30);

        const todayKey = today.toISOString().split('T')[0];
        const todayBucket = result.timeseries.find((point) => point.date === todayKey);

        expect(todayBucket).toBeDefined();
        expect(todayBucket!.orders).toBe(1);
        expect(todayBucket!.revenue).toBe(250);

        // Every order must land in a bucket: the chart total has to match the headline.
        const charted = result.timeseries.reduce((sum, point) => sum + point.orders, 0);
        expect(charted).toBe(result.totals.orders);
    });

    it('seeds quiet days as zero instead of omitting them', async () => {
        const prisma = buildPrismaStub({
            currentOrders: [order({ createdAt: new Date() })],
            previousOrders: [],
        });

        const result = await new SuperAdminService(prisma).getPlatformAnalytics(7);

        // 7-day window, inclusive of both ends.
        expect(result.timeseries).toHaveLength(8);
        expect(result.timeseries.filter((point) => point.orders === 0)).toHaveLength(7);
        // Dates must come back in ascending order for the chart to read correctly.
        const dates = result.timeseries.map((point) => point.date);
        expect([...dates].sort()).toEqual(dates);
    });

    it('computes period-over-period growth from real counts', async () => {
        const prisma = buildPrismaStub({
            currentOrders: [
                order({ totalAmount: 100 }),
                order({ totalAmount: 100 }),
                order({ totalAmount: 100 }),
            ],
            previousOrders: [order({ totalAmount: 100 }), order({ totalAmount: 100 })],
        });

        const result = await new SuperAdminService(prisma).getPlatformAnalytics(30);

        expect(result.totals.orders).toBe(3);
        expect(result.totals.revenue).toBe(300);
        expect(result.totals.avgOrderValue).toBe(100);
        // 3 vs 2 orders => +50%
        expect(result.growth.orders).toBe(50);
        // 300 vs 200 revenue => +50%
        expect(result.growth.revenue).toBe(50);
        // AOV unchanged at 100 => 0%
        expect(result.growth.avgOrderValue).toBe(0);
    });

    it('reports 100% growth when the previous period was empty, and 0% when both are', async () => {
        const fromZero = await new SuperAdminService(
            buildPrismaStub({ currentOrders: [order()], previousOrders: [] }),
        ).getPlatformAnalytics(30);
        expect(fromZero.growth.orders).toBe(100);

        const bothEmpty = await new SuperAdminService(
            buildPrismaStub({ currentOrders: [], previousOrders: [] }),
        ).getPlatformAnalytics(30);
        expect(bothEmpty.growth.orders).toBe(0);
        expect(bothEmpty.totals.avgOrderValue).toBe(0);
        expect(bothEmpty.growth.revenue).toBe(0);
    });

    it('ranks top cafes by revenue and includes cafes with no orders', async () => {
        const prisma = buildPrismaStub({
            currentOrders: [
                order({ shopId: 'shop-a', totalAmount: 100 }),
                order({ shopId: 'shop-b', totalAmount: 500 }),
                order({ shopId: 'shop-b', totalAmount: 50 }),
            ],
            previousOrders: [],
            shops: [
                { id: 'shop-a', name: 'Cafe A', slug: 'cafe-a' },
                { id: 'shop-b', name: 'Cafe B', slug: 'cafe-b' },
                { id: 'shop-c', name: 'Cafe C', slug: 'cafe-c' },
            ],
        });

        const result = await new SuperAdminService(prisma).getPlatformAnalytics(30);

        expect(result.topCafes.map((cafe) => cafe.name)).toEqual(['Cafe B', 'Cafe A', 'Cafe C']);
        expect(result.topCafes[0]).toMatchObject({ orders: 2, revenue: 550 });
        expect(result.topCafes[2]).toMatchObject({ orders: 0, revenue: 0 });
    });

    it('aggregates channel and payment mixes without losing orders', async () => {
        const prisma = buildPrismaStub({
            currentOrders: [
                order({ source: 'POS', paymentMethod: 'CASH', totalAmount: 100 }),
                order({ source: 'POS', paymentMethod: 'UPI', totalAmount: 200 }),
                order({ source: 'QR_TABLE', paymentMethod: 'UPI', totalAmount: 300 }),
            ],
            previousOrders: [],
        });

        const result = await new SuperAdminService(prisma).getPlatformAnalytics(30);

        expect(result.sourceMix).toEqual([
            { key: 'POS', orders: 2, revenue: 300 },
            { key: 'QR_TABLE', orders: 1, revenue: 300 },
        ]);
        expect(result.paymentMix).toEqual([
            { key: 'UPI', orders: 2, revenue: 500 },
            { key: 'CASH', orders: 1, revenue: 100 },
        ]);

        // Mixes must account for every order counted in the totals.
        const mixOrders = result.sourceMix.reduce((sum, entry) => sum + entry.orders, 0);
        expect(mixOrders).toBe(result.totals.orders);
    });

    it('buckets orders into all 24 hours by hour of day', async () => {
        const at = new Date();
        at.setHours(14, 30, 0, 0);

        const prisma = buildPrismaStub({
            currentOrders: [order({ createdAt: at, totalAmount: 400 })],
            previousOrders: [],
        });

        const result = await new SuperAdminService(prisma).getPlatformAnalytics(30);

        expect(result.hourly).toHaveLength(24);
        expect(result.hourly[at.getHours()]).toMatchObject({ orders: 1, revenue: 400 });
        const total = result.hourly.reduce((sum, bucket) => sum + bucket.orders, 0);
        expect(total).toBe(1);
    });

    it('clamps the requested window to a sane range', async () => {
        const service = new SuperAdminService(
            buildPrismaStub({ currentOrders: [], previousOrders: [] }),
        );

        expect((await service.getPlatformAnalytics(0)).range.days).toBe(1);
        expect((await service.getPlatformAnalytics(9999)).range.days).toBe(365);
        expect((await service.getPlatformAnalytics(NaN)).range.days).toBe(30);
    });
});

describe('SuperAdminService.getPlatformStats', () => {
    it('derives MRR and growth from subscriptions rather than a per-cafe guess', async () => {
        const prisma = buildPrismaStub({
            currentOrders: [order(), order()],
            previousOrders: [order()],
            counts: {
                totalCafes: 10,
                totalUsers: 40,
                cafesCurrent: 3,
                cafesPrevious: 2,
                customersCurrent: 12,
                customersPrevious: 10,
                mrrCurrent: 4000,
                mrrPrevious: 2500,
            },
        });

        const stats = await new SuperAdminService(prisma).getPlatformStats();

        // Real sum of subscription prices, not totalCafes * 500.
        expect(stats.mrr).toBe(4000);
        expect(stats.mrr).not.toBe(10 * 500);
        // 4000 vs 2500 => +60%
        expect(stats.mrrGrowth).toBe(60);
        expect(stats.totalCafes).toBe(10);
        // 3 vs 2 new cafes => +50%
        expect(stats.cafeGrowth).toBe(50);
        // None of the growth figures may be the old hardcoded constants.
        expect([stats.mrrGrowth, stats.cafeGrowth, stats.userGrowth, stats.orderGrowth]).not.toContain(
            12.5,
        );
    });
});
