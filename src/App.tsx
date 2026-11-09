import { useRef, useState } from "react"
import { FolderOpenIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react"
import { Button, Callout, PageSection, Tabs, TabsList, TabsTab, Track, toast, transition, useFileDrop } from "@0x1audio/design-system"
import { OxError, ox, type Exported } from "@0x1audio/sdk/page"

import { basename } from "./drop.ts"
import { Hero } from "./hero.tsx"
import { DropOverlay, Intake, SaveTo, WaveSlot, Working } from "./parts.tsx"
import { useSongWave, type SongWave } from "./song-wave.ts"

type Run =
  | { state: "idle" }
  | { state: "working"; progress: number; label: string; stopping: boolean }
  | { state: "done"; outputs: string[] }
  | { state: "failed"; message: string }

type Quality = "fast" | "standard" | "best"

const qualities: { value: Quality; label: string; detail: string }[] = [
  { value: "fast", label: "Fast", detail: "Quickest. Good for a first listen." },
  { value: "standard", label: "Standard", detail: "Clean results for most songs." },
  { value: "best", label: "Best", detail: "The cleanest split. Takes about four times as long." },
]

const formats = ["mp3", "wav", "flac", "ogg"]

export function App() {
  const [file, setFile] = useState("")
  const [blob, setBlob] = useState<Blob | null>(null)
  const [notice, setNotice] = useState("")
  const [quality, setQuality] = useState<Quality>("standard")
  const [format, setFormat] = useState("mp3")
  const [output, setOutput] = useState("")
  const [run, setRun] = useState<Run>({ state: "idle" })
  const stop = useRef<AbortController | null>(null)
  const source = useSongWave(file, blob)
  const outputs = run.state === "done" ? run.outputs : []
  const vocal = outputs.find((item) => item.includes(" (Vocals)")) ?? outputs[0] ?? ""
  const music = outputs.find((item) => item.includes(" (Music)")) ?? ""
  const vocals = useSongWave(vocal, null)
  const backing = useSongWave(music, null)
  const working = run.state === "working"
  const dragging = useFileDrop((dropped) => {
    if (working) return
    const missing = ox.unavailable()
    if (missing) {
      toast.error(missing.message)
      return
    }
    const paths = dropped.map((item) => ox.files.fromDrop(item)).filter(Boolean)
    if (!paths.length) return
    choose(paths[0], dropped[0] ?? null, paths.length > 1)
  })

  const name = file ? basename(file) : ""

  function choose(next: string, body: Blob | null, several = false) {
    transition(() => {
      setFile(next)
      setBlob(body)
      setNotice(several ? `Using ${basename(next)}. Vocal Extractor takes one song at a time.` : "")
      setRun({ state: "idle" })
    })
  }

  async function start() {
    if (!file || working) return
    const controller = new AbortController()
    stop.current = controller
    const folder = output.trim()
    setNotice("")
    setRun({ state: "working", progress: 0, label: "Getting ready", stopping: false })
    try {
      const done = await ox.run<{ items: Exported[] }>("split", { song: file, quality, format, output: folder || null }, {
        signal: controller.signal,
        onProgress: (fraction, label) =>
          setRun((current) =>
            current.state === "working"
              ? { ...current, progress: fraction ?? current.progress, label: current.stopping || !label ? current.label : label }
              : current,
          ),
      })
      const outputs = done.items.map((item) => item.path)
      if (!outputs.length) {
        setRun({ state: "idle" })
        toast("Canceled", { description: "Nothing was saved." })
      } else {
        setRun({ state: "done", outputs })
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof OxError && error.code === "cancelled")) {
        setRun({ state: "idle" })
        toast("Canceled", { description: "Nothing was saved." })
      } else {
        setRun({
          state: "failed",
          message: error instanceof Error && error.message ? error.message : "This song couldn't be separated. Try it again.",
        })
      }
    } finally {
      stop.current = null
    }
  }

  function cancel() {
    if (run.state !== "working" || run.stopping) return
    setRun({ ...run, stopping: true, label: "Canceling" })
    stop.current?.abort()
  }

  const detail = qualities.find((item) => item.value === quality)?.detail

  return (
    <div data-app="vocal-extractor" className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-8 px-8 pt-6 pb-10 max-sm:px-4 max-sm:pt-4">
        <Hero />

        {!file ? (
          <Intake
            title="Drop a song here"
            description="You get two files back: the vocals on their own, and the music without them. The original stays as it is."
            dragging={dragging}
            onChoose={(paths) => choose(paths[0], null)}
          >
            <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-(--voice)" />
                Vocals
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-(--music)" />
                Music
              </span>
            </div>
          </Intake>
        ) : (
          <main className="grid animate-enter items-start gap-8 min-[880px]:grid-cols-2">
            <div className="flex flex-col gap-4">
              <PageSection
                className="pt-0"
                title="Song"
                description="The song you want to split."
                actions={
                  <Button variant="ghost" size="sm" className="-my-2 -mr-2.5" disabled={working} onClick={() => choose("", null)}>
                    <XIcon />
                    Remove
                  </Button>
                }
              >
                <Track label={name} wave={source.wave} src={source.src} empty={shape(file, source, "Reading the song…")} />
                {notice ? <p className="text-[13px] text-muted-foreground">{notice}</p> : null}
              </PageSection>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div role="group" aria-labelledby="quality" className="flex min-w-0 flex-col gap-2">
                  <p id="quality" className="text-sm leading-none font-medium">
                    Quality
                  </p>
                  <Tabs value={quality} onValueChange={(value) => setQuality(value as Quality)}>
                    <TabsList className="w-full">
                      {qualities.map((item) => (
                        <TabsTab key={item.value} value={item.value} disabled={working}>
                          {item.label}
                        </TabsTab>
                      ))}
                    </TabsList>
                  </Tabs>
                  <p className="text-[13px] text-muted-foreground">{detail}</p>
                </div>
                <div role="group" aria-labelledby="format" className="flex min-w-0 flex-col gap-2">
                  <p id="format" className="text-sm leading-none font-medium">
                    File type
                  </p>
                  <Tabs value={format} onValueChange={(value) => setFormat(String(value))}>
                    <TabsList className="w-full">
                      {formats.map((item) => (
                        <TabsTab key={item} value={item} disabled={working} className="px-2">
                          {item.toUpperCase()}
                        </TabsTab>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              <SaveTo folder={output} disabled={working} onChange={setOutput} />

              {run.state === "working" ? (
                <Working progress={run.progress} label={run.label} stopping={run.stopping} onCancel={cancel} />
              ) : (
                <Button size="lg" variant={run.state === "done" ? "outline" : "default"} className="mt-2 w-full" onClick={() => void start()}>
                  {run.state === "done" ? "Split it again" : "Split song"}
                </Button>
              )}
            </div>

            <PageSection
              className="pt-0"
              title="Vocals and music"
              description={
                run.state === "done"
                  ? <span className="block truncate">Saved and added to your Library.</span>
                  : "Two files: the singing on its own, and everything else."
              }
              actions={
                run.state === "done" ? (
                  <Button variant="ghost" size="sm" className="-my-2 -mr-2.5" onClick={() => void ox.files.reveal(vocal)}>
                    <FolderOpenIcon />
                    Show in folder
                  </Button>
                ) : null
              }
            >
              {run.state === "done" ? (
                <div className="flex animate-enter flex-col gap-3">
                  <Track
                    className="[&_canvas]:text-(--voice)"
                    label="Vocals"
                    file={basename(vocal)}
                    wave={vocals.wave}
                    src={vocals.src}
                    empty={shape(vocal, vocals, "")}
                  />
                  {music ? (
                    <Track
                      className="[&_canvas]:text-(--music)"
                      label="Music"
                      file={basename(music)}
                      wave={backing.wave}
                      src={backing.src}
                      empty={shape(music, backing, "")}
                    />
                  ) : null}
                </div>
              ) : run.state === "failed" ? (
                <Callout
                  tone="danger"
                  icon={<WarningCircleIcon />}
                  title="Vocal Extractor couldn't finish"
                  actions={
                    <Button variant="outline" size="sm" onClick={() => void start()}>
                      Try again
                    </Button>
                  }
                >
                  {run.message}
                </Callout>
              ) : (
                <div className="flex flex-col gap-3">
                  <WaveSlot label="Vocals" hint={working ? "On their way" : "The singing on its own"} dot="bg-(--voice)" working={working} />
                  <WaveSlot label="Music" hint={working ? "On its way" : "Everything else"} dot="bg-(--music)" working={working} />
                </div>
              )}
            </PageSection>
          </main>
        )}
        {/* Credits the model authors ask for (Legal, model-licences.md §4.3). The weights come from them, not from us. */}
        <footer className="mt-auto pt-4 text-[12px] leading-relaxed text-muted-foreground">
          Separation by{" "}
          <a className="underline underline-offset-2 hover:text-foreground" href="https://github.com/Anjok07/ultimatevocalremovergui" target="_blank" rel="noreferrer">
            Ultimate Vocal Remover
          </a>{" "}
          (MIT) and{" "}
          <a className="underline underline-offset-2 hover:text-foreground" href="https://github.com/facebookresearch/demucs" target="_blank" rel="noreferrer">
            Demucs by Meta
          </a>{" "}
          (MIT). The models download from their authors the first time you use them.
        </footer>
      </div>
      {dragging && !working ? <DropOverlay label={file ? "Drop to use this song instead" : "Drop to use this song"} /> : null}
    </div>
  )
}

function shape(path: string, state: SongWave, reading: string) {
  if (!path) return ""
  if (!state.settled) return reading || "Reading the file…"
  if (state.missing) return ox.unavailable()?.message ?? "The shape of this file can't be drawn."
  if (!state.wave) return "The shape of this file can't be drawn."
  return ""
}
