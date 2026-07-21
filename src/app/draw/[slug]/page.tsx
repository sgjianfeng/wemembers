import { redirect } from "next/navigation";

// Legacy V1 draw links (/draw/{slug}) — unified into the voucher/draw page
export default async function LegacyDrawPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/voucher/${slug}`);
}
