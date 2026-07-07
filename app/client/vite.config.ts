import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // shadcn/ui が要求する @/* エイリアス（tsconfig.json の paths と対応）
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Caddy(127.0.0.1:443) からの到達性を保証するため IPv4 ループバックに固定
    host: "127.0.0.1",
    proxy: { "/api": "http://127.0.0.1:3111" },
    // Caddy 経由（https://solo-eikaiwa）の Host ヘッダを許可
    allowedHosts: ["solo-eikaiwa", ".localhost"],
  },
});
