"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLang } from "@/components/i18n/LanguageProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TopHeader } from "@/components/ui/TopHeader";
import { CodeInput } from "@/components/ui/CodeInput";
import { PasswordField } from "@/components/auth/PasswordField";
import { SERVICE_CATEGORIES } from "@/types";
import { cn, isValidSingaporeUen } from "@/lib/utils";

type Step = "role" | "details" | "code";
type RoleChoice = "customer" | "business";

function normalizeContact(raw: string): string {
  const t = raw.trim();
  if (t.includes("@")) return t.toLowerCase();
  return t.replace(/\s+/g, "");
}

export default function RegisterPage() {
  const router = useRouter();
  const { t, lang } = useLang();
  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<RoleChoice>("customer");
  const [contact, setContact] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessUen, setBusinessUen] = useState("");
  const [businessCategory, setBusinessCategory] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const contactNorm = normalizeContact(contact);
  const isEmail = contactNorm.includes("@");

  const stepIndex = step === "role" ? 0 : step === "details" ? 1 : 2;
  const steps = [
    t("auth.register.stepRole"),
    t("auth.register.stepDetails"),
    t("auth.register.stepCode"),
  ];

  function categoryLabel(value: string, labelZh: string): string {
    if (lang !== "en") return labelZh;
    const map: Record<string, string> = {
      cafe: "Cafe & Tea",
      food: "Food & Dining",
      retail: "Retail",
      beauty: "Beauty & Salon",
      fitness: "Fitness",
      entertainment: "Entertainment",
      education: "Education",
      other: "Other",
    };
    return map[value] || labelZh;
  }

  async function handleSendCode() {
    if (!contactNorm) {
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
    if (role === "business") {
      if (!businessName.trim()) {
        setError(t("register.error.enterBusinessName"));
        return;
      }
      if (!isValidSingaporeUen(businessUen)) {
        setError(t("register.error.invalidUen"));
        return;
      }
      if (!businessCategory) {
        setError(t("register.error.selectCategory"));
        return;
      }
      if (password.length < 6) {
        setError(t("register.error.passwordRequired"));
        return;
      }
    }
    if (password && password.length < 6) {
      setError(t("auth.login.setPwTooShort"));
      return;
    }

    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact: contactNorm, purpose: "register" }),
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
        contact: contactNorm,
        code,
        role,
        displayName: displayName.trim() || undefined,
        password: password || undefined,
        businessName: role === "business" ? businessName.trim() : undefined,
        businessUen: role === "business" ? businessUen.trim() : undefined,
        businessCategory: role === "business" ? businessCategory : undefined,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      // 企业：先去加门店；客户：进首页
      router.push(role === "business" ? "/business/stores" : "/home");
    } else {
      setError(data.error || t("register.error.registerFailed"));
    }
  }

  const subtitle =
    step === "role"
      ? t("auth.register.subtitle")
      : role === "business"
        ? t("auth.register.subBusiness")
        : t("auth.register.subCustomer");

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 via-white to-white">
      <TopHeader variant="default" fallbackUrl="/" />

      <div className="flex-1 flex flex-col px-6 pt-5 pb-8 max-w-md mx-auto w-full">
        {/* Brand */}
        <div className="text-center mb-5">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#240444] p-1 shadow-lg ring-2 ring-[#240444]/10">
            <Image
              src="/logo-mark.png"
              alt="WeMembers"
              width={48}
              height={48}
              className="h-10 w-10 object-contain"
              priority
            />
          </div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-600/90 uppercase">
            WeMembers.store
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
            {t("auth.register.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 leading-relaxed max-w-[300px] mx-auto">
            {subtitle}
          </p>
        </div>

        {/* Steps */}
        <div className="mb-4 flex items-center justify-center gap-1.5 text-[11px] font-medium">
          {steps.map((label, i) => (
            <div key={label} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-slate-300 px-0.5">→</span>}
              <span
                className={cn(
                  "rounded-full px-2.5 py-1",
                  i === stepIndex
                    ? "bg-slate-900 text-white"
                    : i < stepIndex
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-400"
                )}
              >
                {i + 1}. {label}
              </span>
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          {/* ── 选身份 ── */}
          {step === "role" && (
            <>
              <p className="text-sm font-medium text-slate-700 mb-3">{t("auth.register.role")}</p>
              <div className="space-y-3">
                {(
                  [
                    {
                      id: "customer" as const,
                      title: t("auth.register.customer"),
                      desc: t("auth.register.customerDesc"),
                      points: [
                        t("auth.register.customerPoint1"),
                        t("auth.register.customerPoint2"),
                        t("auth.register.customerPoint3"),
                      ],
                    },
                    {
                      id: "business" as const,
                      title: t("auth.register.business"),
                      desc: t("auth.register.businessDesc"),
                      points: [
                        t("auth.register.businessPoint1"),
                        t("auth.register.businessPoint2"),
                        t("auth.register.businessPoint3"),
                      ],
                    },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRole(item.id)}
                    className={cn(
                      "w-full p-4 rounded-2xl border-2 text-left transition-all",
                      role === item.id
                        ? "border-[#1A6EFF] bg-blue-50/80 shadow-sm"
                        : "border-slate-100 hover:border-slate-200"
                    )}
                  >
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                    <ul className="mt-2 space-y-1">
                      {item.points.map((p) => (
                        <li key={p} className="text-[11px] text-slate-500 flex gap-1.5">
                          <span className="text-[#1A6EFF]">✓</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
              <Button className="w-full mt-4" size="lg" onClick={() => setStep("details")}>
                {t("auth.register.next")}
              </Button>
            </>
          )}

          {/* ── 填写资料 ── */}
          {step === "details" && (
            <>
              <Input
                label={
                  role === "business"
                    ? t("auth.register.companyEmail")
                    : t("auth.register.companyPhone")
                }
                placeholder={
                  role === "business"
                    ? "name@company.com"
                    : t("register.phonePlaceholder")
                }
                type={role === "business" ? "email" : "tel"}
                autoComplete={role === "business" ? "email" : "tel"}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="h-12 rounded-xl"
              />
              <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                {role === "business"
                  ? t("auth.register.contactHintBusiness")
                  : t("auth.register.contactHintCustomer")}
              </p>

              {role === "customer" && (
                <div className="mt-3">
                  <Input
                    label={t("auth.register.displayName")}
                    placeholder={t("auth.register.displayNamePlaceholder")}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-12 rounded-xl"
                  />
                </div>
              )}

              {role === "business" && (
                <>
                  <div className="mt-3">
                    <Input
                      label={t("auth.register.companyName")}
                      placeholder={t("register.companyNamePlaceholder")}
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="h-12 rounded-xl"
                    />
                  </div>
                  <div className="mt-3">
                    <Input
                      label={t("auth.register.uen")}
                      placeholder={t("auth.register.uenPlaceholder")}
                      value={businessUen}
                      onChange={(e) =>
                        setBusinessUen(e.target.value.toUpperCase().replace(/\s+/g, ""))
                      }
                      className="h-12 rounded-xl font-mono tracking-wide"
                      autoCapitalize="characters"
                    />
                    <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                      {t("auth.register.uenHint")}
                    </p>
                  </div>
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      {t("auth.register.category")}
                    </label>
                    <select
                      value={businessCategory}
                      onChange={(e) => setBusinessCategory(e.target.value)}
                      className="w-full h-12 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">{t("auth.register.selectCategory")}</option>
                      {SERVICE_CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {categoryLabel(cat.value, cat.label)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="mt-3">
                <PasswordField
                  label={
                    role === "business"
                      ? t("auth.register.passwordRequired")
                      : t("auth.register.passwordOptional")
                  }
                  value={password}
                  onChange={setPassword}
                  placeholder={t("auth.register.passwordPlaceholder")}
                  show={showPassword}
                  onToggleShow={() => setShowPassword((v) => !v)}
                  showLabel={t("auth.login.showPassword")}
                  hideLabel={t("auth.login.hidePassword")}
                  autoComplete="new-password"
                  hint={
                    role === "business"
                      ? t("auth.register.passwordHintBusiness")
                      : t("auth.register.passwordHintCustomer")
                  }
                />
              </div>

              {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

              <Button
                className="w-full mt-5"
                size="lg"
                onClick={handleSendCode}
                loading={loading}
              >
                {t("auth.login.sendCode")}
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-slate-400 mt-3 hover:text-slate-600"
                onClick={() => {
                  setStep("role");
                  setError("");
                }}
              >
                {t("auth.register.back")}
              </button>
            </>
          )}

          {/* ── 验证码 ── */}
          {step === "code" && (
            <>
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3 mb-5">
                <p className="text-xs text-slate-500">{t("auth.register.codeSent")}</p>
                <p className="mt-0.5 text-sm font-medium text-slate-900 break-all">{contactNorm}</p>
                <p className="mt-1.5 text-xs text-slate-400">{t("auth.login.codeHint")}</p>
              </div>
              <CodeInput length={6} onComplete={handleVerifyAndRegister} error={error} />
              {loading && (
                <p className="mt-3 text-center text-xs text-slate-400">{t("auth.login.verifying")}</p>
              )}
              <div className="mt-6 flex flex-col items-center gap-3">
                <button
                  type="button"
                  className="text-sm text-[#1A6EFF] font-medium"
                  onClick={() => {
                    setStep("details");
                    setError("");
                  }}
                >
                  {t("auth.register.modify")}
                </button>
                <p className="text-sm text-slate-400">
                  {t("auth.register.notReceived")}{" "}
                  <button
                    type="button"
                    className="text-[#1A6EFF] font-medium disabled:opacity-50"
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

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-400">
            {t("auth.register.hasAccount")}{" "}
            <Link href="/auth/login" className="text-[#1A6EFF] font-medium">
              {t("auth.register.goLogin")}
            </Link>
          </p>
        </div>

        <p className="mt-auto pt-8 text-center text-[11px] text-slate-300">
          {t("auth.login.agreement")}
        </p>
      </div>
    </div>
  );
}
