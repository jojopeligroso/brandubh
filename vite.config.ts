import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Static SPA — no backend. `base: "./"` keeps asset paths relative so the
// build works on Vercel, Netlify, or a GitHub Pages subpath alike.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
