import { useEffect, useState } from "react"
import { host } from "@0x1audio/sdk/page"
import { waveformFrom, type Wave } from "@0x1audio/design-system"

export interface SongWave {
  wave: Wave | null
  settled: boolean
  missing: boolean
}

export function useSongWave(path: string, blob: Blob | null): SongWave {
  const [wave, setWave] = useState<Wave | null>(null)
  const [settled, setSettled] = useState(path === "")
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    if (!path) {
      setWave(null)
      setSettled(true)
      setMissing(false)
      return
    }
    let live = true
    setWave(null)
    setSettled(false)
    setMissing(false)
    void load(path, blob)
      .then((next) => {
        if (!live) return
        setWave(next.wave)
        setMissing(next.missing)
      })
      .catch(() => {
        if (!live) return
        setWave(null)
        setMissing(false)
      })
      .finally(() => {
        if (live) setSettled(true)
      })
    return () => {
      live = false
    }
  }, [path, blob])
  return { wave, settled, missing }
}

async function load(path: string, blob: Blob | null): Promise<{ wave: Wave | null; missing: boolean }> {
  if (blob) return { wave: await waveformFrom(blob), missing: false }
  const read = host()?.readFile
  if (!read) return { wave: null, missing: true }
  return { wave: await waveformFrom(await read(path)), missing: false }
}
