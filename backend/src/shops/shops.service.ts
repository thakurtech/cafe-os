import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/** Number of days the revenueByDay series spans, today included. */
const REVENUE_DAYS = 7;

@Injectable()
export class ShopsService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.shop.findMany({
            include: {
                _count: {
                    select: { orders: true, users: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findBySlug(slug: string) {
        const shop = await this.prisma.shop.findUnique({
            where: { slug },
            include: {
                menuCategories: {
                    include: {
                        items: true,
                    },
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });

        if (!shop) {
            throw new NotFoundException(`Shop with slug "${slug}" not found`);
        }

        return shop;
    }

    async findById(id: string) {
        const shop = await this.prisma.shop.findUnique({
            where: { id },
        });

        if (!shop) {
            throw new NotFoundException(`Shop with id "${id}" not found`);
        }

        return shop;
    }

    async create(data: {
        name: string;
        slug: string;
        address?: string;
        phone?: string;
        email?: string;
        upiId?: string;
        gstNumber?: string;
        logo?: string;
        themeColor?: string;
        ownerId: string;
    }) {
        const { ownerId, ...shopData } = data;

        // Create shop
        const shop = await this.prisma.shop.create({
            data: {
                ...shopData,
                slug: shopData.slug.toLowerCase().replace(/\s+/g, '-'),
            },
        });

        // Update owner's shopId
        await this.prisma.user.update({
            where: { id: ownerId },
            data: { shopId: shop.id },
        });

        return shop;
    }

    // Create shop with new owner (for super admin cafe creation wizard)
    async createWithOwner(data: {
        // Shop data
        name: string;
        slug: string;
        address?: string;
        phone?: string;
        email?: string;
        upiId?: string;
        themeColor?: string;
        // Owner data
        ownerName: string;
        ownerEmail: string;
        ownerPhone: string;
        ownerPassword?: string;
    }) {
        const bcrypt = require('bcrypt');
        const defaultPassword = data.ownerPassword || 'password';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        // Create shop first
        const shop = await this.prisma.shop.create({
            data: {
                name: data.name,
                slug: data.slug.toLowerCase().replace(/\s+/g, '-'),
                address: data.address,
                phone: data.phone,
                email: data.email,
                upiId: data.upiId,
                themeColor: data.themeColor,
            },
        });

        // Create owner user linked to shop
        const owner = await this.prisma.user.create({
            data: {
                phone: data.ownerPhone,
                email: data.ownerEmail,
                name: data.ownerName,
                password: hashedPassword,
                role: 'CAFE_OWNER',
                shopId: shop.id,
            },
        });

        return { shop, owner };
    }


    async update(id: string, data: Partial<{
        name: string;
        address: string;
        phone: string;
        email: string;
        upiId: string;
        gstNumber: string;
        fssaiNumber: string;
        logo: string;
        tagline: string;
        themeColor: string;
        isActive: boolean;
    }>) {
        return this.prisma.shop.update({
            where: { id },
            data,
        });
    }

    async getStats(shopId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const startOfWeek = new Date(today);
        startOfWeek.setDate(startOfWeek.getDate() - today.getDay());

        // Rolling window for the revenueByDay series. Both ends are inclusive, so we
        // step back REVENUE_DAYS - 1 days: the first bucket is that day, the last is
        // today. Going back a full REVENUE_DAYS would push today out of the series.
        // This window always covers startOfWeek too (at most 6 days back), so the
        // same orders feed the weekly figures.
        const startOfSeries = new Date(today);
        startOfSeries.setDate(startOfSeries.getDate() - (REVENUE_DAYS - 1));

        const [
            todayOrders,
            todayRevenue,
            yesterdayOrders,
            yesterdayRevenue,
            weekOrders,
            weekRevenue,
            totalCustomers,
            inventory,
            lastOrder,
            seriesOrders
        ] = await Promise.all([
            this.prisma.order.count({ where: { shopId, createdAt: { gte: today } } }),
            this.prisma.order.aggregate({ where: { shopId, createdAt: { gte: today }, status: { not: 'CANCELLED' } }, _sum: { totalAmount: true } }),
            this.prisma.order.count({ where: { shopId, createdAt: { gte: yesterday, lt: today } } }),
            this.prisma.order.aggregate({ where: { shopId, createdAt: { gte: yesterday, lt: today }, status: { not: 'CANCELLED' } }, _sum: { totalAmount: true } }),
            this.prisma.order.count({ where: { shopId, createdAt: { gte: startOfWeek } } }),
            this.prisma.order.aggregate({ where: { shopId, createdAt: { gte: startOfWeek }, status: { not: 'CANCELLED' } }, _sum: { totalAmount: true } }),
            this.prisma.order.groupBy({ by: ['customerId'], where: { shopId, customerId: { not: null } } }),
            this.prisma.inventoryItem.findMany({ where: { shopId } }),
            this.prisma.order.findFirst({ where: { shopId }, orderBy: { createdAt: 'desc' } }),
            // Orders backing the revenueByHour / revenueByDay charts. Cancelled orders
            // never earned anything, so they are left out of both series.
            this.prisma.order.findMany({
                where: { shopId, createdAt: { gte: startOfSeries }, status: { not: 'CANCELLED' } },
                select: { createdAt: true, totalAmount: true }
            })
        ]);

        const alerts: string[] = [];
        const lowInventory = inventory.filter(item => item.quantity <= item.lowStockThreshold);
        if (lowInventory.length > 0) {
            alerts.push(`Low inventory for ${lowInventory.length} items`);
        }
        
        if (lastOrder) {
            const hoursSinceLastOrder = (new Date().getTime() - lastOrder.createdAt.getTime()) / (1000 * 60 * 60);
            if (hoursSinceLastOrder >= 2) {
                alerts.push('No orders in last 2 hours');
            }
        } else {
            alerts.push('No orders found');
        }

        const avgOrderValue = todayOrders > 0 ? (todayRevenue._sum.totalAmount || 0) / todayOrders : 0;
        const totalCustomersCount = totalCustomers.length;

        // Simplify topItems and recentOrders for this endpoint
        const topItems = await this.prisma.orderItem.groupBy({
            by: ['menuItemId'],
            where: { order: { shopId, createdAt: { gte: today } } },
            _sum: { quantity: true },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 5
        });

        const recentOrders = await this.prisma.order.findMany({
            where: { shopId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        // Hour-of-day breakdown is for today, so it lines up with todayRevenue.
        const todaysOrders = seriesOrders.filter(order => order.createdAt >= today);

        return {
            todayRevenue: todayRevenue._sum.totalAmount || 0,
            todayOrders,
            yesterdayRevenue: yesterdayRevenue._sum.totalAmount || 0,
            yesterdayOrders,
            weekRevenue: weekRevenue._sum.totalAmount || 0,
            weekOrders,
            totalCustomers: totalCustomersCount,
            avgOrderValue,
            repeatCustomerRate: 0, // calculate appropriately if needed
            topItems: topItems,
            recentOrders: recentOrders,
            alerts,
            revenueByHour: this.buildRevenueByHour(todaysOrders),
            revenueByDay: this.buildRevenueByDay(seriesOrders, startOfSeries, REVENUE_DAYS)
        };
    }

    /**
     * Today's revenue bucketed by hour of day. All 24 hours are pre-seeded so a
     * quiet hour comes back as zero instead of leaving a hole in the chart.
     */
    private buildRevenueByHour(orders: { createdAt: Date; totalAmount: number }[]) {
        const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));

        orders.forEach(order => {
            const bucket = hours[order.createdAt.getHours()];
            bucket.orders++;
            bucket.revenue += order.totalAmount;
        });

        return hours.map(bucket => ({ ...bucket, revenue: this.round(bucket.revenue) }));
    }

    /**
     * One bucket per day from `from` onwards, `days` of them, so the last bucket is
     * today. Every day is pre-seeded, so a day with no orders reads as zero.
     */
    private buildRevenueByDay(
        orders: { createdAt: Date; totalAmount: number }[],
        from: Date,
        days: number
    ) {
        const buckets = new Map<string, { date: string; orders: number; revenue: number }>();

        for (let offset = 0; offset < days; offset++) {
            // Stepping with setDate rather than adding 24h keeps the keys right
            // across a daylight-saving change.
            const day = new Date(from);
            day.setDate(day.getDate() + offset);
            const key = this.dayKey(day);
            buckets.set(key, { date: key, orders: 0, revenue: 0 });
        }

        orders.forEach(order => {
            const bucket = buckets.get(this.dayKey(order.createdAt));
            if (!bucket) return;
            bucket.orders++;
            bucket.revenue += order.totalAmount;
        });

        return [...buckets.values()]
            .map(bucket => ({ ...bucket, revenue: this.round(bucket.revenue) }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * Local calendar day as YYYY-MM-DD. The window bounds above are local midnights,
     * so a UTC key (toISOString) would file orders under the wrong day off UTC.
     */
    private dayKey(date: Date): string {
        const month = `${date.getMonth() + 1}`.padStart(2, '0');
        const day = `${date.getDate()}`.padStart(2, '0');
        return `${date.getFullYear()}-${month}-${day}`;
    }

    private round(value: number, decimals = 2): number {
        const factor = 10 ** decimals;
        return Math.round(value * factor) / factor;
    }
}
