import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { fulfillVoucherPurchase } from "@/lib/voucher-purchase";
import { applyStripeTopupCredit } from "@/lib/funding";

// POST /api/stripe/webhook
export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature") || "";

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ""
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as {
          metadata?: { userId?: string };
          charges_enabled?: boolean;
          payouts_enabled?: boolean;
          details_submitted?: boolean;
        };
        if (account.metadata?.userId) {
          const chargesEnabled = account.charges_enabled;
          const payoutsEnabled = account.payouts_enabled;

          await prisma.stripeAccount.update({
            where: { userId: account.metadata.userId },
            data: {
              chargesEnabled: !!chargesEnabled,
              payoutsEnabled: !!payoutsEnabled,
              detailsSubmitted: !!account.details_submitted,
            },
          });

          if (chargesEnabled) {
            await prisma.tokenAccount.upsert({
              where: { userId: account.metadata.userId },
              create: {
                userId: account.metadata.userId,
                balance: 0,
                frozenBalance: 0,
                totalEarned: 0,
                totalSpent: 0,
              },
              update: {},
            });
          }
        }
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as {
          id: string;
          amount_total: number | null;
          metadata?: Record<string, string>;
          payment_status?: string;
        };
        const meta = session.metadata || {};

        if (meta.type === "topup" && meta.userId) {
          const amountCents = session.amount_total || 0;
          if (amountCents > 0) {
            await applyStripeTopupCredit({
              userId: meta.userId,
              amountCents,
              stripeSessionId: session.id,
            });
          }
        }

        if (meta.type === "voucher_purchase" && meta.userId && meta.campaignId) {
          await fulfillVoucherPurchase({
            customerId: meta.userId,
            campaignId: meta.campaignId,
            amountSgd: Number(meta.amountSgd),
            spendNowSgd: Number(meta.spendNowSgd || 0),
            sellerId: meta.sellerId || null,
            stripeSessionId: session.id,
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error("webhook error:", error);
  }

  return NextResponse.json({ received: true });
}
