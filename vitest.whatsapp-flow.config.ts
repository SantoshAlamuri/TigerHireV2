import path from "node:path";
import { defineConfig } from "vitest/config";

/** Isolated config so `npm run test:unit` does not pick up the WhatsApp E2E script. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/test-whatsapp-flow.ts"],
    setupFiles: [],
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
