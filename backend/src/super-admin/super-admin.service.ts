import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

// Orders in these states never count towards revenue or volume.
const EXCLUDED_ORDER_STATUSES = ['CANCELLED'] as const;

// Subscriptions in these states never count towards MRR.
const NON_BILLING_SUBSCRIPTION_STATUSES = ['CANCELLED', 'SUSPENDED', 'TRIAL'] as const;

export interface PlatformAnalytics {
    range: { days: number; from: string; to: string };
    totals: {
        orders: number;
        revenue: number;
        avgOrderValue: number;
        customers: number;
        totalCafes: number;
        activeCafes: number;
    };
    growth: {
        orders: number;
        revenue: number;
        avgOrderValue: number;
        customers: number;
        cafes: number;
    };
    timeseries: { date: string; orders: number; revenue: number }[];
    topCafes: { id: string; name: string; slug: string; orders: number; revenue: number }[];
    sourceMix: { key: string; orders: number; revenue: number }[];
    paymentMix: { key: string; orders: number; revenue: number }[];
    hourly: { hour: number; orders: number; revenue: number }[];
}

@Injectable()
export class SuperAdminService {
    constructor(private prisma: PrismaService) { }

    async getPlatformStats() {
        const { now, currentStart, previousStart } = this.periodBounds(30);

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const [
            totalCafes,
            totalUsers,
            ordersToday,
            cafesCurrent,
            cafesPrevious,
            usersCurrent,
            usersPrevious,
            ordersCurrent,
            ordersPrevious,
        ] = await Promise.all([
            this.prisma.shop.count(),
            this.prisma.user.count(),
            this.prisma.order.count({
                where: {
                    createdAt: { gte: startOfToday },
                    status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
                },
            }),
            this.prisma.shop.count({ where: { createdAt: { gte: currentStart, lte: now } } }),
            this.prisma.shop.count({ where: { createdAt: { gte: previousStart, lt: currentStart } } }),
            this.prisma.user.count({ where: { createdAt: { gte: currentStart, lte: now } } }),
            this.prisma.user.count({ where: { createdAt: { gte: previousStart, lt: currentStart } } }),
            this.prisma.order.count({
                where: {
                    createdAt: { gte: currentStart, lte: now },
                    status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
                },
            }),
            this.prisma.order.count({
                where: {
                    createdAt: { gte: previousStart, lt: currentStart },
                    status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
                },
            }),
        ]);

        const { mrr, mrrGrowth } = await this.getMrrSnapshot(currentStart);

        return {
            mrr,
            mrrGrowth,
            totalCafes,
            cafeGrowth: this.pctChange(cafesCurrent, cafesPrevious),
            activeUsers: totalUsers,
            userGrowth: this.pctChange(usersCurrent, usersPrevious),
            ordersToday,
            orderGrowth: this.pctChange(ordersCurrent, ordersPrevious),
        };
    }

