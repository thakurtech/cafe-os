import { RevenueService } from './revenue.service';
import { PrismaService } from '../prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

type SubSeed = {
    shopId?: string;
    name?: string;
    plan?: string;
    status?: string;
    priceMonthly?: number;
    trialEndsAt?: Date | null;
    currentPeriodEnd?: Date | null;
    razorpaySubId?: string | null;
    createdAt?: Date;
};

let seq = 0;

function sub(overrides: SubSeed = {}) {
    seq++;
    const shopId = overrides.shopId ?? `shop-${seq}`;
    return {
        shopId,
        plan: overrides.plan ?? 'STARTER',
        status: overrides.status ?? 'ACTIVE',
        priceMonthly: overrides.priceMonthly ?? 499,
        trialEndsAt: overrides.trialEndsAt ?? null,
        currentPeriodEnd: overrides.currentPeriodEnd ?? null,
        razorpaySubId: overrides.razorpaySubId ?? null,
        createdAt: overrides.createdAt ?? new Date(Date.now() - 90 * DAY_MS),
        shop: { name: overrides.name ?? `Cafe ${shopId}`, slug: shopId },
    };
}

function buildPrismaStub(subs: ReturnType<typeof sub>[], withoutSubscription = 0) {
    return {
        subscription: { findMany: jest.fn(async () => subs) },
        shop: { count: jest.fn(async () => withoutSubscription) },
    } as unknown as PrismaService;
}

