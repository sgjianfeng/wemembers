import fs from "fs";
import path from "path";

/**
 * Jest globalSetup — runs ONCE before all test workers.
 * Schema push now happens per-worker in tests/setup.ts (worker-isolated DBs),
 * so this only removes stale per-worker DB files from previous runs.
 */
export default function globalSetup(): void {
  const dir = path.resolve(__dirname, "../prisma");
  for (const f of fs.readdirSync(dir)) {
    if (/^test-\d+\.db(-journal)?$/.test(f)) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {}
    }
  }
}
