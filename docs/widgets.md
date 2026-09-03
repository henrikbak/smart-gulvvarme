# Dashboard widgets: what is possible

What Homey dashboard widgets offer, what this app has worth putting on one, and what it
cost to build. All five concepts below are implemented under `widgets/`.

Three things in the original exploration turned out to be wrong once the code existed.
They are corrected in place, and called out under [What building it changed](#what-building-it-changed).

## What a widget is

A widget is a small web page (HTML/CSS/JS) that Homey hosts and renders on a user's
dashboard. It gets a `Homey` bridge object that can call a private API belonging to the
widget, listen for realtime events from the app, read the settings the user picked when
they placed it, and ask which devices they selected.

Two platform facts settle whether this is worth considering at all, and both land well:

- Widgets need app compatibility `>=12.3.0`. This app already declares `>=12.9.0`, so
  nothing in the manifest has to move.
- Widgets do not run on Homey Cloud. This app is `platforms: ["local"]` and requires
  Homey Pro anyway, so no user is left behind.

## The moving parts

A widget lives in `/widgets/<id>/`, and the id is the folder name:

```
widgets/heat-strip/
  widget.compose.json   name, height, transparent, settings, devices, api
  public/index.html     the page, plus any assets it references
  api.ts                the endpoints declared above, as async functions
  preview-light.png     what the user sees when picking a widget
  preview-dark.png
```

`homey app widget create` scaffolds this. The CLI folds every `widget.compose.json` into
`app.json` under a `widgets` key during compose, the same way it already folds
`.homeycompose/capabilities` and `.homeycompose/flow` — so the composed manifest stays
the generated artefact it is today.

**API.** The endpoints declared in `widget.compose.json` are scoped to the widget. They
are not added to the app's Web API, so the settings page's `/status`, `/key` and `/test`
surface stays exactly as it is, and nothing new becomes reachable from outside. The
handler signature is the same one `api.ts` already uses: `async fn({ homey, query,
params, body })`, with the app instance on `homey.app`.

**Pushing updates.** The frontend gets `Homey.on(event, cb)`, which receives whatever the
app emits through `this.homey.api.realtime(event, data)`. That matters more than it
sounds: the `Poller` already fans `room`, `building`, `outage` and `recovered` out to
every device on one timer, so a handful of lines in `app.ts` can re-emit those as realtime
events and every open widget updates for free. A widget then costs zero extra requests
against the Smart Gulvvarme API — which is the only acceptable answer given the 30 s poll
floor and the rate limiting the poller already backs off from.

**Settings.** Per-widget settings support `text`, `textarea`, `number`, `dropdown`,
`checkbox` and `autocomplete`, plus a dedicated top-level `devices` picker that hands the
frontend Homey device ids through `Homey.getDeviceIds()`.

**The `devices` picker is not usable here**, which is the one finding that reshaped the
build. Those ids are Homey's own device UUIDs, and the Apps SDK documents no way to get
from a UUID back to a `Device` instance inside the app: `Device` has `getData()`,
`getName()` and the rest, but no `getId()`. An app could reach Homey's device manager
over the Web API instead, but only by taking the `homey:manager:api` permission — and
`permissions` is empty today, which is worth keeping.

So the widgets that need to name one room use an `autocomplete` setting instead, filled by
`registerSettingAutocompleteListener` in `app.ts`. An autocomplete result may carry any
extra properties, so it carries this app's own `buildingId` and `roomId` — identifiers the
app can resolve, because the devices were paired with them. The widgets that show every
room need no setting at all. Nothing depends on an undocumented API.

**Styling.** Homey ships a token set: `--homey-su-*` for spacing, `--homey-font-size-*`
and `--homey-line-height-*` for type, `--homey-text-color-*` / `--homey-color-*` for
colour, and `.homey-widget` for the standard 16 px padding. Light and dark mode swap
automatically, so a widget written against the tokens needs no theme code of its own.
`--homey-color-orange` sits close enough to the app's `#F36B21` brand colour to carry the
"calling for heat" accent without introducing a hardcoded hex.

## What this app has worth showing

The poller already assembles more per room than any device tile shows at once
(`lib/types.ts`):

- `measureTemperature`, `measureHumidity`, `targetTemperature`
- `isHeating`, `heatingPower` — the custom capabilities, the ones nothing else on the
  dashboard can render
- `presetMode` and the set of modes the room allows
- `manualPowerEnabled`, `batteryPercent`, `signalStrength`, `sensorStale`, `sensorMissing`

and per building: `outdoorTemperature`, `windStrength`, `windAngle`, `cloudCoverage`,
`available`, `lastSeen`.

The built-in device widget shows one device at a time and knows nothing about
`heating_power`. That gap is where the value is.

## Concepts

### 1. Heat strip — the strongest candidate

One compact row per room: name, measured temperature, setpoint, a horizontal bar for
`heating_power`, and an orange dot while `is_heating`. Rooms come from a multi-select
`devices` picker so the user chooses which ones and in what order.

This is the widget that shows something no other surface can: which rooms are actually
drawing heat right now, and how hard. On a floor-heating system, where rooms lag by hours
and a valve is either cycling or not, that is the question people actually have.

Data comes from realtime events; height is `rows × rowHeight` via `Homey.setHeight()`
after the first render.

### 2. Room tile

One room, given room. Large measured temperature, setpoint with `−` / `+` at the 0.5 °C
step the driver already declares, and the comfort level as a four-way segmented control
matching the `preset_mode` enum. `Homey.hapticFeedback()` on each press.

The important design rule: writes go through the device, not through `SmartGulvvarmeApi`.
`RoomDevice` already owns the 500 ms write debounce and the 10 s optimistic window that
stops the setpoint snapping back — a widget that called the API client directly would
lose both and reintroduce the bounce. The widget API should do no more than find the
device and delegate to `setTargetTemperature()` / `setPresetMode()`, exactly as the Flow
cards in `app.ts` do.

### 3. Boost button

A single tap-to-boost tile: temperature and duration configured as widget settings,
calling the existing `boost()`. Boost is Flow-only today, which means "warm the bathroom
for half an hour" costs a Flow. As a dashboard button it costs a tap.

Cheapest useful widget in the list — no live data, one endpoint, one button. It is
arguably better as a mode of the room tile than as a widget of its own, but it stands
alone fine.

### 4. Building strip

Outdoor temperature, wind as a value plus an arrow rotated by `windAngle`, cloud
coverage, and the gateway's state with `lastSeen` when it is down. This is the "why is the
house behaving like this" context — the app's whole premise is that the system steers by
the forecast, and right now that steering input is only visible by opening the building
device.

The gateway-offline half also gives the dashboard something honest to show during an
outage, instead of rooms quietly going stale.

### 5. Sensor health strip

Per room: humidity, battery, signal, and a flag for a stale or missing sensor. Turns
`measure_battery`, `measure_signal_strength`, `alarm_connectivity` and `sensorMissing`
into one glanceable "everything is still reporting" panel. Lower everyday value than the
heat strip, but it is the widget that catches a dead sensor before someone notices a cold
room.

### 6. Trend sparkline — the one with a real cost

`measure_temperature` and `heating_power` are both `insights: true`, so the history exists.
A small setpoint-versus-actual sparkline would show whether a room is tracking its target
or losing ground.

Reading device capability logs from the app most likely needs the
`homey:manager:insights` permission, which turns an app that currently asks for nothing
into one that asks for something at install time. That is a real price for a nice-to-have,
and it should be verified against a running Homey before anyone commits to it.

### 7. Manual power tile

Set the valve open percentage directly, and clear it again
(`set_manual_power` / `clear_manual_power`). Useful while commissioning a system, close to
noise afterwards. Listed for completeness; not worth building first.

## What the repo needs before any of this compiles

Small, but not zero:

- **`tsconfig.json`** — `include` lists `app.ts`, `api.ts`, `lib`, `drivers` and `test`.
  A widget's `api.ts` under `widgets/` would silently never be compiled. Add
  `widgets/**/*.ts`.
- **`.homeyignore`** — already excludes `*.ts` and keeps everything else, so `public/`
  ships as-is and the widget sources stay out of the bundle. No change needed.
- **`.eslintrc.json`** — the page in `public/` is browser code, and `eslint-config-athom`
  is Node-flavoured. Either add an override with the browser environment for
  `widgets/*/public/**`, or keep the inline script small enough not to fight about.
- **`@types/homey`** — pinned at `^0.3.9`. `HomeyWidget` types exist there, but
  `homey.dashboards` and the `Widget` class only arrived in `0.3.12`, so an
  `autocomplete` setting needs the bump. Note that `Homey.getDeviceIds()` is documented
  but still missing from the typings even at `0.3.12`; a typed frontend has to declare it
  locally.
- **Preview images** — the CLI resizes them to 128, 192 and 256 px square, so the sources
  should be square and at least 256 px. `homey app validate --level publish` fails
  without them, and CI runs that on every push — a half-finished widget turns the badge
  red.

## Two things that need deciding, not just building

**The poller only runs while devices are subscribed.** `Poller.subscribe()` starts the
timer with the first device and `unsubscribe()` stops it with the last. A widget is not a
device and does not subscribe, so a dashboard-only user — devices paired but, say, all
removed — would see data that never refreshes. Either the widget API calls
`poller.refresh()` when a widget loads, or widgets register as pseudo-subscribers for as
long as one is open. The second is more correct and slightly more machinery.

**The frontend is untested surface.** `node --test` runs against `.homeybuild` and cannot
touch a rendered page. Keeping every decision — formatting, clamping, which device maps to
which row — in the widget's `api.ts` rather than in the page keeps that logic inside the
part the suite can reach, and leaves the HTML as presentation.

## Where to start

Heat strip first (1). It is the only one of these that shows something the platform cannot
show without this app, and building it forces the two pieces of shared plumbing everything
else needs: the realtime bridge out of the poller, and a widget API that resolves device
ids to rooms. The room tile (2) and the building strip (4) then reuse both, and the boost
button (3) folds naturally into the room tile rather than standing on its own.

## Sources

- [Widgets](https://apps.developer.homey.app/the-basics/widgets)
- [Widget settings](https://apps.developer.homey.app/the-basics/widgets/settings)
- [Widget styling](https://apps.developer.homey.app/the-basics/widgets/styling)
- [Web API](https://apps.developer.homey.app/advanced/web-api)

## What building it changed

Three claims above were wrong when first written, and each one cost real work:

1. **The `devices` picker looked like the obvious way to choose rooms.** It is not usable
   without a permission this app does not want, because a Homey device id cannot be
   resolved back to a `Device`. Autocomplete settings carrying this app's own ids replace
   it, and are arguably a better fit: the widgets that show every room now need no
   configuration at all.

2. **The poller-subscription problem does not exist.** Devices always subscribe, and a
   widget can only reference a paired device, so the poller is always running when a
   widget has anything to show.

3. **Widget heights must be measured, not calculated.** Every page first worked out its
   own height by counting rows and multiplying — and four of the five were wrong, by up to
   40 px, which clips silently because an artboard neither scales nor crops. They now
   measure the rendered DOM and pass that to `Homey.setHeight()`. For the same reason none
   of them declares a `height` in `widget.compose.json`: the SDK advises against setting
   both, and content that depends on how many rooms are paired can only be right at
   runtime.

One smaller thing worth knowing: the widget frame sits at `--homey-color-mono-000` in
light mode but `--homey-color-mono-050` in dark, so there is no single mono index one step
above it in both. `--homey-color-mono-100` is the index that reads correctly either way -
a clear control on white, a lighter surface on the dark frame - and is what the buttons
and pills use.
