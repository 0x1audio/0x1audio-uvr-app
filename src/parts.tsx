import { useState, type CSSProperties, type ReactNode } from "react"
import { BooksIcon, DownloadSimpleIcon, FileAudioIcon, FolderSimpleIcon, WaveformIcon, XIcon } from "@phosphor-icons/react"
import { Button, EmptyState, LibraryDialog, Progress, Skeleton, cn, toast } from "@0x1audio/design-system"
import { ox } from "@0x1audio/sdk/page"

import { basename } from "./drop.ts"

// Shared by SonicDryer and Vocal Extractor. Keep the two copies the same.

// The first screen: nothing chosen yet. Choose a file or take one from the Library.
export function Intake({
  title,
  description,
  dragging,
  multiple = false,
  onChoose,
  children,
}: {
  title: string
  description: string
  dragging: boolean
  multiple?: boolean
  onChoose: (paths: string[]) => void
  children?: ReactNode
}) {
  const [library, setLibrary] = useState(false)

  async function browse() {
    if (!ox.available()) {
      toast.error("Reopen this app in 0x1audio.")
      return
    }
    const picked = await ox.files.pick({ multiple })
    if (picked.length) onChoose(multiple ? picked : picked.slice(0, 1))
  }

  return (
    <>
      <EmptyState
        className={cn("min-h-[22rem] flex-1 bg-card/40", dragging && "border-brand/60 bg-brand/5")}
        icon={<WaveformIcon />}
        title={title}
        description={description}
        actions={
          <>
            <Button onClick={() => void browse()}>
              <FileAudioIcon />
              {multiple ? "Choose files" : "Choose a file"}
            </Button>
            <Button variant="outline" onClick={() => setLibrary(true)}>
              <BooksIcon />
              Browse Library
            </Button>
          </>
        }
      >
        {children}
      </EmptyState>
      <LibraryDialog open={library} multiple={multiple} onOpenChange={setLibrary} onPick={(paths) => paths.length && onChoose(paths)} />
    </>
  )
}

// Shown over the whole window while files are dragged over it.
export function DropOverlay({ label }: { label: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 p-3">
      <div className="flex size-full animate-enter flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-brand/60 bg-background/85 backdrop-blur-sm">
        <div className="grid size-12 place-items-center rounded-xl bg-brand/12 text-brand">
          <DownloadSimpleIcon size={20} />
        </div>
        <p className="text-[15px] font-semibold tracking-tight">{label}</p>
      </div>
    </div>
  )
}

// Where the result goes. Shows the shape it will take; shimmers while the work runs.
export function WaveSlot({
  label,
  hint,
  dot,
  working = false,
}: {
  label: string
  hint: string
  dot?: string
  working?: boolean
}) {
  return (
    <section
      aria-busy={working || undefined}
      className="flex flex-col gap-3 rounded-2xl border border-dashed border-border-strong px-4 py-4"
    >
      <div className="flex items-center gap-2">
        {dot ? <span className={cn("size-2 rounded-full", dot)} /> : null}
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="min-w-0 truncate text-sm text-muted-foreground">{hint}</p>
      </div>
      <div className="flex h-16 items-center gap-3">
        <div className="size-9 shrink-0 rounded-full bg-muted" />
        <span className="w-10 shrink-0" />
        {working ? (
          <Skeleton className="h-full min-w-0 flex-1 rounded-none mask-(--slot-bars) mask-size-[100%_100%]" style={bars} />
        ) : (
          <div className="h-full min-w-0 flex-1 bg-muted mask-(--slot-bars) mask-size-[100%_100%]" style={bars} />
        )}
      </div>
    </section>
  )
}

// A calm, made-up waveform used as the placeholder's silhouette.
const bars = (() => {
  const count = 72
  const width = 6
  const rects = Array.from({ length: count }, (_, index) => {
    const t = index / count
    const level = 0.22 + 0.5 * Math.abs(Math.sin(t * 9.1) * Math.cos(t * 3.7)) + 0.18 * Math.abs(Math.sin(t * 31))
    const height = Math.round(level * 100)
    return `<rect x="${index * width}" y="${(100 - height) / 2}" width="${width - 2}" height="${height}" rx="1"/>`
  }).join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${count * width - 2} 100" preserveAspectRatio="none">${rects}</svg>`
  return { "--slot-bars": `url("data:image/svg+xml,${encodeURIComponent(svg)}")` } as CSSProperties
})()

// Where the result is saved. A folder you pick, or next to the original.
export function SaveTo({
  folder,
  disabled,
  onChange,
  fallback = "Next to the original",
}: {
  folder: string
  disabled?: boolean
  onChange: (folder: string) => void
  fallback?: string
}) {
  async function browse() {
    if (!ox.available()) {
      toast.error("Reopen this app in 0x1audio.")
      return
    }
    const picked = await ox.files.pick({ folder: true })
    if (picked[0]) onChange(picked[0])
  }

  return (
    <div role="group" aria-labelledby="save-to" className="flex flex-col gap-2">
      <p id="save-to" className="text-sm leading-none font-medium">
        Save to
      </p>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-(--field) pr-1 pl-3 text-sm shadow-xs",
            disabled && "opacity-50",
          )}
          title={folder || undefined}
        >
          <FolderSimpleIcon size={16} className="shrink-0 text-muted-foreground" />
          <span className={cn("min-w-0 flex-1 truncate", !folder && "text-muted-foreground")}>
            {folder ? basename(folder) : fallback}
          </span>
          {folder ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              aria-label="Save next to the original"
              disabled={disabled}
              onClick={() => onChange("")}
            >
              <XIcon />
            </Button>
          ) : null}
        </div>
        <Button variant="outline" disabled={disabled} onClick={() => void browse()}>
          Change…
        </Button>
      </div>
    </div>
  )
}

// The main button while the work runs: what is happening, how far along, and a way out.
export function Working({
  progress,
  label,
  stopping,
  onCancel,
  note = "The original file stays as it is.",
  stoppingLabel = "Canceling",
}: {
  progress: number
  label: string
  stopping: boolean
  onCancel: () => void
  note?: string
  stoppingLabel?: string
}) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100)
  const words = label.replace(/[.…\s]+$/, "")
  return (
    <div className="mt-2 flex animate-enter flex-col gap-3 rounded-2xl bg-card p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-4 text-sm" aria-live="polite">
        <p className="min-w-0 truncate font-medium">{`${stopping ? stoppingLabel : words}…`}</p>
        <p className="shrink-0 text-muted-foreground tabular-nums">{percent}%</p>
      </div>
      <Progress value={percent} aria-label={words} className="[&_[data-slot=progress-track]]:bg-muted" />
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-muted-foreground">{note}</p>
        <Button variant="outline" size="sm" disabled={stopping} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
