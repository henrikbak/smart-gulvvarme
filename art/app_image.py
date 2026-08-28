#!/usr/bin/env python3
"""App Store image: a warm living room, with the heated floor glowing beneath it."""
import sys

W, H = 1000, 700
VPX, VPY = 500.0, 296.0     # vanishing point
FLOOR_TOP, FLOOR_BOT = 430.0, 700.0
ORANGE = "#F36B21"


def proj(lateral, y):
    """Screen x for a floor-plane lateral position at screen depth y."""
    return VPX + (lateral - VPX) * (y - VPY) / (FLOOR_BOT - VPY)


def floor():
    parts = []
    shades = ["#C58C5C", "#CE9564", "#BC8151", "#D49E6C", "#C28857", "#CA9160", "#B87D4E"]
    xs = list(range(-460, 1470, 96))
    for i in range(len(xs) - 1):
        x0b, x1b = xs[i], xs[i + 1]
        x0t, x1t = proj(x0b, FLOOR_TOP), proj(x1b, FLOOR_TOP)
        parts.append(
            f'<path d="M{x0t:.1f} {FLOOR_TOP} L{x1t:.1f} {FLOOR_TOP} '
            f'L{x1b} {FLOOR_BOT} L{x0b} {FLOOR_BOT} Z" fill="{shades[i % len(shades)]}"/>'
        )
        parts.append(
            f'<path d="M{x0t:.1f} {FLOOR_TOP} L{x0b} {FLOOR_BOT}" stroke="#8E5C33" '
            f'stroke-width="1.6" opacity="0.35" fill="none"/>'
        )
    # board ends, spaced in perspective
    for y in (446.0, 470.0, 506.0, 560.0, 640.0):
        parts.append(f'<rect x="0" y="{y:.1f}" width="{W}" height="{1.0 + (y - 430) / 90:.1f}" fill="#8E5C33" opacity="0.28"/>')
    return "\n    ".join(parts)


def board_seams():
    """Plank lines redrawn over the loop, so the warmth reads as under the boards."""
    parts = []
    xs = list(range(-460, 1470, 96))
    for xb in xs:
        xt = proj(xb, FLOOR_TOP)
        parts.append(f'<path d="M{xt:.1f} {FLOOR_TOP} L{xb} {FLOOR_BOT}" stroke="#8E5C33" '
                     f'stroke-width="2" opacity="0.3" fill="none"/>')
    for y in (446.0, 470.0, 506.0, 560.0, 640.0):
        parts.append(f'<rect x="0" y="{y:.1f}" width="{W}" height="{1.0 + (y - 430) / 90:.1f}" fill="#8E5C33" opacity="0.22"/>')
    return "\n      ".join(parts)


def serpentine():
    """The heating loop running under the floor boards."""
    depths = [464.0, 506.0, 566.0, 652.0]
    left, right = 12.0, 988.0
    segs = []
    for i, y in enumerate(depths):
        x0, x1 = proj(left, y), proj(right, y)
        wdt = 5.5 + (y - FLOOR_TOP) / 270.0 * 13.0
        if i % 2 == 0:
            segs.append((x0, x1, y, wdt))
        else:
            segs.append((x1, x0, y, wdt))
    d = f'M{segs[0][0]:.1f} {segs[0][2]:.1f}'
    for i, (xa, xb, y, _) in enumerate(segs):
        d += f' L{xb:.1f} {y:.1f}'
        if i + 1 < len(segs):
            ny = segs[i + 1][2]
            r = (ny - y) / 2.0
            sweep = 1 if i % 2 == 0 else 0
            d += f' A{r * 0.62:.1f} {r:.1f} 0 0 {sweep} {segs[i + 1][0]:.1f} {ny:.1f}'
    widths = "".join(
        f'<path d="M{xa:.1f} {y:.1f} L{xb:.1f} {y:.1f}" stroke="#FFDCAE" stroke-width="{w:.1f}" '
        f'stroke-linecap="round" fill="none" opacity="0.26"/>'
        for xa, xb, y, w in segs
    )
    return f'''<g>
      <path d="{d}" fill="none" stroke="{ORANGE}" stroke-width="34" stroke-linecap="round"
            stroke-linejoin="round" opacity="0.5" filter="url(#soft)"/>
      <path d="{d}" fill="none" stroke="#FF9040" stroke-width="16" stroke-linecap="round"
            stroke-linejoin="round" opacity="0.38" filter="url(#soft2)"/>
      {widths}
    </g>'''


