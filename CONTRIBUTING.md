# Contributing

Thanks for helping. Bug reports, ideas, and pull requests are all welcome.

## Ground rules

These are the project's reason to exist. A change that breaks one won't be merged.

1. **Full screen must keep working.** The default audio path routes the page's own media elements through Web Audio (`src/content/`). Never send default-path audio through `tabCapture`, `getDisplayMedia`, or anything else that captures the tab. Capture mode (`src/offscreen/`) stays opt-in, behind a warning, and visibly on while active.
2. **Least privilege.** Request only what a feature can't work without, and prefer `optional_permissions` requested at runtime for opt-in features. No `host_permissions`, static `content_scripts`, `tabs`, `<all_urls>`, `web_accessible_resources`, or CSP changes. A new permission needs its justification in the README permissions table, in `store/LISTING.md`, and in `tests/manifest.test.ts`, which fails on any undeclared change.
3. **Never silence the user's audio.** Media the Web Audio API would receive as silence (cross-origin without CORS, or already owned by the page's own audio graph) gets the volume-only fallback instead.
4. **No remote code and no data collection.** Everything ships in the bundle. No analytics, no network requests.

## Development

Requirements: Node 22+ and Chrome or Chromium.

```sh
npm install
npx playwright install chromium   # once, for the browser tests
npm run dev                       # rebuild dist/ on change
```

Load `dist/` with **Load unpacked** in `chrome://extensions`, and press the reload button on the extension card after each rebuild.

| Command                | What it does                                                  |
| ---------------------- | ------------------------------------------------------------- |
| `npm run verify`       | Type check, lint, unit tests, browser tests. Run before a PR. |
| `npm test`             | Unit tests (Vitest)                                           |
| `npm run test:e2e`     | Build, then browser tests (Playwright + Chromium)             |
| `npm run icons`        | Re-render the PNG icons from `src/shared/icon.ts`             |
| `npm run store-assets` | Re-render the store screenshots from the real popup           |
| `npm run package`      | Verify, then zip `dist/` into `release/`                      |

### Project layout

```
public/manifest.json   the manifest (copied into dist/)
src/shared/            pure logic and types, shared everywhere
src/audio/graph.ts     the Web Audio chain used by both engines
src/content/           in-page engine (the default)
src/offscreen/         capture engine (opt-in fallback)
src/background/        service worker: tab memory, capture lifecycle
src/popup/             Svelte 5 UI
tests/                 unit tests; tests/e2e/ for browser tests
store/                 Chrome Web Store listing copy and images
```

## Conventions

- TypeScript, strict. Svelte 5 runes.
- Prettier formats (tabs, single quotes); ESLint lints. `npm run lint` checks both.
- Every message crossing an extension boundary is untrusted: check `sender.id`, validate the shape, and sanitize settings.
- UI text is sentence case, with plain verbs that say what happens.
- Colors come from the tokens in `src/popup/theme.css`. Both themes must keep WCAG AA text contrast.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …). Versions follow [SemVer](https://semver.org/), and `package.json` and `public/manifest.json` are bumped together.

## Pull requests

- Keep each PR to one change, and explain why in the description.
- Add or update tests. Audio behavior belongs in `tests/e2e/graph.spec.ts`.
- If the UI changed, include a screenshot of both themes.
- Make sure `npm run verify` passes.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
