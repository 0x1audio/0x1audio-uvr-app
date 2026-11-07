import { useEffect, useRef, useState } from "react"
import { host } from "@0x1audio/sdk/page"

export function useDrop(onPaths: (paths: string[]) => void, onProblem: (message: string) => void) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const latest = useRef({ onPaths, onProblem })
  latest.current = { onPaths, onProblem }

  useEffect(() => {
    const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") === true
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth.current += 1
      setDragging(true)
    }
    const over = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
    }
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    const drop = (event: DragEvent) => {
      event.preventDefault()
      depth.current = 0
      setDragging(false)
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (!files.length) return
      const bridge = host()
      if (!bridge?.pathFor) {
        latest.current.onProblem("Update 0x1audio to drop files here, or use Choose audio.")
        return
      }
      const paths = files.map((file) => bridge.pathFor?.(file) ?? "").filter(Boolean)
      if (paths.length) latest.current.onPaths(paths)
    }
    window.addEventListener("dragenter", enter)
    window.addEventListener("dragover", over)
    window.addEventListener("dragleave", leave)
    window.addEventListener("drop", drop)
    return () => {
      window.removeEventListener("dragenter", enter)
      window.removeEventListener("dragover", over)
      window.removeEventListener("dragleave", leave)
      window.removeEventListener("drop", drop)
    }
  }, [])

  return dragging
}

export function basename(path: string) {
  return path.split(/[/\\]/).pop() ?? path
}
