// Test environment setup
process.env.DATABASE_URL = "file:./test.db";
process.env.JWT_SECRET = "test-secret-minimum-32-characters-long!!";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

beforeAll(async () => {
  // Push schema to test database
  const { execSync } = require("child_process");
  execSync("npx prisma db push --force-reset --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  // Clean up test database
  try {
    require("fs").unlinkSync("prisma/test.db");
  } catch {}
});

export { prisma };
