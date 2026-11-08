# Vocal Extractor

A Mixel app that pulls the singing out of a song. You get two files, `Name (Vocals)` and `Name (Music)`, both added to the Library. The screen only asks for a file, a quality, a file type, and where to save. Every run uses htdemucs from the MIT-licensed [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui) engine. The weights are not in this repository. The first run downloads htdemucs and keeps it on this computer.

```sh
pnpm install
pnpm dev
pnpm build
```

The desktop opens `dist/index.html`. The hero art is drawn in `src/hero.tsx`, and `icon.svg` is the app's card icon (`accent` and `icon` in `app.json`). `src/parts.tsx` and `src/song-wave.ts` are shared with SonicDryer; keep the copies the same. `@0x1audio/design-system` and `@0x1audio/sdk` are linked from the sibling checkouts.

## Licence

Apache-2.0 · contributions under the [DCO](CONTRIBUTING.md#sign-off-your-commits-dco).

This app is open source under the [Apache License 2.0](LICENSE); see also [NOTICE](NOTICE). The model weights it downloads keep their own licences. The licence covers the code, not the name: "Mixel" and its marks are trademarks of 0x1audio, and [TRADEMARKS.md](https://github.com/0x1audio/cloud/blob/main/TRADEMARKS.md) explains how to use them. To report a vulnerability, see [SECURITY.md](SECURITY.md).
