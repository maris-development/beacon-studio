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
BASE_PATH=//studio npm run build --omit=dev
```

Use `//` to prevent path lookup issues in bash.

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
