# Outlook Business Mails AI Add-in

Maintainer: **Kim Schulz** (based on work by **Matteo Pagani**).

An Outlook web add-in that brings an OpenAI-compatible AI service (draft replies, translation, summaries, in-place mail translation, chat) into the Outlook pane — served from a small self-contained local host, no server deployment required.

It supports two usage styles:

- **Installing a ready-made release package** (end users, no developer tools needed) — see below.
- **Development mode / building your own package** (`npm run start:desktop`, `npm run package:local:win:zip`) — see [Development](#development).

---

## Installing a release package (recommended)

The easiest way to use the add-in: download the latest release and run it on your Windows machine. No Node.js, npm or any other runtime is required — everything is packaged in the zip.

Releases are published on the GitHub **Releases** page:

> https://github.com/kimusan/outlook-businessmails-openai-api/releases

Each release `vX.Y.Z` ships one artifact:

- `outlook-ai-local-host-vX.Y.Z.zip` — the complete local deployment: the local host executable, the add-in web assets, the Outlook manifest, TLS certificates and install helpers.

> The add-in also checks for new releases automatically: while Outlook is open, the taskpane quietly polls GitHub at most once every 6 hours and shows a small banner with a link when a newer version exists. It shows nothing on the current version or when GitHub is unreachable.

### Requirements

- Windows with the desktop Outlook app (Microsoft 365 / Outlook 2019 or newer).
- No admin rights required — everything installs for the current user only.

### Setup

1. **Download and extract** the `outlook-ai-local-host-vX.Y.Z.zip` from the latest release into a permanent folder (e.g. `C:\Tools\outlook-ai\`). Do not run it from inside the zip.
2. **Trust the local HTTPS certificate** (one-time): run `trust-local-cert.cmd`.
   - Outlook requires a trusted certificate for `https://localhost` content; this imports the bundled certificate into your current-user trusted root store.
3. **Start the local host**: run `start-hidden.vbs`.
   - This launches `OutlookAiLocalHost.exe` silently in the background (no console window). It serves the add-in from `https://127.0.0.1:3000`.
4. **Sideload the add-in in Outlook**: open Outlook → **Get Add-ins** (or File → Manage Add-ins) → **My Add-ins** → **Add a custom add-in** → **Add from File…** → select the `manifest.xml` from your extracted folder.
   - General sideloading reference: https://learn.microsoft.com/office/dev/add-ins/testing/sideload-an-office-add-in-for-testing
5. **Optional — auto-start at logon**: run `install-startup.cmd` so the local host starts automatically each time you log in (current-user Startup folder; remove it later with `remove-startup.cmd`).

**Validate the install**: open https://localhost:3000/health in a browser — it should load without any certificate warning. If it does, the host and certificate are ready.

### First run: configure the AI service

The add-in needs your AI service endpoint once:

1. Open a mail, open the add-in pane, and click the **Settings** (gear) icon.
2. Enter the **Base URI** (everything before `/v1/`) and the **model** (or pick one via *Refresh model list*).
3. Under **Authentication mode**, choose *Direct API key* (bearer token) or *UMS token* (token refresh flow), and enter the credential.
4. Save. The configuration is stored locally per mailbox.

The configuration can also be changed at any time later from the same Settings panel.

### Updating to a newer version

1. Stop the running host: end the `OutlookAiLocalHost.exe` process in Task Manager (the exe file is locked while running).
2. Extract the new zip over your existing folder (replace files).
3. Run `start-hidden.vbs` again.
4. Restart Outlook. If the pane still shows the old UI, also end `msedgewebview2.exe` in Task Manager and reopen Outlook — WebView2 caches add-in assets aggressively.

The sideloaded manifest does not need to be re-added; it keeps pointing at the same local URLs.

### Install troubleshooting

- **Pane shows a certificate / blank pane error** → re-run `trust-local-cert.cmd`, then fully restart Outlook (and `msedgewebview2.exe` via Task Manager if needed).
- **Add-in does not load** → check that `OutlookAiLocalHost.exe` is running and https://localhost:3000/health responds; check `logs\host.log` in the deployment folder.
- **Port 3000 already in use** (rare) → a different port requires a rebuilt package — ask the maintainer or see [Development](#development) (`LOCAL_HOST_PORT`).

---

## Development

Everything below is for maintaining, extending or building the add-in yourself.

### Architecture

**Development flow**

- Uses webpack dev tooling and Office add-in debugging helpers.
- Start with `npm run start:desktop`.
- Intended for coding/debugging only.

**Production-style local flow (Windows)**

- Build static add-in frontend assets with webpack production build.
- Serve those assets from a dedicated local HTTPS host.
- Package the local host into a self-contained Windows `.exe` via Node SEA.
- Keep `manifest.xml` separate next to the executable.
- Optional startup shortcut launches host automatically at Windows logon.

Runtime on target machine does **not** require a globally installed Node.js.

### Add-in capabilities

- Draft reply text from thread context + user direction.
- Improve draft and reply language with tone/formality/length controls.
- Translate: selected text alone, or the whole message — in compose mode truly in place (formatting, links and images preserved, with undo), in read mode as a live translated copy in the result dialog that fills in batch by batch with a flash animation.
- Summarize selected/full emails (participants, executive summary, detailed timeline).
- Extract action items & deadlines.
- Large Outlook dialog result window (outside taskpane) with structured heading/bullet rendering.
- In-taskpane AI chat area for follow-up questions on current email/result context.
- Split API URL config:
  - Base URI (everything before `/v1/`)
  - Chat completions path
  - Model list path
  - Token refresh path (shown only for UMS token auth mode)
- Prompt template editor in Configuration (`Edit prompts`) so users can customize system/user prompts per workflow.
- HTML-aware output rendering in result/chat views (sanitized), with translation/improvement safeguards to preserve HTML tags/attributes.
- Selectable auth mode:
  - UMS token -> `/v1/token/refresh` -> access token flow
  - Direct API key as bearer token
- Automatic GitHub release update check (silent on failure, throttled, dismissible banner).
- In-app debug log for API failures.

### Prerequisites for maintainers (build machine)

- Node.js 20 or newer recommended (the release CI builds with Node 24).
- npm 10.x recommended.
- For SEA packaging to `.exe`, run packaging on **Windows**.

### Dev scripts

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

### Production local output

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

### Local HTTPS and certificates

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

### Manifest handling

- Manifest stays separate from the executable.
- `npm run local:manifest` rewrites localhost URLs using `LOCAL_HOST_PORT` (default `3000`) and writes:
  - `release/local-host/manifest.xml`
- Manifest generation also appends a `cb=<token>` query parameter to `taskpane.html`/`commands.html` URLs to force Outlook/WebView to fetch fresh UI assets after updates.
- Sideload this generated manifest in Outlook.

### Runtime host behavior

Local host entrypoint: `local-host/sea-main.cjs`

- Serves static files from `www/`.
- Listens on `https://127.0.0.1:<port>` only.
- Health endpoint: `/health`.
- Logs startup/errors to `logs/host.log`.
- Exits clearly when port is busy or TLS assets are missing.

### Silent startup on Windows

- `start-hidden.vbs` launches `OutlookAiLocalHost.exe` without a visible console window.
- `startup:install` creates a Startup shortcut that runs the hidden launcher via `wscript.exe`.
- No admin rights are required for startup shortcut installation (current user Startup folder).
- End users without npm can run:
  - `release/local-host/install-startup.cmd`
  - `release/local-host/remove-startup.cmd`

### Releasing

Releases are built and published automatically by GitHub Actions (`.github/workflows/release.yml`):

1. Bump `"version"` in `package.json` and commit.
2. Tag the commit with the matching version tag and push it:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. CI runs the tests, builds the package with `npm run package:local:win:zip` on a Windows runner and publishes a GitHub release with `outlook-ai-local-host-vX.Y.Z.zip` attached (release notes auto-generated).

The workflow **fails if the tag does not match the `package.json` version** — this guards the add-in's in-pane update check, which compares the installed version against GitHub release tags.

### Environment variables

Optional variables used by scripts/runtime:

- `LOCAL_HOST_PORT` (default `3000`)
- `LOCAL_CERT_PATH`
- `LOCAL_CERT_KEY_PATH`
- `SEA_NODE_EXE` (override node.exe used for SEA packaging)
- `SEA_SENTINEL_FUSE` (optional override for postject sentinel fuse; default `NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`)
- `POSTJECT_PACKAGE` (optional override for postject package/version used by `sea:package`; default `postject@1.0.0-alpha.6`)
- `ADDIN_BASE_URL` (webpack manifest URL rewrite base, defaults to localhost)
- `OUTLOOK_AI_HOST_DEBUG=1` (runtime stdout logging in addition to file logs)

### Troubleshooting

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

### Limitations and assumptions

- SEA packaging to Windows `.exe` is implemented for Windows build machines.
- `npm run sea:package` uses `npx postject` during build-time SEA injection.
- Static assets are currently deployed as sibling files under `www/` (not embedded into SEA blob), which is intentional for maintainability and predictable Office add-in hosting.
- HTTPS trust requires one-time local certificate trust on target machine.

### Inspiration

Original project:

- https://github.com/qmatteoq/outlook-businessmails-openai
