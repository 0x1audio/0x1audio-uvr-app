import { useRef, useState } from "react"
import { XIcon } from "@phosphor-icons/react"
import { Button, Combobox, Dropzone, FolderField, Label, Progress, SuccessCard, toast, useFileDrop } from "@0x1audio/design-system"
import { host, job } from "@0x1audio/sdk/page"

import lava from "./chroma-lava.jpg"
import { basename } from "./drop.ts"

interface JobResult {
  outputs: string[]
  stopped?: boolean
}

type Quality = "fast" | "standard" | "best"

const qualities = [
  { value: "fast", label: "Fast", hint: "Quicker. Some of the voice may stay in the music." },
  { value: "standard", label: "Standard", hint: "Good for most songs." },
  { value: "best", label: "Best", hint: "Cleaner. It takes longer." },
]

const formats = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
  { value: "flac", label: "FLAC" },
  { value: "ogg", label: "OGG" },
]

export function App() {
  const [file, setFile] = useState("")
  const [extra, setExtra] = useState("")
  const [quality, setQuality] = useState<Quality>("standard")
  const [output, setOutput] = useState("")
  const [format, setFormat] = useState("mp3")
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState("")
  const [stopping, setStopping] = useState(false)
  const [outputs, setOutputs] = useState<string[]>([])
  const stop = useRef<AbortController | null>(null)
  const canceling = useRef(false)
  const dragging = useFileDrop((dropped) => {
    if (pending) return
    const bridge = host()
    if (!bridge?.pathFor) {
      toast.error("Update 0x1audio to drop files here, or use Choose audio.")
      return
    }
    const paths = dropped.map((item) => bridge.pathFor?.(item) ?? "").filter(Boolean)
    if (!paths.length) return
    setFile(paths[0])
    setExtra(paths.length > 1 ? "This takes one song at a time." : "")
    setOutputs([])
  })

  const hint = qualities.find((item) => item.value === quality)?.hint ?? ""
  const percent = Math.round(progress * 100)

  async function chooseFile() {
    const bridge = host()
    if (!bridge?.pick) {
      toast.error("Reopen this app in 0x1audio.")
      return
    }
    const picked = await bridge.pick("file")
    if (!picked[0]) return
    setFile(picked[0])
    setExtra("")
    setOutputs([])
  }

  async function chooseFolder() {
    const bridge = host()
    if (!bridge?.pick) {
      toast.error("Reopen this app in 0x1audio.")
      return
    }
    const picked = await bridge.pick("folder")
    if (picked[0]) setOutput(picked[0])
  }

  async function start() {
    if (!file || pending) return
    const controller = new AbortController()
    stop.current = controller
    canceling.current = false
    setStopping(false)
    setPending(true)
    setProgress(0)
    setStatus("Getting ready")
    setOutputs([])
    setExtra("")
    try {
      const result = await job<JobResult>(
        "start",
        { files: [file], output: output.trim(), quality, format },
        (fraction, label) => {
          setProgress(fraction)
          if (!canceling.current && label) setStatus(label)
        },
        controller.signal,
      )
      if (result.stopped) toast("Canceled", { description: "Nothing was saved." })
      else if (result.outputs.length) {
        setProgress(1)
        setOutputs(result.outputs)
        toast.success("Both files are ready", {
          description: output.trim() ? `Saved to ${basename(output.trim())}.` : "Saved in the same folder as the audio.",
          action: { label: "Show in folder", onClick: () => void host()?.reveal?.(result.outputs[0]) },
        })
      }
    } catch (error) {
      if (controller.signal.aborted) toast("Canceled", { description: "Nothing was saved." })
      else toast.error(error instanceof Error ? error.message : "This song couldn't be separated. Try it again.")
    } finally {
      stop.current = null
      canceling.current = false
      setStopping(false)
      setPending(false)
    }
  }

  function cancel() {
    if (canceling.current) return
    canceling.current = true
    setStopping(true)
    setStatus("Canceling…")
    stop.current?.abort()
  }

  return (
    <div className="relative min-h-svh bg-background text-foreground">
      <header className="relative h-24">
        <img src={lava} alt="" className="pointer-events-none absolute inset-0 size-full object-cover object-[center_22%]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 from-10% to-background" />
      </header>
      <main className="relative mx-auto flex w-full max-w-md flex-col px-6 pb-4">
        <div className="flex flex-col items-center gap-2 pb-5 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-balance">Vocal Extractor</h1>
          <p className="text-sm text-muted-foreground">You get two files: the vocals, and the music without vocals.</p>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Dropzone
              className="py-4"
              title={file ? basename(file) : "Drop audio here"}
              description={file ? undefined : "A song or a voice recording"}
              dragging={dragging}
              disabled={pending}
              onChoose={() => void chooseFile()}
              extra={
                file ? (
                  <button
                    type="button"
                    className="text-sm text-muted-foreground"
                    disabled={pending}
                    aria-label={`Remove ${basename(file)}`}
                    onClick={() => {
                      setFile("")
                      setExtra("")
                      setOutputs([])
                    }}
                  >
                    Remove
                  </button>
                ) : null
              }
            />
            {extra ? <p className="text-center text-sm text-muted-foreground">{extra}</p> : null}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Quality</Label>
              <Combobox items={qualities} value={quality} onValueChange={(value) => setQuality(value as Quality)} />
              <p className="text-sm text-muted-foreground">{hint}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>File type</Label>
              <Combobox items={formats} value={format} onValueChange={setFormat} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Save to</Label>
              <FolderField value={output} disabled={pending} onValueChange={setOutput} onBrowse={() => void chooseFolder()} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {pending ? (
              <>
                <p className="text-sm">{status || "Getting ready"}</p>
                <Progress pulse value={percent} aria-label={status || "Progress"} />
                <Button type="button" variant="outline-destructive" className="h-10 w-full" onClick={cancel}>
                  <XIcon size={16} />
                  {stopping ? "Canceling…" : "Cancel"}
                </Button>
              </>
            ) : (
              <Button type="button" className="h-12 w-full text-base" disabled={!file} onClick={() => void start()}>
                Start processing
              </Button>
            )}
            {outputs.length ? (
              <SuccessCard
                className="mt-3"
                action={
                  <Button type="button" variant="outline" onClick={() => void host()?.reveal?.(outputs[0])}>
                    Show in Folder
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  )
}

