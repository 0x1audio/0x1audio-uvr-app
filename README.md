# Ultimate Vocal Remover

A 0x1audio app for separating a mix into vocals and instruments. The screen follows [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui), and the worker runs that project's MIT-licensed separation code: VR Architecture, MDX-Net, Demucs, and Ensemble. The weights are not in this repository. The first time you pick a model, the app downloads it from UVR's public model repository and runs it on this computer.

```sh
pnpm install
pnpm dev
pnpm build
```

The desktop opens `dist/index.html`. `@0x1audio/design-system` and `@0x1audio/sdk` are linked from the sibling checkouts.
