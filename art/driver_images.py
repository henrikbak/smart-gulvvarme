#!/usr/bin/env python3
"""Driver images: the round room sensor and the controller unit, each on white.

Both are drawn from the real hardware: the sensor is the circular e-ink
temperature and humidity display, the controller the wall box that drives the
actuators.
"""
import sys

ORANGE = "#F36B21"
NAVY = "#16233F"
INK = "#2E2E2C"
FONT = "Liberation Sans, Arial, Helvetica, sans-serif"

# -- seven-segment display -----------------------------------------------------

SEGMENTS = {
    "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc",
    "5": "afgcd", "6": "afgecd", "7": "abc", "8": "abcdefg", "9": "abcdfg",
}


def _h_seg(x, y, length, t):
    """Horizontal segment, centreline y, running right from x."""
    h = t / 2
    return (f'<path d="M{x:.1f} {y:.1f} L{x + h:.1f} {y - h:.1f} '
            f'L{x + length - h:.1f} {y - h:.1f} L{x + length:.1f} {y:.1f} '
            f'L{x + length - h:.1f} {y + h:.1f} L{x + h:.1f} {y + h:.1f} Z" fill="{INK}"/>')


def _v_seg(x, y0, y1, t):
    """Vertical segment, centreline x, running down from y0 to y1."""
    h = t / 2
    return (f'<path d="M{x:.1f} {y0:.1f} L{x + h:.1f} {y0 + h:.1f} '
            f'L{x + h:.1f} {y1 - h:.1f} L{x:.1f} {y1:.1f} '
            f'L{x - h:.1f} {y1 - h:.1f} L{x - h:.1f} {y0 + h:.1f} Z" fill="{INK}"/>')


def digit(ch, x, y, w, h, t):
    """One seven-segment glyph, top-left at (x, y). Only lit segments are drawn."""
    on = SEGMENTS[ch]
    mid = y + h / 2
    gap = t * 0.62
    out = []
    if "a" in on: out.append(_h_seg(x, y, w, t))
    if "g" in on: out.append(_h_seg(x, mid, w, t))
    if "d" in on: out.append(_h_seg(x, y + h, w, t))
    if "f" in on: out.append(_v_seg(x, y + gap, mid - gap, t))
    if "b" in on: out.append(_v_seg(x + w, y + gap, mid - gap, t))
    if "e" in on: out.append(_v_seg(x, mid + gap, y + h - gap, t))
    if "c" in on: out.append(_v_seg(x + w, mid + gap, y + h - gap, t))
    return "".join(out)


def reading(value, cx, baseline, big_h, unit):
    """A reading such as 26.0 - two large digits, then a smaller decimal - with
    its unit set small and high, the way the display lays it out."""
    whole, frac = value.split(".")
    big_w, big_t = big_h * 0.47, big_h * 0.135
    sml_h = big_h * 0.64
    sml_w, sml_t = sml_h * 0.47, sml_h * 0.14
    kern, dot_r = big_h * 0.1, big_h * 0.072

    # a glyph is `w` between segment centrelines, so it eats half a segment
    # thickness of air on each side before the next one starts
    adv_big = big_w + big_t + kern
    adv_sml = sml_w + sml_t + kern
    adv_dot = dot_r * 2 + kern
    unit_w = big_h * (0.62 if unit == "C" else 0.44)
    total = len(whole) * adv_big + adv_dot + len(frac) * adv_sml + unit_w

    x = cx - total / 2 + big_t / 2
    out = []
    for ch in whole:
        out.append(digit(ch, x, baseline - big_h, big_w, big_h, big_t))
        x += adv_big
    out.append(f'<circle cx="{x + dot_r:.1f}" cy="{baseline - dot_r:.1f}" r="{dot_r:.1f}" fill="{INK}"/>')
    x += adv_dot
    for ch in frac:
        out.append(digit(ch, x, baseline - sml_h, sml_w, sml_h, sml_t))
        x += adv_sml
    x += sml_t / 2

    top = baseline - big_h
    if unit == "C":
        r = big_h * 0.078
        out.append(f'<circle cx="{x + r + 4:.1f}" cy="{top + r + 6:.1f}" r="{r:.1f}" fill="none" '
                   f'stroke="{INK}" stroke-width="{big_h * 0.062:.1f}"/>')
        out.append(f'<text x="{x + r * 2 + 12:.1f}" y="{top + big_h * 0.35:.1f}" font-family="{FONT}" '
                   f'font-size="{big_h * 0.3:.1f}" font-weight="600" fill="{INK}">C</text>')
    else:
        out.append(f'<text x="{x + 6:.1f}" y="{top + big_h * 0.34:.1f}" font-family="{FONT}" '
                   f'font-size="{big_h * 0.32:.1f}" font-weight="600" fill="{INK}">%</text>')
    return "".join(out)


