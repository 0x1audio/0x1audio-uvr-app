# Ultimate Vocal Remover

A 0x1audio app for separating a mix into vocals and instruments. The screen follows the [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui) workflow: VR Architecture, MDX-Net, Demucs, and Ensemble, with the same kinds of controls. That project is MIT licensed. This app does not ship its model weights. Each model here is a preset, and the worker separates the file on this computer.

```sh
pnpm install
pnpm dev
pnpm build
```

The desktop opens `dist/index.html`. `@0x1audio/design-system` and `@0x1audio/sdk` are linked from the sibling checkouts.
