import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    minify: "terser",
    cssMinify: true,
    rollupOptions: { input: "mcp-app.html" },
    outDir: "dist-ui",
    emptyOutDir: true,
  },
});
