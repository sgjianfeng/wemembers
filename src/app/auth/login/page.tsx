"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TopHeader } from "@/components/ui/TopHeader";
import { CodeInput } from "@/components/ui/CodeInput";
import { useLang } from "@/components/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

type IntentTab = "customer" | "business" | "admin";
type Mode = "password" | "code" | "code-verify" | "set-password-prompt" | "set-password";

function roleHome(role: string): string {
  if (role === "admin") return "/admin";
  if (role === "business" || role === "staff") return "/business";
  return "/home";
}

/** Only same-origin relative paths (blocks open redirects). */
function safeRedirectPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.startsWith("/auth")) return null;
  return raw;
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  show,
  onToggleShow,
  showLabel,
  hideLabel,
  autoComplete = "current-password",
  onKeyDown,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  show: boolean;
  onToggleShow: () => void;
  showLabel: string;
  hideLabel: string;
  autoComplete?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={cn(
            "flex h-12 w-full rounded-xl border border-input bg-background px-3 py-2 pr-11 text-base",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors"
          )}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-600"
          aria-label={show ? hideLabel : showLabel}
        >
          <EyeIcon open={show} />
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLang();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<IntentTab>("customer");

  useEffect(() => {
    const q = searchParams.get("tab");
    if (q === "customer" || q === "business" || q === "admin") {
      setTab(q);
    }
  }, [searchParams]);
  // admin 默认验证码；客户/商家默认密码
  const [mode, setMode] = useState<Mode>("password");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingRole, setPendingRole] = useState<string>("customer");
  /** 本地非 live 时 API 返回的验证码，页面直接展示 */
  const [devCode, setDevCode] = useState<string | null>(null);

  // 与后端一致：SG 手机规范为 +65…，避免登录查不到号
  const normalizedContact = (() => {
    const raw = contact.trim();
    if (raw.includes("@")) return raw.toLowerCase();
    const d = raw.replace(/[^\d+]/g, "");
    if (d.startsWith("+")) return d;
    const digits = d.replace(/\D/g, "");
    if (digits.startsWith("65") && digits.length === 10) return `+${digits}`;
    if (/^[89]\d{7}$/.test(digits)) return `+65${digits}`;
    return digits || raw;
  })();

  const isAdminTab = tab === "admin";
  const showPasswordForm = !isAdminTab && mode === "password";
  const showCodeForm = isAdminTab || mode === "code" || mode === "code-verify";

  function switchTab(next: IntentTab) {
    setTab(next);
    setError("");
    setPassword("");
    setMode(next === "admin" ? "code" : "password");
    // 客户默认勾选长记住；商家默认不勾选（更偏安全）
    setRememberMe(next === "customer");
  }

  function goHome(role: string) {
    const redirect = safeRedirectPath(searchParams.get("redirect"));
    router.push(redirect || roleHome(role));
  }

  async function handlePasswordLogin() {
    if (!contact.trim() || !password) {
      setError(t("common.required"));
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact: normalizedContact,
        password,
        rememberMe,
        intentRole: tab === "admin" ? undefined : tab,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      goHome(data.data.user.role);
    } else {
      setError(data.error || t("common.error"));
    }
  }

  async function handleSendCode() {
    if (!contact.trim()) {
      setError(t("common.required"));
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact: normalizedContact, purpose: "login" }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setDevCode(
        typeof data.data?.devCode === "string" ? data.data.devCode : null
      );
      setMode("code-verify");
    } else {
      setError(data.error || t("common.error"));
    }
  }

  async function handleVerify(code: string) {
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact: normalizedContact,
        code,
        purpose: "login",
        rememberMe: isAdminTab ? false : rememberMe,
        intentRole: tab,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || t("common.error"));
      return;
    }

    const role = data.data.user.role as string;
    setPendingRole(role);

    if (role === "admin") {
      goHome(role);
      return;
    }

    // 客户 / 商家验证码登录后询问设密
    setMode("set-password-prompt");
  }

  async function handleSavePassword() {
    if (newPassword.length < 6) {
      setError(t("auth.login.setPwTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.login.setPwMismatch"));
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      goHome(pendingRole);
    } else {
      setError(data.error || t("common.error"));
    }
  }

  const subtitle =
    tab === "customer"
      ? t("auth.login.subCustomer")
      : tab === "business"
        ? t("auth.login.subBusiness")
        : t("auth.login.subAdmin");

  const inSetPasswordFlow = mode === "set-password-prompt" || mode === "set-password";

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
            {t("auth.login.title")}
          </h1>
          {!inSetPasswordFlow && (
            <p className="mt-1 text-sm text-slate-500 leading-relaxed">{subtitle}</p>
          )}
        </div>

        {/* Role tabs */}
        {!inSetPasswordFlow && (
          <div
            className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1"
            role="tablist"
            aria-label={t("auth.login.subtitle")}
          >
            {(
              [
                { id: "customer" as const, label: t("auth.login.tabCustomer") },
                { id: "business" as const, label: t("auth.login.tabBusiness") },
                { id: "admin" as const, label: t("auth.login.tabAdmin") },
              ]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => switchTab(item.id)}
                className={cn(
                  "rounded-xl py-2.5 text-sm font-semibold transition-all",
                  tab === item.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Card */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          {/* 密码登录：客户 / 商家 */}
          {showPasswordForm && (
            <>
              <Input
                label={t("auth.login.phone")}
                placeholder={t("auth.login.placeholder")}
                type="text"
                autoComplete="username"
                inputMode="email"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="h-12 rounded-xl"
              />
              <div className="mt-3">
                <PasswordField
                  label={t("auth.login.password")}
                  value={password}
                  onChange={setPassword}
                  placeholder={t("auth.login.passwordPlaceholder")}
                  show={showPassword}
                  onToggleShow={() => setShowPassword((v) => !v)}
                  showLabel={t("auth.login.showPassword")}
                  hideLabel={t("auth.login.hidePassword")}
                  onKeyDown={(e) => e.key === "Enter" && handlePasswordLogin()}
                />
              </div>

              <label className="mt-3 flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1A6EFF] focus:ring-[#1A6EFF]"
                />
                <span className="text-sm text-slate-700 leading-snug">
                  {tab === "customer"
                    ? t("auth.login.rememberCustomer")
                    : t("auth.login.rememberBusiness")}
                  <span className="block text-xs text-slate-400 mt-0.5">
                    {tab === "customer"
                      ? t("auth.login.rememberHintCustomer")
                      : t("auth.login.rememberHintBusiness")}
                  </span>
                </span>
              </label>

              {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">{t("auth.login.hint")}</p>
              <Button
                className="w-full mt-5"
                size="lg"
                onClick={handlePasswordLogin}
                loading={loading}
              >
                {t("auth.login.submit")}
              </Button>
              <button
                type="button"
                className="mt-4 w-full text-center text-sm font-medium text-[#1A6EFF]"
                onClick={() => {
                  setMode("code");
                  setError("");
                  setPassword("");
                }}
              >
                {t("auth.login.useCode")}
              </button>
            </>
          )}

          {/* 验证码：账号输入 */}
          {showCodeForm && mode === "code" && (
            <>
              {isAdminTab && (
                <div className="mb-3 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
                  <p className="text-xs text-amber-800 leading-relaxed">
                    {t("auth.login.codeAdminNote")}
                  </p>
                </div>
              )}
              <Input
                label={t("auth.login.phone")}
                placeholder={t("auth.login.placeholder")}
                type="text"
                autoComplete="username"
                inputMode="email"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                error={error}
                onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                className="h-12 rounded-xl"
              />
              {!isAdminTab && (
                <label className="mt-3 flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1A6EFF] focus:ring-[#1A6EFF]"
                  />
                  <span className="text-sm text-slate-700 leading-snug">
                    {tab === "customer"
                      ? t("auth.login.rememberCustomer")
                      : t("auth.login.rememberBusiness")}
                  </span>
                </label>
              )}
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">{t("auth.login.codeHint")}</p>
              <Button className="w-full mt-5" size="lg" onClick={handleSendCode} loading={loading}>
                {t("auth.login.sendCode")}
              </Button>
              {!isAdminTab && (
                <button
                  type="button"
                  className="mt-4 w-full text-center text-sm font-medium text-[#1A6EFF]"
                  onClick={() => {
                    setMode("password");
                    setError("");
                  }}
                >
                  ← {t("auth.login.usePassword")}
                </button>
              )}
            </>
          )}

          {/* 验证码：6 位 */}
          {mode === "code-verify" && (
            <>
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3 mb-5">
                <p className="text-xs text-slate-500">{t("auth.register.codeSent")}</p>
                <p className="mt-0.5 text-sm font-medium text-slate-900 break-all">
                  {normalizedContact}
                </p>
                <p className="mt-1.5 text-xs text-slate-400">{t("auth.login.codeHint")}</p>
              </div>
              {devCode && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                  <p className="text-[11px] font-medium text-amber-800">
                    本地开发 · 未真发短信
                  </p>
                  <p className="mt-1 text-center text-2xl font-bold tracking-[0.35em] text-amber-900">
                    {devCode}
                  </p>
                  <p className="mt-1 text-center text-[11px] text-amber-700">
                    请输入上方 6 位验证码
                  </p>
                </div>
              )}
              <CodeInput length={6} onComplete={handleVerify} error={error} />
              {loading && (
                <p className="mt-3 text-center text-xs text-slate-400">{t("auth.login.verifying")}</p>
              )}
              <div className="mt-6 flex flex-col items-center gap-3">
                <button
                  type="button"
                  className="text-sm text-[#1A6EFF] font-medium"
                  onClick={() => {
                    setMode("code");
                    setError("");
                  }}
                >
                  ← {t("auth.login.changeContact")}
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

          {/* 设密提示 */}
          {mode === "set-password-prompt" && (
            <div className="text-center py-2">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-xl">
                🔐
              </div>
              <h2 className="text-lg font-semibold text-slate-900">{t("auth.login.setPwTitle")}</h2>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed px-1">
                {t("auth.login.setPwBody")}
              </p>
              <Button
                className="w-full mt-6"
                size="lg"
                onClick={() => {
                  setMode("set-password");
                  setError("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
              >
                {t("auth.login.setPwYes")}
              </Button>
              <button
                type="button"
                className="mt-3 w-full text-sm font-medium text-slate-500 hover:text-slate-700"
                onClick={() => goHome(pendingRole)}
              >
                {t("auth.login.setPwSkip")}
              </button>
            </div>
          )}

          {/* 设密表单 */}
          {mode === "set-password" && (
            <>
              <PasswordField
                label={t("auth.login.setPwLabel")}
                value={newPassword}
                onChange={setNewPassword}
                placeholder={t("auth.login.passwordPlaceholder")}
                show={showNewPassword}
                onToggleShow={() => setShowNewPassword((v) => !v)}
                showLabel={t("auth.login.showPassword")}
                hideLabel={t("auth.login.hidePassword")}
                autoComplete="new-password"
              />
              <div className="mt-3">
                <PasswordField
                  label={t("auth.login.setPwConfirm")}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder={t("auth.login.passwordPlaceholder")}
                  show={showNewPassword}
                  onToggleShow={() => setShowNewPassword((v) => !v)}
                  showLabel={t("auth.login.showPassword")}
                  hideLabel={t("auth.login.hidePassword")}
                  autoComplete="new-password"
                  onKeyDown={(e) => e.key === "Enter" && handleSavePassword()}
                />
              </div>
              {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
              <Button className="w-full mt-5" size="lg" onClick={handleSavePassword} loading={loading}>
                {t("auth.login.setPwSave")}
              </Button>
              <button
                type="button"
                className="mt-3 w-full text-sm font-medium text-slate-500"
                onClick={() => goHome(pendingRole)}
              >
                {t("auth.login.setPwSkip")}
              </button>
            </>
          )}
        </div>

        {!inSetPasswordFlow && (
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-400">
              {t("auth.login.noAccount")}{" "}
              <Link href="/auth/register" className="text-[#1A6EFF] font-medium">
                {t("auth.login.register")}
              </Link>
            </p>
          </div>
        )}

        <p className="mt-auto pt-8 text-center text-[11px] text-slate-300">
          {t("auth.login.agreement")}
        </p>
      </div>
    </div>
  );
}
