import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        editor: resolve(import.meta.dirname, "index.html"),
        imageTool: resolve(import.meta.dirname, "image-tool.html"),
      },
    },
  },
});