    async getPlatformAnalytics(days = 30): Promise<PlatformAnalytics> {
        const windowDays = this.normaliseDays(days);
        const { now, currentStart, previousStart } = this.periodBounds(windowDays);

        const [
            currentOrders,
            previousOrders,
            totalCafes,
            activeCafes,
            cafesCurrent,
            cafesPrevious,
            customersCurrent,
            customersPrevious,
            shops,
        ] = await Promise.all([
                this.prisma.order.findMany({
                    where: {
                        createdAt: { gte: currentStart, lte: now },
                        status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
                    },
                    select: {
                        shopId: true,
                        totalAmount: true,
                        createdAt: true,
                        source: true,
                        paymentMethod: true,
                    },
                }),
                this.prisma.order.findMany({
                    where: {
                        createdAt: { gte: previousStart, lt: currentStart },
                        status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
                    },
                    select: { totalAmount: true },
                }),
                this.prisma.shop.count(),
                this.prisma.shop.count({ where: { isActive: true } }),
                this.prisma.shop.count({ where: { createdAt: { gte: currentStart, lte: now } } }),
                this.prisma.shop.count({
                    where: { createdAt: { gte: previousStart, lt: currentStart } },
                }),
                this.prisma.user.count({
                    where: { role: 'CUSTOMER', createdAt: { gte: currentStart, lte: now } },
                }),
                this.prisma.user.count({
                    where: { role: 'CUSTOMER', createdAt: { gte: previousStart, lt: currentStart } },
                }),
                this.prisma.shop.findMany({ select: { id: true, name: true, slug: true } }),
            ]);

        const revenue = this.sumRevenue(currentOrders);
        const previousRevenue = this.sumRevenue(previousOrders);
        const avgOrderValue = currentOrders.length > 0 ? revenue / currentOrders.length : 0;
        const previousAvgOrderValue =
            previousOrders.length > 0 ? previousRevenue / previousOrders.length : 0;

        return {
            range: {
                days: windowDays,
                from: currentStart.toISOString(),
                to: now.toISOString(),
            },
            totals: {
                orders: currentOrders.length,
                revenue: this.round(revenue),
                avgOrderValue: this.round(avgOrderValue),
                customers: customersCurrent,
                totalCafes,
                activeCafes,
            },
            growth: {
                orders: this.pctChange(currentOrders.length, previousOrders.length),
                revenue: this.pctChange(revenue, previousRevenue),
                avgOrderValue: this.pctChange(avgOrderValue, previousAvgOrderValue),
                customers: this.pctChange(customersCurrent, customersPrevious),
                cafes: this.pctChange(cafesCurrent, cafesPrevious),
            },
            timeseries: this.buildTimeseries(currentOrders, currentStart, windowDays),
            topCafes: this.buildTopCafes(currentOrders, shops),
            sourceMix: this.buildMix(currentOrders, (order) => order.source),
            paymentMix: this.buildMix(currentOrders, (order) => order.paymentMethod),
            hourly: this.buildHourly(currentOrders),
        };
    }

