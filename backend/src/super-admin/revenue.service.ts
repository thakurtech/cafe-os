import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NON_BILLING_SUBSCRIPTION_STATUSES } from './super-admin.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_MONTHS = 12;

/** Contracted but not currently paying — recoverable revenue worth chasing. */
const AT_RISK_STATUSES = ['PAST_DUE', 'GRACE'] as const;

export interface RevenueOverview {
    mrr: number;
    arr: number;
    /** Average revenue per paying account. */
    arpa: number;
    growth: { mrr: number };
    counts: {
        total: number;
        active: number;
        trialing: number;
        pastDue: number;
        grace: number;
        suspended: number;
        cancelled: number;
        withoutSubscription: number;
    };
    atRisk: { subscriptions: number; mrr: number };
    planMix: { plan: string; subscriptions: number; mrr: number; share: number }[];
    statusMix: { status: string; subscriptions: number; mrr: number }[];
    mrrTrend: { month: string; mrr: number }[];
    trialsEndingSoon: BillingRow[];
    renewalsDue: BillingRow[];
    billing: BillingRow[];
}

export interface BillingRow {
    shopId: string;
    shopName: string;
    slug: string;
    plan: string;
    status: string;
    priceMonthly: number;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    /** True when this subscription contributes to MRR. */
    isBilled: boolean;
    /** True once a Razorpay subscription has been linked for auto-collection. */
    hasPaymentLink: boolean;
}

type SubscriptionWithShop = {
    shopId: string;
    plan: string;
    status: string;
    priceMonthly: number;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    razorpaySubId: string | null;
    createdAt: Date;
    shop: { name: string; slug: string };
};

@Injectable()
export class RevenueService {
    constructor(private prisma: PrismaService) { }

    async getRevenueOverview(): Promise<RevenueOverview> {
        const now = new Date();
        const windowStart = new Date(now.getTime() - 30 * DAY_MS);

        const [subscriptions, withoutSubscription] = await Promise.all([
            this.prisma.subscription.findMany({
                select: {
                    shopId: true,
                    plan: true,
                    status: true,
                    priceMonthly: true,
                    trialEndsAt: true,
                    currentPeriodEnd: true,
                    razorpaySubId: true,
                    createdAt: true,
                    shop: { select: { name: true, slug: true } },
                },
            }) as unknown as Promise<SubscriptionWithShop[]>,
            this.prisma.shop.count({ where: { subscription: { is: null } } }),
        ]);

        const billingSubs = subscriptions.filter((sub) => this.isBilled(sub.status));
        const mrr = this.sumPrice(billingSubs);
        const preExistingMrr = this.sumPrice(
            billingSubs.filter((sub) => sub.createdAt < windowStart),
        );

        const atRiskSubs = subscriptions.filter((sub) =>
            (AT_RISK_STATUSES as readonly string[]).includes(sub.status),
        );

        const soonCutoff = new Date(now.getTime() + 7 * DAY_MS);
        const renewalCutoff = new Date(now.getTime() + 30 * DAY_MS);

        return {
            mrr: this.round(mrr),
            arr: this.round(mrr * 12),
            arpa: billingSubs.length > 0 ? this.round(mrr / billingSubs.length) : 0,
            growth: { mrr: this.pctChange(mrr, preExistingMrr) },
            counts: {
                total: subscriptions.length,
                active: this.countByStatus(subscriptions, 'ACTIVE'),
                trialing: this.countByStatus(subscriptions, 'TRIAL'),
                pastDue: this.countByStatus(subscriptions, 'PAST_DUE'),
                grace: this.countByStatus(subscriptions, 'GRACE'),
                suspended: this.countByStatus(subscriptions, 'SUSPENDED'),
                cancelled: this.countByStatus(subscriptions, 'CANCELLED'),
                withoutSubscription,
            },
            atRisk: {
                subscriptions: atRiskSubs.length,
                mrr: this.round(this.sumPrice(atRiskSubs)),
            },
            planMix: this.buildPlanMix(subscriptions, mrr),
            statusMix: this.buildStatusMix(subscriptions),
            mrrTrend: this.buildMrrTrend(billingSubs, now),
            trialsEndingSoon: subscriptions
                .filter(
                    (sub) =>
                        sub.status === 'TRIAL' &&
                        sub.trialEndsAt !== null &&
                        sub.trialEndsAt <= soonCutoff,
                )
                .sort(this.byDate((sub) => sub.trialEndsAt))
                .map((sub) => this.toBillingRow(sub)),
            renewalsDue: subscriptions
                .filter(
                    (sub) =>
                        this.isBilled(sub.status) &&
                        sub.currentPeriodEnd !== null &&
                        sub.currentPeriodEnd <= renewalCutoff,
                )
                .sort(this.byDate((sub) => sub.currentPeriodEnd))
                .map((sub) => this.toBillingRow(sub)),
            billing: [...subscriptions]
                .sort((a, b) => b.priceMonthly - a.priceMonthly || a.shop.name.localeCompare(b.shop.name))
                .map((sub) => this.toBillingRow(sub)),
        };
    }

