import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Phase 9: explicit dev-auth bypass for the pre-existing suites that
    // authenticate via `x-dev-user-id`. Test-only (vitest forces
    // NODE_ENV=test); production ignores AUTH_DEV_BYPASS and fails closed.
    // New auth tests unset/restore this flag to verify 401 behavior.
    env: {
      AUTH_DEV_BYPASS: "true",
    },
  },
});
