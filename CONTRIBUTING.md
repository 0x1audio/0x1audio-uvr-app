# Contributing

Thank you for helping with Vocal Extractor, an official Mixel app. A good bug report is as welcome as a pull request.

## Issues

- **Bugs:** say what you did, what you expected, and what happened instead. Add your OS, the version or commit, and any error text.
- **Ideas and bigger changes:** open an issue before you write the code, so we can agree on the shape first.
- **Security problems:** please don't open a public issue. [SECURITY.md](SECURITY.md) explains how to tell us privately.
- **Mixel itself, your account or Plus:** Mixel isn't developed in this repository. In Mixel, choose **Help › Send Feedback…**, or see [0x1audio.com/help](https://0x1audio.com/help).

## Set up

You build against the Mixel you already use, with the `mixel` command. You don't need Mixel's own source code. You need:

- **Mixel**, on a Mac with macOS 14 or later, from [0x1audio.com/download](https://0x1audio.com/download). Vocal Extractor needs a Mac with Apple silicon.
- **[uv](https://docs.astral.sh/uv/getting-started/installation/)**, which brings its own Python.

In Mixel, turn on **Settings › Developer mode**, then quit and reopen Mixel. Install the `mixel` command once (it's [`ox1audio`](https://pypi.org/project/ox1audio/) on PyPI), and open your clone in Mixel:

```bash
uv tool install ox1audio
git clone https://github.com/0x1audio/0x1audio-uvr-app.git 0x1audio-uvr-app
cd 0x1audio-uvr-app
mixel doctor   # says what's missing, if anything
mixel dev      # opens it in Mixel and reloads it on save
```

`mixel dev` opens your copy in Mixel, marked **In development**. It reloads when you save, and prints the app's log and errors in your terminal. Press Ctrl-C to close it. The first time, Mixel installs the app's Python packages, PyTorch among them, so the first open takes a while.

### The page

The page is a Vite + React app in `src/`. Mixel opens the built copy, `dist/index.html`, which is committed, so a change to the Python alone needs no Node.

The page builds with two Mixel packages from npm: the page SDK ([`@ox1audio/sdk`](https://www.npmjs.com/package/@ox1audio/sdk)) and Mixel's design system ([`@ox1audio/design-system`](https://www.npmjs.com/package/@ox1audio/design-system)). To rebuild it you need [Node](https://nodejs.org) 20.19 or later and [pnpm](https://pnpm.io):

```bash
pnpm install
pnpm build   # checks the types, then writes dist/
```

`src/parts.tsx`, `src/song-wave.ts`, `src/track.tsx` and `src/motion.ts` are shared with De-reverb. Keep the copies the same.

## Run the checks

Run these before you open a pull request:

```bash
uv sync       # once: the app's Python packages, so the tests can run (PyTorch is large)
mixel check   # app.json and the action, the way Mixel and its reviewers read them
mixel test    # the tests in tests/
```

A change to `src/` comes with a rebuilt `dist/` (`pnpm build`), so the page Mixel opens matches its source.

## Pull requests

- Keep each pull request to one change, and say what changed and why.
- Add or update tests with the change.
- For anything on screen, add screenshots in light and dark.
- Sign off every commit (see below).

A maintainer reviews every pull request. We may ask for changes; that's normal, and it's about the code, never about you.

**Written with a coding agent?** That's welcome, and the bar is the same. You've read the change, you've run the checks yourself, and the sign-off is yours: you're the one saying you have the right to contribute it. `mixel mcp` keeps an agent on the rules.

## Sign off your commits (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org) (DCO) instead of a contributor licence agreement. You keep the copyright on your work. By signing off, you confirm you have the right to contribute it.

Add `-s` when you commit:

```bash
git commit -s -m "Explain the change"
```

Git adds a line with your name and email from `git config`:

```text
Signed-off-by: Your Name <you@example.com>
```

Use your real name, or the name you're known by in open source. Forgot one? `git commit --amend -s` fixes the last commit, and `git rebase --signoff main` fixes every commit on your branch. Then force-push the branch.

A check on every pull request reads the commits and fails if one isn't signed off. `sh .github/dco-check.sh origin/main` runs the same check on your computer.

<details>
<summary>The full DCO 1.1 text</summary>

```text
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

</details>

## Your contribution's licence

Everything you contribute is licensed under **Apache-2.0**, the same licence as the rest of this repository ([LICENSE](LICENSE)). There is no separate agreement and no relicensing.

## The bar

**Code.** Small and readable beats clever. Every change comes with its tests, the checks above pass, and no secrets go into the repository.

**Design.** Anything on screen follows [Mixel's design system for apps](https://docs.0x1audio.com/design-system): its tokens, type, the 4 px spacing grid, motion and words. On top of that, our craft bar:

- Start from real content: real file names, long titles, and 0, 1 or 10,000 items.
- Give each view one clear primary action.
- Design every state: hover, pressed, focus-visible, disabled, loading, empty, error, and text that overflows. Keyboard first.
- Motion is short and explains what changed.
- Write plain, specific copy. Use a verb that says what the button does, never "Submit".
- None of the usual tells: gradient text, glows, cards inside cards, borders everywhere, or emoji as icons.

## How we treat each other

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). In short: be kind, talk about the work and not the person, and assume the other person is trying to help. If something isn't right, write to [hello@0x1audio.com](mailto:hello@0x1audio.com); it's read by a person and kept private.

## The name

The code is open, and the name "Mixel" and its marks are protected so people know what's official. See the [trademark policy](https://0x1audio.com/trademarks).
