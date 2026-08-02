/**
 * Mock for @vonage/server-sdk — avoids pulling in ESM-only transitive deps
 * (node-fetch, data-uri-to-buffer, …) into Jest. SMS is gated by
 * shouldLogOnly() anyway and never really sent in tests.
 */
export class Vonage {
  constructor(_config: unknown) {}
  messages = {
    send: async () => ({ messageUUID: "mock-uuid" }),
  };
}