# -- room sensor ---------------------------------------------------------------

BODY_CX, BODY_CY, BODY_R = 496.0, 470.0, 320.0
SCR_CX, SCR_CY, SCR_R = 488.0, 462.0, 236.0

ROOM = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  <defs>
    <linearGradient id="case" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.6" stop-color="#FAFBFC"/>
      <stop offset="1" stop-color="#ECEFF3"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#DFE4EA"/>
      <stop offset="1" stop-color="#C3CBD5"/>
    </linearGradient>
    <radialGradient id="eink" cx="0.38" cy="0.32" r="0.85">
      <stop offset="0" stop-color="#EFEFEB"/>
      <stop offset="0.7" stop-color="#E6E6E1"/>
      <stop offset="1" stop-color="#D9D9D3"/>
    </radialGradient>
    <filter id="drop" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="15"/>
    </filter>
  </defs>
  <rect width="1000" height="1000" fill="#FFFFFF"/>

  <ellipse cx="500" cy="830" rx="270" ry="30" fill="#9AA9BC" opacity="0.32" filter="url(#drop)"/>

  <!-- kickstand -->
  <path d="M520 700 L604 700 L582 812 Q548 822 522 812 Z" fill="#E3E7EC" stroke="#CDD5DE" stroke-width="4"/>

  <!-- case: the rim shows the depth of the disc -->
  <circle cx="{BODY_CX + 20}" cy="{BODY_CY + 12}" r="{BODY_R}" fill="url(#rim)"/>
  <circle cx="{BODY_CX}" cy="{BODY_CY}" r="{BODY_R}" fill="url(#case)" stroke="#D2D9E1" stroke-width="3"/>

  <!-- e-ink display -->
  <circle cx="{SCR_CX}" cy="{SCR_CY}" r="{SCR_R + 6}" fill="#D3D3CD"/>
  <circle cx="{SCR_CX}" cy="{SCR_CY}" r="{SCR_R}" fill="url(#eink)"/>

  <!-- bluetooth and battery -->
  <g>
    <path d="M446 262 L446 316 L466 300 L438 280 M438 298 L466 278 L446 262"
          fill="none" stroke="{INK}" stroke-width="6.5" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="500" y="270" width="58" height="34" rx="7" fill="none" stroke="{INK}" stroke-width="6.5"/>
    <rect x="562" y="279" width="9" height="16" rx="3" fill="{INK}"/>
    <rect x="509" y="279" width="40" height="16" rx="3" fill="{INK}"/>
  </g>

  <!-- temperature over humidity, split by the rule -->
  {reading("26.0", SCR_CX + 8, 462, 112, "C")}
  <rect x="{SCR_CX - 202}" y="504" width="404" height="5" rx="2.5" fill="{INK}"/>
  {reading("60.0", SCR_CX + 8, 648, 112, "%")}
