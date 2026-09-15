# Moneyshot

Moneyshot is a small Tauri app for cropping and annotating screenshots. Open, paste, or drop an image; add neat handwritten arrows and labels, boxes, text, or blur; then export a PNG.

AI locates regions from plain instructions such as “the error dialog.” It shows its bounding boxes without changing the image; you can switch between earlier results, use one as a crop preview, or keep one as an editable box. Requests run through a configurable OpenAI-compatible endpoint.

## Run it

You need Node.js, npm, Rust, and the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/) for your platform.

```bash
npm install
npm run dev
```

For the browser-only development view:

```bash
npm run web:dev
```

## Use with Flameshot

Take a screenshot in Flameshot, finish any capture-time edits, then press **Ctrl+O** and choose **Moneyshot**. Flameshot passes a temporary PNG to Moneyshot, which opens it directly for cropping and annotation.

For a direct capture flow with no app chooser, install `scripts/flameshot-moneyshot` on your `PATH` and bind it to your screenshot shortcut. It opens Flameshot for region selection, copies the capture to your clipboard, and launches Moneyshot as soon as you release the selection.

You can also open an image from a terminal:

```bash
moneyshot /path/to/screenshot.png
```

## Tools

- Select, move, and resize annotations
- Manual crop
- Bounding boxes
- Curved arrows with handwritten labels
- Handwritten text
- Blur regions
- Twenty-one neutral and bright Tailwind annotation colors
- Reviewable AI bounding boxes with result history
- Undo, redo, paste, drag and drop, and PNG export

## AI connection setup

Open an image, then click the key icon beside the AI prompt. Enter your provider’s API base URL, model ID and key. No provider is configured by default. These are placeholders, not a working configuration:

```text
API URL: https://api.example.com/v1
Model:   <your-image-capable-model-id>
```

Use a model and endpoint that support OpenAI-compatible chat completions, image input, and JSON-schema structured output. The connection settings stay in the app's local storage. Manual edits remain local; Moneyshot sends the current screenshot to the configured API only when you click **Locate**. AI never applies a crop itself.

## Checks and builds

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

The React canvas editor lives in `src/editor`. The Tauri commands for native open/save dialogs and AI requests live in `src-tauri/src/lib.rs`.
