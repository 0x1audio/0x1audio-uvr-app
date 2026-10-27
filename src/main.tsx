import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { followSystemTheme } from "@0x1audio/design-system"

import { App } from "./App.tsx"
import "./index.css"

followSystemTheme()

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
