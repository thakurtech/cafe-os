import { ShopsService } from './shops.service';
import { PrismaService } from '../prisma.service';

type OrderRow = {
    createdAt: Date;
    totalAmount: number;
    status: string;
};

/** Local calendar day key, matching the one the service builds. */
function dayKey(date: Date): string {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

function startOfToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

/** Today at a fixed hour, so the bucket an order lands in never depends on the clock. */
function todayAt(hour: number): Date {
    const at = startOfToday();
    at.setHours(hour, 30, 0, 0);
    return at;
}

function daysAgoAt(days: number, hour: number): Date {
    const at = startOfToday();
    at.setDate(at.getDate() - days);
    at.setHours(hour, 30, 0, 0);
    return at;
}

function order(createdAt: Date, totalAmount: number, status = 'COMPLETED'): OrderRow {
    return { createdAt, totalAmount, status };
}

/**
 * PrismaService stand-in that honours the createdAt / status filters the service
 * sends, so the tests exercise the real query windows and not just the bucketing.
 */
function matchesWhere(row: OrderRow, where: any): boolean {
    const createdAt = where?.createdAt;
    if (createdAt?.gte && row.createdAt < createdAt.gte) return false;
    if (createdAt?.lt && row.createdAt >= createdAt.lt) return false;
    if (where?.status?.not && row.status === where.status.not) return false;
    return true;
}

function buildPrismaStub(orders: OrderRow[]) {
    const select = (args: any) => orders.filter(row => matchesWhere(row, args?.where));

    return {
        order: {
            count: jest.fn(async (args: any) => select(args).length),
            aggregate: jest.fn(async (args: any) => ({
                _sum: {
                    totalAmount: select(args).reduce((sum, row) => sum + row.totalAmount, 0),
                },
            })),
            groupBy: jest.fn(async () => []),
            findMany: jest.fn(async (args: any) => {
                // The series query asks for a narrow selection; recentOrders does not.
                if (args?.select) {
                    return select(args).map(row => ({
                        createdAt: row.createdAt,
                        totalAmount: row.totalAmount,
                    }));
                }
                return [...orders]
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                    .slice(0, args?.take ?? orders.length);
            }),
            findFirst: jest.fn(async () =>
                [...orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
                null,
            ),
        },
        orderItem: {
            groupBy: jest.fn(async () => []),
        },
        inventoryItem: {
            findMany: jest.fn(async () => []),
        },
    } as unknown as PrismaService;
}

describe('ShopsService.getStats revenue series', () => {
    it('keeps every one of the 24 hours, with today placed in the hour it was sold', async () => {
        const prisma = buildPrismaStub([order(todayAt(9), 100), order(todayAt(9), 50)]);

        const stats = await new ShopsService(prisma).getStats('shop-1');

        expect(stats.revenueByHour).toHaveLength(24);
        expect(stats.revenueByHour.map(bucket => bucket.hour)).toEqual(
            Array.from({ length: 24 }, (_, hour) => hour),
        );
        expect(stats.revenueByHour[9]).toEqual({ hour: 9, orders: 2, revenue: 150 });
        // Quiet hours are present and zero, never missing.
        const quiet = stats.revenueByHour.filter(bucket => bucket.hour !== 9);
        expect(quiet).toHaveLength(23);
        expect(quiet.every(bucket => bucket.orders === 0 && bucket.revenue === 0)).toBe(true);
    });

    it("lands today's orders in the last day bucket", async () => {
        const prisma = buildPrismaStub([order(todayAt(14), 400)]);

        const stats = await new ShopsService(prisma).getStats('shop-1');

        const todayBucket = stats.revenueByDay[stats.revenueByDay.length - 1];
        expect(todayBucket.date).toBe(dayKey(new Date()));
        expect(todayBucket).toEqual({ date: dayKey(new Date()), orders: 1, revenue: 400 });
        // The day series and the today aggregate have to agree.
        expect(todayBucket.revenue).toBe(stats.todayRevenue);
        // Nothing fell outside the pre-seeded window.
        const seriesOrders = stats.revenueByDay.reduce((sum, day) => sum + day.orders, 0);
        expect(seriesOrders).toBe(1);
    });

    it('covers seven days inclusive of both ends, oldest first', async () => {
        const stats = await new ShopsService(buildPrismaStub([])).getStats('shop-1');

        expect(stats.revenueByDay).toHaveLength(7);

        const expected = Array.from({ length: 7 }, (_, offset) => {
            const day = startOfToday();
            day.setDate(day.getDate() - (6 - offset));
            return dayKey(day);
        });
        expect(stats.revenueByDay.map(day => day.date)).toEqual(expected);
    });

    it('returns zeroed buckets rather than gaps when nothing was sold', async () => {
        const stats = await new ShopsService(buildPrismaStub([])).getStats('shop-1');

        expect(stats.revenueByDay).toHaveLength(7);
        expect(stats.revenueByDay.every(day => day.orders === 0 && day.revenue === 0)).toBe(true);
        expect(stats.revenueByHour).toHaveLength(24);
        expect(stats.revenueByHour.every(hour => hour.orders === 0 && hour.revenue === 0)).toBe(
            true,
        );
    });

    it('leaves cancelled orders out of both series', async () => {
        const prisma = buildPrismaStub([
            order(todayAt(11), 200),
            order(todayAt(11), 999, 'CANCELLED'),
            order(daysAgoAt(2, 11), 300),
            order(daysAgoAt(2, 11), 999, 'CANCELLED'),
        ]);

        const stats = await new ShopsService(prisma).getStats('shop-1');

        expect(stats.revenueByHour[11]).toEqual({ hour: 11, orders: 1, revenue: 200 });

        const twoDaysAgo = stats.revenueByDay.find(day => day.date === dayKey(daysAgoAt(2, 11)));
        expect(twoDaysAgo).toEqual({ date: dayKey(daysAgoAt(2, 11)), orders: 1, revenue: 300 });

        const seriesRevenue = stats.revenueByDay.reduce((sum, day) => sum + day.revenue, 0);
        expect(seriesRevenue).toBe(500);
    });

    it('buckets earlier days separately and keeps them out of the hour series', async () => {
        const prisma = buildPrismaStub([order(todayAt(8), 120), order(daysAgoAt(3, 8), 80)]);

        const stats = await new ShopsService(prisma).getStats('shop-1');

        // Hour-of-day covers today only, so yesterday's 8am does not pile onto today's.
        expect(stats.revenueByHour[8]).toEqual({ hour: 8, orders: 1, revenue: 120 });

        const byDate = new Map(stats.revenueByDay.map(day => [day.date, day]));
        expect(byDate.get(dayKey(new Date()))).toMatchObject({ orders: 1, revenue: 120 });
        expect(byDate.get(dayKey(daysAgoAt(3, 8)))).toMatchObject({ orders: 1, revenue: 80 });
    });

    it('fills the quiet days between two busy ones', async () => {
        const prisma = buildPrismaStub([order(todayAt(10), 60), order(daysAgoAt(6, 10), 40)]);

        const stats = await new ShopsService(prisma).getStats('shop-1');

        // A gap in the middle of a chart series is a bug, so the quiet days are zeros.
        expect(stats.revenueByDay).toHaveLength(7);
        expect(stats.revenueByDay.slice(1, 6).every(day => day.orders === 0)).toBe(true);
        expect(stats.revenueByDay[0]).toMatchObject({ orders: 1, revenue: 40 });
        expect(stats.revenueByDay[6]).toMatchObject({ orders: 1, revenue: 60 });
    });

    it('ignores orders older than the series window', async () => {
        const prisma = buildPrismaStub([order(daysAgoAt(30, 12), 5000), order(todayAt(12), 10)]);

        const stats = await new ShopsService(prisma).getStats('shop-1');

        expect(stats.revenueByDay).toHaveLength(7);
        const seriesRevenue = stats.revenueByDay.reduce((sum, day) => sum + day.revenue, 0);
        expect(seriesRevenue).toBe(10);
    });

    it('rounds fractional revenue to paise instead of leaking float noise', async () => {
        const prisma = buildPrismaStub([order(todayAt(7), 10.1), order(todayAt(7), 20.2)]);

        const stats = await new ShopsService(prisma).getStats('shop-1');

        expect(stats.revenueByHour[7].revenue).toBe(30.3);
        expect(stats.revenueByDay[stats.revenueByDay.length - 1].revenue).toBe(30.3);
    });
});
