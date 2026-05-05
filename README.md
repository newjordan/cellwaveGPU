# CellWave Playground

A real-time, GPU-accelerated playground for the CellWave fluid algorithm — a velocity-field simulation with layered noise/wave forcing, directional currents, point emitters, and rect occluders. Mess with every parameter live, then copy a Svelte snippet that reproduces your exact state.

Single-page Vite + Svelte 5 app. The simulation runs on the GPU via OGL (WebGL2). Static-only build, deploys anywhere.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5174
```

## Build

```bash
npm run build    # writes ./dist/ — static, ready to deploy
npm run preview  # serve the built output locally
```

## Deploy

Static `dist/` folder. Drop into:

- **Vercel**: import the repo; framework preset detects Vite automatically. Output dir: `dist`. Build command: `npm run build`.
- **Netlify**: build command `npm run build`, publish dir `dist`.
- **Cloudflare Pages**: same.
- **GitHub Pages**: `npm run build`, push `dist/` to `gh-pages` branch.

No backend, no environment variables, no runtime services required.

## Project layout

```
src/
  main.ts              entry
  App.svelte           UI shell — preview canvas, controls panel, code tab
  app.css              all styling, plain CSS
  lib/
    CellWaveFluid.svelte   the engine (GPU sim) and its types/exports
```

## The engine

Single Svelte component, ~600 lines. Public API has 18 props with calibrated defaults:

| Prop | Type | Notes |
|---|---|---|
| `gridSize` | number | Sim resolution (cells per side). |
| `advection` | number | How much velocity is carried by the flow itself. |
| `diffusion` | number | Viscosity term. |
| `visScale` | number | Speed → tone-curve mapping. |
| `speed` | number | Master multiplier on noise/wave time. |
| `colorStops` | `ColorStop[]` | Gradient applied along `tanh(speed/visScale)^gradientCurve`. |
| `gradientCurve` | number | Power curve before LUT lookup. |
| `gradientContrast` | number | Smoothstep S-curve around midpoint. |
| `tintAmount` | number | Directional hue blend amount (0–1). |
| `tintSaturation` | number | Hue wheel saturation. |
| `tintLightness` | number | Hue wheel lightness. |
| `tintHueOffset` | number | Hue wheel rotation in degrees. |
| `tintHueRange` | number | How much of the wheel a 360° direction sweep traverses. |
| `noiseLayers` | `NoiseLayer[]` | Up to 8 simplex/wave forcing layers. |
| `currents` | `Current[]` | Up to 8 directional force tubes. |
| `emitters` | `Emitter[]` | Up to 8 cone-shaped fans. |
| `occluders` | `Occluder[]` | Up to 8 solid rect blocks. |
| `backgroundColor` | string | Container background color. |
| `class` | string | Extra container classes. |

## How the sim works

Each frame, on the GPU:

1. **Advection** — semi-Lagrangian back-trace on the velocity field.
2. **Diffusion** — 4-neighbor (von Neumann) Laplacian.
3. **Forcing layers** — Ashima/Stefan Gustavson 3D simplex noise + sine waves; up to 8, each with scale/strength/speed/angle.
4. **Currents** — directional force tubes between two cell points; gaussian falloff perpendicular, taper-power falloff along.
5. **Emitters** — cone-shaped force fields; angular spread + length, taper-power falloff.
6. **Occluders** — rect blocks that zero out velocity.

State is held in two `RGBA16F` ping-pong RenderTargets. The render shader maps `tanh(|velocity| / visScale)` → `pow(curve)` → smoothstep contrast → 256-entry color LUT, with an optional directional hue tint blend.

## Performance

At default settings (gridSize 90, 4 forcing layers, no extra forces): ~0.17 ms of JS per frame, vsync-capped at 60 FPS. JS work is constant in `gridSize`; GPU work scales linearly but stays sub-millisecond at default. Pauses automatically when off-screen (`IntersectionObserver`) or when the tab is hidden.

## License

MIT — see [`LICENSE`](./LICENSE). The CellWave algorithm is the author's original work, also MIT-licensed.