    // ==================== helpers ====================

    private isBilled(status: string): boolean {
        return !(NON_BILLING_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
    }

    private toBillingRow(sub: SubscriptionWithShop): BillingRow {
        return {
            shopId: sub.shopId,
            shopName: sub.shop.name,
            slug: sub.shop.slug,
            plan: sub.plan,
            status: sub.status,
            priceMonthly: sub.priceMonthly,
            trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
            isBilled: this.isBilled(sub.status),
            hasPaymentLink: Boolean(sub.razorpaySubId),
        };
    }

    private byDate(pick: (sub: SubscriptionWithShop) => Date | null) {
        return (a: SubscriptionWithShop, b: SubscriptionWithShop) =>
            (pick(a)?.getTime() ?? 0) - (pick(b)?.getTime() ?? 0);
    }

    private countByStatus(subs: SubscriptionWithShop[], status: string): number {
        return subs.filter((sub) => sub.status === status).length;
    }

    private sumPrice(subs: SubscriptionWithShop[]): number {
        return subs.reduce((sum, sub) => sum + sub.priceMonthly, 0);
    }

    private buildPlanMix(subs: SubscriptionWithShop[], totalMrr: number) {
        const totals = new Map<string, { plan: string; subscriptions: number; mrr: number }>();

        subs.forEach((sub) => {
            const entry = totals.get(sub.plan) ?? { plan: sub.plan, subscriptions: 0, mrr: 0 };
            entry.subscriptions++;
            if (this.isBilled(sub.status)) entry.mrr += sub.priceMonthly;
            totals.set(sub.plan, entry);
        });

        return [...totals.values()]
            .map((entry) => ({
                ...entry,
                mrr: this.round(entry.mrr),
                share: totalMrr > 0 ? this.round((entry.mrr / totalMrr) * 100, 1) : 0,
            }))
            .sort((a, b) => b.mrr - a.mrr || b.subscriptions - a.subscriptions);
    }

    private buildStatusMix(subs: SubscriptionWithShop[]) {
        const totals = new Map<string, { status: string; subscriptions: number; mrr: number }>();

        subs.forEach((sub) => {
            const entry = totals.get(sub.status) ?? {
                status: sub.status,
                subscriptions: 0,
                mrr: 0,
            };
            entry.subscriptions++;
            if (this.isBilled(sub.status)) entry.mrr += sub.priceMonthly;
            totals.set(sub.status, entry);
        });

        return [...totals.values()]
            .map((entry) => ({ ...entry, mrr: this.round(entry.mrr) }))
            .sort((a, b) => b.subscriptions - a.subscriptions);
    }

    /**
     * Committed MRR at the end of each of the last TREND_MONTHS months, built from
     * subscription start dates. Subscriptions that have since churned are already
     * excluded, and the schema keeps no history of status changes, so earlier months
     * reflect today's surviving accounts rather than a true historical snapshot.
     */
    private buildMrrTrend(billingSubs: SubscriptionWithShop[], now: Date) {
        const trend: { month: string; mrr: number }[] = [];

        for (let offset = TREND_MONTHS - 1; offset >= 0; offset--) {
            // Day 0 of the following month is the last instant of the month we want.
            const monthEnd = new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset + 1, 0, 23, 59, 59, 999),
            );
            const monthKey = `${monthEnd.getUTCFullYear()}-${String(monthEnd.getUTCMonth() + 1).padStart(2, '0')}`;

            trend.push({
                month: monthKey,
                mrr: this.round(
                    this.sumPrice(billingSubs.filter((sub) => sub.createdAt <= monthEnd)),
                ),
            });
        }

        return trend;
    }

    private pctChange(current: number, previous: number): number {
        if (previous === 0) return current > 0 ? 100 : 0;
        return this.round(((current - previous) / previous) * 100, 1);
    }

    private round(value: number, decimals = 2): number {
        const factor = 10 ** decimals;
        return Math.round(value * factor) / factor;
    }
}
