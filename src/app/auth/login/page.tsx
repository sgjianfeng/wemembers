"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CodeInput } from "@/components/ui/CodeInput";
import { useLang } from "@/components/i18n/LanguageProvider";

type Step = "phone" | "code";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLang();
  const [contact, setContact] = useState("");
  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSendCode() {
    if (!contact) {
      setError(t("common.required"));
      return;
    }
    setLoading(true); setError("");
    const res = await fetch("/api/auth/send-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact, purpose: "login" }) });
    const data = await res.json();
    setLoading(false);
    if (res.ok) { setStep("code"); } else { setError(data.error || t("common.error")); }
  }

  async function handleVerify(code: string) {
    setLoading(true); setError("");
    const res = await fetch("/api/auth/verify-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact, code, purpose: "login" }) });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      router.push(data.data.user.role === "admin" ? "/admin" : data.data.user.role === "business" ? "/business" : "/home");
    } else { setError(data.error || t("common.error")); }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex-1 flex flex-col justify-center px-6">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-[#1A6EFF] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">WM</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("auth.login.title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("auth.login.subtitle")}</p>
        </div>

        {step === "phone" ? (
          <>
            <Input label={t("auth.login.phone")} placeholder={t("auth.login.placeholder")} type="text" value={contact} onChange={(e) => setContact(e.target.value)} error={error} onKeyDown={(e) => e.key === "Enter" && handleSendCode()} />
            <Button className="w-full mt-4" size="lg" onClick={handleSendCode} loading={loading}>{t("auth.login.sendCode")}</Button>
            <div className="mt-6 text-center">
              <p className="text-sm text-slate-400">{t("auth.login.noAccount")}{" "}<a href="/auth/register" className="text-[#1A6EFF] font-medium">{t("auth.login.register")}</a></p>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600 text-center mb-6">{t("auth.register.codeSent")} <span className="font-medium">{contact}</span></p>
            <CodeInput length={6} onComplete={handleVerify} error={error} />
            <div className="text-center mt-6 space-y-3">
              <button className="text-sm text-[#1A6EFF] font-medium" onClick={() => setStep("phone")}>← {t("auth.register.modify").replace("← ", "")}</button>
              <p className="text-sm text-slate-400">{t("auth.register.notReceived")}{" "}<button className="text-[#1A6EFF] font-medium" onClick={handleSendCode} disabled={loading}>{t("auth.register.resend")}</button></p>
            </div>
          </>
        )}
      </div>
      <div className="px-6 pb-8 text-center"><p className="text-xs text-slate-300">{t("auth.login.agreement")}</p></div>
    </div>
  );
}
