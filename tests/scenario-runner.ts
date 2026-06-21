#!/usr/bin/env npx tsx
/**
 * YAML Scenario Test Runner
 * 读取 YAML 场景文件，通过 HTTP API + DB peek 执行完整业务旅程。
 *
 * Step types:
 *   api        — HTTP 请求
 *   db         — Prisma 查询（读验证码、验证数据库状态）
 *   sleep      — 等待 ms
 *   log        — 仅打印
 *
 * Variable resolution: ${varName} 在所有字段中自动替换
 * Variable capture:   api.set / db.set 从响应中提取变量
 *
 * Usage: npx tsx tests/scenario-runner.ts [scenario-file]
 */
import yaml from "js-yaml";
import fs from "fs";
import path from "path";

const BASE = process.env.TEST_BASE || "http://localhost:3000";

// ── Types ──

interface ApiStep {
  method: string; path: string; body?: any; cookie?: string; expect: number;
}

interface DbStep {
  model: string;                // "verificationCode", "voucher", "campaign"...
  method: string;               // "findFirst", "findMany", "findUnique"
  args: Record<string, any>;
  expectField?: string;         // 断言：该字段必须存在
  expectValue?: any;            // 断言：该字段必须等于此值
}

interface Step {
  name: string;
  api?: ApiStep;
  db?: DbStep;
  set?: Record<string, string>;  // { varName: "$.data.field" }
  sleep?: number;
  log?: string;
}

interface Scenario {
  name: string;
  description: string;
  steps: Step[];
}

// ── State ──

const pass: string[] = [];
const fail: string[] = [];
const vars: Record<string, string> = {};

// ── Var resolution ──

function resolveVars(template: string): string {
  return template.replace(/\$\{(\w+)\}/g, (_, key) => vars[key] ?? `\$\{${key}\}`);
}

function resolveObj(obj: any, visited = new Set<any>()): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return resolveVars(obj);
  if (Array.isArray(obj)) {
    if (visited.has(obj)) return obj;
    visited.add(obj);
    return obj.map((v) => resolveObj(v, visited));
  }
  if (typeof obj === "object") {
    if (visited.has(obj)) return obj;
    visited.add(obj);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = resolveObj(v, visited);
    }
    return out;
  }
  return obj;
}

// ── JSON path ──

function jsonPath(obj: any, jpath: string): any {
  const parts = jpath.replace(/^\$\.?/, "").split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur === undefined || cur === null) return undefined;
    if (p === "length") return Array.isArray(cur) ? cur.length : undefined;
    cur = cur[p];
  }
  return cur;
}

// ── Prisma ──

let _prisma: any = null;
function prisma(): any {
  if (!_prisma) {
    const { PrismaClient } = require("@prisma/client");
    _prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || "file:./dev.db" } },
    });
  }
  return _prisma;
}

// ── API call ──

async function apiCall(method: string, rawPath: string, rawBody?: any, cookie?: string): Promise<Response> {
  const resolvedPath = resolveVars(rawPath);
  const body = rawBody ? resolveObj(rawBody) : undefined;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = `gwm_token=${resolveVars(cookie)}`;

  const init: RequestInit = { method, headers, redirect: "manual" as RequestRedirect };
  if (body) init.body = JSON.stringify(body);

  return fetch(`${BASE}${resolvedPath}`, init);
}

// ── Main runner ──

