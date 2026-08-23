import { redirect } from "next/navigation";

/**
 * 旧的国庆落地页地址。
 *
 * 满赠已经不再作为「国庆活动」单独处理，落地页搬到 /spend-get/[slug]。
 * 但 /ndp/{slug} 可能已经印在桌卡和前台的二维码上 —— 印出去的东西改不了，
 * 所以这条路永久保留为 301 跳转，查询参数（from=table / from=counter / seller）原样带过去。
 */
export default async function LegacyNdpRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0]);
  }
  const suffix = qs.toString();
  redirect(`/spend-get/${encodeURIComponent(slug)}${suffix ? `?${suffix}` : ""}`);
}
