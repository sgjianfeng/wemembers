import { redirect } from "next/navigation";

/** 旧「票据」入口 → 资料仓 */
export default function ReceiptPageRedirect() {
  redirect("/business/hub/docs");
}
