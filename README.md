# Smart Gulvvarme for Homey

[![Validate](https://github.com/henrikbak/smart-gulvvarme/actions/workflows/validate.yml/badge.svg)](https://github.com/henrikbak/smart-gulvvarme/actions/workflows/validate.yml)
![Homey App](https://img.shields.io/badge/Homey-App-F36B21?logo=homey&logoColor=white)
![SDK 3](https://img.shields.io/badge/Homey%20SDK-3-16233F)

<img src="assets/images/large.png" width="500" alt="Smart Gulvvarme app tile" />

Brings [Smart Gulvvarme](https://www.smart-gulvvarme.dk) underfloor heating into Homey, room by room.

## What it does

Each room you've set up in Smart Gulvvarme becomes a thermostat device in Homey — with the
same name, so it lines up with your Homey zones right away. Every room reports:

- current temperature and humidity
- target temperature and comfort level (preset)
- whether it's calling for heat right now, and how hard it's working
- manual overrides made outside Homey, so a Flow can react to them instead of quietly losing to them

Turn a room off and it's held at zero power; turn it back on and the Smart Gulvvarme heating
engine takes over again.

A separate **building** device reports the outdoor conditions the system is steering by, and
tells you when the gateway stops reporting.

## Flows

**Triggers** — a room starts or stops heating, its comfort level changes, or someone changes
the setpoint outside Homey.

**Actions** — set a target temperature or comfort level, boost a room for a number of minutes,
or override the heating power directly.

**Conditions** — check whether a room is heating, whether its heating power is above a
threshold, what comfort level it's in, or whether the building is online.

## Getting started

You'll need an API key for your Smart Gulvvarme account. Enter it when you add your first
room; you can replace it later under the app's settings without removing devices or breaking
Flows.

Requires Homey Pro.

## Development

```bash
npm install
npm run build      # typecheck via tsc
npm run lint        # eslint-config-athom
npm test            # build + node --test against .homeybuild
npm run validate    # homey app validate --level publish
```

`npm run gen:types` regenerates `lib/api-schema.ts` from `docs/openapi.json` when the Smart
Gulvvarme API changes.

---

This app is not made, maintained, or endorsed by Smart Gulvvarme.
