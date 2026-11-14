import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Toaster, followSystemTheme } from "@ox1audio/design-system"

import { App } from "./App.tsx"
import "./index.css"

followSystemTheme()

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
      <Toaster />
    </StrictMode>,
  )
}
