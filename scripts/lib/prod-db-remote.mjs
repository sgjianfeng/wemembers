/**
 * Runs ON the production server (via SSH / scp).
 *
 * Usage:
 *   node prod-db-remote.mjs summary
 *   node prod-db-remote.mjs dump --stamp 20260722-120000 --outdir /tmp/wemembers-prod-pull
 *   node prod-db-remote.mjs verify
 *
 * Reads DATABASE_URL from /var/www/wemembers/.env (never prints password).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REMOTE_ENV = process.env.WEMEMBERS_ENV || "/var/www/wemembers/.env";

function parseEnv() {
  const line = fs
    .readFileSync(REMOTE_ENV, "utf8")
    .split("\n")
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error(`DATABASE_URL missing in ${REMOTE_ENV}`);
  let url = line.slice("DATABASE_URL=".length).trim();
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1);
  }
  const m = url.match(
    /^postgresql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/([^?]+)/
  );
  if (!m) throw new Error("cannot parse DATABASE_URL");
  return { user: m[1], pass: m[2], host: m[3], port: m[4], db: m[5] };
}

/**
 * Host pg_dump is often older than the server (e.g. client 13 vs server 15).
 * Prefer pg tools inside the platform Postgres container when available.
 */
function pgTool(bin) {
  const container = process.env.PG_DOCKER_CONTAINER || "platform-postgres-1";
  try {
    execFileSync("docker", ["inspect", container], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return {
      mode: "docker",
      container,
      run(args, opts = {}) {
        const c = parseEnv();
        // Inside the DB container, connect via local socket / localhost
        const full = [
          "exec",
          "-e",
          `PGPASSWORD=${c.pass}`,
          container,
          bin,
          "-h",
          "127.0.0.1",
          "-U",
          c.user,
          "-d",
          c.db,
          ...args,
        ];
        return execFileSync("docker", full, {
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
          ...opts,
        });
      },
    };
  } catch {
    return {
      mode: "host",
      run(args, opts = {}) {
        const c = parseEnv();
        return execFileSync(
          bin,
          ["-h", c.host, "-p", c.port, "-U", c.user, "-d", c.db, ...args],
          {
            env: { ...process.env, PGPASSWORD: c.pass },
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024,
            ...opts,
          }
        );
      },
    };
  }
}

function psql(sql, { tuplesOnly = true } = {}) {
  const tool = pgTool("psql");
  const args = [];
  if (tuplesOnly) args.push("-t", "-A");
  args.push("-c", sql);
  return String(tool.run(args)).trim();
}

function pgDump(outPath, format) {
  const tool = pgTool("pg_dump");
  const c = parseEnv();
  // Custom format to a path *inside* the container, then docker cp out.
  // Plain SQL can stream to host file via docker exec stdout.
  if (tool.mode === "docker") {
    const container = tool.container;
    if (format === "custom") {
      const inner = `/tmp/wemembers-pull-${Date.now()}.dump`;
      execFileSync(
        "docker",
        [
          "exec",
          "-e",
          `PGPASSWORD=${c.pass}`,
          container,
          "pg_dump",
          "-h",
          "127.0.0.1",
          "-U",
          c.user,
          "-d",
          c.db,
          "--no-owner",
          "--no-acl",
          "-Fc",
          "-f",
          inner,
        ],
        { stdio: ["ignore", "inherit", "inherit"] }
      );
      execFileSync("docker", ["cp", `${container}:${inner}`, outPath], {
        stdio: ["ignore", "inherit", "inherit"],
      });
      execFileSync(
        "docker",
        ["exec", container, "rm", "-f", inner],
        { stdio: ["ignore", "ignore", "ignore"] }
      );
      return;
    }
    // plain SQL → host file via stdout redirect
    const sql = execFileSync(
      "docker",
      [
        "exec",
        "-e",
        `PGPASSWORD=${c.pass}`,
        container,
        "pg_dump",
        "-h",
        "127.0.0.1",
        "-U",
        c.user,
        "-d",
        c.db,
        "--no-owner",
        "--no-acl",
      ],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
    );
    fs.writeFileSync(outPath, sql);
    return;
  }

  const args = ["--no-owner", "--no-acl"];
  if (format === "custom") {
    args.push("-Fc", "-f", outPath);
    tool.run(args, { stdio: ["ignore", "inherit", "inherit"] });
  } else {
    args.push("-f", outPath);
    tool.run(args, { stdio: ["ignore", "inherit", "inherit"] });
  }
}

function countOrZero(sql) {
  try {
    return Number(psql(sql) || 0);
  } catch {
    return null;
  }
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

function cmdSummary() {
  const c = parseEnv();
  const size = psql(
    "SELECT pg_size_pretty(pg_database_size(current_database()));"
  );

  const tables = {};
  const tablesRaw = psql(`
    SELECT relname || E'\\t' || n_live_tup::text
    FROM pg_stat_user_tables
    ORDER BY relname;
  `);
  for (const line of tablesRaw.split("\n").filter(Boolean)) {
    const [name, n] = line.split("\t");
    tables[name] = Number(n || 0);
  }

  const roles = {};
  try {
    const r = psql(
      `SELECT role || E'\\t' || count(*)::text FROM "User" GROUP BY role ORDER BY role;`
    );
    for (const line of r.split("\n").filter(Boolean)) {
      const [role, n] = line.split("\t");
      roles[role] = Number(n || 0);
    }
  } catch (e) {
    roles._error = String(e.message || e);
  }

  const campaigns = {};
  try {
    const r = psql(`
      SELECT COALESCE(type, '(null)') || E'\\t' || COALESCE(status, '(null)') || E'\\t' || count(*)::text
      FROM "Campaign" GROUP BY type, status ORDER BY type, status;
    `);
    for (const line of r.split("\n").filter(Boolean)) {
      const [type, status, n] = line.split("\t");
      campaigns[`${type}/${status}`] = Number(n || 0);
    }
  } catch (e) {
    campaigns._error = String(e.message || e);
  }

  const business = {
    users: countOrZero(`SELECT count(*) FROM "User"`),
    stores: countOrZero(`SELECT count(*) FROM "Store"`),
    campaigns: countOrZero(`SELECT count(*) FROM "Campaign"`),
    vouchers: countOrZero(`SELECT count(*) FROM "Voucher"`),
    voucherActive: countOrZero(
      `SELECT count(*) FROM "Voucher" WHERE status = 'active'`
    ),
    memberships: countOrZero(`SELECT count(*) FROM "Membership"`),
    redemptions: countOrZero(`SELECT count(*) FROM "RedemptionLog"`),
    tokenAccounts: countOrZero(`SELECT count(*) FROM "TokenAccount"`),
    tokenBalanceSum: countOrZero(
      `SELECT COALESCE(sum(balance),0) FROM "TokenAccount"`
    ),
    physicalTickets: countOrZero(`SELECT count(*) FROM "PhysicalTicket"`),
    settlements: countOrZero(`SELECT count(*) FROM "Settlement"`),
    verificationCodes: countOrZero(`SELECT count(*) FROM "VerificationCode"`),
  };

  const result = {
    at: new Date().toISOString(),
    source: { host: c.host, port: c.port, db: c.db, user: c.user },
    size,
    roles,
    campaigns,
    business,
    tables,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

function cmdDump() {
  const stamp =
    argValue("--stamp") ||
    new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);
  const outdir = argValue("--outdir") || "/tmp/wemembers-prod-pull";

  fs.mkdirSync(outdir, { recursive: true });
  const custom = path.join(outdir, `wemembers-${stamp}.dump`);
  const sql = path.join(outdir, `wemembers-${stamp}.sql`);

  console.error(`dump custom → ${custom}`);
  pgDump(custom, "custom");
  console.error(`dump sql → ${sql}`);
  pgDump(sql, "plain");
  execFileSync("gzip", ["-f", sql], { stdio: "inherit" });

  const sqlGz = `${sql}.gz`;
  const result = {
    custom,
    sqlGz,
    customBytes: fs.statSync(custom).size,
    sqlGzBytes: fs.statSync(sqlGz).size,
    stamp,
  };
  process.stdout.write(JSON.stringify(result) + "\n");
}

const VERIFY_SQL = `
SELECT 'users_by_role' AS check_id, role AS k, count(*)::text AS v FROM "User" GROUP BY role
UNION ALL
SELECT 'users_status', status, count(*)::text FROM "User" GROUP BY status
UNION ALL
SELECT 'campaigns', COALESCE(type,'null') || '/' || COALESCE(status,'null'), count(*)::text FROM "Campaign" GROUP BY type, status
UNION ALL
SELECT 'vouchers_status', COALESCE(status,'null'), count(*)::text FROM "Voucher" GROUP BY status
UNION ALL
SELECT 'token_accounts', 'count', count(*)::text FROM "TokenAccount"
UNION ALL
SELECT 'token_balance_sum', 'sum', COALESCE(sum(balance),0)::text FROM "TokenAccount"
UNION ALL
SELECT 'stores', 'count', count(*)::text FROM "Store"
UNION ALL
SELECT 'memberships', 'count', count(*)::text FROM "Membership"
UNION ALL
SELECT 'settlements_status', COALESCE(status,'null'), count(*)::text FROM "Settlement" GROUP BY status
UNION ALL
SELECT 'orphan_vouchers', 'customer_missing', count(*)::text
  FROM "Voucher" v LEFT JOIN "User" u ON u.id = v."customerId" WHERE u.id IS NULL
UNION ALL
SELECT 'orphan_stores', 'business_missing', count(*)::text
  FROM "Store" s LEFT JOIN "User" u ON u.id = s."businessId" WHERE u.id IS NULL
UNION ALL
SELECT 'token_account_without_user', 'count', count(*)::text
  FROM "TokenAccount" t LEFT JOIN "User" u ON u.id = t."userId" WHERE u.id IS NULL
UNION ALL
SELECT 'users_without_token_account', 'business_or_customer', count(*)::text
  FROM "User" u
  LEFT JOIN "TokenAccount" t ON t."userId" = u.id
  WHERE u.role IN ('business','customer') AND t.id IS NULL
ORDER BY 1, 2;
`;

function cmdVerify() {
  const tool = pgTool("psql");
  const out = tool.run(["-c", VERIFY_SQL]);
  process.stdout.write(String(out));
}

const cmd = process.argv[2] || "summary";
if (cmd === "summary") cmdSummary();
else if (cmd === "dump") cmdDump();
else if (cmd === "verify") cmdVerify();
else {
  console.error("Usage: node prod-db-remote.mjs <summary|dump|verify>");
  process.exit(1);
}
