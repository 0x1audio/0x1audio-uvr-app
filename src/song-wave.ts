import { useEffect, useState } from "react"
import { ox } from "@0x1audio/sdk/page"
import { waveformFrom, type Wave } from "@0x1audio/design-system"

export interface SongWave {
  wave: Wave | null
  src: string | null
  settled: boolean
  missing: boolean
}

export function useSongWave(path: string, blob: Blob | null): SongWave {
  const [wave, setWave] = useState<Wave | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [settled, setSettled] = useState(path === "")
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    if (!path) {
      setWave(null)
      setSrc(null)
      setSettled(true)
      setMissing(false)
      return
    }
    let live = true
    let url = ""
    setWave(null)
    setSrc(null)
    setSettled(false)
    setMissing(false)
    void load(path, blob)
      .then((next) => {
        if (!live) {
          if (next.src) URL.revokeObjectURL(next.src)
          return
        }
        url = next.src
        setWave(next.wave)
        setSrc(next.src || null)
        setMissing(next.missing)
      })
      .catch(() => {
        if (!live) return
        setWave(null)
        setSrc(null)
        setMissing(false)
      })
      .finally(() => {
        if (live) setSettled(true)
      })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [path, blob])
  return { wave, src, settled, missing }
}

function mime(path: string) {
  const ext = path.split(".").pop()?.toLowerCase()
  if (ext === "mp3") return "audio/mpeg"
  if (ext === "wav" || ext === "wave") return "audio/wav"
  if (ext === "flac") return "audio/flac"
  if (ext === "ogg" || ext === "oga") return "audio/ogg"
  if (ext === "m4a" || ext === "mp4" || ext === "aac") return "audio/mp4"
  return "application/octet-stream"
}

async function load(path: string, blob: Blob | null): Promise<{ wave: Wave | null; src: string; missing: boolean }> {
  if (blob) return { wave: await waveformFrom(blob), src: URL.createObjectURL(blob), missing: false }
  if (!ox.available()) return { wave: null, src: "", missing: true }
  const bytes = await ox.files.read(path)
  const file = new Blob([bytes.slice()], { type: mime(path) })
  return { wave: await waveformFrom(file), src: URL.createObjectURL(file), missing: false }
}
