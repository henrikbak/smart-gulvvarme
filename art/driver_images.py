#!/usr/bin/env python3
"""Driver images: the room thermostat and the gateway, each on white."""
import sys

ORANGE = "#F36B21"
NAVY = "#16233F"
FONT = "Liberation Sans, Arial, Helvetica, sans-serif"

DEFS = f'''  <defs>
    <linearGradient id="case" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.55" stop-color="#F7F9FC"/>
      <stop offset="1" stop-color="#E7ECF3"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#DCE3EC"/>
      <stop offset="1" stop-color="#C2CCD9"/>
    </linearGradient>
    <linearGradient id="screen" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#1E2F52"/>
      <stop offset="1" stop-color="#101B32"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.32"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="led" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#FFC48A"/>
      <stop offset="0.45" stop-color="{ORANGE}"/>
      <stop offset="1" stop-color="#D2560F"/>
    </radialGradient>
    <filter id="drop" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
    <filter id="halo" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
  </defs>'''


ROOM = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
{DEFS}
  <rect width="1000" height="1000" fill="#FFFFFF"/>

  <!-- contact shadow -->
  <ellipse cx="500" cy="862" rx="268" ry="32" fill="#9AA9BC" opacity="0.34" filter="url(#drop)"/>

  <!-- case -->
  <rect x="212" y="164" width="576" height="676" rx="68" fill="url(#edge)"/>
  <rect x="212" y="164" width="576" height="654" rx="68" fill="url(#case)" stroke="#C6D0DD" stroke-width="4"/>
  <rect x="230" y="182" width="540" height="360" rx="56" fill="url(#gloss)"/>

  <!-- display -->
  <rect x="278" y="232" width="444" height="344" rx="42" fill="url(#screen)"/>
  <rect x="278" y="232" width="444" height="344" rx="42" fill="none" stroke="#0B1424" stroke-width="4"/>
  <text x="466" y="400" font-family="{FONT}" font-size="164" font-weight="600" fill="#FFFFFF"
        text-anchor="middle" letter-spacing="-4">21.5</text>
  <circle cx="640" cy="322" r="16" fill="none" stroke="#FFFFFF" stroke-width="10"/>
  <g opacity="0.95">
    <path d="M338 478 q24 -32 48 0 q24 32 48 0 q24 -32 48 0" fill="none" stroke="{ORANGE}"
          stroke-width="13" stroke-linecap="round"/>
    <text x="556" y="494" font-family="{FONT}" font-size="54" font-weight="500" fill="#93A4C2"
          text-anchor="start">45%</text>
  </g>
  <rect x="316" y="528" width="368" height="12" rx="6" fill="#2C3F68"/>
  <rect x="316" y="528" width="220" height="12" rx="6" fill="{ORANGE}"/>

  <!-- capacitive controls -->
  <g stroke="#8E9CB0" stroke-width="13" stroke-linecap="round" fill="none">
    <path d="M348 684 L414 684"/>
    <path d="M586 684 L652 684 M619 651 L619 717"/>
  </g>
  <circle cx="500" cy="684" r="18" fill="url(#led)"/>
  <circle cx="500" cy="684" r="28" fill="{ORANGE}" opacity="0.4" filter="url(#halo)"/>

  <!-- wall bracket edge -->
  <rect x="330" y="812" width="340" height="18" rx="9" fill="#D3DBE5"/>
</svg>
'''


def grille():
    rows = []
    for r in range(3):
        for c in range(9):
            x = 328 + c * 38
            y = 608 + r * 28
            rows.append(f'<rect x="{x}" y="{y}" width="22" height="11" rx="5.5" fill="#C3CEDC"/>')
    return "\n  ".join(rows)


BUILDING = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
{DEFS}
  <rect width="1000" height="1000" fill="#FFFFFF"/>

  <!-- contact shadow -->
  <ellipse cx="500" cy="754" rx="320" ry="36" fill="#9AA9BC" opacity="0.34" filter="url(#drop)"/>

  <!-- antennas -->
  <g>
    <path d="M234 452 L192 244" stroke="#B9C4D2" stroke-width="28" stroke-linecap="round"/>
    <path d="M234 452 L192 244" stroke="#E4EAF1" stroke-width="13" stroke-linecap="round"/>
    <circle cx="190" cy="236" r="18" fill="#B9C4D2"/>
    <path d="M766 452 L808 244" stroke="#B9C4D2" stroke-width="28" stroke-linecap="round"/>
    <path d="M766 452 L808 244" stroke="#E4EAF1" stroke-width="13" stroke-linecap="round"/>
    <circle cx="810" cy="236" r="18" fill="#B9C4D2"/>
  </g>

  <!-- the link this device reports on -->
  <g fill="none" stroke="{ORANGE}" stroke-linecap="round">
    <path d="M500 268 m-38 44 a58 58 0 0 1 76 0" stroke-width="17"/>
    <path d="M500 268 m-78 8 a114 114 0 0 1 156 0" stroke-width="17" opacity="0.62"/>
    <path d="M500 268 m-118 -28 a170 170 0 0 1 236 0" stroke-width="17" opacity="0.34"/>
    <circle cx="500" cy="330" r="16" fill="{ORANGE}" stroke="none"/>
  </g>

  <!-- case -->
  <rect x="164" y="428" width="672" height="326" rx="58" fill="url(#edge)"/>
  <rect x="164" y="428" width="672" height="302" rx="58" fill="url(#case)" stroke="#C6D0DD" stroke-width="4"/>
  <rect x="182" y="446" width="636" height="148" rx="48" fill="url(#gloss)"/>

  <!-- status window -->
  <rect x="228" y="476" width="544" height="98" rx="36" fill="url(#screen)"/>
  <circle cx="294" cy="525" r="21" fill="url(#led)"/>
  <circle cx="294" cy="525" r="32" fill="{ORANGE}" opacity="0.45" filter="url(#halo)"/>
  <circle cx="366" cy="525" r="21" fill="#3A5083"/>
  <circle cx="438" cy="525" r="21" fill="#3A5083"/>
  <path d="M556 546 q28 -36 56 0 q28 36 56 0 q28 -36 56 0" fill="none" stroke="#5D75A8"
        stroke-width="13" stroke-linecap="round"/>

  <!-- vents -->
  {grille()}

  <!-- feet -->
  <rect x="244" y="728" width="96" height="26" rx="13" fill="#C9D3E0"/>
  <rect x="660" y="728" width="96" height="26" rx="13" fill="#C9D3E0"/>
</svg>
'''

if __name__ == "__main__":
    open(sys.argv[1], "w", encoding="utf-8").write(ROOM)
    open(sys.argv[2], "w", encoding="utf-8").write(BUILDING)
