# Contributing to Moneyshot

Start with an [open issue](https://github.com/testy-cool/moneyshot/issues). Describe the editing task you want to improve before proposing a large change.

## Local setup

Install Node.js 22, Rust stable, and the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/). From a clone of this repository:

```sh
npm ci
npm run dev
```

For manual editing in a browser, use `npm run web:dev`. Native dialogs and AI requests require the Tauri app.

## Checks

```sh
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Tests support a real interaction check. For a clipboard bug, test an actual clipboard image in the compiled app. For an AI bug, verify the request from the desktop UI through the configured service; a mocked response alone is not enough.

## Where to work

| Area | Files |
| --- | --- |
| Tools, selection, crop and AI history | `src/editor/App.tsx` |
| Drawing and PNG export | `src/editor/canvas.ts` |
| Hit testing and resize geometry | `src/editor/geometry.ts` |
| Layout and themes | `src/editor/index.css` |
| Shared UI components | `src/components/ui/` |
| Native dialogs and AI requests | `src-tauri/src/lib.rs` |

The legacy application identifier and storage keys remain for connection-setting compatibility. They are internal, not the product name.

Keep changes focused. Preserve undo and explicit crop approval. UI text must be at least 12px and the layout must remain aligned at the minimum window size. Include no credentials, personal endpoints, or private images in commits, logs, issues or demos. Use fictional placeholders for connection examples.
