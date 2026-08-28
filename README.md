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
```

`npm run gen:types` regenerates `lib/api-schema.ts` from `docs/openapi.json` when the Smart
Gulvvarme API changes.

Repository layout:

- `app.ts`, `lib/` — API client, poller, and the mapper that turns API payloads into device state
- `drivers/room`, `drivers/building` — the two drivers, their pairing views and assets
- `.homeycompose/` — app manifest, capabilities, and Flow card definitions (compiled into `app.json`)
- `test/` — `node --test` suites run against the compiled output

---

This app is not made, maintained, or endorsed by Smart Gulvvarme.
