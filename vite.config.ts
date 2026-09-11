import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? "/market-microstructure-crisis-lab/" : "/",
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
