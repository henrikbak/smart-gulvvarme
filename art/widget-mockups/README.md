# Widget mockups

Mockups for the dashboard widget concepts in [`docs/widgets.md`](../../docs/widgets.md),
as a Claude Design canvas. Nothing here ships: `/art/` is excluded by `.homeyignore`.

- `_tokens.css` — Homey's published widget design tokens at their exact values (spacing,
  type ramp, the mono/blue/green/orange/red palettes for both modes). The mono ramp
  inverts between modes, so one token index works in both.
- `*.frag.html` — one fragment per widget. Each is rendered twice per artboard, light
  beside dark, so the two modes cannot drift apart.
- `build.py` — assembles the fragments into `*.dc.html` artboards plus `canvas.json`.
- `_sizes.json` — artboard frame heights.

## Regenerating

```bash
python3 art/widget-mockups/build.py
```

Then re-seed and publish the canvas with the `design` skill's `seed-canvas.mjs`.

## Measuring heights

Frame heights are measured, not guessed — an artboard frame neither scales nor crops, so
a frame shorter than its content clips. Render a fragment in a plain page and read back
`.stage` height with `min-height` neutralised. Note that headless Chromium's viewport is
roughly 88 px shorter than `--window-size`, so measure and screenshot with headroom or
the result looks clipped when it is not.

## Sample data

Readings are made up. Room names are Danish because they come from the Smart Gulvvarme
account, and the app is sold in Denmark; the widget chrome would be localised through
`.homeycompose/locales` like the rest of the app.
