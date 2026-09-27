import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const PAYOUT_PENDING = 'PENDING';
const PAYOUT_PAID = 'PAID';
const PAYOUT_REJECTED = 'REJECTED';

/** Referral states that represent a cafe actually running on a paid plan. */
const CONVERTED_REFERRAL_STATUSES = ['ACTIVE', 'CONVERTED'] as const;

export interface AffiliateSummary {
    id: string;
    userId: string;
    name: string;
    email: string | null;
    phone: string;
    code: string;
    commissionRate: number;
    /** Unpaid balance held on the account. */
    balance: number;
    referrals: { total: number; converted: number; trial: number };
    /** Sum of payouts already settled. */
    paidToDate: number;
    /** Sum of payouts awaiting approval. */
    pendingPayout: number;
}

export interface PayoutRow {
    id: string;
    affiliateId: string;
    affiliateName: string;
    affiliateCode: string;
    amount: number;
    status: string;
    createdAt: string;
}

export interface AffiliateOverview {
    totals: {
        affiliates: number;
        /** Affiliates with at least one converted referral. */
        producingAffiliates: number;
        referrals: number;
        convertedReferrals: number;
        trialReferrals: number;
        outstandingBalance: number;
        pendingPayoutAmount: number;
        paidOutAmount: number;
    };
    affiliates: AffiliateSummary[];
    pendingPayouts: PayoutRow[];
    recentPayouts: PayoutRow[];
}

@Injectable()
export class AffiliatesService {
    constructor(private prisma: PrismaService) { }

    async getOverview(): Promise<AffiliateOverview> {
        const accounts = await this.prisma.affiliateAccount.findMany({
            include: {
                user: { select: { name: true, email: true, phone: true } },
                referrals: { select: { status: true } },
                payouts: { select: { id: true, amount: true, status: true, createdAt: true } },
            },
        });

        const affiliates: AffiliateSummary[] = accounts.map((account) => {
            const converted = account.referrals.filter((ref) =>
                (CONVERTED_REFERRAL_STATUSES as readonly string[]).includes(ref.status),
            ).length;

            return {
                id: account.id,
                userId: account.userId,
                name: account.user.name ?? 'Unnamed affiliate',
                email: account.user.email,
                phone: account.user.phone,
                code: account.code,
                commissionRate: account.commissionRate,
                balance: this.round(account.balance),
                referrals: {
                    total: account.referrals.length,
                    converted,
                    trial: account.referrals.filter((ref) => ref.status === 'TRIAL').length,
                },
                paidToDate: this.round(this.sumPayouts(account.payouts, PAYOUT_PAID)),
                pendingPayout: this.round(this.sumPayouts(account.payouts, PAYOUT_PENDING)),
            };
        });

        const allPayouts: PayoutRow[] = accounts.flatMap((account) =>
            account.payouts.map((payout) => ({
                id: payout.id,
                affiliateId: account.id,
                affiliateName: account.user.name ?? 'Unnamed affiliate',
                affiliateCode: account.code,
                amount: this.round(payout.amount),
                status: payout.status,
                createdAt: payout.createdAt.toISOString(),
            })),
        );

        const newestFirst = (a: PayoutRow, b: PayoutRow) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

        return {
            totals: {
                affiliates: affiliates.length,
                producingAffiliates: affiliates.filter((a) => a.referrals.converted > 0).length,
                referrals: affiliates.reduce((sum, a) => sum + a.referrals.total, 0),
                convertedReferrals: affiliates.reduce((sum, a) => sum + a.referrals.converted, 0),
                trialReferrals: affiliates.reduce((sum, a) => sum + a.referrals.trial, 0),
                outstandingBalance: this.round(
                    affiliates.reduce((sum, a) => sum + a.balance, 0),
                ),
                pendingPayoutAmount: this.round(
                    affiliates.reduce((sum, a) => sum + a.pendingPayout, 0),
                ),
                paidOutAmount: this.round(affiliates.reduce((sum, a) => sum + a.paidToDate, 0)),
            },
            affiliates: affiliates.sort(
                (a, b) =>
                    b.referrals.converted - a.referrals.converted ||
                    b.balance - a.balance ||
                    a.name.localeCompare(b.name),
            ),
            pendingPayouts: allPayouts
                .filter((payout) => payout.status === PAYOUT_PENDING)
                .sort(newestFirst),
            recentPayouts: allPayouts
                .filter((payout) => payout.status !== PAYOUT_PENDING)
                .sort(newestFirst)
                .slice(0, 20),
        };
    }

    /**
     * Settles a pending payout and draws it down from the affiliate's balance.
     *
     * The status transition is claimed with a conditional updateMany inside the
     * transaction, so two concurrent approvals cannot both debit the balance:
     * the second one matches no rows and is rejected.
     */
    async approvePayout(payoutId: string) {
        return this.prisma.$transaction(async (tx) => {
            const payout = await tx.affiliatePayout.findUnique({ where: { id: payoutId } });

            if (!payout) {
                throw new NotFoundException('Payout not found');
            }
            if (payout.status !== PAYOUT_PENDING) {
                throw new BadRequestException(
                    `Payout is already ${payout.status.toLowerCase()} and cannot be approved again`,
                );
            }

            const account = await tx.affiliateAccount.findUnique({
                where: { id: payout.affiliateId },
                select: { balance: true },
            });

            if (!account) {
                throw new NotFoundException('Affiliate account not found');
            }

            // Payout rows are created out of band, so the amount is untrusted.
            // Settling more than the account holds would leave a negative balance
            // that nothing later reconciles, and the affiliate would be shown a
            // negative claimable figure.
            if (payout.amount > account.balance) {
                throw new BadRequestException(
                    `Payout of ${payout.amount} exceeds the affiliate's balance of ${account.balance}`,
                );
            }

            const claimed = await tx.affiliatePayout.updateMany({
                where: { id: payoutId, status: PAYOUT_PENDING },
                data: { status: PAYOUT_PAID },
            });

            if (claimed.count !== 1) {
                throw new BadRequestException('Payout was already processed');
            }

            const settled = await tx.affiliateAccount.update({
                where: { id: payout.affiliateId },
                data: { balance: { decrement: payout.amount } },
            });

            return {
                success: true,
                payoutId,
                amount: payout.amount,
                status: PAYOUT_PAID,
                remainingBalance: this.round(settled.balance),
            };
        });
    }

    /** Declines a pending payout. The balance is untouched, so it stays claimable. */
    async rejectPayout(payoutId: string) {
        const payout = await this.prisma.affiliatePayout.findUnique({ where: { id: payoutId } });

        if (!payout) {
            throw new NotFoundException('Payout not found');
        }
        if (payout.status !== PAYOUT_PENDING) {
            throw new BadRequestException(
                `Payout is already ${payout.status.toLowerCase()} and cannot be rejected`,
            );
        }

        const claimed = await this.prisma.affiliatePayout.updateMany({
            where: { id: payoutId, status: PAYOUT_PENDING },
            data: { status: PAYOUT_REJECTED },
        });

        if (claimed.count !== 1) {
            throw new BadRequestException('Payout was already processed');
        }

        return { success: true, payoutId, status: PAYOUT_REJECTED };
    }

    private sumPayouts(payouts: { amount: number; status: string }[], status: string): number {
        return payouts
            .filter((payout) => payout.status === status)
            .reduce((sum, payout) => sum + payout.amount, 0);
    }

    private round(value: number, decimals = 2): number {
        const factor = 10 ** decimals;
        return Math.round(value * factor) / factor;
    }
}
