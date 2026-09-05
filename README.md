# Smart Gulvvarme for Homey

[![Validate](https://github.com/henrikbak/smart-gulvvarme/actions/workflows/validate.yml/badge.svg)](https://github.com/henrikbak/smart-gulvvarme/actions/workflows/validate.yml)
![Homey App](https://img.shields.io/badge/Homey-App-F36B21?logo=homey&logoColor=white)
![SDK 3](https://img.shields.io/badge/Homey%20SDK-3-16233F)

Brings [Smart Gulvvarme](https://www.smart-gulvvarme.dk) underfloor heating into Homey, room by
room. Each room you have set up in Smart Gulvvarme becomes a thermostat device in Homey — with
the same name, so it lines up with your Homey zones right away — reporting temperature,
humidity, setpoint, comfort level, and whether it is calling for heat. A separate building
device reports the outdoor conditions the system is steering by, and tells you when the gateway
stops reporting.

Requires Homey Pro and an API key for your Smart Gulvvarme account.

## Development

```bash
npm install
npm run build       # typecheck via tsc
npm run lint        # eslint-config-athom
npm test            # build + node --test against .homeybuild
npm run validate    # homey app validate --level publish

python3 test/manual/check-widgets.py   # render the widgets against a stubbed Homey
```

`npm run gen:types` regenerates `lib/api-schema.ts` from `docs/openapi.json` when the Smart
Gulvvarme API changes.

## Releasing

The git tag is what starts a release. Everything else follows from it, so the version only has
to be right in one place before the tag is pushed:

1. Bump `version` in `.homeycompose/app.json`, `app.json` and `package.json` to the same number.
2. Add the matching entry to `.homeychangelog.json` - `en` is required, `da` is included in the
   release notes when it is there.
3. `npm run version:check` confirms the four agree. CI runs the same check on every push, so
   drift surfaces before tagging rather than after.
4. Tag and push: `git tag -a v1.2.3 -m "..." && git push origin v1.2.3`.

The `Release` workflow then typechecks, lints, tests and validates the tagged tree, verifies the
tag matches `app.json` and the changelog, and publishes a GitHub release whose notes are the
changelog entry the Homey App Store shows. Re-running the workflow updates the existing release
rather than failing.

Publishing to the Homey App Store is still the separate `homey app publish` step, which submits
a draft for review in the developer dashboard.

Repository layout:

- `app.ts`, `lib/` — API client, poller, and the mapper that turns API payloads into device state
- `drivers/room`, `drivers/building` — the two drivers, their pairing views and assets
- `.homeycompose/` — app manifest, capabilities, and Flow card definitions (compiled into `app.json`)
- `widgets/` — the five dashboard widgets, each with its own API, page and previews
- `test/` — `node --test` suites run against the compiled output
- `docs/` — the API schema, and [notes on the dashboard widgets](docs/widgets.md)

---

This app is not made, maintained, or endorsed by Smart Gulvvarme.
