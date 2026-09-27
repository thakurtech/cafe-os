import { NotFoundException } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { PrismaService } from '../prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

type PayoutSeed = { amount: number; status: string; createdAt?: Date };

type AccountSeed = {
    balance?: number;
    commissionRate?: number;
    referrals?: { status: string }[];
    payouts?: PayoutSeed[];
};

function buildPrismaStub(account: AccountSeed | null) {
    return {
        affiliateAccount: {
            findUnique: jest.fn(async () =>
                account === null
                    ? null
                    : {
                        id: 'aff-1',
                        userId: 'user-1',
                        code: 'CODE123',
                        balance: account.balance ?? 0,
                        commissionRate: account.commissionRate ?? 150,
                        referrals: account.referrals ?? [],
                        payouts: (account.payouts ?? []).map((payout, index) => ({
                            amount: payout.amount,
                            status: payout.status,
                            createdAt: payout.createdAt ?? new Date(Date.now() - index * DAY_MS),
                        })),
                    },
            ),
        },
    } as unknown as PrismaService;
}

describe('AffiliateService.getStats', () => {
    it('counts only settled payouts as earnings', async () => {
        const prisma = buildPrismaStub({
            balance: 1200,
            payouts: [
                { amount: 500, status: 'PAID' },
                { amount: 250, status: 'PAID' },
                // Neither of these has reached the affiliate.
                { amount: 900, status: 'PENDING' },
                { amount: 700, status: 'REJECTED' },
            ],
        });

        const stats = await new AffiliateService(prisma).getStats('user-1');

        expect(stats.totalEarnings).toBe(750);
    });

    it('reports the pending payout total as the next payout, not a guessed figure', async () => {
        const prisma = buildPrismaStub({
            balance: 1000,
            commissionRate: 150,
            referrals: [{ status: 'ACTIVE' }, { status: 'ACTIVE' }],
            payouts: [
                { amount: 400, status: 'PENDING' },
                { amount: 100, status: 'PENDING' },
                { amount: 999, status: 'PAID' },
                { amount: 999, status: 'REJECTED' },
            ],
        });

        const stats = await new AffiliateService(prisma).getStats('user-1');

        expect(stats.nextPayout.amount).toBe(500);
        expect(stats.nextPayout.pendingCount).toBe(2);
        // Not the old mock, which was activeReferrals * commissionRate.
        expect(stats.nextPayout.amount).not.toBe(2 * 150);
    });

    it('dates the next payout from the oldest request still awaiting approval', async () => {
        const oldest = new Date('2026-01-05T10:00:00.000Z');
        const prisma = buildPrismaStub({
            payouts: [
                { amount: 100, status: 'PENDING', createdAt: new Date('2026-02-10T10:00:00.000Z') },
                { amount: 100, status: 'PENDING', createdAt: oldest },
                // A settled payout is not what comes next.
                { amount: 100, status: 'PAID', createdAt: new Date('2025-01-01T10:00:00.000Z') },
            ],
        });

        const stats = await new AffiliateService(prisma).getStats('user-1');

        expect(stats.nextPayout.date).toEqual(oldest);
    });

    it('promises no payout date when nothing is pending', async () => {
        const prisma = buildPrismaStub({
            balance: 300,
            payouts: [{ amount: 200, status: 'PAID' }, { amount: 50, status: 'REJECTED' }],
        });

        const stats = await new AffiliateService(prisma).getStats('user-1');

        expect(stats.nextPayout.amount).toBe(0);
        expect(stats.nextPayout.date).toBeNull();
        expect(stats.nextPayout.pendingCount).toBe(0);
        // The unpaid balance is still claimable.
        expect(stats.nextPayout.claimable).toBe(300);
    });

    it('reports zeros for an affiliate with no payouts at all', async () => {
        const stats = await new AffiliateService(buildPrismaStub({})).getStats('user-1');

        expect(stats.totalEarnings).toBe(0);
        expect(stats.nextPayout).toMatchObject({ amount: 0, date: null, claimable: 0 });
    });

    it('exposes the unpaid balance as claimable, including amounts already requested', async () => {
        // Approving a payout is what draws the balance down, so a pending request is
        // still inside the balance.
        const prisma = buildPrismaStub({
            balance: 800,
            payouts: [{ amount: 300, status: 'PENDING' }],
        });

        const stats = await new AffiliateService(prisma).getStats('user-1');

        expect(stats.nextPayout.claimable).toBe(800);
        expect(stats.nextPayout.amount).toBe(300);
    });

    it('rounds payout sums to paise', async () => {
        const prisma = buildPrismaStub({
            balance: 0.1 + 0.2,
            payouts: [
                { amount: 10.1, status: 'PAID' },
                { amount: 20.2, status: 'PAID' },
                { amount: 0.1, status: 'PENDING' },
                { amount: 0.2, status: 'PENDING' },
            ],
        });

        const stats = await new AffiliateService(prisma).getStats('user-1');

        expect(stats.totalEarnings).toBe(30.3);
        expect(stats.nextPayout.amount).toBe(0.3);
        expect(stats.nextPayout.claimable).toBe(0.3);
    });

    it('keeps the response shape the dashboard already reads', async () => {
        const prisma = buildPrismaStub({
            balance: 100,
            commissionRate: 200,
            referrals: [{ status: 'ACTIVE' }, { status: 'TRIAL' }, { status: 'ACTIVE' }],
            payouts: [{ amount: 50, status: 'PAID' }],
        });

        const stats = await new AffiliateService(prisma).getStats('user-1');

        expect(Object.keys(stats).sort()).toEqual(
            ['activeCafes', 'commissionRate', 'nextPayout', 'referralCode', 'totalEarnings'].sort(),
        );
        expect(stats.nextPayout).toHaveProperty('amount');
        expect(stats.nextPayout).toHaveProperty('date');
        expect(stats.activeCafes).toBe(2);
        expect(stats.commissionRate).toBe(200);
        expect(stats.referralCode).toBe('CODE123');
    });

    it('rejects an unknown affiliate', async () => {
        await expect(new AffiliateService(buildPrismaStub(null)).getStats('nobody')).rejects.toThrow(
            NotFoundException,
        );
    });
});
