# Outlook Business Mails AI Add-in

Maintainer: **Kim Schulz** (based on work by **Matteo Pagani**).

This project is an Outlook web add-in that runs against an OpenAI-compatible API and is designed to support both:

- `development` mode (`npm run start:desktop`)
- `production-style local deployment` on Windows (self-contained host executable + local manifest)

## Architecture

### Development flow

- Uses webpack dev tooling and Office add-in debugging helpers.
- Start with `npm run start:desktop`.
- Intended for coding/debugging only.

### Production-style local flow (Windows)

- Build static add-in frontend assets with webpack production build.
- Serve those assets from a dedicated local HTTPS host.
- Package the local host into a self-contained Windows `.exe` via Node SEA.
- Keep `manifest.xml` separate next to the executable.
- Optional startup shortcut launches host automatically at Windows logon.

Runtime on target machine does **not** require a globally installed Node.js.

## Add-in capabilities

- Draft reply text from thread context + user direction.
- Improve draft and reply language with tone/formality/length controls.
- Translate between English, Korean, and Danish.
- Summarize selected/full emails (participants, executive summary, detailed timeline).
- Selection-first behavior for summarize/translate/improve workflows, with full-body fallback.
- Large Outlook dialog result window (outside taskpane) with structured heading/bullet rendering.
- In-taskpane AI chat area for follow-up questions on current email/result context.
- Split API URL config:
  - Base URI (everything before `/v1/`)
  - Chat completions path
  - Model list path
  - Token refresh path (shown only for UMS token auth mode)
- Prompt template editor in Configuration (`Edit prompts`) so users can customize system/user prompts per workflow.
- Selectable auth mode:
  - UMS token -> `/v1/token/refresh` -> access token flow
  - Direct API key as bearer token
- In-app debug log for API failures.

## Prerequisites for maintainers (build machine)

- Node.js `20.x` or `22.x` recommended.
- npm `10.x` recommended.
- For SEA packaging to `.exe`, run packaging on **Windows**.

## Core scripts

### Existing dev scripts

```bash
npm run start:desktop
npm run stop
```

### Production local runtime prep

```bash
npm run build:web
npm run local:runtime
npm run local:manifest
npm run local:certs
```

Or all at once:

```bash
npm run local:prepare
```

### SEA packaging (Windows)

```bash
npm run sea:config
npm run sea:blob
npm run sea:package
```

Or full Windows packaging in one command:

```bash
npm run package:local:win
```

Create distribution zip (includes runtime + release README):

```bash
npm run release:zip
```

Or run full build + package + zip:

```bash
npm run package:local:win:zip
```

### Startup and cert helper scripts (Windows)

```bash
npm run startup:install
npm run startup:remove
npm run cert:trust
```

## Production local output

After `npm run package:local:win`, runtime artifacts are prepared in:

- `release/local-host/OutlookAiLocalHost.exe`
- `release/local-host/manifest.xml`
- `release/local-host/www/*` (static add-in files)
- `release/local-host/certs/*`
- `release/local-host/start-hidden.vbs`
- `release/local-host/trust-local-cert.cmd`
- `release/local-host/install-startup.cmd`
- `release/local-host/remove-startup.cmd`
- `release/local-host/scripts/*.ps1`
- `release/local-host/host-config.json`
- `release/local-host/logs/host.log` (created/updated at runtime)
- `release/local-host/README-LOCAL-DEPLOYMENT.md` (end-user deployment instructions)

After `npm run release:zip`, distributable archive is created:

- `release/outlook-ai-local-host-v<version>.zip`

## Local HTTPS and certificates

The host only serves over HTTPS and only on localhost (`127.0.0.1`).

Certificate behavior:

- `npm run local:certs` generates a localhost certificate via `office-addin-dev-certs` by default.
- You can provide your own cert/key via:
  - `LOCAL_CERT_PATH`
  - `LOCAL_CERT_KEY_PATH`
