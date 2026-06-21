#!/usr/bin/env npx tsx
/**
 * YAML Scenario Test Runner
 * 读取 YAML 场景文件，通过 HTTP API 执行完整业务旅程，验证端到端流程。
 * Usage: npx tsx tests/scenario-runner.ts [scenario-file]
 *        不指定文件则运行 tests/scenarios/ 下所有 .yaml
 */
import yaml from "js-yaml";
import fs from "fs";
import path from "path";

const BASE = process.env.TEST_BASE || "http://localhost:3000";

interface Step {
  name: string;
  api?: { method: string; path: string; body?: any; cookie?: string; expect: number };
  db?: { query: string; expect: (rows: any[]) => boolean | string };
  set?: Record<string, string>;     // { token: "$.data.token", campaignId: "$.data.id" }
  log?: string;
}

interface Scenario {
  name: string;
  description: string;
  setup?: { env: Record<string, string> };
  vars?: Record<string, string>;
  steps: Step[];
}

const pass: string[] = [];
const fail: string[] = [];
const vars: Record<string, string> = {};

// ── Variable resolution ──

function resolveVars(template: string): string {
  return template.replace(/\$\{(\w+)\}/g, (_, key) => {
    if (vars[key] !== undefined) return String(vars[key]);
    if (process.env[key] !== undefined) return String(process.env[key]);
    return `\$\{${key}\}`;
  });
}

function resolveObj(obj: any): any {
  if (typeof obj === "string") return resolveVars(obj);
  if (Array.isArray(obj)) return obj.map(resolveObj);
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = resolveObj(v);
    return out;
  }
  return obj;
}

// ── Helpers ──

async function apiCall(method: string, rawPath: string, rawBody?: any, cookie?: string): Promise<Response> {
  const rpath = resolveVars(rawPath);
  const body = rawBody ? resolveObj(rawBody) : undefined;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = `gwm_token=${resolveVars(cookie)}`;

  const init: RequestInit = { method, headers, redirect: "manual" as RequestRedirect };
  if (body) init.body = JSON.stringify(body);

  return fetch(`${BASE}${rpath}`, init);
}

function jsonPath(obj: any, jpath: string): any {
  // e.g. "$.data.token" → obj.data.token
  const parts = jpath.replace(/^\$\.?/, "").split(".");
  let cur = obj;
  for (const p of parts) {
    if (p === "" || cur === undefined || cur === null) return undefined;
    if (p === "length") return Array.isArray(cur) ? cur.length : undefined;
    cur = cur[p];
  }
  return cur;
}

// ── DB access (reuse dev.db like run-all.ts) ──

let _prisma: any = null;
function prisma(): any {
  if (!_prisma) {
    const { PrismaClient } = require("@prisma/client");
    _prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL || "file:./dev.db" } } });
  }
  return _prisma;
}

async function runDbQuery(query: string): Promise<any[]> {
  // 简化：query 是 Prisma 查询的 JSON 描述
  // 格式: "model.method" 如 "user.findMany"
  // 参数通过 vars 传递
  const p = prisma();
  const parts = query.split(".");
  if (parts.length !== 2) throw new Error(`Invalid DB query: ${query}`);

  const [model, method] = parts;
  const m = p[model];
  if (!m) throw new Error(`Model not found: ${model}`);

  try {
    // 使用 vars 中存储的 ID 作为查询参数
    return await m[method](resolveObj({
      where: { id: vars.lastCreatedId },
    }));
  } catch {
    // 不带 where 的查询
    return await m[method](resolveObj({}));
  }
}

// ── Main runner ──

async function runScenario(filePath: string) {
  const content = fs.readFileSync(filePath, "utf8");
  const scenario = yaml.load(content) as Scenario;

  console.log(`\n📋 ${scenario.name}`);
  console.log(`   ${scenario.description}\n`);

  // Setup env
  if (scenario.setup?.env) {
    for (const [k, v] of Object.entries(scenario.setup.env)) {
      process.env[k] = v;
    }
  }

  // Init vars
  if (scenario.vars) {
    for (const [k, v] of Object.entries(scenario.vars)) {
      vars[k] = String(v);
    }
  }

  for (const step of scenario.steps) {
    const label = step.name;
    try {
      // ── API step ──
      if (step.api) {
        const { method, path, body, cookie, expect: expectStatus } = step.api;
        const res = await apiCall(method, path, body, cookie);
        const json = await res.json();

        if (res.status !== expectStatus) {
          throw new Error(`Expected ${expectStatus}, got ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
        }

        // Save variables from response
        if (step.set) {
          for (const [varName, jpath] of Object.entries(step.set)) {
            const val = jsonPath(json, jpath);
            if (val !== undefined && val !== null) {
              vars[varName] = String(val);
            }
          }
        }

        // Store last created ID for DB steps
        if (json.data?.id) vars.lastCreatedId = json.data.id;
      }

      // ── DB step ──
      if (step.db) {
        const rows = await runDbQuery(step.db.query);
        const result = step.db.expect(rows);
        if (typeof result === "string") throw new Error(result);
        if (result === false) throw new Error(`DB assertion failed: ${JSON.stringify(rows).slice(0, 200)}`);
      }

      // ── Log step ──
      if (step.log) {
        console.log(`   ℹ️  ${resolveVars(step.log)}`);
      }

      pass.push(`${scenario.name} → ${label}`);
      console.log(`   ✅ ${label}`);
    } catch (e: any) {
      fail.push(`${scenario.name} → ${label}`);
      console.log(`   ❌ ${label}: ${e.message?.slice(0, 150)}`);
    }
  }
}

// ── Entry ──

async function main() {
  console.log("\n🧪 WeMembers YAML Scenario Tests\n");
  console.log(`Server: ${BASE}\n`);

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
