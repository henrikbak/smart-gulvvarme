# Widget previews

Generates `widgets/<id>/preview-light.png` and `preview-dark.png` — the images the
Widget picker and the App Store show before a widget is added. Nothing here ships:
`/art/` is excluded by `.homeyignore`.

```bash
python3 art/widget-previews/build.py
```

App Store guideline 1.10 rules out the obvious approach: a preview may not be a
screenshot of the widget and may not contain text. So `build.py` redraws each widget
as flat shapes — every label, reading and caption becomes a plain rounded bar — at
1024x1024 on a transparent background, in light and dark. Colours are the Homey mono
ramp from [`../widget-mockups/_tokens.css`](../widget-mockups/_tokens.css) plus the
orange accent and one green, so the previews and the widgets stay in step.

Rasterising uses headless Chromium. Set `CHROME` if it is not at the path the script
looks for.
