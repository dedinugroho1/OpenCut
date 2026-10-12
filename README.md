<div align="center">

# OpenCut — Custom Extended Edition

**An AI-assisted, privacy-first video editor for screen-recorded tutorials.**
Extended by [Dedi Nugroho](https://github.com/dedinugroho1) on top of the open-source [OpenCut](https://github.com/opencut-app/opencut) project.

[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat)](LICENSE)
[![Fork of OpenCut](https://img.shields.io/badge/fork%20of-opencut--app%2Fopencut-black?style=flat&logo=github)](https://github.com/opencut-app/opencut)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat&logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat&logo=typescript&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-local%20API-007808?style=flat&logo=ffmpeg&logoColor=white)

</div>

> [!NOTE]
> **This is a personal fork, not the official OpenCut.** It builds on the classic OpenCut web editor ([opencut-app/opencut-classic](https://github.com/opencut-app/opencut-classic)) and adds automation for editing tutorial recordings: silence removal, AI-assisted captions, and more.
> All original work belongs to the OpenCut authors. See [Acknowledgments & Upstream](#-acknowledgments--upstream).

## 🚀 Custom Enhancements & Roadmap

The goal of this fork is to cut the time it takes to turn a raw screen recording into a publishable tutorial, while everything still runs locally.

| Status | Feature | Details |
| :---: | --- | --- |
| ✅ | **Smart Silence Cut** | One-click removal of pauses longer than 1.5 s, detected by a local FFmpeg API (`silencedetect`). Keeps 200 ms of audio before speech and 250 ms after it, so words are never clipped. Cuts every track at once to keep overlays and separate mic audio in sync. Fully undoable, and safe with ripple editing on. |
| ✅ | **Indonesian transcription** | Bahasa Indonesia is available in the Whisper caption generator. |
| 🚧 | **AI filler-word cleaner** | Local Whisper word timestamps plus the Anthropic Claude API to detect and cut fillers ("eee", "anu") and retakes. |
| 🗓️ | **Dynamic AI subtitles** | Caption style presets (bold word-pop, minimal tech) with Claude-assisted keyword emphasis. |
| 🗓️ | **16:9 ↔ 9:16 canvas toggle** | One-click aspect switch with automatic vertical layout templates. |
| 🗓️ | **Targeted auto-zoom** | 1.5× zoom presets on chosen regions (code or cursor), generated as editable keyframes. |
| 🗓️ | **Native Mac export** | 720p, 1080p and 4K via FFmpeg VideoToolbox hardware encoding, with estimated file size and export time. |

✅ shipped · 🚧 in progress · 🗓️ planned. The technical roadmap lives in [`notes/auto-editor-roadmap.md`](notes/auto-editor-roadmap.md).

### Engineering highlights

- **Local-first AI pipeline:** heavy media work (FFmpeg) runs in a local API route, and media never leaves the machine except for opt-in LLM calls on transcript text.
- **Command-pattern integration:** new edits are first-class undoable commands (`RippleCutCommand`) that plug into the editor's existing history and ripple system.
- **Pure, tested core logic:** the silence-to-cut-range mapping (padding, trims, playback rate) is framework-free and unit-tested in `apps/web/src/silence/__tests__`.

## Why OpenCut?

- **Privacy**: Your videos stay on your device
- **Free features**: Most basic CapCut features are now paywalled
- **Simple**: People want editors that are easy to use - CapCut proved that

## Project Structure

- `apps/web/`: Next.js web application
- `apps/web/src/silence/`, `apps/web/src/app/api/silence-detect/`: Smart Silence Cut *(fork addition)*
- `apps/desktop/`: Native desktop app built with GPUI (in progress)
- `rust/`: Platform-agnostic core: GPU compositor, effects, masks, and WASM bindings
- `docs/`: Architecture and subsystem documentation
- `notes/`: Fork roadmap and design notes

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+ with npm (this fork's default). [Bun](https://bun.sh/docs/installation) also works.
- [FFmpeg](https://ffmpeg.org/) on your `PATH` for Smart Silence Cut (`brew install ffmpeg` on macOS). Set `FFMPEG_PATH` to use a custom binary.
- Optional: [Docker](https://docs.docker.com/get-docker/) for the local database and Redis. The editor works without them; only auth, feedback and sound search need them.

### Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/dedinugroho1/OpenCut.git
   cd OpenCut
   ```

2. Copy the environment file:

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

3. Optional: start the database and Redis:

   ```bash
   docker compose up -d db redis serverless-redis-http
   ```

4. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev --workspace @opencut/web
   ```

   With Bun, run `bun install && bun dev:web` instead.

The application will be available at [http://localhost:3000](http://localhost:3000).

> [!IMPORTANT]
> Smart Silence Cut calls a local Node.js API route that spawns FFmpeg. It works with `next dev` or `next start` on your own machine. It does not work on edge or serverless deployments such as Cloudflare Workers.

<details>
<summary><strong>Desktop, local WASM and Docker self-hosting</strong> (from upstream)</summary>

### Desktop setup

Desktop is opt-in. If you want to get ready for `apps/desktop`, see [`apps/desktop/README.md`](apps/desktop/README.md).

### Local WASM development

Only needed if you're editing `rust/wasm` and want the web app to use your local build instead of the published package.

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install wasm-pack
cargo install cargo-watch
```

1. Build the package once from the repo root: `bun run build:wasm`
2. Register it for linking: `cd rust/wasm/pkg && bun link`
3. Link `apps/web` to it: `cd apps/web && bun link opencut-wasm`
4. Rebuild on changes: `bun dev:wasm`

To switch back to the published package, run `cd apps/web && bun add opencut-wasm`.

### Self-hosting with Docker

```bash
docker compose up -d
```

The app will be available at [http://localhost:3100](http://localhost:3100).

</details>

## Contributing

This is a personal portfolio fork. Issues and suggestions about the custom features are welcome here.

To contribute to OpenCut itself, please head to the official repository, [opencut-app/opencut](https://github.com/opencut-app/opencut), and read its contributing guide.

## 🙏 Acknowledgments & Upstream

This project would not exist without the work of the **OpenCut team and its contributors**. The editor, timeline, renderer, and WASM compositor are theirs. This fork only adds extensions on top.

- **Official repository:** [opencut-app/opencut](https://github.com/opencut-app/opencut) (the Rust-core rewrite)
- **Base of this fork:** [opencut-app/opencut-classic](https://github.com/opencut-app/opencut-classic) (the original Next.js editor)
- **Website:** [opencut.app](https://opencut.app)
- **License:** [![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat)](LICENSE). The original copyright notice is preserved, and fork modifications are attributed separately.

Upstream OpenCut is supported by [Vercel](https://vercel.com?utm_source=github-opencut&utm_campaign=oss) and [fal.ai](https://fal.ai?utm_source=github-opencut&utm_campaign=oss). Their sponsorship is of the original project, not this fork.

[![Star History Chart](https://api.star-history.com/svg?repos=opencut-app/opencut&type=Date)](https://star-history.com/#opencut-app/opencut&Date)

## License

Released under the [MIT License](LICENSE).

- Copyright 2025-2026 OpenCut
- Portions copyright (c) 2026 Dedi Nugroho (custom modifications & extensions)
