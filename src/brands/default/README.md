# Make a brand

A brand changes the look of Beacon Studio for one project. It changes fonts, colors, button shape, logo, favicons, text, links and endpoints.

Every brand is a folder in `src/brands/` on the `main` branch. Do not make a fork or a branch per brand.

## Steps

1. Copy `src/brands/default/` to `src/brands/<name>/`. Use lowercase letters, digits and hyphens.
2. Edit the files in the new folder. The sections below give the details.
3. Run `npm run check`. A wrong key fails the check.
4. Run `STUDIO_BRAND=<name> npm run dev` or `STUDIO_BRAND=<name> npm run build`. The log shows `[beacon-studio] brand: <name>`.

Without `STUDIO_BRAND`, the build uses `default`.

## Files

| File                | Required | Content                                           |
| ------------------- | -------- | ------------------------------------------------- |
| `brand.ts`          | yes      | Name, logo, links and endpoints                   |
| `theme.scss`        | yes      | Tokens and fonts                                  |
| `locales.ts`        | yes      | Text overrides per language                       |
| `static/`           | no       | Files that replace the default files in `static/` |
| `assets/`, `fonts/` | no       | Files that `brand.ts` and `theme.scss` import     |
| `README.md`         | no       | Notes for the project                             |

Each file can be empty. A missing value keeps the default value.

## brand.ts

List only the fields that change. `src/lib/brand/define.ts` lists every field.

```ts
import { defineBrand } from "@/brand/define";
import logo from "./assets/logo.svg";

export default defineBrand({
    name: "Ocean Explorer",
    logo,
    links: { docs: null, source: null },
    endpoints: { feedback: "https://example.org/feedback" }
});
```

- `name` replaces `{app}` in all text, in every language. It is not translated.
- `null` hides a sidebar link.
- `endpoints.telemetry` sets the receiver. `STUDIO_TELEMETRY=on` still turns telemetry on.

## theme.scss

Override the tokens of the `:root` and `:root.dark` blocks in `src/tailwind.css`. Put only `:root` tokens, `:root.dark` tokens and `@font-face` rules in this file.

The `:root.dark` block of `src/tailwind.css` outranks your `:root` block. In dark mode, a token that it sets ignores your `:root` value. Set your dark value in a `:root.dark` block. A token that `src/tailwind.css` does not set in `:root.dark` (for example `--map-draw`) keeps your `:root` value in both themes.

```scss
@font-face {
    font-family: "Inter";
    font-weight: 100 900;
    font-display: swap;
    src: url("./fonts/inter.woff2") format("woff2");
}

:root {
    --font-family-base: "Inter", sans-serif;
    --primary: #0f766e;
    --link: #0f766e;
    --button-radius: 999px;
    --button-text-transform: uppercase;
}

:root.dark {
    --primary: #2dd4bf;
    --link: #2dd4bf;
}
```

- Use a relative `url()`. Then Vite hashes the file and adds the base path. This also works in a token value, for example an image in `--home-header-background`.
- `--map-draw` must be a hex color. The map draw tools read it in code.
- To change a component, change a token. If no token fits, add the token to `src/tailwind.css` first, with the current value as default.

Useful token groups: colors (`--primary`, `--highlight`, `--app-background`), fonts (`--font-family-*`, `--heading-foreground`, `--link`), buttons (`--button-*`), controls (`--control-active`, `--input-border`), corners (`--radius`, `--card-radius`, `--input-radius`, `--menu-item-radius`), tables (`--table-*`), toasts (`--toast-*`) and the home page background (`--network-*`).

Logo and header tokens:

- `--sidebar-header-background` colors a band behind the logo at the top of the sidebar. `--page-header-background` colors the bar of a phone screen. Use both for a light logo.
- `--sidebar-header-foreground` and `--sidebar-header-hover` set the text and the hover color in both places.
- `--sidebar-logo-height` and `--page-header-logo-height` set the logo height. The width follows the logo shape, so a wide logo needs no width.
- `--sidebar-name-white-space`, `--sidebar-name-divider` and `--sidebar-name-indent` set the text beside the logo. Use `normal` to let a long text take two lines.
- `--home-header-*`, `--home-title-*` and `--home-subtitle-foreground` style the title block of the home page.

The text beside the logo is the key `app.logoText`. Its default is the app name. A brand with the project name in its logo can set a shorter text in `locales.ts`.

## locales.ts

Override text per language. Use inline literals, so the type check catches a wrong key.

```ts
import type { BrandLocales } from "@/i18n";

export default {
    en: { home: { title: { beforeHighlight: "Welcome to", highlight: "Ocean Explorer" } } },
    nl: { home: { title: { beforeHighlight: "Welkom bij", highlight: "Ocean Explorer" } } }
} satisfies BrandLocales;
```

Override a key in every language. Another language keeps the default text.

## static/

A file in `static/` replaces the default file at the same path, for example `static/favicons/favicon.svg`. The build warns for a file with no default file at that path.

## Limits

- A Tauri build shows the brand inside the window. The app name, identifier and icons stay those of `src-tauri/tauri.conf.json`.
- A brand folder holds config only. A new feature, page or layout goes in the shared code, behind a `BrandConfig` field.
- Two brands on one domain share the browser storage of Studio.
