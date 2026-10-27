import { useEffect, useState } from "react"
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Progress,
} from "@0x1audio/design-system"
import { host } from "@0x1audio/sdk/page"

export interface ModelRow {
  id: string
  label: string
  installed: boolean
}

export interface Catalog {
  online: boolean
  vr: ModelRow[]
  mdx: ModelRow[]
  demucs: ModelRow[]
}

type Kind = "vr" | "mdx" | "demucs"

const kinds: Array<{ value: Kind; label: string }> = [
  { value: "vr", label: "VR Arch" },
  { value: "mdx", label: "MDX-Net" },
  { value: "demucs", label: "Demucs" },
]

interface DownloadJob {
  progress: number
  message: string
  done: boolean
  error: string | null
  stopped: boolean
}

const idle: DownloadJob = { progress: 0, message: "", done: true, error: null, stopped: false }

export function DownloadCenter({
  open,
  onOpenChange,
  onCatalog,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCatalog: (catalog: Catalog) => void
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [kind, setKind] = useState<Kind>("vr")
  const [picked, setPicked] = useState<Record<Kind, string>>({ vr: "", mdx: "", demucs: "" })
  const [job, setJob] = useState<DownloadJob>(idle)
  const [running, setRunning] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [info, setInfo] = useState("")

  useEffect(() => {
    if (!open) return
    void load(true)
  }, [open])

  async function load(refresh: boolean) {
    const bridge = host()
    if (!bridge) {
      setInfo("Open this app in 0x1audio.")
      return null
    }
    const next = await bridge.call<Catalog>("models", { refresh })
    setCatalog(next)
    onCatalog(next)
    return next
  }

  function choose(next: Kind) {
    setKind(next)
    setPicked((current) => ({ ...current, [next]: "" }))
    setInfo("")
  }

  async function refresh() {
    setRefreshing(true)
    setInfo("")
    try {
      const next = await load(true)
      setInfo(next && !next.online ? "No Internet Connection" : "Download List Refreshed!")
    } catch (error) {
      setInfo(error instanceof Error ? error.message : "No Internet Connection")
    } finally {
      setRefreshing(false)
    }
  }

  async function start() {
    const bridge = host()
    const model = picked[kind]
    if (!bridge || !model || running) return
    setRunning(true)
    setInfo("")
    setJob({ ...idle, done: false, message: "Downloading Item 1/1..." })
    try {
      await bridge.call("download", { method: kind, model })
      const result = await watch((next) => {
        setJob(next)
        setInfo(next.message)
      })
      setJob(result)
      setInfo(result.message)
      if (!result.stopped && !result.error) {
        const next = await load(false)
        if (next) setPicked((current) => ({ ...current, [kind]: "" }))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Download Failed"
      setInfo(message)
      setJob({ ...idle, message, error: message })
    } finally {
      setRunning(false)
    }
  }

  async function stop() {
    const bridge = host()
    if (!bridge) return
    await bridge.call("stopDownload", {})
  }

  function close(next: boolean) {
    if (!next && running) void stop()
    onOpenChange(next)
  }

  const missing = (catalog?.[kind] ?? []).filter((row) => !row.installed)
  const canDownload = Boolean(picked[kind]) && !running && !refreshing && catalog?.online !== false

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Application Download Center</DialogTitle>
          <DialogDescription>Select Download</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {kinds.map((item) => {
            const rows = (catalog?.[item.value] ?? []).filter((row) => !row.installed)
            const items = rows.length
              ? rows.map((row) => ({ value: row.id, label: row.label }))
              : [{ value: "", label: "All Available Models Downloaded" }]
            return (
              <div key={item.value} className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="uvr-download"
                    className="size-4"
                    checked={kind === item.value}
                    disabled={running}
                    onChange={() => choose(item.value)}
                  />
                  {item.label}
                </label>
                <fieldset disabled={kind !== item.value || running} className="min-w-0 border-0 p-0 disabled:opacity-50">
                  <Combobox
                    items={items}
                    value={picked[item.value]}
                    placeholder={rows.length ? "No Model Selected" : "All Available Models Downloaded"}
                    empty="All Available Models Downloaded"
                    onValueChange={(value) => setPicked((current) => ({ ...current, [item.value]: value }))}
                  />
                </fieldset>
              </div>
            )
          })}
        </div>
        <Button type="button" className="h-12 w-full text-base" disabled={!canDownload || !missing.length} onClick={() => void start()}>
          Download
        </Button>
        {info ? <p className="text-center text-sm">{info}</p> : null}
        {running || job.progress > 0 ? (
          <p className="text-center text-sm text-muted-foreground">{Math.round((running ? job.progress : job.done ? 1 : job.progress) * 100)} %</p>
        ) : null}
        <Progress value={running || job.message ? Math.round(job.progress * 100) : 0} />
        <Button type="button" variant="outline" className="w-full" disabled={!running} onClick={() => void stop()}>
          Stop Download
        </Button>
        <Button type="button" variant="outline" className="w-full" disabled={running || refreshing} onClick={() => void refresh()}>
          Refresh List
        </Button>
      </DialogContent>
    </Dialog>
  )
}

async function watch(onUpdate: (job: DownloadJob) => void): Promise<DownloadJob> {
  const bridge = host()
  if (!bridge) throw new Error("Open this app in 0x1audio.")
  for (;;) {
    const job = await bridge.call<DownloadJob>("downloadStatus", {})
    onUpdate(job)
    if (job.done) return job
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}
