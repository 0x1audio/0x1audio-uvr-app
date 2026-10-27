export const methods = [
  { value: "vr", label: "VR Architecture" },
  { value: "mdx", label: "MDX-Net" },
  { value: "demucs", label: "Demucs" },
  { value: "ensemble", label: "Ensemble" },
] as const

export type Method = (typeof methods)[number]["value"]

export const models: Record<Method, string[]> = {
  vr: ["1_HP-UVR", "2_HP-UVR", "3_HP-UVR", "4_HP-UVR", "5_HP-Karaoke-UVR", "6_HP-Karaoke-UVR"],
  mdx: ["UVR-MDX-NET Inst HQ 3", "UVR-MDX-NET Voc FT", "UVR-MDX-NET Kim Vocal 2", "UVR-MDX-NET Main"],
  demucs: ["htdemucs", "htdemucs_ft", "hdemucs_mmi", "mdx_extra"],
  ensemble: ["UVR-MDX-NET Inst HQ 3", "UVR-MDX-NET Voc FT", "UVR-MDX-NET Kim Vocal 2", "1_HP-UVR", "htdemucs"],
}

export const algorithms = [
  { value: "avg", label: "Average" },
  { value: "max", label: "Max spec" },
  { value: "min", label: "Min spec" },
]

export const windows = [
  { value: "320", label: "320" },
  { value: "512", label: "512" },
  { value: "1024", label: "1024" },
  { value: "2048", label: "2048" },
]

export function stemsFor(method: Method, model: string): string[] {
  if (method === "demucs" && model !== "mdx_extra") return ["Vocals", "Instrumental", "Drums", "Bass", "Other"]
  return ["Vocals", "Instrumental"]
}

export function options(values: readonly string[]) {
  return values.map((value) => ({ value, label: value }))
}
