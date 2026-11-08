import path from "node:path"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

const root = import.meta.dirname

export default defineConfig({
  plugins: [react()],
  envDir: path.join(root, "tests/env"),
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": path.join(root, "tests/helpers/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**"],
  },
})
