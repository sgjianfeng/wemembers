import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  // Playwright E2E specs are run via `npx playwright test`, not Jest
  testPathIgnorePatterns: ["<rootDir>/tests/e2e/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // jose v6 / node-fetch are pure ESM — transform them (and only them) from node_modules
  transformIgnorePatterns: ["/node_modules/(?!jose|node-fetch)"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  transform: {
    // Include .js so jose v6 (pure ESM, in node_modules) gets transpiled by ts-jest
    "^.+\\.(ts|tsx|js|jsx)$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  // Schema push runs once here instead of racing per-file beforeAll
  globalSetup: "<rootDir>/tests/global-setup.ts",
  globalTeardown: "<rootDir>/tests/global-teardown.ts",
  testTimeout: 30000,
};

export default config;
