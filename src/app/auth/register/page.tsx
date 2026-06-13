"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CodeInput } from "@/components/ui/CodeInput";
import { SERVICE_CATEGORIES } from "@/types";

type Step = "role" | "contact" | "code" | "info";

export default function RegisterPage() {
  const router = useRouter();
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
      setError("请输入手机号或邮箱");
      return;
    }
    if (role === "business" && !isEmail) {
      setError("企业用户请使用邮箱注册");
      return;
    }
    if (role === "customer" && isEmail) {
      setError("客户请使用手机号注册");
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
      setError(data.error || "发送失败");
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
      setError(data.error || "注册失败");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex-1 flex flex-col justify-center px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">创建账号</h1>
          <p className="text-sm text-slate-500 mt-1">加入 WeMembers</p>
        </div>

        {step === "role" && (
          <>
            <p className="text-sm text-slate-600 mb-4">选择你的身份</p>
            <div className="space-y-3">
              <button
                onClick={() => setRole("customer")}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                  role === "customer"
                    ? "border-[#1A6EFF] bg-blue-50"
                    : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <p className="font-medium text-slate-900">🙋 我是客户</p>
                <p className="text-xs text-slate-500 mt-0.5">领取代金券，享受优惠</p>
              </button>
              <button
                onClick={() => setRole("business")}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                  role === "business"
                    ? "border-[#1A6EFF] bg-blue-50"
                    : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <p className="font-medium text-slate-900">🏢 我是商家</p>
                <p className="text-xs text-slate-500 mt-0.5">管理会员，发布代金券</p>
              </button>
            </div>
            <Button className="w-full mt-6" size="lg" onClick={() => setStep("contact")}>
              下一步
            </Button>
          </>
        )}

        {step === "contact" && (
          <>
            <Input
              label={role === "business" ? "企业邮箱" : "手机号"}
              placeholder={role === "business" ? "name@company.com" : "请输入手机号"}
              type={role === "business" ? "email" : "tel"}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              error={error}
            />
            {role === "business" && (
              <>
                <Input
                  label="企业名称"
                  placeholder="如：星巴克咖啡"
                  className="mt-3"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
                <div className="mt-3">
                  <label className="block text-sm font-medium text-slate-700 mb-1">行业分类</label>
                  <select
                    value={businessCategory}
                    onChange={(e) => setBusinessCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6EFF]"
                  >
                    <option value="">请选择</option>
                    {SERVICE_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label="设置密码 (可选)"
                  type="password"
                  placeholder="留空则仅使用验证码登录"
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
              获取验证码
            </Button>
            <button
              className="w-full text-center text-sm text-slate-400 mt-3"
              onClick={() => setStep("role")}
            >
              ← 返回
            </button>
          </>
        )}

        {step === "code" && (
          <>
            <p className="text-sm text-slate-600 text-center mb-6">
              验证码已发送至 <span className="font-medium">{contact}</span>
            </p>
            <CodeInput length={6} onComplete={handleVerifyAndRegister} error={error} />
            <div className="text-center mt-6 space-y-3">
              <button
                className="text-sm text-slate-400"
                onClick={() => setStep("contact")}
              >
                ← 修改信息
              </button>
              <p className="text-sm text-slate-400">
                未收到？{" "}
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
    </div>
  );
}
