import { useEffect, useRef, useState, type ReactNode } from "react"
import { FolderOpenIcon, MusicNotesIcon } from "@phosphor-icons/react"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Combobox,
  Label,
  Progress,
  Slider,
  Switch,
  Tabs,
  TabsList,
  TabsTab,
} from "@0x1audio/design-system"
import { host } from "@0x1audio/sdk/page"

import { DownloadCenter, type Catalog } from "./DownloadCenter.tsx"
import { algorithms, methods, models, options, stemsFor, windows, type Method } from "./models.ts"

interface Job {
  progress: number
  message: string
  log: string
  done: boolean
  error: string | null
  outputs: string[]
}

export function App() {
  const [files, setFiles] = useState<string[]>([])
  const [method, setMethod] = useState<Method>("vr")
  const [model, setModel] = useState(models.vr[0])
  const [secondary, setSecondary] = useState(models.ensemble[1])
  const [algorithm, setAlgorithm] = useState("avg")
  const [selected, setSelected] = useState<string[]>(["Vocals", "Instrumental"])
  const [output, setOutput] = useState("")
  const [format, setFormat] = useState("wav")
  const [segment, setSegment] = useState(8)
  const [overlap, setOverlap] = useState(0.25)
  const [aggression, setAggression] = useState(5)
  const [windowSize, setWindowSize] = useState("512")
  const [shifts, setShifts] = useState(2)
  const [denoise, setDenoise] = useState(false)
  const [highEnd, setHighEnd] = useState(false)
  const [tta, setTta] = useState(false)
  const [gpu, setGpu] = useState(false)
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState("")
  const [log, setLog] = useState("")
  const [outputs, setOutputs] = useState<string[]>([])
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [center, setCenter] = useState(false)
  const consoleRef = useRef<HTMLPreElement>(null)

  const available = stemsFor(method, model)
  const installed = catalog ? installedIds(catalog, method) : null
  const modelList = installed ?? models[method]
  const ensembleList = catalog ? installedIds(catalog, "ensemble") : models.ensemble

  useEffect(() => {
    const bridge = host()
    if (!bridge) return
    void bridge.call<Catalog>("models", { refresh: false }).then(setCatalog).catch(() => {})
  }, [])

  useEffect(() => {
    if (!catalog) return
    const list = installedIds(catalog, method)
    if (model && list.includes(model)) return
    setModel(list[0] ?? "")
  }, [catalog, method, model])

  useEffect(() => {
    const node = consoleRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [log])

  function chooseMethod(next: string) {
    const value = next as Method
    setMethod(value)
    const list = catalog ? installedIds(catalog, value) : models[value]
    const first = list[0] ?? ""
    setModel(first)
    setSelected(stemsFor(value, first))
  }

  async function chooseFiles() {
    const bridge = host()
    if (!bridge?.pick) {
      setMessage("Reopen this app in 0x1audio.")
      return
    }
    const picked = await bridge.pick("file")
    if (!picked.length) return
    setFiles((current) => [...new Set([...current, ...picked])])
    setMessage("")
  }

  async function chooseFolder() {
    const bridge = host()
    if (!bridge?.pick) {
      setMessage("Reopen this app in 0x1audio.")
      return
    }
    const picked = await bridge.pick("folder")
    if (picked[0]) setOutput(picked[0])
  }

  function toggleStem(stem: string, checked: boolean) {
    setSelected((current) => (checked ? [...new Set([...current, stem])] : current.filter((item) => item !== stem)))
  }

  async function start() {
    const bridge = host()
    if (!bridge) {
      setMessage("Open this app in 0x1audio.")
      return
    }
    if (!files.length) {
      setMessage("Choose an audio file.")
      return
    }
    setPending(true)
    setProgress(0)
    setOutputs([])
    setMessage("")
    setLog("")
    try {
      const created = await bridge.call<{ id: string }>("start", {
        files,
        output,
        method,
        model,
        secondary,
        algorithm,
        stems: selected.filter((stem) => available.includes(stem)),
        format,
        segment,
        overlap,
        aggression: method === "vr" ? aggression : null,
        window: method === "vr" ? Number(windowSize) : null,
        shifts: method === "demucs" ? shifts : 1,
        denoise: method === "mdx" ? denoise : false,
        highEnd,
        tta: method === "vr" ? tta : false,
        gpu,
      })
      const result = await wait(created.id, (job) => {
        setProgress(job.progress)
        setLog(job.log)
      })
      setProgress(result.progress)
      setLog(result.log)
      setMessage(result.error ?? "")
      setOutputs(result.outputs)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10 text-foreground">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-medium">Ultimate Vocal Remover</h1>
        <p className="text-sm text-muted-foreground">
          Separate vocals, instruments, and the rest of a mix with the models from{" "}
          <button
            type="button"
            className="underline"
            onClick={() => window.open("https://github.com/Anjok07/ultimatevocalremovergui")}
          >
            Ultimate Vocal Remover
          </button>
          .
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Input</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {files.length ? (
            <ul className="flex flex-col gap-2">
              {files.map((file) => (
                <li key={file} className="flex items-center gap-3 rounded-lg bg-[var(--bg-field)] px-4 py-2">
                  <MusicNotesIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">{file.split(/[/\\]/).pop()}</span>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground"
                    disabled={pending}
                    onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No audio yet.</p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => void chooseFiles()}>
              <FolderOpenIcon size={16} />
              Choose audio
            </Button>
            {files.length ? (
              <Button type="button" variant="outline" disabled={pending} onClick={() => setFiles([])}>
                Clear
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Tabs value={method} onValueChange={chooseMethod}>
        <TabsList>
          {methods.map((item) => (
            <TabsTab key={item.value} value={item.value} disabled={pending}>
              {item.label}
            </TabsTab>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Model</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setCenter(true)}>
              Download Center
            </Button>
          </div>
          <Field label="Model">
            <Combobox
              items={options(modelList)}
              value={model}
              placeholder={modelList.length ? undefined : "No Model Selected"}
              onValueChange={setModel}
            />
          </Field>
          {method === "ensemble" ? (
            <>
              <Field label="Second model">
                <Combobox items={options(ensembleList)} value={secondary} onValueChange={setSecondary} />
              </Field>
              <Field label="Ensemble algorithm">
                <Combobox items={algorithms} value={algorithm} onValueChange={setAlgorithm} />
              </Field>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stems</CardTitle>
          <CardDescription>Save one file for each stem you leave on.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {available.map((stem) => (
            <label key={stem} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(stem)}
                disabled={pending}
                onCheckedChange={(checked) => toggleStem(stem, checked)}
              />
              {stem}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Output</CardTitle>
          <CardDescription>Leave the folder empty to save next to the original file.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Folder">
            <div className="flex gap-2">
              <div className="flex h-10 min-w-0 flex-1 items-center rounded-lg bg-[var(--bg-field)] px-4 text-sm">
                <span className="truncate text-muted-foreground">{output || "Same folder as the audio"}</span>
              </div>
              <Button type="button" variant="outline" disabled={pending} onClick={() => void chooseFolder()}>
                Choose
              </Button>
            </div>
          </Field>
          <Field label="Format">
            <Combobox
              items={[
                { value: "wav", label: "WAV" },
                { value: "flac", label: "FLAC" },
              ]}
              value={format}
              onValueChange={setFormat}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {method === "mdx" || method === "demucs" ? (
            <NumberControl
              label="Overlap"
              value={overlap}
              min={0}
              max={0.9}
              step={0.05}
              disabled={pending}
              onChange={setOverlap}
            />
          ) : null}
          {method === "vr" ? (
            <>
              <NumberControl
                label="Aggression"
                value={aggression}
                min={0}
                max={50}
                step={1}
                disabled={pending}
                onChange={setAggression}
              />
              <Field label="Window size">
                <Combobox items={windows} value={windowSize} onValueChange={setWindowSize} />
              </Field>
              <Toggle label="TTA" checked={tta} disabled={pending} onChange={setTta} />
            </>
          ) : null}
          {method === "mdx" ? <Toggle label="Denoise" checked={denoise} disabled={pending} onChange={setDenoise} /> : null}
          {method === "demucs" ? (
            <>
              <NumberControl label="Segment" value={segment} min={1} max={30} step={1} suffix="s" disabled={pending} onChange={setSegment} />
              <NumberControl label="Shifts" value={shifts} min={0} max={5} step={1} disabled={pending} onChange={setShifts} />
            </>
          ) : null}
          <Toggle label="High-end process" checked={highEnd} disabled={pending} onChange={setHighEnd} />
          <Toggle label="GPU conversion" checked={gpu} disabled={pending} onChange={setGpu} />
        </CardContent>
      </Card>

      <Button type="button" className="h-12 w-full text-base" disabled={pending} onClick={() => void start()}>
        {pending ? "Processing…" : "Start processing"}
      </Button>
      <Progress value={pending || outputs.length ? Math.round(progress * 100) : 0} />
      {log ? (
        <pre
          ref={consoleRef}
          className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--bg-field)] p-4 font-mono text-xs leading-5 text-muted-foreground"
        >
          {log}
        </pre>
      ) : null}
      {message ? <p className="min-h-5 text-sm">{message}</p> : null}
      <DownloadCenter open={center} onOpenChange={setCenter} onCatalog={setCatalog} />
      {outputs.length ? (
        <ul className="flex flex-col gap-2">
          {outputs.map((file) => (
            <li key={file} className="truncate text-sm text-muted-foreground">
              {file}
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  const shown = Number.isInteger(step) ? String(value) : value.toFixed(2)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <Label>{label}</Label>
        <span className="text-muted-foreground">
          {shown}
          {suffix ?? ""}
        </span>
      </div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(next) => onChange(typeof next === "number" ? next : next[0])}
      />
    </div>
  )
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      {label}
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  )
}

function installedIds(catalog: Catalog, method: Method): string[] {
  const rows =
    method === "ensemble" ? [...catalog.mdx, ...catalog.vr, ...catalog.demucs] : catalog[method]
  return rows.filter((row) => row.installed).map((row) => row.id)
}

async function wait(id: string, onUpdate: (job: Job) => void): Promise<Job> {
  const bridge = host()
  if (!bridge) throw new Error("Open this app in 0x1audio.")
  for (;;) {
    const job = await bridge.call<Job>("status", { id })
    onUpdate(job)
    if (job.done) return job
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}
