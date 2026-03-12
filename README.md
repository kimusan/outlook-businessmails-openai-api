# Outlook Business Mails AI Add-in

Maintainer: **Kim Schulz** (based on work by **Matteo Pagani**).

This Outlook add-in runs against an internal **OpenAI-compatible API** and is focused on business email workflows in desktop/web Outlook.

## Features

- Draft reply text from email thread context + user direction.
- Improve existing draft language (tone, formality, length).
- Improve reply drafts using referenced thread style/context.
- Summarize selected/full read-mode email content with:
  - participants (active/passive)
  - executive summary
  - detailed timeline (who says what)
- Translate received or composed email text between:
  - English
  - Korean
  - Danish
- Show technical API failure details in the in-app Debug log.

## AI Configuration (UMS token flow)

The add-in is configured inside the task pane.

Required settings:

- Chat completions endpoint (full URL, typically ending with `/v1/chat/completions`)
- Model name
- UMS token
- Summary/default translation language
- Temperature

Authentication flow:

1. User provides a UMS token.
2. Add-in calls `POST /v1/token/refresh` with body `ums_token=TOKEN`.
3. Response `access_token` is used as bearer token for API calls.
4. Access token is kept only in memory (not persisted).
5. If missing/expired, the add-in refreshes automatically.

Model discovery:

- Add-in can fetch models from derived endpoint `/v1/model_list`.
- You can still type a custom model manually.

API connectivity check:

- `Check API & refresh token` verifies token refresh only.
- `Refresh model list` is a separate action.

## Prerequisites

Use a supported LTS Node version.

- Node.js `20.x` or `22.x`
- npm `10.x` (or compatible with selected Node LTS)

Node `25.x` is not recommended for this add-in tooling.

## Install

```bash
npm install
```

## Validate locally

```bash
npm run lint
npm run build
npm run validate
```

## Run locally (localhost:3000)

```bash
npm run start:desktop
```

Stop:

```bash
npm run stop
```

## Windows startup helpers

Included helpers:

- `start-local-addin.ps1`
- `start-local-addin.cmd`

Both scripts resolve repo path from script location, start the local host, log to `start-desktop.log`, and launch Outlook.

Examples:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-local-addin.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-local-addin.ps1 -Visible
```

```cmd
start-local-addin.cmd
start-local-addin.cmd --visible
```

## Troubleshooting

- If AI requests fail, open the add-in **Debug log** section to inspect detailed request/response error info.
- If sideloading fails in New Outlook, verify sideload policy support in your tenant/client channel.

## Inspiration

Original project:

- https://github.com/qmatteoq/outlook-businessmails-openai
