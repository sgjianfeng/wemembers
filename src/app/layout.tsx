import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { LangWrapper } from "@/components/i18n/LangWrapper";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WeMembers — 会员+代金券平台",
  description: "一站式商户营销平台：会员管理、代金券、幸运抽奖",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    title: "WeMembers",
    statusBarStyle: "default",
  },
  manifest: "/site.webmanifest",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const langCookie = cookieStore.get("gwm_lang")?.value;
  const initialLang = (langCookie === "en" ? "en" : "zh") as "zh" | "en";

  return (
    <html lang={initialLang === "en" ? "en" : "zh-CN"} className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen bg-background text-foreground font-sans">
        <div className="max-w-lg mx-auto min-h-screen relative">
          <LangWrapper initialLang={initialLang}>
            {children}
          </LangWrapper>
        </div>
      </body>
    </html>
  );
}
