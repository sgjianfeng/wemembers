import path from "path";

/**
 * Worker-isolated test DB path.
 * Jest runs test files across parallel workers; each worker gets its own
 * SQLite file so files never pollute each other's data.
 */
export function getTestDbPath(): string {
  const workerId = process.env.JEST_WORKER_ID || "0";
  return path.resolve(__dirname, `../prisma/test-${workerId}.db`);
}

// Test environment setup
process.env.DATABASE_URL = "file:" + getTestDbPath();
process.env.JWT_SECRET = "test-secret-minimum-32-characters-long!!";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

// Route handlers call cookies()/issueSession — provide an in-memory cookie
// store instead of throwing "outside a request scope".
jest.mock("next/headers", () => require("./mocks/next-headers"));
// Vonage SDK pulls ESM-only transitive deps; SMS is gated by shouldLogOnly anyway.
jest.mock("@vonage/server-sdk", () => require("./mocks/vonage-server-sdk"));
jest.mock("@vonage/messages", () => require("./mocks/vonage-messages"));

import { PrismaClient } from "@prisma/client";
import { __resetCookies } from "./mocks/next-headers";

const prisma = new PrismaClient();

beforeAll(async () => {
  // Push schema to this worker's own test DB (fresh per worker, no cross-worker races)
  const { execSync } = require("child_process");
  execSync(`npx prisma db push --force-reset --skip-generate`, {
    env: { ...process.env, DATABASE_URL: "file:" + getTestDbPath() },
    stdio: "pipe",
  });
});

beforeEach(() => {
  __resetCookies();
});

afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };
