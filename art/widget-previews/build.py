#!/usr/bin/env python3
"""Draw the App Store widget previews.

Store guideline 1.10 asks for a *simplified representation* of the widget: no
text, no screenshots, simple shapes, few colours, a transparent background and
1024x1024 pixels, light and dark. So every label, reading and button caption in
the real widget is drawn here as a plain rounded bar - the layout survives, the
content does not. Colours come from the same Homey token ramp the widgets
themselves use (art/widget-mockups/_tokens.css).

    python3 art/widget-previews/build.py

Writes widgets/<widget>/preview-light.png and preview-dark.png. Rasterising
needs a Chromium; set CHROME to point at one if the default path is wrong.
"""

import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
WIDGETS = ROOT / 'widgets'

SIZE = 1024
CARD_X = 72
CARD_W = SIZE - 2 * CARD_X
PAD = 56
INNER_X = CARD_X + PAD
INNER_W = CARD_W - 2 * PAD
INNER_R = CARD_X + CARD_W - PAD  # right edge of the content column

ACCENT = '#ff8400'
GREEN = '#3fc700'

# Two points on Homey's mono ramp per mode: `bar` stands in for text, `track`
# for the surfaces text sits on. The ramp inverts between modes.
THEME = {
    'light': {
        'card': '#ffffff',
        'strong': '#b1b1b9',   # what a heading-sized value would occupy
        'bar': '#dadae2',
        'track': '#eaeaf1',
        'line': '#eaeaf1',
        'shadow': ('6', '14', '0.10'),
    },
    'dark': {
        'card': '#1f2029',
        'strong': '#4f515f',
        'bar': '#3b3d4a',
        'track': '#2b2c36',
        'line': '#2b2c36',
        'shadow': ('8', '18', '0.55'),
    },
}


def rect(x, y, w, h, r, fill, opacity=1.0):
    o = '' if opacity >= 1 else f' opacity="{opacity}"'
    return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
            f'rx="{r:.1f}" fill="{fill}"{o}/>')


def bar(x, y, w, h, fill, opacity=1.0):
    """A text placeholder: a fully rounded bar."""
    return rect(x, y, w, h, h / 2, fill, opacity)


def circle(cx, cy, r, fill, opacity=1.0):
    o = '' if opacity >= 1 else f' opacity="{opacity}"'
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}"{o}/>'


def right_bar(w, y, h, fill, opacity=1.0):
    return bar(INNER_R - w, y, w, h, fill, opacity)


def signal(x, y, fill):
    """Three ascending bars - the sensor signal glyph, as shapes."""
    out = []
    for i in range(3):
        h = 12 + i * 10
        out.append(rect(x + i * 14, y + 32 - h, 9, h, 3, fill))
    return ''.join(out)


def heat_strip(t):
    """Five rooms: a dot, a name, a track with its percentage, a reading."""
    rows = [(250, 0.72), (330, 0.62), (300, 0.22), (215, 0.0), (235, 0.0)]
    height = PAD * 2 + len(rows) * 104 - 24
    out = []
    y = PAD
    for name_w, fill in rows:
        hot = fill > 0
        out.append(circle(INNER_X + 11, y + 15, 11, ACCENT if hot else t['track']))
        out.append(bar(INNER_X + 40, y, name_w, 30, t['bar']))
        out.append(right_bar(120, y, 30, t['strong']))
        track_w = INNER_W - 40 - 150 - 90
        out.append(bar(INNER_X + 40, y + 48, track_w, 16, t['track']))
        if hot:
            out.append(bar(INNER_X + 40, y + 48, track_w * fill, 16, ACCENT))
        # The percentage the widget prints at the end of the track.
        out.append(bar(INNER_X + 40 + track_w + 16, y + 48, 74, 16,
                       t['bar'] if hot else t['track']))
        out.append(right_bar(90, y + 48, 16, t['track']))
        y += 104
    return height, out


