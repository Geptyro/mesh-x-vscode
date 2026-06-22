# mesh-x Asset Editor

A VS Code extension that gives [mesh-x](https://github.com/Geptyro/mesh-x)
procedural assets a **visual editor + live 3D preview**.

Open a `*.meshx.json` asset config and the extension replaces the raw JSON view
with a custom editor: tweak a component's parameters with sliders/inputs on one
side, and see the resulting mesh rendered live in a 3D viewport on the other.
Saving rebuilds the GLB automatically.

## Features

- **Custom editor** for `*.meshx.json` and `*.meshx-preview.json` files —
  prop schema → form controls, no hand-editing JSON.
- **Live 3D preview** — a Three.js viewport renders the asset and updates as you
  change parameters.
- **Auto-rebuild** — edits trigger a background rebuild of the corresponding
  `.glb` via the mesh-x build pipeline.

## How it works

The extension drives the mesh-x build pipeline. It resolves `mesh-x` from the
asset project's `node_modules`, transforms the component's `.jsx` with the
shared JSX loader hooks, and writes a preview `.glb` that the webview displays.
The asset project just needs `mesh-x` installed and assets following the
`{Name}.meshx.json + {Name}.jsx` convention.

## Development

```bash
npm install
npm run build:webview   # build the Svelte webview
npm run dev             # watch mode
npm run link            # link into your VS Code extensions for local testing
```

The webview is a Svelte app (`webview/`); the extension host code is in `src/`;
the off-thread GLB build runs in `preview-worker.mjs`.

## License

[MIT](./LICENSE) © Geptyro
