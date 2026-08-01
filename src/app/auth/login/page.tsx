"use client";

import { useState, useEffect } from "react";
import { BrandMark } from "@/components/ui/BrandMark";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TopHeader } from "@/components/ui/TopHeader";
import { CodeInput } from "@/components/ui/CodeInput";
import { PasswordField } from "@/components/auth/PasswordField";
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

export default function LoginPage() {
  const router = useRouter();
  const { t, lang } = useLang();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<IntentTab>("customer");
  /** 已登录但非顾客（企业/店员）— 顾客活动回流时需先退出 */
  const [blockingSession, setBlockingSession] = useState<{
    role: string;
    name?: string | null;
  } | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const q = searchParams.get("tab");
    if (q === "customer" || q === "business" || q === "admin") {
      setTab(q);
    } else if (searchParams.get("intent") === "customer") {
      setTab("customer");
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const j = await res.json();
        const u = j.data;
        if (!u?.role || cancelled) return;
        if (u.role === "customer") {
          // 已是顾客：直接回 redirect
          const redirect = safeRedirectPath(searchParams.get("redirect"));
          window.location.assign(redirect || "/home");
          return;
        }
        // 企业/店员/管理员占着 session，又从顾客活动进来 → 提示切换
        const intent =
          searchParams.get("tab") || searchParams.get("intent") || "customer";
        const redirect = safeRedirectPath(searchParams.get("redirect"));
        const customerFlow =
          intent === "customer" ||
          (redirect &&
            (/^\/(ndp|voucher|join|activity|store|shop|coupons|wallet|home|redeem|balance|card)/.test(
              redirect
            ) ||
              redirect.startsWith("/c/")));
        if (customerFlow) {
          setBlockingSession({
            role: u.role,
            name: u.businessName || u.displayName || u.phone || u.email,
          });
          setTab("customer");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // admin 默认验证码；客户/商家默认密码
  const [mode, setMode] = useState<Mode>("password");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // 客户 / 商家默认勾选「记住」，避免误关导致很快掉线
  const [rememberMe, setRememberMe] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingRole, setPendingRole] = useState<string>("customer");
  /** 本地非 live 时 API 返回的验证码，页面直接展示 */
  const [devCode, setDevCode] = useState<string | null>(null);

  async function logoutForCustomer() {
    setSwitching(true);
    setError("");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setBlockingSession(null);
      // 清 session 后留在登录页，继续顾客登录
      const qs = new URLSearchParams();
      qs.set("tab", "customer");
      qs.set("intent", "customer");
      const r = searchParams.get("redirect");
      if (r) qs.set("redirect", r);
      window.location.assign(`/auth/login?${qs.toString()}`);
    } catch {
      setError(lang === "en" ? "Logout failed" : "退出失败，请重试");
      setSwitching(false);
    }
  }

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
    // 客户 / 商家默认都勾选记住；仅管理员走短会话
    setRememberMe(next !== "admin");
  }

  function goHome(role: string) {
    const redirect = safeRedirectPath(searchParams.get("redirect"));
    // 企业/店员登录：不要带进顾客活动页当「已登录顾客」；回角色首页
    // 顾客登录：优先回 redirect（NDP / 钱包等）
    let dest = roleHome(role);
    if (role === "customer" && redirect) {
      dest = redirect;
    } else if (
      (role === "business" || role === "staff") &&
      redirect &&
      !/^\/(ndp|voucher|join|activity|wallet|home|redeem|balance|card)/.test(
        redirect
      ) &&
      !redirect.startsWith("/c/")
    ) {
      dest = redirect;
    }
    // 硬跳转：避免 iOS 键盘放大后 soft navigate 视口仍缩放、布局错乱
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
      window.location.assign(dest);
      return;
    }
    router.push(dest);
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
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-slate-50 via-white to-white overflow-x-hidden overflow-y-auto touch-manipulation">
      <TopHeader variant="default" fallbackUrl="/" preferFallback />

      <div className="flex-1 flex flex-col px-5 pt-4 pb-10 max-w-md mx-auto w-full min-w-0 box-border">
        {/* Brand */}
        <div className="text-center mb-5">
          <div className="mx-auto mb-3 flex justify-center">
            <BrandMark
              size={56}
              priority
              className="shadow-lg ring-2 ring-[#240444]/15"
            />
          </div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-600 dark:text-amber-400/90 uppercase">
            WeMembers.store
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
            {t("auth.login.title")}
          </h1>
          {!inSetPasswordFlow && (
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
          )}
        </div>

        {/* Role tabs */}
        {!blockingSession && !inSetPasswordFlow && (
          <div
            className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1"
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
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground/90"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {blockingSession && (
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm">
            <p className="font-semibold text-amber-950">
              {lang === "en"
                ? "Business account is signed in"
                : "当前是企业 / 店员账号"}
            </p>
            <p className="text-xs text-amber-900/85 mt-1 leading-relaxed">
              {lang === "en"
                ? `${blockingSession.name || blockingSession.role} cannot claim customer rewards. Sign out, then log in with a customer mobile number.`
                : `${blockingSession.name || blockingSession.role} 不能领取顾客活动权益。请先退出，再用顾客手机号登录。`}
            </p>
            <div className="flex flex-col gap-2 mt-3">
              <Button
                className="w-full rounded-full h-11"
                loading={switching}
                onClick={logoutForCustomer}
              >
                {lang === "en"
                  ? "Sign out · continue as customer"
                  : "退出企业账号 · 以顾客身份继续"}
              </Button>
              {safeRedirectPath(searchParams.get("redirect")) && (
                <Link
                  href={safeRedirectPath(searchParams.get("redirect"))!}
                  className="text-center text-xs font-medium text-muted-foreground"
                >
                  {lang === "en" ? "Back to activity" : "返回活动页"}
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Card：min-w-0 防止键盘弹起时横向撑破 */}
        {!blockingSession && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm min-w-0 w-full">
          {/* 密码登录：客户 / 商家 */}
          {showPasswordForm && (
            <>
              <Input
                label={t("auth.login.phone")}
                placeholder={t("auth.login.placeholder")}
                type="text"
                autoComplete="username"
                inputMode="email"
                enterKeyHint="next"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="h-12 rounded-xl text-base"
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
                <span className="text-sm text-foreground/90 leading-snug">
                  {tab === "customer"
                    ? t("auth.login.rememberCustomer")
                    : t("auth.login.rememberBusiness")}
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {tab === "customer"
                      ? t("auth.login.rememberHintCustomer")
                      : t("auth.login.rememberHintBusiness")}
                  </span>
                </span>
              </label>

              {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{t("auth.login.hint")}</p>
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
                <div className="mb-3 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-100 dark:border-amber-800/50 px-3 py-2.5">
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
                  <span className="text-sm text-foreground/90 leading-snug">
                    {tab === "customer"
                      ? t("auth.login.rememberCustomer")
                      : t("auth.login.rememberBusiness")}
                  </span>
                </label>
              )}
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{t("auth.login.codeHint")}</p>
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
              <div className="rounded-xl bg-muted/50 border border-border px-3 py-3 mb-5">
                <p className="text-xs text-muted-foreground">{t("auth.register.codeSent")}</p>
                <p className="mt-0.5 text-sm font-medium text-foreground break-all">
                  {normalizedContact}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">{t("auth.login.codeHint")}</p>
              </div>
              {devCode && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/35 px-3 py-3">
                  <p className="text-[11px] font-medium text-amber-800">
                    本地开发 · 未真发短信
                  </p>
                  <p className="mt-1 text-center text-2xl font-bold tracking-[0.35em] text-amber-900">
                    {devCode}
                  </p>
                  <p className="mt-1 text-center text-[11px] text-amber-700 dark:text-amber-400">
                    请输入上方 6 位验证码
                  </p>
                </div>
              )}
              <CodeInput length={6} onComplete={handleVerify} error={error} />
              {loading && (
                <p className="mt-3 text-center text-xs text-muted-foreground">{t("auth.login.verifying")}</p>
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
                <p className="text-sm text-muted-foreground">
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
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/35 text-xl">
                🔐
              </div>
              <h2 className="text-lg font-semibold text-foreground">{t("auth.login.setPwTitle")}</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed px-1">
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
                className="mt-3 w-full text-sm font-medium text-muted-foreground hover:text-foreground/90"
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
                className="mt-3 w-full text-sm font-medium text-muted-foreground"
                onClick={() => goHome(pendingRole)}
              >
                {t("auth.login.setPwSkip")}
              </button>
            </>
          )}
        </div>
        )}

        {!blockingSession && !inSetPasswordFlow && (
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t("auth.login.noAccount")}{" "}
              <Link
                href={`/auth/register?tab=customer&intent=customer${
                  searchParams.get("redirect")
                    ? `&redirect=${encodeURIComponent(searchParams.get("redirect")!)}`
                    : ""
                }`}
                className="text-[#1A6EFF] font-medium"
              >
                {t("auth.login.register")}
              </Link>
            </p>
          </div>
        )}

        <p className="mt-auto pt-8 text-center text-[11px] text-muted-foreground">
          {t("auth.login.agreement")}
        </p>
      </div>
    </div>
  );
}
