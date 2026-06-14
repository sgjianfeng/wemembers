import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { LangWrapper } from "@/components/i18n/LangWrapper";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WeMembers — 会员+代金券平台",
  description: "简单好用的会员与代金券管理系统",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const langCookie = cookieStore.get("gwm_lang")?.value;
  const initialLang = (langCookie === "en" ? "en" : "zh") as "zh" | "en";

  return (
    <html
      lang={initialLang === "en" ? "en" : "zh-CN"}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-50 text-slate-900 font-sans">
        <div className="max-w-lg mx-auto min-h-screen bg-white relative">
          <LangWrapper initialLang={initialLang}>
            {children}
          </LangWrapper>
        </div>
      </body>
    </html>
  );
}
