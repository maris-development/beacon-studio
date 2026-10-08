# Beacon Studio

Beacon Studio is a SvelteKit + Tauri application for Beacon data exploration.

## Developing

Install dependencies:

```bash
npm install
```

Run the web app in development mode:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

Run the desktop app (Tauri) in development mode:

```bash
npm run tauri:dev
```

## Building

Build the web app (static output):

```bash
npm run build
```

Build the web app for a subdirectory deployment (example: `beacon-wod.maris.nl/studio`):

```bash
BASE_PATH=//studio npm run build
```
```powershell
$env:BASE_PATH="/studio"; npm run build
```

Use `//` to prevent path lookup issues in bash.

Telemetry is off by default. Set `STUDIO_TELEMETRY=on` to send usage events to beacon-datalake.org:

```bash
STUDIO_TELEMETRY=on npm run build
```
```powershell
$env:STUDIO_TELEMETRY="on"; npm run build
```

A build without `STUDIO_TELEMETRY=on` sends nothing, and the settings page shows no telemetry settings.

Build downloadable desktop executables (Tauri):

```bash
npm run tauri:build
```

## Running Production Build Locally

Preview the web production build locally:

```bash
npm run preview
```

## Quality Checks

```bash
npm run check
npm run lint
```

## Notes

- Static web output is generated in `build/`.
- `BASE_PATH` is read by `svelte.config.js` and should be set for subdirectory hosting.
- `STUDIO_TELEMETRY` is read by `vite.config.ts`. Only the value `on` turns telemetry on.


## Beacon client dependency:

The Beacon SDK comes from npm as [`@maris-development/beacon-client`](https://www.npmjs.com/package/@maris-development/beacon-client). `npm install` installs it with the other dependencies.

Its source is in the `beacon` repository, in [`beacon-clients/beacon-ts`](https://github.com/maris-development/beacon/tree/main/beacon-clients/beacon-ts).

## License

Beacon Studio is licensed under the Apache License 2.0. See [LICENSE](LICENSE).

The Beacon server has its own license (AGPLv3). Studio connects to a Beacon node over HTTP, so that license does not apply to Studio.
