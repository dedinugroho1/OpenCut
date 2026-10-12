# Auto-Editor Roadmap (personal fork)

Base: `opencut-app/opencut-classic` (Next.js 16). Run with `npm install` + `npm run dev --workspace @opencut/web`.

## Architecture hooks

| Concern | Where |
| --- | --- |
| Editor state | `EditorCore` singleton (`apps/web/src/core`), React via `useEditor(selector)` |
| Tracks | `scene.tracks = { overlay[], main, audio[] }` (`timeline/types.ts`) |
| Time | integer ticks, `TICKS_PER_SECOND = 120_000`; use `mediaTimeFromSeconds` etc. from `@/wasm` |
| Mutations | `Command` subclasses + `editor.command.execute()`; undo snapshots full `SceneTracks` |
| Media files | `editor.media.getAssets()` → `asset.file` (OPFS-backed) |
| Preview | `services/renderer/*` scene graph → WASM GPU compositor |
| Export | `RendererManager.exportProject` → `SceneExporter` (mediabunny, in-browser) |
| Transcription | `services/transcription` (Whisper via transformers.js worker) |

## Features

1. **Smart Silence Cut** ✅: `app/api/silence-detect` (ffmpeg `silencedetect`), `silence/`, `ripple/remove-ranges.ts`, `RippleCutCommand`.
2. **Filler word cleaner**: run Whisper with word timestamps (local whisper.cpp API or the existing transformers.js worker), send the transcript to Claude via a server route to tag "eee/anu"/retakes, then reuse `RippleCutCommand`.
3. **AI subtitles + style presets**: reuse `buildCaptionChunks` + `insertCaptionChunksAsTextTrack`; add preset styles (Hormozi word-pop, Minimal Tech); use Claude for emphasis/keyword highlighting.
4. **16:9 ↔ 9:16 toggle**: `editor.project.updateSettings({ canvasSize })` + layout template (blurred background / split screen-cam) via element transforms.
5. **Auto-zoom 1.5x**: user marks regions → generate scale/position keyframes (`animation/`) on the main clip; optionally cursor tracking.
6. **Native export 720p/1080p/4K**: new local API that renders the timeline via ffmpeg `h264_videotoolbox`/`hevc_videotoolbox`; size estimate = bitrate × duration, ETA from a short benchmark encode.
