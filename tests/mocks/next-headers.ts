/**
 * Mock for `next/headers` — provides an in-memory cookie store so route
 * handlers (register/login/verify-code → issueSession → setSession) work
 * in Jest without a real Next.js request scope.
 */
const store = new Map<string, { value: string; options: Record<string, unknown> }>();

export const cookies = () => ({
  get: (name: string) => {
    const c = store.get(name);
    return c ? { name, value: c.value } : undefined;
  },
  set: (name: string, value: string, options: Record<string, unknown> = {}) => {
    store.set(name, { value, options });
  },
  getAll: () =>
    Array.from(store.entries()).map(([name, c]) => ({ name, value: c.value })),
  delete: (name: string) => {
    store.delete(name);
  },
});

/** Test helper: reset the cookie store between tests */
export const __resetCookies = () => store.clear();
