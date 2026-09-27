import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AffiliatesService } from './affiliates.service';
import { PrismaService } from '../prisma.service';

type Payout = { id: string; affiliateId: string; amount: number; status: string; createdAt: Date };
type Account = {
    id: string;
    userId: string;
    code: string;
    balance: number;
    commissionRate: number;
    user: { name: string | null; email: string | null; phone: string };
    referrals: { status: string }[];
    payouts: Payout[];
};

/**
 * Stateful stub: approvals mutate the same rows the service reads back, so
 * double-spend and race conditions are exercised for real rather than mocked away.
 */
function buildPrismaStub(accounts: Account[]) {
    const payouts = () => accounts.flatMap((account) => account.payouts);

    const tx = {
        affiliatePayout: {
            findUnique: jest.fn(async ({ where }: any) =>
                payouts().find((payout) => payout.id === where.id) ?? null,
            ),
            updateMany: jest.fn(async ({ where, data }: any) => {
                const matches = payouts().filter(
                    (payout) =>
                        payout.id === where.id &&
                        (where.status === undefined || payout.status === where.status),
                );
                matches.forEach((payout) => {
                    payout.status = data.status;
                });
                return { count: matches.length };
            }),
        },
        affiliateAccount: {
            update: jest.fn(async ({ where, data }: any) => {
                const account = accounts.find((item) => item.id === where.id);
                if (!account) throw new Error('account missing');
                if (data.balance?.decrement !== undefined) {
                    account.balance -= data.balance.decrement;
                }
                return account;
            }),
        },
    };

    return {
        ...tx,
        affiliateAccount: {
            ...tx.affiliateAccount,
            findMany: jest.fn(async () => accounts),
        },
        $transaction: jest.fn(async (fn: any) => fn(tx)),
    } as unknown as PrismaService;
}

function account(overrides: Partial<Account> = {}): Account {
    const id = overrides.id ?? 'aff-1';
    return {
        id,
        userId: `user-${id}`,
        code: `CODE-${id}`,
        balance: 0,
        commissionRate: 150,
        user: { name: 'Affiliate One', email: 'a@example.com', phone: '9999999999' },
        referrals: [],
        payouts: [],
        ...overrides,
    };
}

function payout(overrides: Partial<Payout> = {}): Payout {
    return {
        id: 'pay-1',
        affiliateId: 'aff-1',
        amount: 500,
        status: 'PENDING',
        createdAt: new Date(),
        ...overrides,
    };
}

describe('AffiliatesService.getOverview', () => {
    it('rolls up referrals, balances and payout totals', async () => {
        const prisma = buildPrismaStub([
            account({
                id: 'aff-1',
                balance: 900,
                referrals: [{ status: 'ACTIVE' }, { status: 'TRIAL' }, { status: 'CHURNED' }],
                payouts: [
                    payout({ id: 'p1', amount: 300, status: 'PAID' }),
                    payout({ id: 'p2', amount: 200, status: 'PENDING' }),
                ],
            }),
            account({
                id: 'aff-2',
                balance: 100,
                referrals: [{ status: 'TRIAL' }],
                payouts: [],
            }),
        ]);

        const result = await new AffiliatesService(prisma).getOverview();

        expect(result.totals).toMatchObject({
            affiliates: 2,
            producingAffiliates: 1,
            referrals: 4,
            convertedReferrals: 1,
            trialReferrals: 2,
            outstandingBalance: 1000,
            pendingPayoutAmount: 200,
            paidOutAmount: 300,
        });

        const first = result.affiliates[0];
        expect(first.id).toBe('aff-1');
        expect(first.referrals).toEqual({ total: 3, converted: 1, trial: 1 });
        expect(first.paidToDate).toBe(300);
        expect(first.pendingPayout).toBe(200);
    });

    it('separates pending payouts from settled history', async () => {
        const older = new Date(Date.now() - 10_000);
        const prisma = buildPrismaStub([
            account({
                payouts: [
                    payout({ id: 'pending-new', status: 'PENDING' }),
                    payout({ id: 'paid', status: 'PAID', createdAt: older }),
                    payout({ id: 'rejected', status: 'REJECTED' }),
                ],
            }),
        ]);

        const result = await new AffiliatesService(prisma).getOverview();

        expect(result.pendingPayouts.map((row) => row.id)).toEqual(['pending-new']);
        expect(result.recentPayouts.map((row) => row.id)).toEqual(['rejected', 'paid']);
        expect(result.pendingPayouts[0].affiliateCode).toBe('CODE-aff-1');
    });

    it('handles an affiliate with no name', async () => {
        const prisma = buildPrismaStub([
            account({ user: { name: null, email: null, phone: '1' } }),
        ]);

        const result = await new AffiliatesService(prisma).getOverview();

        expect(result.affiliates[0].name).toBe('Unnamed affiliate');
    });
});

describe('AffiliatesService.approvePayout', () => {
    it('settles the payout and draws it down from the balance', async () => {
        const accounts = [
            account({ balance: 1000, payouts: [payout({ id: 'p1', amount: 400 })] }),
        ];
        const service = new AffiliatesService(buildPrismaStub(accounts));

        const result = await service.approvePayout('p1');

        expect(result).toMatchObject({ success: true, status: 'PAID', amount: 400 });
        expect(result.remainingBalance).toBe(600);
        expect(accounts[0].balance).toBe(600);
        expect(accounts[0].payouts[0].status).toBe('PAID');
    });

    it('refuses to pay the same payout twice, debiting the balance only once', async () => {
        const accounts = [
            account({ balance: 1000, payouts: [payout({ id: 'p1', amount: 400 })] }),
        ];
        const service = new AffiliatesService(buildPrismaStub(accounts));

        await service.approvePayout('p1');
        await expect(service.approvePayout('p1')).rejects.toBeInstanceOf(BadRequestException);

        // The critical assertion: one approval, one debit.
        expect(accounts[0].balance).toBe(600);
    });

    it('rejects an unknown payout', async () => {
        const service = new AffiliatesService(buildPrismaStub([account()]));

        await expect(service.approvePayout('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('will not approve a payout that was already rejected', async () => {
        const accounts = [
            account({ balance: 500, payouts: [payout({ id: 'p1', status: 'REJECTED' })] }),
        ];
        const service = new AffiliatesService(buildPrismaStub(accounts));

        await expect(service.approvePayout('p1')).rejects.toBeInstanceOf(BadRequestException);
        expect(accounts[0].balance).toBe(500);
    });
});

describe('AffiliatesService.rejectPayout', () => {
    it('declines the payout and leaves the balance claimable', async () => {
        const accounts = [
            account({ balance: 700, payouts: [payout({ id: 'p1', amount: 200 })] }),
        ];
        const service = new AffiliatesService(buildPrismaStub(accounts));

        const result = await service.rejectPayout('p1');

        expect(result).toMatchObject({ success: true, status: 'REJECTED' });
        expect(accounts[0].payouts[0].status).toBe('REJECTED');
        // Rejecting must not spend the money.
        expect(accounts[0].balance).toBe(700);
    });

    it('will not reject a payout that was already paid', async () => {
        const accounts = [
            account({ balance: 300, payouts: [payout({ id: 'p1', status: 'PAID' })] }),
        ];
        const service = new AffiliatesService(buildPrismaStub(accounts));

        await expect(service.rejectPayout('p1')).rejects.toBeInstanceOf(BadRequestException);
        expect(accounts[0].balance).toBe(300);
    });

    it('rejects an unknown payout', async () => {
        const service = new AffiliatesService(buildPrismaStub([account()]));

        await expect(service.rejectPayout('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
});
