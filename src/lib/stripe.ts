import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export const PLATFORM_FEE_PERCENT = 10; // 平台抽成 10%
export const MIN_WITHDRAWAL_CENTS = 1000; // 最低提现 ¥10

export async function createConnectedAccount(
  email: string,
  businessName: string
): Promise<string> {
  const account = await stripe.accounts.create({
    type: "express",
    country: "SG",
    email,
    business_type: "company",
    company: { name: businessName },
    capabilities: {
      transfers: { requested: true },
    },
    settings: {
      payouts: {
        schedule: { interval: "manual" },
      },
    },
  });
  return account.id;
}

export async function createAccountLink(
  stripeAccountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

export async function getAccountStatus(stripeAccountId: string) {
  const account = await stripe.accounts.retrieve(stripeAccountId);
  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

export async function createCheckoutSession(params: {
  userId: string;
  amountSgd: number; // Singapore dollars
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card", "paynow"],
    line_items: [
      {
        price_data: {
          currency: "sgd",
          product_data: { name: "WeMembers 账户充值" },
          unit_amount: Math.round(params.amountSgd * 100), // cents
        },
        quantity: 1,
      },
    ],
    metadata: { userId: params.userId, type: "topup" },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
  return session.url || "";
}

export async function createTransfer(params: {
  amountCents: number;
  stripeAccountId: string;
  description: string;
}) {
  const transfer = await stripe.transfers.create({
    amount: params.amountCents,
    currency: "sgd",
    destination: params.stripeAccountId,
    description: params.description,
  });
  return transfer;
}
