#!/usr/bin/env python3
"""Driver icons: the same two devices as the driver images, drawn as line work.

The App Store guidelines ask for a vector drawing of the device with dimension
added through angles rather than a flat, front-facing glyph, so both are turned
away from the viewer: the room sensor is a disc yawed to the right so its rim
shows, the controller an axonometric box seen from above with its side wall in
view. Strokes only, no fills or background, on the full 960x960 canvas.

    python3 art/driver_icons.py

writes drivers/room/assets/icon.svg and drivers/building/assets/icon.svg.
"""
import math
import os

STRUCTURE = 46.0   # the outline of the device itself
DETAIL = 34.0      # markings on it, kept lighter so they do not clog at 40px

HEAD = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 960" '
        'width="960" height="960">\n')


def group(width, body):
    return (f'  <g fill="none" stroke="#000" stroke-width="{width:g}" '
            f'stroke-linecap="round" stroke-linejoin="round">\n{body}  </g>\n')


# -- room sensor ---------------------------------------------------------------

# The disc yawed about its vertical axis: the face projects to an ellipse and a
# crescent of the side wall opens up on the right. `SHIFT` is how far the back
# edge of the puck lands to the right of the front one at this angle.
YAW = math.radians(34)
CX, CY = 422.0, 455.0
FACE_R = 400.0
DEPTH = 215.0

RX = FACE_R * math.cos(YAW)
RY = FACE_R
SHIFT = DEPTH * math.sin(YAW)

SCREEN = 0.74      # the e-ink circle as a fraction of the face
SRX, SRY = RX * SCREEN, RY * SCREEN


def room():
    body = []
    # the face, then the back edge of the puck and the two silhouette tangents
    # that close the side wall between them
    body.append(f'<ellipse cx="{CX:.1f}" cy="{CY:.1f}" rx="{RX:.1f}" ry="{RY:.1f}"/>')
    body.append(f'<path d="M{CX + SHIFT:.1f} {CY - RY:.1f} '
                f'A{RX:.1f} {RY:.1f} 0 0 1 {CX + SHIFT:.1f} {CY + RY:.1f}"/>')
    body.append(f'<path d="M{CX:.1f} {CY - RY:.1f} L{CX + SHIFT:.1f} {CY - RY:.1f}"/>')
    body.append(f'<path d="M{CX:.1f} {CY + RY:.1f} L{CX + SHIFT:.1f} {CY + RY:.1f}"/>')
    body.append(f'<ellipse cx="{CX:.1f}" cy="{CY:.1f}" rx="{SRX:.1f}" ry="{SRY:.1f}"/>')
    outline = "".join(f"    {p}\n" for p in body)

    # what the display shows: the rule, with a reading above and below it - the
    # value, then its unit set apart. Offsets are given on the face and
    # foreshortened with it, so they stay put as the disc turns.
    def mark(x0, x1, y):
        return (f'    <path d="M{CX + x0 * math.cos(YAW):.1f} {y:.1f} '
                f'L{CX + x1 * math.cos(YAW):.1f} {y:.1f}"/>\n')

    marks = [mark(-205, 205, CY)]
    for y in (CY - 142.0, CY + 142.0):
        marks.append(mark(-180, -25, y))
        marks.append(mark(30, 105, y))

    return (HEAD
            + group(STRUCTURE, outline)
            + group(DETAIL, "".join(marks))
            + '</svg>\n')


# -- controller unit -----------------------------------------------------------

# The same axonometric as the driver image: `U` runs along the width of the box,
# `V` into its depth, and the lid is high enough above the front wall to put the
# viewer above the unit rather than level with it.
AX, AY = 105.0, 615.0
UX, UY = 528.0, 62.0
VX, VY = 245.0, -352.0
BOX_H = 120.0


def lid(s, t):
    """A point on the lid, in fractions of its width and depth."""
    return AX + s * UX + t * VX, AY + s * UY + t * VY


def wall(s, y):
    """A point on the front wall: `s` across its width, `y` down its height."""
    return AX + s * UX, AY + s * UY + y * BOX_H


def poly(pts, close=True):
    d = f'M{pts[0][0]:.1f} {pts[0][1]:.1f}' + "".join(f' L{x:.1f} {y:.1f}' for x, y in pts[1:])
    return f'    <path d="{d}{" Z" if close else ""}"/>\n'


GLANDS = (0.10, 0.32, 0.54, 0.76)
GLAND_W = 0.14
GLAND_TOP, GLAND_BOTTOM = 0.30, 1.20


def building():
    # lid, then the front and right walls. The bottom edge of the front wall is
    # broken where a gland sits on it, so the glands read as fitted into the
    # wall rather than as boxes drawn across it.
    outline = poly([lid(0, 0), lid(1, 0), lid(1, 1), lid(0, 1)])
    outline += poly([wall(0, 0), wall(0, 1)], close=False)
    edges = [0.0] + [e for s in GLANDS for e in (s, s + GLAND_W)] + [1.0]
    for a, b in zip(edges[::2], edges[1::2]):
        outline += poly([wall(a, 1), wall(b, 1)], close=False)
    outline += poly([wall(1, 0), wall(1, 1)], close=False)
    outline += poly([lid(1, 1), (lid(1, 1)[0], lid(1, 1)[1] + BOX_H), wall(1, 1)], close=False)

    # the label plate on the lid
    plate = poly([lid(0.10, 0.14), lid(0.90, 0.14), lid(0.90, 0.86), lid(0.10, 0.86)])

    # the cable glands along the bottom of the front wall, each with a tail
    glands, tails = "", ""
    for s in GLANDS:
        glands += poly([wall(s, GLAND_TOP), wall(s, GLAND_BOTTOM),
                        wall(s + GLAND_W, GLAND_BOTTOM), wall(s + GLAND_W, GLAND_TOP)],
                       close=False)
        x, y = wall(s + GLAND_W / 2, GLAND_BOTTOM)
        tails += (f'    <path d="M{x:.1f} {y:.1f} C{x:.1f} {y + 56:.1f} '
                  f'{x - 58:.1f} {y + 48:.1f} {x - 70:.1f} {y + 102:.1f}"/>\n')

    return (HEAD
            + group(STRUCTURE, outline)
            + group(DETAIL, plate + glands + tails)
            + '</svg>\n')


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for name, svg in (("room", room()), ("building", building())):
        path = os.path.join(root, "drivers", name, "assets", "icon.svg")
        with open(path, "w", encoding="utf-8") as f:
            f.write(svg)
        print(path)
