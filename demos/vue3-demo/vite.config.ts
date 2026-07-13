import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  build: {
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  plugins: [vue()],
  server: {
    proxy: {
      "/api/lapp/token/get": {
        target: "https://open.ys7.com",
        changeOrigin: true,
      },
    },
  },
});
