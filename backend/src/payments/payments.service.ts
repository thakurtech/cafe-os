import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Razorpay = require('razorpay');
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private razorpayClient: any = null;

  constructor(private prisma: PrismaService) { }

  /**
   * Builds the Razorpay client on first use rather than in the constructor.
   *
   * The Razorpay SDK throws '`key_id` or `oauthToken` is mandatory' when
   * constructed without credentials. Doing that in the constructor meant Nest
   * failed to instantiate this provider, so the whole application refused to
   * boot without RAZORPAY_KEY_ID -- taking auth, the POS and the kitchen display
   * down over a missing optional payment key. Now a deployment with no payment
   * credentials runs fine and only online payment attempts fail, with a message
   * that says what is missing.
   */
  private getRazorpay() {
    if (this.razorpayClient) {
      return this.razorpayClient;
    }

    const keyId = process.env.RAZORPAY_KEY_ID?.trim();
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

    if (!keyId || !keySecret) {
      throw new BadRequestException(
        'Online payments are not configured on this server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable them.',
      );
    }

    this.razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
    return this.razorpayClient;
  }

  /** Whether online payments can be attempted at all. */
  isConfigured(): boolean {
    return Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim());
  }

  async createRazorpayOrder(amount: number, currency: string, receipt: string, notes?: Record<string, string>) {
    try {
      const options = {
        amount: Math.round(amount * 100), // amount in paise (smallest unit)
        currency,
        receipt,
        notes,
      };
      const order = await this.getRazorpay().orders.create(options);
      return { id: order.id, amount: order.amount, currency: order.currency };
    } catch (error) {
      throw new BadRequestException('Failed to create Razorpay order: ' + (error as Error).message);
    }
  }

  verifyPayment(razorpayOrderId: string, razorpayPaymentId: string, signature: string): boolean {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new BadRequestException('Razorpay secret not configured');

    const generated_signature = crypto
      .createHmac('sha256', secret)
      .update(razorpayOrderId + '|' + razorpayPaymentId)
      .digest('hex');

    return generated_signature === signature;
  }

  async updateOrderPayment(
    internalOrderId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
  ) {
    return this.prisma.order.update({
      where: { id: internalOrderId },
      data: {
        paymentStatus: 'PAID',
        paidAt: new Date(),
        razorpayOrderId,
        razorpayPaymentId,
      },
    });
  }
}
