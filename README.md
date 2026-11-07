# Vocal Extractor

A 0x1audio app that pulls the singing out of a song. The screen only asks for a file, a quality, and a format. Every run uses htdemucs from the MIT-licensed [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui) engine. The weights are not in this repository. The first run downloads htdemucs and keeps it on this computer.

```sh
pnpm install
pnpm dev
pnpm build
```

The desktop opens `dist/index.html`. `@0x1audio/design-system` and `@0x1audio/sdk` are linked from the sibling checkouts.
