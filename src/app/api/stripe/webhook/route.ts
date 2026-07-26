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
          id?: string;
          metadata?: { userId?: string };
          charges_enabled?: boolean;
          payouts_enabled?: boolean;
          details_submitted?: boolean;
        };
        const chargesEnabled = !!account.charges_enabled;
        const payoutsEnabled = !!account.payouts_enabled;
        const detailsSubmitted = !!account.details_submitted;

        // Prefer metadata.userId; fall back to stripeAccountId lookup
        // (older Connect accounts may lack metadata)
        let userId = account.metadata?.userId || null;
        if (!userId && account.id) {
          const row = await prisma.stripeAccount.findFirst({
            where: { stripeAccountId: account.id },
            select: { userId: true },
          });
          userId = row?.userId || null;
        }

        if (userId) {
          await prisma.stripeAccount.update({
            where: { userId },
            data: {
              chargesEnabled,
              payoutsEnabled,
              detailsSubmitted,
            },
          });

          if (chargesEnabled) {
            await prisma.tokenAccount.upsert({
              where: { userId },
              create: {
                userId,
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
            productId: meta.productId || null,
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
