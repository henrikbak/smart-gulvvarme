#!/usr/bin/env python3
"""Assemble the widget mockup artboards.

Each widget is written once as a fragment; this pairs every fragment with the
Homey token block and renders it twice per artboard, light beside dark, so the
two modes can never drift apart. Run after editing a fragment or the tokens:

    python3 art/widget-mockups/build.py

Artboard heights in `_sizes.json` are measured, not guessed - see README.md.
"""

import json
import pathlib

HERE = pathlib.Path(__file__).parent

PAGE = '''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
{tokens}
    .stage {{ align-items: stretch; min-height: 100vh; }}
  </style>
</helmet>
<div class="stage">
  <div class="mode-light pane">
    <div class="pane-label">Lys</div>
{light}
  </div>
  <div class="mode-dark pane">
    <div class="pane-label">M&#248;rk</div>
{dark}
  </div>
</div>
</x-dc>
<script data-dc-script data-props='{props}'>
class Component extends DCLogic {{
  renderVals() {{
    return {{ accent: this.props.accent ?? '#ff8400' }};
  }}
}}
</script>
</body>
</html>
'''

# file stem -> (widget title, fragment)
SINGLE = [
    ('Main', 'Varme', 'heatstrip'),
    ('RoomTile', 'Badev&#230;relse', 'roomtile'),
    ('BuildingStrip', 'Udenfor', 'building'),
    ('SensorHealth', 'Sensorer', 'sensors'),
    ('BoostButton', 'Boost badev&#230;relse', 'boost'),
]

# The stacked view: what a dashboard column actually looks like.
COLUMN = [('Varme', 'heatstrip'), ('Udenfor', 'building'), ('Boost badev&#230;relse', 'boost')]

WIDTH = 800


def fragment(name):
    return (HERE / f'{name}.frag.html').read_text(encoding='utf-8').rstrip('\n')


def titled(title, name):
    return f'    <div class="widget-title">{title}</div>\n{fragment(name)}'


def props(width, height):
    return json.dumps({
        'accent': {
            'editor': 'color',
            'default': '#ff8400',
            # Homey's own orange, then the app's brand orange.
            'options': ['#ff8400', '#f36b21', '#d81c1d', '#0082fa'],
            'section': 'Theme',
        },
        '$preview': {'width': width, 'height': height},
    })


def main():
    tokens = (HERE / '_tokens.css').read_text(encoding='utf-8')
    sizes = json.loads((HERE / '_sizes.json').read_text(encoding='utf-8'))

    def write(stem, body):
        (HERE / f'{stem}.dc.html').write_text(
            PAGE.format(tokens=tokens, light=body, dark=body,
                        props=props(WIDTH, sizes[stem])),
            encoding='utf-8')

    for stem, title, name in SINGLE:
        write(stem, titled(title, name))
    write('Dashboard', '\n'.join(titled(t, n) for t, n in COLUMN))

    gap_x, gap_y = 100, 140
    row2 = max(sizes[s] for s, _, _ in SINGLE[:3]) + gap_y
    placed = [
        ('Main', 0, 0), ('RoomTile', WIDTH + gap_x, 0), ('BuildingStrip', 2 * (WIDTH + gap_x), 0),
        ('SensorHealth', 0, row2), ('BoostButton', WIDTH + gap_x, row2),
        ('Dashboard', 2 * (WIDTH + gap_x), row2),
    ]
    canvas = {
        'artboards': [
            {'file': f'{stem}.dc.html', 'x': x, 'y': y, 'w': WIDTH, 'h': sizes[stem]}
            for stem, x, y in placed
        ],
        'annotations': [
            {'id': 'note-lead', 'x': 0, 'y': -170, 'w': WIDTH,
             'text': 'Heat strip - the lead concept. heating_power and is_heating are custom '
                     'capabilities of this app, so no built-in Homey widget can draw them. Readings '
                     'are sample data; room names come from the Smart Gulvvarme account, which is '
                     'why they are Danish.'},
            {'id': 'note-tokens', 'x': WIDTH + gap_x, 'y': -170, 'w': WIDTH,
             'text': "Colours, type ramp and spacing are Homey's published widget tokens at their "
                     "exact values. The orange is Homey's own --homey-color-orange (#ff8400); the "
                     "accent chip above each artboard swaps it for the app's brand orange "
                     "(#f36b21) or any other."},
            {'id': 'note-dashboard', 'x': 2 * (WIDTH + gap_x), 'y': row2 - 60, 'w': WIDTH,
             'text': 'How three of them sit together in one dashboard column.'},
        ],
        'launch': {'view': 'canvas'},
    }
    (HERE / 'canvas.json').write_text(json.dumps(canvas, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {len(placed)} artboards and canvas.json')


if __name__ == '__main__':
    main()