SVG = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF7EE"/>
      <stop offset="0.55" stop-color="#FDEEE0"/>
      <stop offset="1" stop-color="#F8E0CB"/>
    </linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8FB3CD"/>
      <stop offset="0.7" stop-color="#BFD6E4"/>
      <stop offset="1" stop-color="#D9E7EF"/>
    </linearGradient>
    <linearGradient id="depth" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5A3418" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#5A3418" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.95" r="0.8">
      <stop offset="0" stop-color="#F79A4E" stop-opacity="0.42"/>
      <stop offset="0.5" stop-color="#F79A4E" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#F79A4E" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lamplight" cx="0.5" cy="0" r="1">
      <stop offset="0" stop-color="#FFDCA8" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#FFDCA8" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sofaBack" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#33596F"/><stop offset="1" stop-color="#28485C"/>
    </linearGradient>
    <linearGradient id="sofaSeat" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2C4F65"/><stop offset="1" stop-color="#1F3A4C"/>
    </linearGradient>
    <filter id="soft" x="-25%" y="-60%" width="150%" height="220%">
      <feGaussianBlur stdDeviation="17"/>
    </filter>
    <filter id="soft2" x="-25%" y="-60%" width="150%" height="220%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
    <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="12"/>
    </filter>
    <clipPath id="pane"><rect x="640" y="118" width="248" height="228" rx="3"/></clipPath>
    <clipPath id="floorClip"><rect x="0" y="{FLOOR_TOP}" width="{W}" height="{H - FLOOR_TOP}"/></clipPath>
  </defs>

  <rect width="{W}" height="{H}" fill="url(#wall)"/>

  <!-- window on to the weather the system steers by -->
  <g>
    <rect x="626" y="104" width="276" height="256" rx="6" fill="#FFFCF7"/>
    <rect x="626" y="104" width="276" height="256" rx="6" fill="none" stroke="#E9D9C7" stroke-width="3"/>
    <rect x="640" y="118" width="248" height="228" rx="3" fill="url(#sky)"/>
    <g clip-path="url(#pane)">
      <circle cx="700" cy="168" r="40" fill="#E3EDF4" opacity="0.9"/>
      <circle cx="746" cy="156" r="30" fill="#EDF4F8" opacity="0.9"/>
      <circle cx="822" cy="176" r="34" fill="#DCE9F1" opacity="0.85"/>
      <path d="M640 290 Q702 244 764 286 Q820 258 888 296 L888 346 L640 346 Z" fill="#EAF2F7"/>
      <path d="M640 312 Q712 280 782 314 Q838 292 888 320 L888 346 L640 346 Z" fill="#FBFDFE"/>
      <g fill="#FFFFFF" opacity="0.92">
        <circle cx="672" cy="150" r="5"/><circle cx="786" cy="132" r="4"/><circle cx="854" cy="212" r="5"/>
        <circle cx="700" cy="236" r="4.5"/><circle cx="762" cy="204" r="4"/><circle cx="836" cy="258" r="4.5"/>
        <circle cx="662" cy="258" r="4"/><circle cx="724" cy="286" r="4"/><circle cx="800" cy="240" r="3.5"/>
      </g>
    </g>
    <rect x="758" y="118" width="9" height="228" fill="#FFFCF7"/>
    <rect x="640" y="228" width="248" height="9" fill="#FFFCF7"/>
    <rect x="612" y="352" width="304" height="14" rx="5" fill="#FFFCF7"/>
    <rect x="612" y="362" width="304" height="5" rx="2" fill="#E4D2BE"/>
  </g>

  <!-- framed print above the sofa -->
  <g>
    <rect x="150" y="122" width="196" height="150" rx="5" fill="#FFFCF7" stroke="#E4D2BE" stroke-width="3"/>
    <rect x="166" y="138" width="164" height="118" fill="#FBEFE0"/>
    <circle cx="248" cy="188" r="34" fill="{ORANGE}" opacity="0.85"/>
    <path d="M166 232 Q212 190 258 222 Q296 244 330 216 L330 256 L166 256 Z" fill="#3F6C82"/>
  </g>

  <!-- floor -->
  <g clip-path="url(#floorClip)">
    <g>
      {floor()}
    </g>
    <rect x="0" y="{FLOOR_TOP}" width="{W}" height="120" fill="url(#depth)"/>
    {serpentine()}
    <g>
      {board_seams()}
    </g>
    <rect x="0" y="{FLOOR_TOP}" width="{W}" height="{H - FLOOR_TOP}" fill="url(#glow)"/>
  </g>

  <!-- skirting -->
  <rect x="0" y="{FLOOR_TOP - 24}" width="{W}" height="24" fill="#FFFCF7"/>
  <rect x="0" y="{FLOOR_TOP - 24}" width="{W}" height="4" fill="#EADAC7"/>
  <rect x="0" y="{FLOOR_TOP - 2}" width="{W}" height="4" fill="#7E5230" opacity="0.45"/>

  <!-- floor lamp -->
  <g>
    <ellipse cx="566" cy="452" rx="150" ry="58" fill="url(#lamplight)"/>
    <path d="M566 442 L566 206" stroke="#3B3128" stroke-width="6" stroke-linecap="round"/>
    <path d="M528 206 L604 206 L589 148 L543 148 Z" fill="#F8CD94"/>
    <path d="M528 206 L604 206 L589 148 L543 148 Z" fill="none" stroke="#DFA congenital" stroke-width="0"/>
    <path d="M528 206 L604 206" stroke="#E9B172" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="566" cy="444" rx="30" ry="8" fill="#3B3128"/>
  </g>

  <!-- rug -->
  <g>
    <ellipse cx="268" cy="546" rx="228" ry="58" fill="#F7ECDF" opacity="0.94"/>
    <ellipse cx="268" cy="546" rx="228" ry="58" fill="none" stroke="#E5CFB6" stroke-width="3"/>
    <ellipse cx="268" cy="546" rx="176" ry="42" fill="none" stroke="{ORANGE}" stroke-width="5" opacity="0.3"/>
    <ellipse cx="268" cy="546" rx="128" ry="28" fill="none" stroke="#E5CFB6" stroke-width="4"/>
  </g>

  <!-- sofa -->
  <g>
    <ellipse cx="286" cy="500" rx="234" ry="26" fill="#7A4A24" opacity="0.28" filter="url(#shadow)"/>
    <rect x="92" y="296" width="396" height="118" rx="30" fill="url(#sofaBack)"/>
    <rect x="126" y="316" width="150" height="84" rx="20" fill="#3E6A82"/>
    <rect x="300" y="316" width="150" height="84" rx="20" fill="#3E6A82"/>
    <rect x="70" y="344" width="62" height="140" rx="24" fill="#3A657D"/>
    <rect x="448" y="344" width="62" height="140" rx="24" fill="#3A657D"/>
    <rect x="112" y="382" width="356" height="96" rx="22" fill="url(#sofaSeat)"/>
    <path d="M290 382 L290 478" stroke="#18303F" stroke-width="3" opacity="0.5"/>
    <g transform="rotate(-9 214 372)">
      <rect x="172" y="330" width="84" height="84" rx="18" fill="{ORANGE}"/>
      <rect x="172" y="330" width="84" height="84" rx="18" fill="none" stroke="#D95C1B" stroke-width="3"/>
    </g>
    <g transform="rotate(8 364 372)">
      <rect x="326" y="332" width="80" height="80" rx="18" fill="#F6E7D4"/>
      <rect x="326" y="332" width="80" height="80" rx="18" fill="none" stroke="#E4CDB2" stroke-width="3"/>
    </g>
    <rect x="128" y="474" width="24" height="30" rx="8" fill="#5E4229"/>
    <rect x="428" y="474" width="24" height="30" rx="8" fill="#5E4229"/>
  </g>

  <!-- the real test of a warm floor -->
  <g>
    <ellipse cx="646" cy="622" rx="104" ry="22" fill="#7A4A24" opacity="0.26" filter="url(#shadow)"/>
    <path d="M566 606 Q560 546 616 538 Q664 532 686 560 Q712 548 732 566 Q750 584 736 606 Q700 624 646 624 Q590 624 566 606 Z" fill="#8D9AAB"/>
    <path d="M596 600 Q604 566 640 560 Q676 556 690 578 Q700 596 686 608 Q640 618 596 600 Z" fill="#F3EAE0" opacity="0.9"/>
    <g fill="#8D9AAB">
      <path d="M712 560 L706 528 L734 546 Z"/>
      <path d="M748 566 L760 538 L768 570 Z"/>
    </g>
    <circle cx="738" cy="578" r="30" fill="#97A4B4"/>
    <path d="M712 560 L707 534 L732 550 Z" fill="#6F7C8D"/>
    <path d="M754 556 L768 536 L770 562 Z" fill="#6F7C8D"/>
    <g stroke="#3E4855" stroke-width="3" stroke-linecap="round" fill="none">
      <path d="M726 578 Q732 583 738 578"/>
      <path d="M746 578 Q752 583 758 578"/>
    </g>
    <path d="M566 606 Q536 600 528 576 Q524 556 542 552 Q556 550 560 566" fill="none" stroke="#8D9AAB" stroke-width="17" stroke-linecap="round"/>
    <g stroke="#6F7C8D" stroke-width="4" stroke-linecap="round" opacity="0.8">
      <path d="M614 546 Q622 538 632 542"/>
      <path d="M652 540 Q660 532 670 536"/>
    </g>
  </g>

  <!-- plant -->
  <g>
    <ellipse cx="898" cy="606" rx="92" ry="24" fill="#7A4A24" opacity="0.26" filter="url(#shadow)"/>
    <g stroke="#4A8760" stroke-width="8" fill="none" stroke-linecap="round">
      <path d="M898 542 L898 448"/><path d="M898 502 Q856 474 846 428"/><path d="M898 488 Q942 462 954 418"/>
    </g>
    <g fill="#55A075">
      <ellipse cx="898" cy="424" rx="29" ry="52"/>
      <ellipse cx="840" cy="410" rx="25" ry="45" transform="rotate(-28 840 410)"/>
      <ellipse cx="958" cy="400" rx="25" ry="45" transform="rotate(26 958 400)"/>
      <ellipse cx="858" cy="474" rx="21" ry="38" transform="rotate(-54 858 474)"/>
      <ellipse cx="940" cy="466" rx="21" ry="38" transform="rotate(52 940 466)"/>
    </g>
    <g fill="#3F8259" opacity="0.5">
      <ellipse cx="898" cy="434" rx="10" ry="40"/>
    </g>
    <path d="M854 536 L942 536 L928 606 Q898 616 868 606 Z" fill="#C4653C"/>
    <rect x="846" y="520" width="104" height="26" rx="9" fill="#D67C4E"/>
  </g>
</svg>
'''

if __name__ == "__main__":
    open(sys.argv[1], "w", encoding="utf-8").write(SVG)
