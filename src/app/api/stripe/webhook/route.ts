import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";

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
      // Connected account onboarding 完成
      case "account.updated": {
        const account = event.data.object as any;
        if (account.metadata?.userId) {
          const chargesEnabled = account.charges_enabled;
          const payoutsEnabled = account.payouts_enabled;

          await prisma.stripeAccount.update({
            where: { userId: account.metadata.userId },
            data: {
              chargesEnabled,
              payoutsEnabled,
              detailsSubmitted: account.details_submitted,
            },
          });

          // 同步到 TokenAccount
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

      // 充值成功
      case "checkout.session.completed": {
        const session = event.data.object as any;
        if (session.metadata?.type === "topup" && session.metadata?.userId) {
          const amountCents = session.amount_total || 0;

          const tokenAccount = await prisma.tokenAccount.upsert({
            where: { userId: session.metadata.userId },
            create: {
              userId: session.metadata.userId,
              balance: amountCents,
              frozenBalance: 0,
              totalEarned: amountCents,
              totalSpent: 0,
            },
            update: {
              balance: { increment: amountCents },
              totalEarned: { increment: amountCents },
            },
          });

          await prisma.tokenTransaction.create({
            data: {
              accountId: tokenAccount.id,
              amount: amountCents,
              type: "stripe_topup",
              description: `Stripe 充值 S$${(amountCents / 100).toFixed(2)}`,
              balanceAfter: tokenAccount.balance,
            },
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
