"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/components/i18n/LanguageProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TopHeader } from "@/components/ui/TopHeader";
import { CodeInput } from "@/components/ui/CodeInput";
import { SERVICE_CATEGORIES } from "@/types";

type Step = "role" | "contact" | "code" | "info";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useLang();
  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<"business" | "customer">("customer");
  const [contact, setContact] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessCategory, setBusinessCategory] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isEmail = contact.includes("@");

  async function handleSendCode() {
    if (!contact) {
      setError(t("register.error.enterContact"));
      return;
    }
    if (role === "business" && !isEmail) {
      setError(t("register.error.businessUseEmail"));
      return;
    }
    if (role === "customer" && isEmail) {
      setError(t("register.error.customerUsePhone"));
      return;
    }

    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact, purpose: "register" }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setStep("code");
    } else {
      setError(data.error || t("register.error.sendFailed"));
    }
  }

  async function handleVerifyAndRegister(code: string) {
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact,
        code,
        role,
        displayName,
        password: role === "business" ? password : undefined,
        businessName: role === "business" ? businessName : undefined,
        businessCategory: role === "business" ? businessCategory : undefined,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      const redirect = role === "business" ? "/business" : "/home";
      router.push(redirect);
    } else {
      setError(data.error || t("register.error.registerFailed"));
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <TopHeader variant="default" />
      <div className="flex-1 flex flex-col justify-center px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">{t("auth.register.title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("auth.register.subtitle")}</p>
        </div>

        {step === "role" && (
          <>
            <p className="text-sm text-slate-600 mb-4">{t("auth.register.role")}</p>
            <div className="space-y-3">
              <button
                onClick={() => setRole("customer")}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                  role === "customer"
                    ? "border-[#1A6EFF] bg-blue-50"
                    : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <p className="font-medium text-slate-900">{t("auth.register.customer")}</p>
                <p className="text-xs text-slate-500 mt-0.5">{t("auth.register.customerDesc")}</p>
              </button>
              <button
                onClick={() => setRole("business")}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                  role === "business"
                    ? "border-[#1A6EFF] bg-blue-50"
                    : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <p className="font-medium text-slate-900">{t("auth.register.business")}</p>
                <p className="text-xs text-slate-500 mt-0.5">{t("auth.register.businessDesc")}</p>
              </button>
            </div>
            <Button className="w-full mt-6" size="lg" onClick={() => setStep("contact")}>
              {t("auth.register.next")}
            </Button>
          </>
        )}

        {step === "contact" && (
          <>
            <Input
              label={role === "business" ? t("auth.register.companyEmail") : t("auth.register.companyPhone")}
              placeholder={role === "business" ? "name@company.com" : t("register.phonePlaceholder")}
              type={role === "business" ? "email" : "tel"}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              error={error}
            />
            {role === "business" && (
              <>
                <Input
                  label={t("auth.register.companyName")}
                  placeholder={t("register.companyNamePlaceholder")}
                  className="mt-3"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
                <div className="mt-3">
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t("auth.register.category")}</label>
                  <select
                    value={businessCategory}
                    onChange={(e) => setBusinessCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6EFF]"
                  >
                    <option value="">{t("auth.register.selectCategory")}</option>
                    {SERVICE_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label={t("auth.register.password")}
                  type="password"
                  placeholder={t("auth.register.passwordHint")}
                  className="mt-3"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </>
            )}
            <Button
              className="w-full mt-4"
              size="lg"
              onClick={handleSendCode}
              loading={loading}
            >
              {t("auth.login.sendCode")}
            </Button>
            <button
              className="w-full text-center text-sm text-slate-400 mt-3"
              onClick={() => setStep("role")}
            >
              {t("auth.register.back")}
            </button>
          </>
        )}

        {step === "code" && (
          <>
            <p className="text-sm text-slate-600 text-center mb-6">
              {t("auth.register.codeSent")} <span className="font-medium">{contact}</span>
            </p>
            <CodeInput length={6} onComplete={handleVerifyAndRegister} error={error} />
            <div className="text-center mt-6 space-y-3">
              <button
                className="text-sm text-slate-400"
                onClick={() => setStep("contact")}
              >
                {t("auth.register.modify")}
              </button>
              <p className="text-sm text-slate-400">
                {t("auth.register.notReceived")}{" "}
                <button
                  className="text-[#1A6EFF] font-medium"
                  onClick={handleSendCode}
                  disabled={loading}
                >
                  {t("auth.register.resend")}
                </button>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
