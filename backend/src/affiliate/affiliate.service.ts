import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Payout states, as the super admin side (super-admin/affiliates.service.ts) writes them.
const PAYOUT_PENDING = 'PENDING';
const PAYOUT_PAID = 'PAID';

@Injectable()
export class AffiliateService {
    constructor(private prisma: PrismaService) { }

    async getStats(userId: string) {
        const affiliate = await this.prisma.affiliateAccount.findUnique({
            where: { userId },
            include: {
                referrals: true,
                payouts: { select: { amount: true, status: true, createdAt: true } },
            },
        });

        if (!affiliate) {
            throw new NotFoundException('Affiliate account not found');
        }

        const activeReferrals = affiliate.referrals.filter(r => r.status === 'ACTIVE').length;

        // Settled payouts are the only money that actually reached the affiliate.
        // Rejected ones never will, and pending ones have not yet.
        const totalEarnings = this.round(this.sumPayouts(affiliate.payouts, PAYOUT_PAID));

        const pendingPayouts = affiliate.payouts.filter(p => p.status === PAYOUT_PENDING);
        const pendingAmount = this.round(this.sumPayouts(affiliate.payouts, PAYOUT_PENDING));

        // The payout that settles next is the oldest request still awaiting approval;
        // with nothing pending there is no date to promise, so it stays null.
        const oldestPending = pendingPayouts.reduce<Date | null>(
            (oldest, payout) =>
                oldest === null || payout.createdAt < oldest ? payout.createdAt : oldest,
            null,
        );

        return {
            totalEarnings,
            activeCafes: activeReferrals,
            commissionRate: affiliate.commissionRate,
            nextPayout: {
                // What is already requested and waiting on the super admin.
                amount: pendingAmount,
                // When that request was raised, rather than a made-up schedule.
                // Null when nothing is pending: there is no date to promise.
                date: oldestPending,
                // Unpaid balance on the account. Approving a payout decrements the
                // balance, so anything already requested is still counted here until
                // it is settled.
                claimable: this.round(affiliate.balance),
                pendingCount: pendingPayouts.length,
            },
            referralCode: affiliate.code,
        };
    }

    async getReferrals(userId: string) {
        const affiliate = await this.prisma.affiliateAccount.findUnique({
            where: { userId },
            include: {
                referrals: {
                    include: { shop: true }
                }
            },
        });

        if (!affiliate) {
            throw new NotFoundException('Affiliate account not found');
        }

        return affiliate.referrals.map(ref => ({
            id: ref.id,
            shopName: ref.shop.name,
            status: ref.status,
            joinedAt: ref.createdAt,
            commission: affiliate.commissionRate,
        }));
    }

    async onboardCafe(userId: string, data: { shopName: string; ownerName: string; ownerPhone: string }) {
        const affiliate = await this.prisma.affiliateAccount.findUnique({
            where: { userId },
        });

        if (!affiliate) {
            throw new NotFoundException('Affiliate account not found');
        }

        // 1. Create a placeholder Shop
        const shop = await this.prisma.shop.create({
            data: {
                name: data.shopName,
                slug: data.shopName.toLowerCase().replace(/ /g, '-') + '-' + Math.floor(Math.random() * 1000),
                phone: data.ownerPhone,
            }
        });

        // 2. Link to Affiliate
        await this.prisma.affiliateReferral.create({
            data: {
                affiliateId: affiliate.id,
                shopId: shop.id,
                status: 'TRIAL', // Start as TRIAL
            }
        });

        return { success: true, shopId: shop.id, message: 'Cafe onboarded successfully' };
    }

    private sumPayouts(payouts: { amount: number; status: string }[], status: string): number {
        return payouts
            .filter(payout => payout.status === status)
            .reduce((sum, payout) => sum + payout.amount, 0);
    }

    private round(value: number, decimals = 2): number {
        const factor = 10 ** decimals;
        return Math.round(value * factor) / factor;
    }
}
