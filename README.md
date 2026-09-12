# Moneyshot

[![CI](https://github.com/testy-cool/moneyshot/actions/workflows/ci.yml/badge.svg)](https://github.com/testy-cool/moneyshot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Crop a screenshot, point out what matters, and blur what you don't want to share. Moneyshot is a small desktop editor with handwritten arrows, movable annotations, and optional AI region detection.

**Early development.** Manual editing is the starting point. Desktop AI dispatch and clipboard paste have reported bugs; use **Open** to load an image. Prebuilt downloads are not available yet.

## What you can do

- Draw boxes and curved arrows with handwritten labels.
- Move and resize annotations; choose from 21 neutral and bright colors.
- Crop manually, blur a region, undo edits, and export a PNG.
- Ask an image-capable model to locate a region, review its suggested boxes, and choose whether to crop. Earlier results remain available during the editing session.

Manual editing needs no account or API key. The desktop shell uses Tauri; editing happens on a local canvas.

## Try it from source

Install Node.js 22, Rust stable, and the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/) for your OS. The first native build takes longer than subsequent starts.

```sh
git clone https://github.com/testy-cool/moneyshot.git
cd moneyshot
npm ci
npm run dev
```

Click **Open**, choose a PNG, JPEG or WebP, add an arrow or box, then **Export PNG**. To crop, drag a region with the Crop tool and click **Apply crop**.

For a browser preview of manual editing, run `npm run web:dev` and open the printed local URL. Native dialogs and AI requests require the desktop app.

## Optional AI connection

Open the key button beside **AI locate** and enter your API base URL, model ID and key. No provider is preconfigured.

The endpoint must support OpenAI-compatible `POST /chat/completions`, image data URLs, and JSON-schema structured output. Choose a model with those capabilities; arbitrary text-only models will not work.

```text
API URL: https://api.example.com/v1
Model:   <your-image-capable-model-id>
API key: <your-api-key>
```

These are fictional placeholders. Moneyshot sends the current screenshot to your configured endpoint only when you click **Locate**. AI results are suggestions: **Use for crop** prepares a preview; **Apply crop** changes the image.

Connection settings, including the key, currently use local app storage, not an OS credential vault. Secure credential storage is tracked in [#8](https://github.com/testy-cool/moneyshot/issues/8).

## Current limitations and roadmap

| Work | Tracking |
| --- | --- |
| Multiline text and independent arrow labels | [#1](https://github.com/testy-cool/moneyshot/issues/1), [#2](https://github.com/testy-cool/moneyshot/issues/2) |
| Reliable desktop AI requests and clipboard paste | [#3](https://github.com/testy-cool/moneyshot/issues/3), [#4](https://github.com/testy-cool/moneyshot/issues/4) |
| New app icon | [#5](https://github.com/testy-cool/moneyshot/issues/5) |
| Light/dark switching and editing ergonomics | [#6](https://github.com/testy-cool/moneyshot/issues/6), [#7](https://github.com/testy-cool/moneyshot/issues/7) |

Linux is the locally exercised desktop platform. macOS and Windows builds have not been verified here. AI history is session-only, not a saved project format. Blur is a visual effect, not guaranteed irreversible redaction.

## Build and contribute

```sh
npm run tauri:build
```

The executable is written to `src-tauri/target/release/moneyshot` on Linux. Installer packaging is not enabled yet.

See [CONTRIBUTING.md](CONTRIBUTING.md) for checks and the code map. [Report a bug](https://github.com/testy-cool/moneyshot/issues/new/choose) with your OS, commit and reproduction steps; remove credentials and private screenshot content first.

## License

[MIT](LICENSE). Derived from [achu](https://github.com/QAInsights/achu); the original license notice is retained.