- On target machines, trust `release/local-host/certs/dev-ca.crt` in:
  - `Current User > Trusted Root Certification Authorities`
- Optional: import `release/local-host/certs/localhost.cer` into `Current User > Trusted People`
- Convenience script:
  - `npm run cert:trust`
  - or for end users without npm: run `release/local-host/trust-local-cert.cmd`

The server will fail fast if cert files are missing and logs the reason.

## Manifest handling

- Manifest stays separate from the executable.
- `npm run local:manifest` rewrites localhost URLs using `LOCAL_HOST_PORT` (default `3000`) and writes:
  - `release/local-host/manifest.xml`
- Manifest generation also appends a `cb=<token>` query parameter to `taskpane.html`/`commands.html` URLs to force Outlook/WebView to fetch fresh UI assets after updates.
- Sideload this generated manifest in Outlook.

## Runtime host behavior

Local host entrypoint: `local-host/sea-main.cjs`

- Serves static files from `www/`.
- Listens on `https://127.0.0.1:<port>` only.
- Health endpoint: `/health`.
- Logs startup/errors to `logs/host.log`.
- Exits clearly when port is busy or TLS assets are missing.

## Silent startup on Windows

- `start-hidden.vbs` launches `OutlookAiLocalHost.exe` without a visible console window.
- `startup:install` creates a Startup shortcut that runs the hidden launcher via `wscript.exe`.
- No admin rights are required for startup shortcut installation (current user Startup folder).
- End users without npm can run:
  - `release/local-host/install-startup.cmd`
  - `release/local-host/remove-startup.cmd`

## End-user quick setup (no npm required)

From a packaged `release/local-host` folder on Windows:

1. Run `trust-local-cert.cmd` (one-time certificate trust).
2. Start host with `start-hidden.vbs` (or launch `OutlookAiLocalHost.exe`).
3. Sideload `manifest.xml` in Outlook.
4. Optional auto-start: run `install-startup.cmd`.

## Environment variables

Optional variables used by scripts/runtime:

- `LOCAL_HOST_PORT` (default `3000`)
- `LOCAL_CERT_PATH`
- `LOCAL_CERT_KEY_PATH`
- `SEA_NODE_EXE` (override node.exe used for SEA packaging)
- `SEA_SENTINEL_FUSE` (optional override for postject sentinel fuse; default `NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`)
- `POSTJECT_PACKAGE` (optional override for postject package/version used by `sea:package`; default `postject@1.0.0-alpha.6`)
- `ADDIN_BASE_URL` (webpack manifest URL rewrite base, defaults to localhost)
- `OUTLOOK_AI_HOST_DEBUG=1` (runtime stdout logging in addition to file logs)

## Troubleshooting

- Add-in not loading in Outlook:
  - Verify `OutlookAiLocalHost.exe` is running.
  - Check `https://localhost:3000/health`.
  - Check `release/local-host/logs/host.log`.
  - Confirm localhost cert is trusted.
  - After updates, restart Outlook and `msedgewebview2.exe` to clear stale add-in asset cache.
- Port already in use:
  - Change `LOCAL_HOST_PORT` and regenerate manifest/runtime.
- SEA packaging errors:
  - Ensure packaging is run on Windows.
  - Ensure `npm install` has installed dependencies (including `postject`).
  - If sentinel/fuse errors appear, set `SEA_NODE_EXE` to an official Node `node.exe` (not a launcher/shim), then rerun packaging:

```powershell
$env:SEA_NODE_EXE = "C:\nodejs\node.exe"
npm run sea:package
```

## Limitations and assumptions

- SEA packaging to Windows `.exe` is implemented for Windows build machines.
- `npm run sea:package` uses `npx postject` during build-time SEA injection.
- Static assets are currently deployed as sibling files under `www/` (not embedded into SEA blob), which is intentional for maintainability and predictable Office add-in hosting.
- HTTPS trust requires one-time local certificate trust on target machine.

## Inspiration

Original project:

- https://github.com/qmatteoq/outlook-businessmails-openai