</svg>
'''



# -- controller unit -----------------------------------------------------------

# A light axonometric: `U` runs along the width of the box, `V` into the depth.
AX, AY = 140.0, 476.0          # front-left corner of the lid
UX, UY = 430.0, 48.0
VX, VY = 152.0, -136.0
BOX_H = 124.0


def lid(s, t):
    """A point on the lid, in fractions of its width and depth."""
    return AX + s * UX + t * VX, AY + s * UY + t * VY


def quad(pts, fill, stroke=None, sw=3):
    d = f'M{pts[0][0]:.1f} {pts[0][1]:.1f}' + "".join(f' L{x:.1f} {y:.1f}' for x, y in pts[1:]) + " Z"
    st = f' stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"' if stroke else ""
    return f'<path d="{d}" fill="{fill}"{st}/>'


def plane(o, u, v, w, h):
    """Map a local w x h drawing space onto the parallelogram at `o` spanned by u and v."""
    return (f'matrix({u[0] / w:.5f},{u[1] / w:.5f},{v[0] / h:.5f},{v[1] / h:.5f},'
            f'{o[0]:.2f},{o[1]:.2f})')


def qr(x, y, size, modules=21):
    """A stand-in QR block - finder squares and a stable scatter of modules."""
    import random
    rnd = random.Random(7)
    m = size / modules
    cells = []
    def finder(cx, cy):
        cells.append(f'<rect x="{x + cx * m:.1f}" y="{y + cy * m:.1f}" width="{7 * m:.1f}" height="{7 * m:.1f}" fill="{NAVY}"/>')
        cells.append(f'<rect x="{x + (cx + 1) * m:.1f}" y="{y + (cy + 1) * m:.1f}" width="{5 * m:.1f}" height="{5 * m:.1f}" fill="#FFFFFF"/>')
        cells.append(f'<rect x="{x + (cx + 2) * m:.1f}" y="{y + (cy + 2) * m:.1f}" width="{3 * m:.1f}" height="{3 * m:.1f}" fill="{NAVY}"/>')
    def in_finder(r, c):
        return ((r < 8 and c < 8) or (r < 8 and c >= modules - 8) or (r >= modules - 8 and c < 8))
    for r in range(modules):
        for c in range(modules):
            if in_finder(r, c) or not rnd.getrandbits(1):
                continue
            cells.append(f'<rect x="{x + c * m:.1f}" y="{y + r * m:.1f}" width="{m:.1f}" height="{m:.1f}" fill="{NAVY}"/>')
    finder(0, 0); finder(modules - 7, 0); finder(0, modules - 7)
    return "".join(cells)


LOGO = f'''<g transform="translate(52 228) scale(1.52)">
    <path d="M100 14 L184 92 L184 184 L16 184 L16 92 Z" fill="{ORANGE}" stroke="{ORANGE}"
          stroke-width="16" stroke-linejoin="round"/>
    <path d="M46 108 H124 a15 15 0 0 1 0 30 H64 a15 15 0 0 0 0 30 H150" fill="none"
          stroke="#FFFFFF" stroke-width="15" stroke-linecap="round"/>
  </g>
  <text x="392" y="410" font-family="Liberation Serif, Georgia, serif" font-size="186"
        font-weight="700" fill="{ORANGE}" letter-spacing="4">SMART</text>
  <text x="404" y="588" font-family="Liberation Serif, Georgia, serif" font-size="92"
        font-weight="700" fill="{NAVY}" letter-spacing="2">GULVVARME</text>'''


def panel():
    o = lid(0.07, 0.88)
    u = (0.86 * UX, 0.86 * UY)
    v = (-0.76 * VX, -0.76 * VY)
    return f'''<g transform="{plane(o, u, v, 1400, 800)}">
    <rect x="0" y="0" width="1400" height="800" fill="#F5F7F8"/>
    <rect x="26" y="26" width="1348" height="748" fill="none" stroke="#CDD4DB" stroke-width="9"/>
    {LOGO}
    {qr(1146, 372, 202)}
    <text x="1146" y="636" font-family="{FONT}" font-size="36" fill="#7C858F">Scan for Info</text>
  </g>'''


def screws():
    out = []
    for s_, t_ in ((0.045, 0.085), (0.955, 0.085), (0.045, 0.915), (0.955, 0.915), (0.5, 0.085), (0.5, 0.915)):
        x, y = lid(s_, t_)
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8.5" fill="#DDE2E7" stroke="#B6BEC7" stroke-width="2.5"/>')
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="#9AA3AD"/>')
    return "".join(out)


def cable_slots():
    """Cable entries along the front face, with leads running out of them."""
    routes = [(0.20, 118, 128), (0.38, 176, 146), (0.56, 246, 158)]
    slots, leads = [], []
    for s_, end_x, drop in routes:
        x = AX + s_ * UX
        y = AY + s_ * UY + BOX_H * 0.5
        slots.append(f'<rect x="{x - 27:.1f}" y="{y:.1f}" width="54" height="32" rx="7" fill="#3C444E"/>')
        slots.append(f'<rect x="{x - 27:.1f}" y="{y:.1f}" width="54" height="9" rx="4" fill="#2B323A"/>')
        leads.append(f'<path d="M{x:.1f} {y + 28:.1f} C{x:.1f} {y + drop * 0.7:.1f} '
                     f'{end_x + 40:.1f} {y + drop * 0.5:.1f} {end_x:.1f} {y + drop:.1f}" '
                     f'fill="none" stroke="#C4C9CF" stroke-width="16" stroke-linecap="round"/>')
    return "".join(leads) + "".join(slots)


BUILDING = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  <defs>
    <linearGradient id="valve" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2E5FA8"/>
      <stop offset="0.42" stop-color="#3E7ACB"/>
      <stop offset="1" stop-color="#26518F"/>
    </linearGradient>
    <filter id="drop" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="15"/>
    </filter>
  </defs>
  <rect width="1000" height="1000" fill="#FFFFFF"/>

  <g transform="translate(480 520) scale(1.09) translate(-480 -520)">
  <ellipse cx="470" cy="712" rx="330" ry="42" fill="#9AA9BC" opacity="0.3" filter="url(#drop)"/>
  <ellipse cx="812" cy="716" rx="96" ry="22" fill="#9AA9BC" opacity="0.3" filter="url(#drop)"/>

  <!-- lead running out to the actuator -->
  <path d="M556 606 C640 690 700 706 762 692" fill="none" stroke="#C4C9CF" stroke-width="16" stroke-linecap="round"/>

  <!-- enclosure -->
  {quad([lid(0, 1), lid(1, 1), (AX + UX + VX, AY + UY + VY + BOX_H), (AX + VX, AY + VY + BOX_H)], "#CFD5DC")}
  {quad([lid(0, 0), lid(1, 0), (AX + UX, AY + UY + BOX_H), (AX, AY + BOX_H)], "#E1E5EA", "#C3CAD2")}
  {quad([lid(1, 0), lid(1, 1), (AX + UX + VX, AY + UY + VY + BOX_H), (AX + UX, AY + UY + BOX_H)], "#D2D8DF", "#C3CAD2")}
  {quad([lid(0, 0), lid(1, 0), lid(1, 1), lid(0, 1)], "#EEF1F3", "#C3CAD2")}
  {quad([lid(0.03, 0.06), lid(0.97, 0.06), lid(0.97, 0.94), lid(0.03, 0.94)], "#F2F4F6", "#D7DCE2", 2)}

  {panel()}
  {screws()}
  {cable_slots()}

  <!-- thermal actuator -->
  <g>
    <path d="M754 706 L754 596 a58 26 0 0 1 116 0 L870 706 a58 26 0 0 1 -116 0 Z" fill="url(#valve)"/>
    <ellipse cx="812" cy="596" rx="58" ry="26" fill="#5C93DC"/>
    <ellipse cx="812" cy="596" rx="40" ry="17" fill="#4A7FC6"/>
    <rect x="758" y="648" width="108" height="26" rx="6" fill="#1F4478" opacity="0.55"/>
    <path d="M754 700 a58 26 0 0 0 116 0" fill="none" stroke="#1B3C6B" stroke-width="6"/>
  </g>
  </g>
</svg>
'''


if __name__ == "__main__":
    open(sys.argv[1], "w", encoding="utf-8").write(ROOM)
    open(sys.argv[2], "w", encoding="utf-8").write(BUILDING)
