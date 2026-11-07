import { useRef, useState } from "react"
import { Button, Combobox, Dropzone, Label, Progress, useFileDrop } from "@0x1audio/design-system"
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
  const [message, setMessage] = useState("")
  const [outputs, setOutputs] = useState<string[]>([])
  const stop = useRef<AbortController | null>(null)
  const dragging = useFileDrop((dropped) => {
    if (pending) return
    const bridge = host()
    if (!bridge?.pathFor) {
      setMessage("Update 0x1audio to drop files here, or use Choose audio.")
      return
    }
    const paths = dropped.map((item) => bridge.pathFor?.(item) ?? "").filter(Boolean)
    if (!paths.length) return
    setFile(paths[0])
    setExtra(paths.length > 1 ? "This takes one song at a time." : "")
    setOutputs([])
    setMessage("")
  })

  const hint = qualities.find((item) => item.value === quality)?.hint ?? ""
  const folder = output ? basename(output) : "Same folder as the audio"
  const percent = Math.round(progress * 100)

  async function chooseFile() {
    const bridge = host()
    if (!bridge?.pick) {
      setMessage("Reopen this app in 0x1audio.")
      return
    }
    const picked = await bridge.pick("file")
    if (!picked[0]) return
    setFile(picked[0])
    setExtra("")
    setOutputs([])
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

  async function start() {
    if (!file || pending) return
    const controller = new AbortController()
    stop.current = controller
    setPending(true)
    setProgress(0)
    setOutputs([])
    setMessage("")
    setExtra("")
    try {
      const result = await job<JobResult>(
        "start",
        { files: [file], output, quality, format },
        (fraction) => setProgress(fraction),
        controller.signal,
      )
      if (!result.stopped && result.outputs.length) {
        setProgress(1)
        setOutputs(result.outputs)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessage(error instanceof Error ? error.message : "This song couldn't be separated. Try it again.")
      }
    } finally {
      stop.current = null
      setPending(false)
    }
  }

  return (
    <div className="relative min-h-svh bg-background text-foreground">
      <header className="relative h-32">
        <img src={lava} alt="" className="pointer-events-none absolute inset-0 size-full object-cover object-[center_22%]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 from-10% to-background" />
      </header>
      <main className="relative mx-auto flex w-full max-w-md flex-col px-6 pb-6">
        <div className="flex flex-col items-center gap-2 pb-8 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-balance">Vocal Extractor</h1>
          <p className="text-sm text-muted-foreground">You get two files: the vocals, and the music without vocals.</p>
        </div>

        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <Dropzone
              className="py-6"
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

          <div className="flex flex-col gap-5">
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
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex h-10 min-w-0 flex-1 items-center rounded-lg bg-card px-4 text-left text-sm"
                  title={output || "Same folder as the audio"}
                  disabled={pending}
                  onClick={() => void chooseFolder()}
                >
                  <span className="truncate">{folder}</span>
                </button>
                <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={() => void chooseFolder()}>
                  Choose folder
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button type="button" className="h-12 w-full text-base" disabled={pending || !file} onClick={() => void start()}>
              {pending ? "Separating…" : "Separate vocals"}
            </Button>
            {pending ? (
              <>
                <p className="text-sm text-muted-foreground">{percent > 0 ? `Separating vocals… ${percent}%` : "Getting ready…"}</p>
                {percent > 0 ? <Progress value={percent} aria-label="Separating vocals" /> : null}
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full"
                  onClick={() => stop.current?.abort()}
                >
                  Stop
                </Button>
              </>
            ) : null}
            {message ? <p className="text-sm text-destructive">{message}</p> : null}
            {outputs.length ? (
              <section className="flex flex-col gap-3 rounded-2xl bg-card px-4 py-4">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">Both files are ready</p>
                  <p className="text-sm text-muted-foreground">Your song was not changed.</p>
                  <p className="text-sm text-muted-foreground">{output ? `Saved to ${folder}.` : "Saved in the same folder as the audio."}</p>
                </div>
                <ul className="flex flex-col gap-2">
                  {outputs.map((item) => (
                    <li key={item} className="flex items-center justify-between gap-3 text-sm">
                      <span>{resultLabel(item)}</span>
                      <span className="min-w-0 truncate text-muted-foreground">{basename(item)}</span>
                    </li>
                  ))}
                </ul>
                <Button type="button" variant="outline" className="h-10" onClick={() => void host()?.reveal?.(outputs[0])}>
                  Show in folder
                </Button>
              </section>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  )
}

function resultLabel(file: string) {
  const name = basename(file)
  if (name.includes("(Vocals)")) return "Vocals"
  if (name.includes("(Music)")) return "Music"
  return "Audio"
}
