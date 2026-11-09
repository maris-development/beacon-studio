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

Build with a brand (other fonts, colors, logo, text and links). A brand is a folder in `src/brands/`:

```bash
STUDIO_BRAND=example npm run build
```
```powershell
$env:STUDIO_BRAND="example"; npm run build
```

Without `STUDIO_BRAND`, the build uses `default`. See [src/brands/default/README.md](src/brands/default/README.md) to make a brand.

Build downloadable desktop executables (Tauri):

```bash
npm run tauri:build
```

## Running Production Build Locally

Preview the web production build locally:

```bash
npm run preview
```

## Docker

The image builds the app from this folder and serves it with nginx on port 80.

```bash
docker build -t beacon-studio .
docker run -p 8080:80 beacon-studio
```

Open `http://localhost:8080`.

The build takes these arguments:

| Argument | Default | Effect |
|---|---|---|
| `BASE_PATH` | empty | Serves the app from a subdirectory, for example `/studio`. |
| `STUDIO_TELEMETRY` | `off` | `on` sends usage events to beacon-datalake.org. |
| `STUDIO_BRAND` | `default` | The brand folder in `src/brands/`. |
| `GIT_COMMIT`, `GIT_BRANCH` | from `.git` | The commit link in the app. Set them only when the build folder has no `.git`, for example a zip download. |

Example for `https://example.org/studio`:

```bash
docker build --build-arg BASE_PATH=/studio -t beacon-studio .
```

In Git Bash, put `MSYS_NO_PATHCONV=1` before the command. Otherwise Git Bash changes `/studio` into a Windows path, and the build fails. The `//studio` form from the npm build does not work in a Docker argument.

```bash
MSYS_NO_PATHCONV=1 docker build --build-arg BASE_PATH=/studio -t beacon-studio .
```

Telemetry stays off unless you add `--build-arg STUDIO_TELEMETRY=on`.

Run it, and open `http://localhost:8080/studio/`:

```bash
docker run -p 8080:80 beacon-studio
```

The build writes these values into the app. To change a value, build the image again. `docker run -e` has no effect on them.

Add `--pull` to the build to get the latest patched `node` and `nginx` images.

## Quality Checks

```bash
npm run check
npm run lint
```

## Notes

- Static web output is generated in `build/`.
- `BASE_PATH` is read by `svelte.config.js` and should be set for subdirectory hosting.
- `STUDIO_TELEMETRY` is read by `vite.config.ts`. Only the value `on` turns telemetry on.
- `STUDIO_BRAND` is read by `scripts/brand.js`. The build log shows the active brand.


## Beacon client dependency:

The Beacon SDK comes from npm as [`@maris-development/beacon-client`](https://www.npmjs.com/package/@maris-development/beacon-client). `npm install` installs it with the other dependencies.

Its source is in the `beacon` repository, in [`beacon-clients/beacon-ts`](https://github.com/maris-development/beacon/tree/main/beacon-clients/beacon-ts).

## License

Beacon Studio is licensed under the Apache License 2.0. See [LICENSE](LICENSE).

The Beacon server has its own license (AGPLv3). Studio connects to a Beacon node over HTTP, so that license does not apply to Studio.