def room_tile(t):
    """One room: the reading, a setpoint stepper, a four-way mode switch."""
    out = [
        rect(INNER_X, PAD, 250, 62, 20, t['strong']),
        bar(INNER_X, PAD + 82, 190, 22, t['bar']),
    ]
    # Status pill, top right.
    pill_w, pill_h = 250, 60
    out.append(rect(INNER_R - pill_w, PAD, pill_w, pill_h, pill_h / 2, t['track']))
    out.append(circle(INNER_R - pill_w + 34, PAD + pill_h / 2, 11, ACCENT))
    out.append(bar(INNER_R - pill_w + 58, PAD + pill_h / 2 - 11, 140, 22, t['bar']))

    # Stepper: two buttons around the setpoint.
    sy = PAD + 150
    for bx in (INNER_X, INNER_R - 104):
        out.append(rect(bx, sy, 104, 104, 30, t['track']))
    out.append(rect(INNER_X + 30, sy + 47, 44, 10, 5, t['bar']))
    px = INNER_R - 104
    out.append(rect(px + 30, sy + 47, 44, 10, 5, t['bar']))
    out.append(rect(px + 47, sy + 30, 10, 44, 5, t['bar']))
    out.append(bar(SIZE / 2 - 105, sy + 20, 210, 30, t['strong']))
    out.append(bar(SIZE / 2 - 75, sy + 62, 150, 22, t['bar']))

    # Mode switch: four segments, the last one selected.
    my = sy + 150
    seg_h = 96
    out.append(rect(INNER_X, my, INNER_W, seg_h, 30, t['track']))
    seg_w = INNER_W / 4
    out.append(rect(INNER_X + 3 * seg_w, my, seg_w, seg_h, 30, ACCENT))
    for i in range(4):
        cx = INNER_X + seg_w * (i + 0.5)
        fill = '#ffffff' if i == 3 else t['bar']
        out.append(bar(cx - 44, my + seg_h / 2 - 11, 88, 22, fill))
    return my + seg_h + PAD, out


def building_strip(t):
    """The house: outside reading, wind, cloud cover, gateway health."""
    out = [
        rect(INNER_X, PAD, 230, 62, 20, t['strong']),
        bar(INNER_X, PAD + 82, 220, 22, t['bar']),
    ]
    # Wind: a dial with an arrow, then its reading.
    cx, cy = INNER_R - 260, PAD + 34
    out.append(circle(cx, cy, 36, t['track']))
    out.append(f'<path d="M{cx:.1f} {cy - 16:.1f} v32 M{cx - 13:.1f} {cy + 4:.1f} '
               f'l13 13 13 -13" fill="none" stroke="{t["strong"]}" stroke-width="7" '
               'stroke-linecap="round" stroke-linejoin="round"/>')
    out.append(right_bar(170, PAD, 30, t['strong']))
    out.append(right_bar(120, PAD + 44, 22, t['bar']))

    # Cloud cover: a label, a track, a reading.
    ty = PAD + 150
    out.append(bar(INNER_X, ty, 170, 24, t['bar']))
    track_x = INNER_X + 200
    track_w = INNER_W - 200 - 130
    out.append(bar(track_x, ty + 4, track_w, 16, t['track']))
    out.append(bar(track_x, ty + 4, track_w * 0.62, 16, t['strong']))
    out.append(right_bar(110, ty, 24, t['bar']))

    # Gateway health.
    ly = PAD + 220
    out.append(rect(INNER_X, ly, INNER_W, 3, 1.5, t['line']))
    out.append(circle(INNER_X + 11, ly + 55, 11, GREEN))
    out.append(bar(INNER_X + 38, ly + 42, 240, 26, t['bar']))
    out.append(right_bar(190, ly + 44, 22, t['track']))
    return ly + 68 + PAD, out


