import { useEffect, useRef, useState, type ReactNode } from "react"
import { CaretDownIcon, FolderOpenIcon, MusicNotesIcon } from "@phosphor-icons/react"
import {
  Button,
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
import { host, job } from "@0x1audio/sdk/page"

import lava from "./chroma-lava.jpg"
import { DownloadCenter, type Catalog } from "./DownloadCenter.tsx"
import { basename, useDrop } from "./drop.ts"
import { algorithms, methods, models, options, stemsFor, windows, type Method } from "./models.ts"

interface JobResult {
  outputs: string[]
  log: string
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
  const [more, setMore] = useState(false)
  const consoleRef = useRef<HTMLPreElement>(null)
  const dragging = useDrop((paths) => {
    setFiles((current) => [...new Set([...current, ...paths])])
    setMessage("")
  }, setMessage)

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
      const result = await job<JobResult>("start", {
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
      }, (fraction, label) => {
        setProgress(fraction)
        if (label) setLog((current) => (current.endsWith(label) ? current : current + label))
      })
      setProgress(1)
      setLog(result.log)
      setOutputs(result.outputs)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative min-h-svh bg-background text-foreground">
      <header className="relative h-52">
        <img src={lava} alt="" className="pointer-events-none absolute inset-0 size-full object-cover object-[center_22%]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 from-25% to-background" />
        <h1 className="absolute inset-x-6 bottom-1 text-center text-5xl font-medium tracking-tight text-balance">Ultimate Vocal Remover</h1>
      </header>
      <main className="relative mx-auto flex w-full max-w-xl flex-col gap-5 px-6 pt-4 pb-8">
        <section className={`flex flex-col gap-3 rounded-2xl p-4 ${dragging ? "bg-[var(--bg-field)]" : "bg-card"}`}>
          {files.length ? (
            <ul className="flex flex-col gap-2">
              {files.map((file) => (
                <li key={file} className="flex items-center gap-3 rounded-lg bg-[var(--bg-field)] px-4 py-2">
                  <MusicNotesIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">{basename(file)}</span>
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
            <p className="px-2 py-5 text-center text-sm text-muted-foreground">{dragging ? "Drop to add" : "Drop audio here"}</p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-11 flex-1" disabled={pending} onClick={() => void chooseFiles()}>
              <FolderOpenIcon size={16} />
              {files.length ? "Add audio" : "Choose audio"}
            </Button>
            {files.length ? (
              <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={() => setFiles([])}>
                Clear
              </Button>
            ) : null}
          </div>
        </section>

        <Tabs value={method} onValueChange={chooseMethod}>
          <TabsList>
            {methods.map((item) => (
              <TabsTab key={item.value} value={item.value} disabled={pending}>
                {item.value === "vr" ? "VR" : item.value === "mdx" ? "MDX" : item.label}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>

        <Field label="Model">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Combobox
                items={options(modelList)}
                value={model}
                placeholder={modelList.length ? undefined : "No model yet"}
                onValueChange={setModel}
              />
            </div>
            <Button type="button" variant="outline" className="h-10 shrink-0" disabled={pending} onClick={() => setCenter(true)}>
              Models
            </Button>
          </div>
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

        <Field label="Stems">
          <div className="flex flex-wrap gap-x-5 gap-y-3">
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
          </div>
        </Field>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex h-10 min-w-0 flex-1 items-center rounded-lg bg-card px-4 text-sm">
              <span className="truncate text-muted-foreground">{output || "Same folder as the audio"}</span>
            </div>
            <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={() => void chooseFolder()}>
              Folder
            </Button>
          </div>
          <div className="flex gap-2">
            {(["wav", "flac"] as const).map((item) => (
              <Button
                key={item}
                type="button"
                variant={format === item ? "default" : "outline"}
                className="h-10 flex-1"
                disabled={pending}
                onClick={() => setFormat(item)}
              >
                {item.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>

        <Toggle label="GPU conversion" checked={gpu} disabled={pending} onChange={setGpu} />

        <div className="flex flex-col gap-5">
          <Button type="button" variant="outline" className="h-10 w-full" disabled={pending} onClick={() => setMore((current) => !current)}>
            Settings
            <CaretDownIcon size={16} className={more ? "rotate-180" : ""} />
          </Button>
          {more ? (
            <div className="flex flex-col gap-5">
              {method === "mdx" || method === "demucs" ? (
                <NumberControl label="Overlap" value={overlap} min={0} max={0.9} step={0.05} disabled={pending} onChange={setOverlap} />
              ) : null}
              {method === "vr" ? (
                <>
                  <NumberControl label="Aggression" value={aggression} min={0} max={50} step={1} disabled={pending} onChange={setAggression} />
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
            </div>
          ) : null}
        </div>

        <Button type="button" className="h-12 w-full text-base" disabled={pending} onClick={() => void start()}>
          {pending ? "Processing…" : "Start processing"}
        </Button>
        {pending || outputs.length ? <Progress value={Math.round(progress * 100)} /> : null}
        {log ? (
          <pre
            ref={consoleRef}
            className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-card p-4 font-mono text-xs leading-5 text-muted-foreground"
          >
            {log}
          </pre>
        ) : null}
        {message ? <p className="text-sm">{message}</p> : null}
        {outputs.length ? (
          <ul className="flex flex-col gap-2">
            {outputs.map((file) => (
              <li key={file} className="truncate text-sm text-muted-foreground">
                {basename(file)}
              </li>
            ))}
          </ul>
        ) : null}
      </main>
      <DownloadCenter open={center} onOpenChange={setCenter} onCatalog={setCatalog} />
    </div>
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
