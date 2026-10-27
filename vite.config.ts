import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react({ exclude: /node_modules\/(?!@0x1audio\/design-system)/ }),
    tailwindcss(),
    {
      name: "file-protocol",
      transformIndexHtml(html) {
        return html.replaceAll(" crossorigin", "")
      },
    },
  ],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})
