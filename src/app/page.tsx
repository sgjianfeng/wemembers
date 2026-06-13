import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();

  if (!session) {
    redirect("/auth/login");
  }

  switch (session.role) {
    case "admin":
      redirect("/admin");
    case "business":
      redirect("/business");
    case "customer":
      redirect("/home");
    default:
      redirect("/auth/login");
  }
}
