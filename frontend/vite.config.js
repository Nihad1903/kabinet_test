import { defineConfig } from "vite";

const kabinet = "http://127.0.0.1:8001";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/login": kabinet,
      "/logout": kabinet,
      "/me": kabinet,
      "/health": kabinet,
      "/students": kabinet,
      "/ai": kabinet,
    },
  },
  build: {
    outDir: "dist",
  },
});
