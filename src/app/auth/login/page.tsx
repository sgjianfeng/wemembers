"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CodeInput } from "@/components/ui/CodeInput";

type Step = "phone" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [contact, setContact] = useState("");
  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSendCode() {
    if (!contact) {
      setError("请输入手机号或邮箱");
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact, purpose: "login" }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setStep("code");
    } else {
      setError(data.error || "发送失败");
    }
  }

  async function handleVerify(code: string) {
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact, code, purpose: "login" }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      const redirect = data.data.user.role === "admin"
        ? "/admin"
        : data.data.user.role === "business"
        ? "/business"
        : "/home";
      router.push(redirect);
    } else {
      setError(data.error || "验证失败");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex-1 flex flex-col justify-center px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-[#1A6EFF] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">WM</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">WeMembers</h1>
          <p className="text-sm text-slate-500 mt-1">会员 + 代金券，轻松管理</p>
        </div>

        {step === "phone" ? (
          <>
            <Input
              label="手机号或邮箱"
              placeholder="请输入手机号或邮箱"
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              error={error}
              onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
            />
            <Button
              className="w-full mt-4"
              size="lg"
              onClick={handleSendCode}
              loading={loading}
            >
              获取验证码
            </Button>
            <div className="mt-6 text-center">
              <p className="text-sm text-slate-400">
                还没有账号？{" "}
                <a href="/auth/register" className="text-[#1A6EFF] font-medium">
                  立即注册
                </a>
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600 text-center mb-6">
              验证码已发送至 <span className="font-medium">{contact}</span>
            </p>
            <CodeInput length={6} onComplete={handleVerify} error={error} />
            <div className="text-center mt-6 space-y-3">
              <button
                className="text-sm text-[#1A6EFF] font-medium"
                onClick={() => setStep("phone")}
              >
                ← 更换账号
              </button>
              <p className="text-sm text-slate-400">
                未收到验证码？{" "}
                <button
                  className="text-[#1A6EFF] font-medium"
                  onClick={handleSendCode}
                  disabled={loading}
                >
                  重新发送
                </button>
              </p>
            </div>
          </>
        )}
      </div>

      {/* Bottom */}
      <div className="px-6 pb-8 text-center">
        <p className="text-xs text-slate-300">
          登录即表示同意服务条款和隐私政策
        </p>
      </div>
    </div>
  );
}
