import { useRef, useState } from "react"
import { XIcon } from "@phosphor-icons/react"
import { Button, Combobox, Dropzone, FolderField, Label, Progress, SuccessCard, Tabs, TabsList, TabsTab, Waveform, clock, toast, useFileDrop } from "@0x1audio/design-system"
import { host, job } from "@0x1audio/sdk/page"

import lava from "./chroma-lava.jpg"
import { basename } from "./drop.ts"
import { useSongWave, type SongWave } from "./song-wave.ts"

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
  const [blob, setBlob] = useState<Blob | null>(null)
  const [extra, setExtra] = useState("")
  const [quality, setQuality] = useState<Quality>("standard")
  const [output, setOutput] = useState("")
  const [format, setFormat] = useState("mp3")
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState("")
  const [stopping, setStopping] = useState(false)
  const [outputs, setOutputs] = useState<string[]>([])
  const [heard, setHeard] = useState("vocals")
  const stop = useRef<AbortController | null>(null)
  const canceling = useRef(false)
  const source = useSongWave(file, blob)
  const vocal = outputs.find((item) => item.includes(" (Vocals)")) ?? outputs[0] ?? ""
  const music = outputs.find((item) => item.includes(" (Music)")) ?? ""
  const vocals = useSongWave(vocal, null)
  const backing = useSongWave(music, null)
  const activePath = heard === "music" && music ? music : vocal
  const active = heard === "music" && music ? backing : vocals
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
    setBlob(dropped[0] ?? null)
    setExtra(paths.length > 1 ? "This takes one song at a time." : "")
    setOutputs([])
    setHeard("vocals")
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
    setBlob(null)
    setExtra("")
    setOutputs([])
    setHeard("vocals")
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
    setHeard("vocals")
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

  function clear() {
    setFile("")
    setBlob(null)
    setExtra("")
    setOutputs([])
    setHeard("vocals")
  }

  return (
    <div className="relative min-h-svh bg-background text-foreground">
      <header className="relative h-12">
        <img src={lava} alt="" className="pointer-events-none absolute inset-0 size-full object-cover object-[center_22%]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 from-10% to-background" />
      </header>
      <main className="relative mx-auto flex w-full max-w-6xl flex-col px-8 pb-4">
        <div className="flex flex-col items-center gap-1 pb-3 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-balance">Vocal Extractor</h1>
          <p className="text-sm text-muted-foreground">You get two files: the vocals, and the music without vocals.</p>
        </div>

        <div className="grid items-start gap-8 min-[880px]:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Dropzone
                className="py-2"
                title={file ? basename(file) : "Drop audio here"}
                description={file ? undefined : "A song or a voice recording"}
                dragging={dragging}
                disabled={pending}
                onChoose={() => void chooseFile()}
                extra={
                  file ? (
                    <button type="button" className="text-sm text-muted-foreground" disabled={pending} aria-label={`Remove ${basename(file)}`} onClick={clear}>
                      Remove
                    </button>
                  ) : null
                }
              />
              {extra ? <p className="text-center text-sm text-muted-foreground">{extra}</p> : null}
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label>Quality</Label>
                  <Combobox items={qualities} value={quality} onValueChange={(value) => setQuality(value as Quality)} />
                  <p className="text-sm text-muted-foreground">{hint}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>File type</Label>
                  <Combobox items={formats} value={format} onValueChange={setFormat} />
                </div>
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
                  className="mt-1 py-4"
                  action={
                    <Button type="button" variant="outline" onClick={() => void host()?.reveal?.(outputs[0])}>
                      Show in Folder
                    </Button>
                  }
                />
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Waveform label="Original" detail={caption(file, source)} wave={source.wave} empty={shape(file, source, "The song shows up here.")} />
            {vocal && music ? (
              <Tabs value={heard} onValueChange={(value) => { if (value === "vocals" || value === "music") setHeard(value) }}>
                <TabsList className="w-full">
                  <TabsTab value="vocals">Vocals</TabsTab>
                  <TabsTab value="music">Music</TabsTab>
                </TabsList>
              </Tabs>
            ) : null}
            <Waveform
              label="Processed"
              detail={caption(activePath, active)}
              wave={active.wave}
              empty={shape(activePath, active, pending ? status || "Separating vocals" : "This shows up when processing finishes.")}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

function caption(path: string, state: SongWave) {
  if (!path) return ""
  const name = basename(path)
  return state.wave ? `${name} · ${clock(state.wave.seconds)}` : name
}

function shape(path: string, state: SongWave, idle: string) {
  if (!path) return idle
  if (!state.settled) return "Reading the song…"
  if (state.missing) return "Reopen 0x1audio to see the shape."
  if (!state.wave) return "The shape of this file can't be drawn."
  return ""
}
