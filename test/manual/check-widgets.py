#!/usr/bin/env python3
"""Drive each widget's index.html with a stubbed Homey object.

`node --test` cannot reach a rendered page, so this renders each widget in
headless Chromium with the parts of Homey it touches stubbed out: its settings,
translations from the real locale file, and one payload shaped exactly like
`WidgetState`. It reports JavaScript errors, missing translation keys, and -
the one that keeps biting - whether the height a widget asked for matches the
height it actually drew. A frame shorter than its content clips in silence.

    python3 test/manual/check-widgets.py [--out DIR]

Screenshots of every widget in both modes are written to the output directory.
Set CHROME if the default headless Chromium is somewhere else. Note that the
full `chrome` binary short-changes the viewport by the height of the absent
browser chrome; `headless_shell` renders full-bleed.
"""
import argparse, json, os, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SHELL = os.environ.get(
    'CHROME', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
TOKENS = (ROOT / 'art/widget-mockups/_tokens.css').read_text(encoding='utf-8')
LOCALE = json.loads((ROOT / 'locales/en.json').read_text(encoding='utf-8'))

def room(name, rid, **kw):
    base = dict(
        buildingId='b1', roomId=rid, name=name, available=True,
        measureTemperature=21.4, targetTemperature=22.0, measureHumidity=54,
        minTemperature=7, maxTemperature=35, temperatureStep=0.5,
        onoff=True, isHeating=False, heatingPower=0, presetMode='medium',
        batteryPercent=82, signalStrength=-60, sensorOffline=False)
    base.update(kw)
    return base

STATE = {
    'hasKey': True,
    'rooms': [
        room('Stue', 'r1', measureTemperature=21.4, targetTemperature=22.0, isHeating=True, heatingPower=68),
        room('Badeværelse', 'r2', measureTemperature=23.8, targetTemperature=24.0, isHeating=True, heatingPower=45, presetMode='high', measureHumidity=68),
        room('Soveværelse', 'r3', measureTemperature=18.9, targetTemperature=19.0, isHeating=True, heatingPower=12, sensorOffline=True, measureHumidity=None),
        room('Køkken', 'r4', measureTemperature=22.1, targetTemperature=22.0, measureHumidity=49, batteryPercent=12),
        room('Kontor', 'r5', measureTemperature=20.2, targetTemperature=21.0, measureHumidity=44),
    ],
    'buildings': [{
        'buildingId': 'b1', 'name': 'Hjemmet', 'online': True,
        'outdoorTemperature': 8.2, 'windStrength': 4.6, 'windAngle': 202, 'cloudCoverage': 62,
        'lastSeen': '2026-09-03T12:04:00Z',
    }],
}

CASES = {
    'heat-strip':      {'sort': 'power', 'only_heating': False},
    'room-tile':       {'room': {'buildingId': 'b1', 'roomId': 'r2', 'name': 'Badeværelse'}},
    'building-strip':  {'building': {'buildingId': 'b1', 'name': 'Hjemmet'}},
    'sensor-health':   {'only_problems': False, 'low_battery': 20},
    'boost':           {'room': {'buildingId': 'b1', 'roomId': 'r2', 'name': 'Badeværelse'}, 'temperature': 24, 'minutes': 30},
}

STUB = '''
<style>%(tokens)s
  html, body { margin: 0; }
  body { box-sizing: border-box; width: 340px; background: var(--homey-background-color); }
</style>
<script type="text/javascript">
(function () {
  var LOCALE = %(locale)s;
  var SETTINGS = %(settings)s;
  var STATE = %(state)s;
  var report = { ready: null, heights: [], errors: [], missing: [] };
  window.__report = report;

  window.onerror = function (m) { report.errors.push(String(m)); };

  function lookup(key) {
    var node = LOCALE;
    var parts = key.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (node === undefined || node === null) return undefined;
      node = node[parts[i]];
    }
    return node;
  }

  var Homey = {
    getSettings: function () { return SETTINGS; },
    getWidgetInstanceId: function () { return 'instance-1'; },
    __: function (key, tokens) {
      var text = lookup(key);
      if (typeof text !== 'string') { report.missing.push(key); return key; }
      return text.replace(/\\{\\{(\\w+)\\}\\}/g, function (_, name) {
        return tokens && tokens[name] !== undefined ? String(tokens[name]) : '';
      });
    },
    api: function () { return Promise.resolve(STATE); },
    on: function () {},
    ready: function (args) { report.ready = args || {}; },
    setHeight: function (h) { report.heights.push(h); },
    hapticFeedback: function () {},
    popup: function () { return Promise.resolve(); },
  };

  window.addEventListener('load', function () {
    document.documentElement.classList.add('%(mode)s');
    document.body.classList.add('%(mode)s');
    try { onHomeyReady(Homey); } catch (err) { report.errors.push(String(err)); }
    window.setTimeout(function () {
      // What the widget asked for, against what it actually drew. A frame
      // shorter than its content clips; much taller leaves a dead band.
      var style = window.getComputedStyle(document.body);
      var pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      var root = document.getElementById('root');
      report.rendered = Math.ceil(root.getBoundingClientRect().height + pad);
      document.title = JSON.stringify(report);
      if (report.ready && report.ready.height) {
        document.body.style.height = report.ready.height + 'px';
      }
    }, 300);
  });
})();
</script>
'''

def run(widget, settings, mode):
    src = (ROOT / 'widgets' / widget / 'public' / 'index.html').read_text(encoding='utf-8')
    stub = STUB % {
        'tokens': TOKENS,
        'locale': json.dumps(LOCALE, ensure_ascii=False),
        'settings': json.dumps(settings, ensure_ascii=False),
        'state': json.dumps(STATE, ensure_ascii=False),
        'mode': 'mode-' + mode,
    }
    # The stub goes last so onHomeyReady is already defined when load fires.
    page = src.replace('</body>', stub + '</body>')
    path = OUT / f'{widget}-{mode}.html'
    path.write_text(page, encoding='utf-8')

    shot = OUT / f'{widget}-{mode}.png'
    proc = subprocess.run(
        [SHELL, '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
         '--window-size=340,700', '--virtual-time-budget=4000',
         f'--screenshot={shot}', '--dump-dom', f'file://{path}'],
        capture_output=True, text=True)

    title = ''
    for line in proc.stdout.splitlines():
        if '<title>' in line:
            title = line.split('<title>', 1)[1].split('</title>', 1)[0]
            break
    return title

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out', default=None, help='where to write pages and screenshots')
args = parser.parse_args()
OUT = pathlib.Path(args.out) if args.out else pathlib.Path(tempfile.mkdtemp(prefix='widget-check-'))
OUT.mkdir(parents=True, exist_ok=True)

if not pathlib.Path(SHELL).exists():
    sys.exit(f'No headless Chromium at {SHELL}. Set CHROME to one.')

failures = 0
for widget, settings in CASES.items():
    raw = run(widget, settings, 'light')
    run(widget, settings, 'dark')
    try:
        report = json.loads(raw.replace('&quot;', '"').replace('&amp;', '&'))
    except Exception:
        print(f'{widget}: COULD NOT READ REPORT: {raw[:200]}')
        failures += 1
        continue

    problems = []
    if report['errors']: problems.append('errors=' + '; '.join(report['errors']))
    if report['missing']: problems.append('missing locale keys=' + ', '.join(sorted(set(report['missing']))))
    if report['ready'] is None: problems.append('never called Homey.ready()')
    asked = (report.get('ready') or {}).get('height')
    drawn = report.get('rendered')
    if asked and drawn:
        if drawn > asked:
            problems.append(f'clips: asked {asked}px, drew {drawn}px')
        elif asked - drawn > 12:
            problems.append(f'dead space: asked {asked}px, drew {drawn}px')

    status = 'FAIL' if problems else 'ok'
    if problems: failures += 1
    print(f"{status:4} {widget:15} asked={(report.get('ready') or {}).get('height')} drew={report.get('rendered')}"
          + (('\n     ' + '\n     '.join(problems)) if problems else ''))

print(f'\nScreenshots in {OUT}')
sys.exit(1 if failures else 0)