async function runScenario(filePath: string) {
  const content = fs.readFileSync(filePath, "utf8");
  const scenario = yaml.load(content) as Scenario;

  console.log(`\n📋 ${scenario.name}`);
  console.log(`   ${scenario.description}\n`);

  for (const step of scenario.steps) {
    const label = step.name;
    try {
      // ── Sleep ──
      if (step.sleep) {
        await new Promise((r) => setTimeout(r, step.sleep));
      }

      // ── API step ──
      if (step.api) {
        const { method, path: apiPath, body, cookie, expect: expectStatus } = step.api;
        const res = await apiCall(method, apiPath, body, cookie);
        let json: any = null;
        try {
          const text = await res.text();
          try { json = JSON.parse(text); } catch { json = text; }
        } catch {
          json = "<empty>";
        }

        if (res.status !== expectStatus) {
          const detail = typeof json === "string" ? json : JSON.stringify(json).slice(0, 200);
          throw new Error(`Expected ${expectStatus}, got ${res.status}: ${detail}`);
        }

        // Save variables from response (json-path)
        if (step.set && typeof json === "object") {
          for (const [varName, jpath] of Object.entries(step.set)) {
            const val = jsonPath(json, jpath);
            if (val !== undefined && val !== null) {
              vars[varName] = String(val);
            }
          }
        }

        // Auto-save common fields
        if (json?.data?.id) vars.lastId = String(json.data.id);
        if (json?.data?.token) vars.lastToken = String(json.data.token);
      }

      // ── DB step ──
      if (step.db) {
        const { model, method, args, expectField, expectValue } = step.db;
        const resolvedArgs = resolveObj(args);
        const p = prisma();
        const rows = await p[model][method](resolvedArgs);

        if (expectField) {
          // 单条记录检查字段
          const record = Array.isArray(rows) ? rows[0] : rows;
          const val = record?.[expectField];
          if (val === undefined || val === null) {
            throw new Error(`DB field '${expectField}' not found in ${model}.${method}`);
          }
          if (expectValue !== undefined && String(val) !== String(expectValue)) {
            throw new Error(`DB field '${expectField}' expected '${expectValue}', got '${val}'`);
          }
          // 存入变量
          if (step.db.set) {
            for (const [varName, fieldName] of Object.entries(step.db.set)) {
              const v = record[fieldName];
              if (v !== undefined && v !== null) vars[varName] = String(v);
            }
          }
        }

        if (step.db.set && !expectField) {
          // 从数组结果中提取
          const arr = Array.isArray(rows) ? rows : [rows].filter(Boolean);
          for (const [varName, fieldName] of Object.entries(step.db.set)) {
            const v = arr[0]?.[fieldName];
            if (v !== undefined && v !== null) vars[varName] = String(v);
          }
        }
      }

      // ── Log step ──
      if (step.log) {
        console.log(`   ℹ️  ${resolveVars(step.log)}`);
      }

      pass.push(`${scenario.name} → ${label}`);
      console.log(`   ✅ ${label}`);
    } catch (e: any) {
      fail.push(`${scenario.name} → ${label}`);
      console.log(`   ❌ ${label}: ${e.message?.slice(0, 200)}`);
    }
  }
}

// ── Entry ──

async function main() {
  // 每次运行生成唯一 ID，避免 slug/phone 冲突
  vars.RUN = Date.now().toString(36);

  console.log("\n🧪 WeMembers YAML Scenario Tests\n");
  console.log(`Server: ${BASE}`);

  const scenarioDir = path.resolve(__dirname, "scenarios");
  const target = process.argv[2];

  let files: string[];
  if (target) {
    const fp = path.isAbsolute(target) ? target : path.resolve(target);
    if (!fs.existsSync(fp)) { console.error(`File not found: ${fp}`); process.exit(1); }
    files = [fp];
  } else {
    files = fs.readdirSync(scenarioDir)
      .filter(f => f.endsWith(".yaml") || f.endsWith(".yml"))
      .sort()
      .map(f => path.join(scenarioDir, f));
  }

  if (files.length === 0) {
    console.log("No scenario files found.");
    process.exit(0);
  }

  for (const f of files) {
    await runScenario(f);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ✅ ${pass.length} passed`);
  console.log(`  ❌ ${fail.length} failed`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (fail.length > 0) {
    console.log("Failures:");
    fail.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }

  console.log("All scenario tests passed! 🎉\n");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
