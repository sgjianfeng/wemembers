import fs from "fs";
import path from "path";

/** Jest globalTeardown — runs ONCE after all test workers finish. */
export default function globalTeardown(): void {
  const dir = path.resolve(__dirname, "../prisma");
  try {
    for (const f of fs.readdirSync(dir)) {
      if (/^test-\d+\.db(-journal)?$/.test(f)) {
        fs.unlinkSync(path.join(dir, f));
      }
    }
  } catch {}
}