def sensor_health(t):
    """The table: one row per room, humidity, battery, signal."""
    rows = [(190, False), (230, False), (280, False), (250, True)]
    height = PAD * 2 + 60 + len(rows) * 88 + 100
    out = [
        bar(INNER_X, PAD, 110, 22, t['track']),
        bar(INNER_R - 300, PAD, 110, 22, t['track']),
        bar(INNER_R - 130, PAD, 130, 22, t['track']),
    ]
    y = PAD + 66
    for name_w, muted in rows:
        text = t['track'] if muted else t['strong']
        out.append(bar(INNER_X, y, name_w, 30, text))
        out.append(bar(INNER_R - 300, y, 100, 30, text))
        out.append(bar(INNER_R - 150, y + 3, 90, 26, ACCENT if name_w == 280 else text))
        out.append(signal(INNER_R - 38, y, t['track'] if muted else GREEN))
        y += 88
    # The warning line: a mark and a message.
    out.append(rect(INNER_X, y + 4, INNER_W, 3, 1.5, t['line']))
    wy = y + 52
    out.append(f'<path d="M{INNER_X + 16:.1f} {wy - 15:.1f} l16 28 h-32 z" fill="{ACCENT}"/>')
    out.append(bar(INNER_X + 52, wy - 13, 430, 26, t['bar']))
    return height, out


def boost(t):
    """One tap: the whole widget is the button."""
    cx = SIZE / 2
    top = PAD + 10
    # The flame the widget draws, scaled up from its 24px grid.
    flame = ('M13 2.5c.4 3.2-1.2 4.6-2.6 6C9 9.8 7.5 11.2 7.5 14a5.5 5.5 0 0 0 11 0'
             'c0-2.2-1-3.9-2.2-5.2-.3 1-1 1.7-1.8 2 .3-3.4-1.4-6.6-1.5-8.3z')
    scale = 7.5
    out = [
        f'<g transform="translate({cx - 13 * scale:.1f} {top:.1f}) scale({scale})">'
        f'<path d="{flame}" fill="none" stroke="#ffffff" stroke-width="1.5" '
        'stroke-linejoin="round"/></g>',
        bar(cx - 110, top + 200, 220, 34, '#ffffff'),
        bar(cx - 160, top + 258, 320, 26, '#ffffff', 0.6),
    ]
    return top + 284 + PAD, out, ACCENT


WIDGETS_TO_DRAW = {
    'heat-strip': heat_strip,
    'room-tile': room_tile,
    'building-strip': building_strip,
    'sensor-health': sensor_health,
    'boost': boost,
}


def svg(name, mode):
    t = THEME[mode]
    drawn = WIDGETS_TO_DRAW[name](t)
    height, shapes = drawn[0], drawn[1]
    card_fill = drawn[2] if len(drawn) > 2 else t['card']
    top = (SIZE - height) / 2
    dy, blur, opacity = t['shadow']
    body = ''.join(shapes)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">
  <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="{dy}" stdDeviation="{blur}" flood-color="#000000" flood-opacity="{opacity}"/>
  </filter>
  <g transform="translate(0 {top:.1f})">
    {rect(CARD_X, 0, CARD_W, height, 44, card_fill).replace('/>', ' filter="url(#s)"/>')}
    {body}
  </g>
</svg>
'''


def chrome():
    env = os.environ.get('CHROME')
    candidates = [env] if env else []
    candidates += [
        '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
        shutil.which('chromium'),
        shutil.which('chromium-browser'),
        shutil.which('google-chrome'),
    ]
    for c in candidates:
        if c and pathlib.Path(c).exists():
            return c
    sys.exit('No Chromium found; set CHROME to one.')


def main():
    binary = chrome()
    tmp = pathlib.Path(tempfile.mkdtemp())
    for name in WIDGETS_TO_DRAW:
        for mode in ('light', 'dark'):
            src = tmp / f'{name}-{mode}.svg'
            src.write_text(svg(name, mode), encoding='utf-8')
            out = WIDGETS / name / f'preview-{mode}.png'
            subprocess.run([
                binary, '--headless', '--disable-gpu', '--no-sandbox',
                '--hide-scrollbars', '--force-device-scale-factor=1',
                '--default-background-color=00000000',
                f'--window-size={SIZE},{SIZE}',
                f'--screenshot={out}', src.as_uri(),
            ], check=True, capture_output=True)
            print(f'{out.relative_to(ROOT)}')
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