describe('RevenueService.getRevenueOverview', () => {
    it('counts only billing subscriptions towards MRR', async () => {
        const prisma = buildPrismaStub([
            sub({ status: 'ACTIVE', priceMonthly: 1000 }),
            sub({ status: 'PAST_DUE', priceMonthly: 500 }),
            sub({ status: 'GRACE', priceMonthly: 200 }),
            // None of these are revenue.
            sub({ status: 'TRIAL', priceMonthly: 9999 }),
            sub({ status: 'CANCELLED', priceMonthly: 9999 }),
            sub({ status: 'SUSPENDED', priceMonthly: 9999 }),
        ]);

        const result = await new RevenueService(prisma).getRevenueOverview();

        expect(result.mrr).toBe(1700);
        expect(result.arr).toBe(1700 * 12);
        // 1700 across 3 billing accounts.
        expect(result.arpa).toBeCloseTo(566.67, 1);
    });

    it('reports zero revenue metrics with no subscriptions', async () => {
        const result = await new RevenueService(buildPrismaStub([])).getRevenueOverview();

        expect(result.mrr).toBe(0);
        expect(result.arr).toBe(0);
        expect(result.arpa).toBe(0);
        expect(result.growth.mrr).toBe(0);
        expect(result.planMix).toEqual([]);
        expect(result.billing).toEqual([]);
        expect(result.mrrTrend.every((point) => point.mrr === 0)).toBe(true);
    });

    it('separates at-risk revenue from healthy revenue', async () => {
        const prisma = buildPrismaStub([
            sub({ status: 'ACTIVE', priceMonthly: 1000 }),
            sub({ status: 'PAST_DUE', priceMonthly: 400 }),
            sub({ status: 'GRACE', priceMonthly: 100 }),
        ]);

        const result = await new RevenueService(prisma).getRevenueOverview();

        expect(result.atRisk.subscriptions).toBe(2);
        expect(result.atRisk.mrr).toBe(500);
        // At-risk revenue is still inside MRR; it is contracted, just unpaid.
        expect(result.mrr).toBe(1500);
    });

    it('breaks MRR down by plan with shares that add up', async () => {
        const prisma = buildPrismaStub([
            sub({ plan: 'PRO', status: 'ACTIVE', priceMonthly: 600 }),
            sub({ plan: 'GROWTH', status: 'ACTIVE', priceMonthly: 300 }),
            sub({ plan: 'STARTER', status: 'ACTIVE', priceMonthly: 100 }),
            // A trial still counts as a subscription on the plan, but adds no MRR.
            sub({ plan: 'STARTER', status: 'TRIAL', priceMonthly: 100 }),
        ]);

        const result = await new RevenueService(prisma).getRevenueOverview();

        expect(result.planMix.map((entry) => entry.plan)).toEqual(['PRO', 'GROWTH', 'STARTER']);
        expect(result.planMix[0]).toMatchObject({ mrr: 600, share: 60, subscriptions: 1 });
        expect(result.planMix[2]).toMatchObject({ mrr: 100, subscriptions: 2 });

        const totalShare = result.planMix.reduce((sum, entry) => sum + entry.share, 0);
        expect(totalShare).toBeCloseTo(100, 1);
        const totalMrr = result.planMix.reduce((sum, entry) => sum + entry.mrr, 0);
        expect(totalMrr).toBe(result.mrr);
    });

    it('tallies subscription states and cafes with no subscription at all', async () => {
        const prisma = buildPrismaStub(
            [
                sub({ status: 'ACTIVE' }),
                sub({ status: 'ACTIVE' }),
                sub({ status: 'TRIAL' }),
                sub({ status: 'PAST_DUE' }),
                sub({ status: 'GRACE' }),
                sub({ status: 'SUSPENDED' }),
                sub({ status: 'CANCELLED' }),
            ],
            4,
        );

        const result = await new RevenueService(prisma).getRevenueOverview();

        expect(result.counts).toMatchObject({
            total: 7,
            active: 2,
            trialing: 1,
            pastDue: 1,
            grace: 1,
            suspended: 1,
            cancelled: 1,
            withoutSubscription: 4,
        });
    });

    it('builds a 12-month cumulative MRR trend ending at current MRR', async () => {
        const now = Date.now();
        const prisma = buildPrismaStub([
            sub({ status: 'ACTIVE', priceMonthly: 500, createdAt: new Date(now - 300 * DAY_MS) }),
            sub({ status: 'ACTIVE', priceMonthly: 500, createdAt: new Date(now - 10 * DAY_MS) }),
        ]);

        const result = await new RevenueService(prisma).getRevenueOverview();

        expect(result.mrrTrend).toHaveLength(12);
        // Cumulative, so it can never dip.
        for (let i = 1; i < result.mrrTrend.length; i++) {
            expect(result.mrrTrend[i].mrr).toBeGreaterThanOrEqual(result.mrrTrend[i - 1].mrr);
        }
        // The newest point is today's committed MRR.
        expect(result.mrrTrend[11].mrr).toBe(result.mrr);
        expect(result.mrrTrend[11].mrr).toBe(1000);
        // Months come back oldest first, as YYYY-MM.
        const months = result.mrrTrend.map((point) => point.month);
        expect([...months].sort()).toEqual(months);
        expect(months[0]).toMatch(/^\d{4}-\d{2}$/);
    });

    it('surfaces trials ending within a week, soonest first', async () => {
        const now = Date.now();
        const prisma = buildPrismaStub([
            sub({ name: 'Later', status: 'TRIAL', trialEndsAt: new Date(now + 5 * DAY_MS) }),
            sub({ name: 'Sooner', status: 'TRIAL', trialEndsAt: new Date(now + 1 * DAY_MS) }),
            // Beyond the 7-day horizon.
            sub({ name: 'Far', status: 'TRIAL', trialEndsAt: new Date(now + 30 * DAY_MS) }),
            // Not a trial.
            sub({ name: 'Paying', status: 'ACTIVE', trialEndsAt: new Date(now + 1 * DAY_MS) }),
        ]);

        const result = await new RevenueService(prisma).getRevenueOverview();

        expect(result.trialsEndingSoon.map((row) => row.shopName)).toEqual(['Sooner', 'Later']);
    });

    it('lists upcoming renewals for billing subscriptions only', async () => {
        const now = Date.now();
        const prisma = buildPrismaStub([
            sub({ name: 'Due', status: 'ACTIVE', currentPeriodEnd: new Date(now + 3 * DAY_MS) }),
            // Cancelled accounts do not renew.
            sub({ name: 'Gone', status: 'CANCELLED', currentPeriodEnd: new Date(now + 3 * DAY_MS) }),
            // Outside the 30-day horizon.
            sub({ name: 'Distant', status: 'ACTIVE', currentPeriodEnd: new Date(now + 90 * DAY_MS) }),
        ]);

        const result = await new RevenueService(prisma).getRevenueOverview();

        expect(result.renewalsDue.map((row) => row.shopName)).toEqual(['Due']);
    });

    it('flags whether each account is billed and has a payment link', async () => {
        const prisma = buildPrismaStub([
            sub({ name: 'Linked', status: 'ACTIVE', razorpaySubId: 'sub_abc', priceMonthly: 999 }),
            sub({ name: 'Manual', status: 'ACTIVE', razorpaySubId: null, priceMonthly: 499 }),
            sub({ name: 'Trialing', status: 'TRIAL', priceMonthly: 0 }),
        ]);

        const result = await new RevenueService(prisma).getRevenueOverview();

        // Sorted by price, highest first.
        expect(result.billing.map((row) => row.shopName)).toEqual(['Linked', 'Manual', 'Trialing']);
        expect(result.billing[0]).toMatchObject({ isBilled: true, hasPaymentLink: true });
        expect(result.billing[1]).toMatchObject({ isBilled: true, hasPaymentLink: false });
        expect(result.billing[2]).toMatchObject({ isBilled: false, hasPaymentLink: false });
    });

    it('measures MRR growth against subscriptions that predate the window', async () => {
        const now = Date.now();
        const prisma = buildPrismaStub([
            sub({ status: 'ACTIVE', priceMonthly: 800, createdAt: new Date(now - 200 * DAY_MS) }),
            sub({ status: 'ACTIVE', priceMonthly: 200, createdAt: new Date(now - 2 * DAY_MS) }),
        ]);

        const result = await new RevenueService(prisma).getRevenueOverview();

        // 1000 now vs 800 at the start of the window => +25%
        expect(result.mrr).toBe(1000);
        expect(result.growth.mrr).toBe(25);
    });
});
