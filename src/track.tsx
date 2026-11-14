/*
  The player card for one sound: its waveform, a play button and where it is.
  From Mixel's design system (Apache-2.0), which doesn't export it from
  @ox1audio/design-system yet. When it does, this file goes.
*/
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { ClockIcon, PauseIcon, PlayIcon } from "@phosphor-icons/react"
import { Badge, cn, type Wave } from "@ox1audio/design-system"

function clock(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const remain = total % 60
  return `${minutes}:${remain.toString().padStart(2, "0")}`
}

export function Track({
  label,
  file,
  wave,
  src,
  empty,
  progress,
  className,
}: {
  label: string
  file?: string
  wave?: Wave | null
  src?: string | null
  empty: string
  progress?: { value: number; label: string } | null
  className?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const audio = useRef<HTMLAudioElement>(null)
  const id = useId()
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const peaks = wave?.peaks
  const seconds = wave?.seconds ?? 0
  const place = playing || at > 0 ? (seconds > 0 ? Math.min(1, at / seconds) : 0) : 1

  useEffect(() => {
    setPlaying(false)
    setAt(0)
  }, [src])

  useEffect(() => {
    const node = canvas.current
    if (!node || progress) return
    const draw = () => paint(node, peaks ?? [], place)
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(node)
    const theme = new MutationObserver(draw)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    media.addEventListener("change", draw)
    return () => {
      observer.disconnect()
      theme.disconnect()
      media.removeEventListener("change", draw)
    }
  }, [peaks, place, progress])

  useEffect(() => {
    const onPlay = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail === id) return
      const node = audio.current
      if (!node || node.paused) return
      node.pause()
      setPlaying(false)
    }
    window.addEventListener("track-play", onPlay)
    return () => window.removeEventListener("track-play", onPlay)
  }, [id])

  function toggle() {
    const node = audio.current
    if (!node) return
    if (!node.paused) {
      node.pause()
      setPlaying(false)
      return
    }
    window.dispatchEvent(new CustomEvent("track-play", { detail: id }))
    void node.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }

  function seek(event: ReactPointerEvent<HTMLDivElement>) {
    const node = audio.current
    if (!node || !seconds) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    node.currentTime = ratio * (Number.isFinite(node.duration) ? node.duration : seconds)
    setAt(node.currentTime)
  }

  if (progress) {
    const value = Math.min(100, Math.max(0, progress.value))
    return (
      <section className={cn("relative min-h-44 overflow-hidden rounded-xl bg-card @container", className)} aria-label={progress.label}>
        <p className="flex min-h-44 items-center justify-center px-6 text-center text-body font-medium text-foreground">{progress.label}</p>
        <div
          className="absolute inset-y-0 left-0 overflow-hidden bg-foreground transition-[width] duration-500 ease-out"
          style={{ width: `${value}%` }}
        >
          {/* ds-exception: 100cqw keeps the label centred on the whole bar while it is clipped */}
          <p className="flex min-h-44 w-[100cqw] items-center justify-center px-6 text-center text-body font-medium text-card">{progress.label}</p>
        </div>
      </section>
    )
  }

  return (
    <section className={cn("relative flex flex-col gap-3 rounded-xl bg-card px-4 py-4", className)}>
      <div className="flex items-center gap-3 pr-16">
        <h2 className="shrink-0 text-body font-medium">{label}</h2>
        {file ? <p className="min-w-0 truncate text-body text-muted-foreground">{file}</p> : null}
      </div>
      {seconds > 0 ? (
        <Badge className="absolute top-3.5 right-3 z-10 gap-1 bg-secondary text-secondary-foreground">
          <ClockIcon size={12} />
          {clock(seconds)}
        </Badge>
      ) : null}
      {peaks?.length ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground disabled:opacity-40"
            aria-label={playing ? `Pause ${label}` : `Play ${label}`}
            disabled={!src}
            onClick={toggle}
          >
            {playing ? <PauseIcon size={16} weight="fill" /> : <PlayIcon size={16} weight="fill" />}
          </button>
          <span className="w-10 shrink-0 text-right text-caption tabular-nums text-muted-foreground">{clock(at)}</span>
          <div
            className="relative h-16 min-w-0 flex-1"
            onPointerDown={(event) => {
              if (!src) return
              event.currentTarget.setPointerCapture(event.pointerId)
              seek(event)
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
              seek(event)
            }}
          >
            <canvas ref={canvas} className="size-full text-foreground" role="img" aria-label={label} />
          </div>
        </div>
      ) : (
        <div className="flex h-16 items-center justify-center px-6 text-center text-body text-muted-foreground">{empty}</div>
      )}
      {src ? (
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onTimeUpdate={(event) => setAt(event.currentTarget.currentTime)}
          onEnded={() => {
            setPlaying(false)
            setAt(0)
          }}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
        />
      ) : null}
    </section>
  )
}

function paint(node: HTMLCanvasElement, peaks: number[], played = 1) {
  const rect = node.getBoundingClientRect()
  const width = Math.max(1, Math.floor(rect.width))
  const height = Math.max(1, Math.floor(rect.height))
  const ratio = window.devicePixelRatio || 1
  if (node.width !== Math.floor(width * ratio) || node.height !== Math.floor(height * ratio)) {
    node.width = Math.floor(width * ratio)
    node.height = Math.floor(height * ratio)
  }
  const context = node.getContext("2d")
  if (!context) return
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)
  const style = getComputedStyle(node)
  const ink = style.color
  // ds-exception: canvas fallback for when the token can't be read
  const quiet = style.getPropertyValue("--muted-foreground").trim() || "rgba(255,255,255,0.35)"
  const mid = height / 2
  if (!peaks.length) return
  const gap = 2
  const bar = Math.max(1, (width - gap * (peaks.length - 1)) / peaks.length)
  const heard = Math.round(played * peaks.length)
  peaks.forEach((peak, index) => {
    const body = Math.max(2, peak * (height - 6))
    const x = index * (bar + gap)
    context.fillStyle = index < heard ? ink : quiet
    context.beginPath()
    context.roundRect(x, mid - body / 2, Math.max(1, bar - 0.5), body, 1)
    context.fill()
  })
}
