#!/usr/bin/env python3
"""Driver icons: the room sensor and the controller, drawn to the house style.

Measured off the icons Athom's own designers deliver in athombv/homey-vectors-
public, which the App Store guidelines point at. What that art does, and what
this follows:

  * the outer silhouette is one closed path at stroke width 40, and every line
    inside it - seams, plates, markings - is drawn at exactly half that;
  * the device is turned a little rather than projected honestly: the face
    stays close to frontal and a slice of its left side is thrown out to the
    left, which is what gives the drawings their depth;
  * corners are generously rounded, detail is sparse, and nothing is drawn that
    is not part of the device - none of the 1609 icons in that repository draws
    a trailing cable.

    python3 art/driver_icons.py

writes drivers/room/assets/icon.svg and drivers/building/assets/icon.svg.
"""
import math
import os

EDGE = 40      # the outer silhouette of the device
LINE = 20      # everything inside it

HEAD = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 960" '
        'width="960" height="960">\n')


def group(width, body):
    return (f'  <g fill="none" stroke="#000" stroke-width="{width:g}" '
            f'stroke-linecap="round" stroke-linejoin="round">\n{body}  </g>\n')


def path(d):
    return f'    <path d="{d}"/>\n'


def rounded(pts, r):
    """A closed path through `pts` with the corners cut to a radius of `r`,
    clamped per corner so a short edge cannot round past its own midpoint."""
    n = len(pts)
    out = []
    for i in range(n):
        a, b, c = pts[(i - 1) % n], pts[i], pts[(i + 1) % n]
        va = (a[0] - b[0], a[1] - b[1])
        vc = (c[0] - b[0], c[1] - b[1])
        la = math.hypot(*va) or 1.0
        lc = math.hypot(*vc) or 1.0
        k = min(r, la / 2, lc / 2)
        p = (b[0] + va[0] / la * k, b[1] + va[1] / la * k)
        q = (b[0] + vc[0] / lc * k, b[1] + vc[1] / lc * k)
        out.append((p, b, q))
    d = f'M{out[0][2][0]:.1f} {out[0][2][1]:.1f}'
    for i in range(1, n + 1):
        p, b, q = out[i % n]
        d += f' L{p[0]:.1f} {p[1]:.1f} Q{b[0]:.1f} {b[1]:.1f} {q[0]:.1f} {q[1]:.1f}'
    return d + " Z"


# -- room sensor ---------------------------------------------------------------

# The disc turned a little to the right, so a crescent of its rim opens up on
# the left. The face is only slightly narrowed - the turn reads from the rim,
# not from squashing the circle.
CX, CY = 537.5, 480.0
RY = 385.0
RX = 323.0
RIM = 115.0        # how far the back edge of the puck sits to the left

SCREEN = 0.72
SRX, SRY = RX * SCREEN, RY * SCREEN


def room():
    # silhouette: the right half of the face, down the rim to the back edge,
    # round its left half and back along the top
    edge = path(
        f'M{CX:.1f} {CY - RY:.1f} '
        f'A{RX:.1f} {RY:.1f} 0 0 1 {CX:.1f} {CY + RY:.1f} '
        f'L{CX - RIM:.1f} {CY + RY:.1f} '
        f'A{RX:.1f} {RY:.1f} 0 0 1 {CX - RIM:.1f} {CY - RY:.1f} Z'
    )

    # the seam that closes the face, and the e-ink circle inside it
    inside = path(f'M{CX:.1f} {CY - RY:.1f} '
                  f'A{RX:.1f} {RY:.1f} 0 0 0 {CX:.1f} {CY + RY:.1f}')
    inside += f'    <ellipse cx="{CX:.1f}" cy="{CY:.1f}" rx="{SRX:.1f}" ry="{SRY:.1f}"/>\n'

    # what the display shows: a reading over a reading, split by the rule
    def mark(x0, x1, y):
        return path(f'M{CX + x0:.1f} {y:.1f} L{CX + x1:.1f} {y:.1f}')

    inside += mark(-160, 160, CY)
    for y in (CY - 132.0, CY + 132.0):
        inside += mark(-140, -42, y)
        inside += mark(-6, 50, y)

    return HEAD + group(EDGE, edge) + group(LINE, inside) + '</svg>\n'


# -- controller unit -----------------------------------------------------------

# The lid faces us, keystoned so its left edge stands nearer, and the body of
# the box is thrown up and to the left behind it. The cable glands sit along the
# bottom edge and belong to the silhouette, the way terminal blocks do on the
# DIN-rail icons.
LT, LB = (215.0, 215.0), (215.0, 760.0)
RT, RB = (885.0, 295.0), (885.0, 690.0)
THROW = (-150.0, -110.0)

GLANDS = ((0.09, 0.23), (0.30, 0.44), (0.51, 0.65), (0.72, 0.86))
GLAND_DROP = 0.13


def face(a, b):
    """A point on the lid: `a` across it from left to right, `b` down it."""
    top = (LT[0] + a * (RT[0] - LT[0]), LT[1] + a * (RT[1] - LT[1]))
    bot = (LB[0] + a * (RB[0] - LB[0]), LB[1] + a * (RB[1] - LB[1]))
    return (top[0] + b * (bot[0] - top[0]), top[1] + b * (bot[1] - top[1]))


def back(p):
    return (p[0] + THROW[0], p[1] + THROW[1])


def building():
    # silhouette: up the right edge of the lid, across the top of the box and
    # down its left side, then back along the bottom around each gland
    pts = [face(1, 1), face(1, 0), back(face(1, 0)), back(face(0, 0)),
           back(face(0, 1)), face(0, 1)]
    for a0, a1 in GLANDS:
        pts += [face(a0, 1), face(a0, 1 + GLAND_DROP),
                face(a1, 1 + GLAND_DROP), face(a1, 1)]
    edge = path(rounded(pts, 22))

    # the two seams where the lid meets the body, and the label plate on it
    inside = path(f'M{face(0, 1)[0]:.1f} {face(0, 1)[1]:.1f} '
                  f'L{face(0, 0)[0]:.1f} {face(0, 0)[1]:.1f} '
                  f'L{face(1, 0)[0]:.1f} {face(1, 0)[1]:.1f}')
    inside += path(f'M{face(0, 0)[0]:.1f} {face(0, 0)[1]:.1f} '
                   f'L{back(face(0, 0))[0]:.1f} {back(face(0, 0))[1]:.1f}')
    inside += path(rounded([face(0.08, 0.11), face(0.92, 0.11),
                            face(0.92, 0.73), face(0.08, 0.73)], 18))

    return HEAD + group(EDGE, edge) + group(LINE, inside) + '</svg>\n'


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for name, svg in (("room", room()), ("building", building())):
        p = os.path.join(root, "drivers", name, "assets", "icon.svg")
        with open(p, "w", encoding="utf-8") as f:
            f.write(svg)
        print(p)
