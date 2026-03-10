# Outlook Business Mails AI Add-in

This repository contains a Microsoft Outlook add-in focused on business email workflows powered by an **OpenAI-compatible API** endpoint.

The add-in is intended for internal/private AI services and supports configurable endpoint/auth settings instead of hard-coding OpenAI-hosted service usage.

## What this add-in does

- Drafts reply text from the current thread plus user-provided direction.
- Improves existing draft text with configurable writing style.
- Improves existing reply draft text with style inferred from referenced thread content.
- Translates email content between English, Korean, and Danish.
- Supports both read-mode and compose-mode taskpane scenarios.

## AI service configuration

The taskpane provides a configuration panel with:

- Chat completions endpoint URL (OpenAI-compatible)
- Model name
- Authentication mode (`Bearer`, `Custom header`, `None`)
- API key + optional prefix
- Temperature

Settings are stored in Office roaming settings when available, with localStorage fallback.

## Current toolchain and key dependencies

Recommended local environment:

- Node.js `20.x` (LTS)
- npm `10.x`

Project tooling (from `package.json`):

- `office-addin-cli` `^2.0.6`
- `office-addin-debugging` `^6.0.6`
- `office-addin-dev-certs` `^2.0.6`
- `office-addin-lint` `^3.0.6`
- `office-addin-manifest` `^2.1.2`
- `office-addin-prettier-config` `^2.0.1`

UI/runtime libraries:

- `react` `^17.0.2`
- `@fluentui/react` `^8.52.3`

## Local development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run lint
npm run build
npm run validate
```

Sideload into Outlook Desktop:

```bash
npm run start:desktop
```

Stop sideloading/debug session:

```bash
npm run stop
```

### Windows local auto-start helper

This repo includes:

- [start-local-addin.ps1](/home/kim/repo/github/outlook-businessmails-openai/start-local-addin.ps1)
- [start-local-addin.cmd](/home/kim/repo/github/outlook-businessmails-openai/start-local-addin.cmd)

What it does:

- Uses the script folder as repo path.
- Resolves `npm.cmd` preferring `C:\nodejs\npm.cmd` (or recursive `C:\nodejs\...\npm.cmd`), then `PATH`, then standard Node install paths.
- Starts `npm run start:desktop` in a hidden `cmd` process.
- Writes output to `start-desktop.log`.
- Opens Outlook after startup delay.

Run PowerShell version manually:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-local-addin.ps1
```

Run CMD version manually:

```cmd
start-local-addin.cmd
```

Optional: run it automatically at logon using Task Scheduler:

```powershell
$repo = "C:\path\to\outlook-businessmails-openai"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$repo\start-local-addin.ps1`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "Outlook AI Local Addin" -Action $action -Trigger $trigger -Description "Start local Outlook AI add-in host and open Outlook"
```

## Deploy as an installable add-in (tenant/internal)

Outlook web add-ins are installed via hosted web assets + manifest deployment (not via native installer binaries).

1. Host the add-in web app on HTTPS.
2. Update `manifest.xml` production URLs (taskpane/commands/icons/support URL).
3. Validate manifest: `npm run validate`.
4. Deploy manifest through Microsoft 365 admin center (`Integrated apps`) to users/groups.

## Runtime verification checklist

- Compose new email:
  - Improve draft
  - Translate draft
- Reply to email:
  - Draft reply from thread + direction
  - Improve reply draft (thread-aware)
- Read existing email:
  - Translate received content
- Compose apply actions:
  - Replace draft with result
  - Insert result at cursor

## Inspiration

This project is inspired by the original Outlook/OpenAI sample repository:

- https://github.com/qmatteoq/outlook-businessmails-openai
