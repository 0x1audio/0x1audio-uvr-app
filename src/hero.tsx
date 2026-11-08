import icon from "../icon.svg"
import { Wordmark } from "./wordmark.tsx"

// One strand of sound comes in from the left and comes apart: the voice rises
// to the magenta ring, the music settles into the cyan one.
const width = 640
const middle = 72

function strand(side: 1 | -1, phase: number, amplitude: number) {
  const points: string[] = []
  for (let x = 0; x <= 526; x += 3) {
    const apart = ease((x - 150) / 330)
    const landing = 1 - ease((x - 430) / 96)
    const envelope = (0.35 + 0.65 * Math.min(1, x / 140)) * (1 - apart * 0.35) * landing
    const y = middle + side * apart * 32 + Math.sin(x / 13 + phase + side * apart * 1.6) * amplitude * envelope
    points.push(`${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`)
  }
  return points.join("")
}

function ease(value: number) {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

const voice = strand(-1, 0, 12)
const music = strand(1, 0, 12)
const voiceEcho = strand(-1, 1.2, 6)
const musicEcho = strand(1, 1.2, 6)

export function Hero() {
  return (
    <header className="relative isolate h-36 overflow-hidden rounded-3xl bg-[linear-gradient(110deg,var(--hero-from),var(--hero-to))] shadow-sm max-sm:h-32">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_90%_at_82%_10%,var(--hero-voice-glow),transparent_70%),radial-gradient(40%_90%_at_88%_100%,var(--hero-music-glow),transparent_70%)]" />
      <svg
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-auto max-sm:-right-28"
        viewBox={`0 0 ${width} 144`}
        aria-hidden
      >
        <defs>
          <linearGradient id="extractor-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="white" stopOpacity="0" />
            <stop offset="0.3" stopColor="white" stopOpacity="1" />
          </linearGradient>
          <mask id="extractor-in">
            <rect width={width} height="144" fill="url(#extractor-fade)" />
          </mask>
          <filter id="extractor-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <g mask="url(#extractor-in)" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <g filter="url(#extractor-glow)" className="opacity-0 dark:opacity-70" strokeWidth="6">
            <path d={voice} stroke="var(--voice)" />
            <path d={music} stroke="var(--music)" />
          </g>
          <g className="mix-blend-multiply dark:mix-blend-screen">
            <path d={voiceEcho} stroke="var(--voice)" strokeOpacity="0.4" strokeWidth="1.25" />
            <path d={musicEcho} stroke="var(--music)" strokeOpacity="0.4" strokeWidth="1.25" />
            <path d={voice} stroke="var(--voice)" strokeWidth="2.5" />
            <path d={music} stroke="var(--music)" strokeWidth="2.5" />
          </g>
        </g>
        <g fill="none" strokeWidth="4">
          <circle cx="548" cy="40" r="22" stroke="var(--voice)" />
          <circle cx="548" cy="104" r="22" stroke="var(--music)" />
          <g filter="url(#extractor-glow)" className="opacity-0 dark:opacity-70" strokeWidth="7">
            <circle cx="548" cy="40" r="22" stroke="var(--voice)" />
            <circle cx="548" cy="104" r="22" stroke="var(--music)" />
          </g>
        </g>
      </svg>
      <Grain />
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-3/4 bg-[linear-gradient(90deg,var(--hero-from)_55%,transparent)] max-sm:block" />
      <div className="relative flex h-full flex-col justify-center gap-2.5 px-8 max-sm:px-6">
        <h1 className="flex items-center gap-3 text-(--hero-ink)">
          <img src={icon} alt="" className="size-10 rounded-[10px] shadow-sm" />
          <Wordmark className="h-7 w-auto max-sm:h-6" />
        </h1>
        <p className="text-sm text-(--hero-muted) max-sm:max-w-60">Pull the vocals out of a song, and keep the music too.</p>
      </div>
    </header>
  )
}

// A fine grain over the band keeps its soft gradients from banding.
function Grain() {
  return (
    <svg className="pointer-events-none absolute inset-0 size-full opacity-[0.1] mix-blend-soft-light" aria-hidden>
      <filter id="extractor-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#extractor-grain)" />
    </svg>
  )
}