    async getAllCafes() {
        const cafes = await this.prisma.shop.findMany({
            include: {
                subscription: { select: { plan: true, status: true } },
                _count: { select: { orders: true, users: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return cafes.map((cafe) => ({
            id: cafe.id,
            name: cafe.name,
            slug: cafe.slug,
            location: cafe.address || 'N/A',
            totalOrders: cafe._count.orders,
            totalStaff: cafe._count.users,
            plan: cafe.subscription?.plan ?? 'STARTER',
            status: this.resolveCafeStatus(cafe.isActive, cafe.subscription?.status),
            joinedDate: cafe.createdAt,
        }));
    }

    async getRecentSignups() {
        const recentCafes = await this.prisma.shop.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { subscription: { select: { status: true } } },
        });

        return recentCafes.map((cafe) => ({
            name: cafe.name,
            location: cafe.address || 'N/A',
            date: this.getRelativeTime(cafe.createdAt),
            status: this.resolveCafeStatus(cafe.isActive, cafe.subscription?.status),
        }));
    }

    // ==================== helpers ====================

    /**
     * Current MRR is the sum of monthly prices across billing subscriptions.
     * Growth compares it with the MRR attributable to subscriptions that already
     * existed at the start of the window. The schema keeps no historical snapshot
     * of subscription state, so this measures MRR added during the window.
     */
    private async getMrrSnapshot(windowStart: Date) {
        const [billing, preExisting] = await Promise.all([
            this.prisma.subscription.aggregate({
                _sum: { priceMonthly: true },
                where: { status: { notIn: [...NON_BILLING_SUBSCRIPTION_STATUSES] } },
            }),
            this.prisma.subscription.aggregate({
                _sum: { priceMonthly: true },
                where: {
                    status: { notIn: [...NON_BILLING_SUBSCRIPTION_STATUSES] },
                    createdAt: { lt: windowStart },
                },
            }),
        ]);

        const mrr = billing._sum.priceMonthly ?? 0;
        const previousMrr = preExisting._sum.priceMonthly ?? 0;

        return { mrr, mrrGrowth: this.pctChange(mrr, previousMrr) };
    }

    private resolveCafeStatus(isActive: boolean, subscriptionStatus?: string) {
        if (!isActive) return 'suspended';
        if (!subscriptionStatus) return 'trial';
        return subscriptionStatus.toLowerCase();
    }

    private periodBounds(days: number) {
        const now = new Date();
        return {
            now,
            currentStart: new Date(now.getTime() - days * DAY_MS),
            previousStart: new Date(now.getTime() - 2 * days * DAY_MS),
        };
    }

    private normaliseDays(days: number) {
        if (!Number.isFinite(days)) return 30;
        return Math.min(Math.max(Math.trunc(days), 1), 365);
    }

    private pctChange(current: number, previous: number): number {
        if (previous === 0) return current > 0 ? 100 : 0;
        return this.round(((current - previous) / previous) * 100, 1);
    }

    private round(value: number, decimals = 2): number {
        const factor = 10 ** decimals;
        return Math.round(value * factor) / factor;
    }

    private sumRevenue(orders: { totalAmount: number }[]): number {
        return orders.reduce((sum, order) => sum + order.totalAmount, 0);
    }

    private buildTimeseries(
        orders: { createdAt: Date; totalAmount: number }[],
        from: Date,
        days: number,
    ) {
        const buckets = new Map<string, { date: string; orders: number; revenue: number }>();

        // Pre-seed every day in the window so gaps render as zero rather than vanishing.
        // Inclusive of both ends: `from` is now - days, so the final bucket is today.
        for (let offset = 0; offset <= days; offset++) {
            const key = new Date(from.getTime() + offset * DAY_MS).toISOString().split('T')[0];
            buckets.set(key, { date: key, orders: 0, revenue: 0 });
        }

        orders.forEach((order) => {
            const key = order.createdAt.toISOString().split('T')[0];
            const bucket = buckets.get(key);
            if (!bucket) return;
            bucket.orders++;
            bucket.revenue += order.totalAmount;
        });

        return [...buckets.values()]
            .map((bucket) => ({ ...bucket, revenue: this.round(bucket.revenue) }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    private buildTopCafes(
        orders: { shopId: string; totalAmount: number }[],
        shops: { id: string; name: string; slug: string }[],
    ) {
        const totals = new Map<string, { orders: number; revenue: number }>();

        orders.forEach((order) => {
            const entry = totals.get(order.shopId) ?? { orders: 0, revenue: 0 };
            entry.orders++;
            entry.revenue += order.totalAmount;
            totals.set(order.shopId, entry);
        });

        return shops
            .map((shop) => {
                const entry = totals.get(shop.id) ?? { orders: 0, revenue: 0 };
                return {
                    id: shop.id,
                    name: shop.name,
                    slug: shop.slug,
                    orders: entry.orders,
                    revenue: this.round(entry.revenue),
                };
            })
            .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
            .slice(0, 10);
    }

    private buildMix<T extends { totalAmount: number }>(orders: T[], pick: (order: T) => string) {
        const totals = new Map<string, { key: string; orders: number; revenue: number }>();

        orders.forEach((order) => {
            const key = pick(order);
            const entry = totals.get(key) ?? { key, orders: 0, revenue: 0 };
            entry.orders++;
            entry.revenue += order.totalAmount;
            totals.set(key, entry);
        });

        return [...totals.values()]
            .map((entry) => ({ ...entry, revenue: this.round(entry.revenue) }))
            .sort((a, b) => b.orders - a.orders);
    }

    private buildHourly(orders: { createdAt: Date; totalAmount: number }[]) {
        const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));

        orders.forEach((order) => {
            const bucket = hours[order.createdAt.getHours()];
            bucket.orders++;
            bucket.revenue += order.totalAmount;
        });

        return hours.map((bucket) => ({ ...bucket, revenue: this.round(bucket.revenue) }));
    }

    private getRelativeTime(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays === 1) return '1 day ago';
        return `${diffDays} days ago`;
    }
}
