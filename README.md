# Outlook OpenAI-Compatible Assistant Add-in

This Outlook add-in provides AI workflows for desktop Outlook using an **OpenAI-compatible API**. It is designed for internal/private AI gateways and does not require direct OpenAI-hosted endpoints.

## Implemented capabilities

- Configurable AI service connection:
  - Chat completions endpoint URL
  - Model name
  - Auth mode (`Bearer`, custom header, or none)
  - API key and optional prefix
  - Temperature
- Reply drafting from email thread context + user direction
- Draft optimization for composed emails with style controls:
  - tone
  - formality
  - length
- Reply-draft optimization using both:
  - current reply text
  - referenced thread language/style
- Translation workflows between:
  - English
  - Korean
  - Danish
- Translation supports both read-mode emails and compose-mode drafts

## How configuration works

The taskpane includes an **AI Service Configuration** section.

1. Open Outlook add-in taskpane.
2. Set `Chat completions endpoint`, for example:
   - `https://your-internal-service.example.com/v1/chat/completions`
3. Set model and auth settings.
4. Save configuration.

Settings are stored in Office roaming settings when available, with localStorage fallback.

## Development

### Prerequisites

- Node.js 20 LTS (recommended)
- npm 10 (recommended)

### Setup

```bash
npm install
```

### Local checks

```bash
npm run build
npm run lint
npm run validate
```

### Sideload

```bash
npm run start:desktop
```

## Installable add-in deployment

This project can be distributed as an installable Outlook add-in for users in your Microsoft 365 tenant.

### 1) Host the add-in web app

- Build and host the web assets on HTTPS (Azure App Service, static hosting, etc.).
- Ensure the hosted domain is reachable by Outlook Desktop/Web.

### 2) Update the manifest for production

- Replace all `https://localhost:3000/...` URLs in [manifest.xml](/home/kim/repo/github/outlook-businessmails-openai/manifest.xml) with your production HTTPS URLs.
- Update `SupportUrl`, icon URLs, and taskpane/command URLs to production paths.
- Validate the manifest:

```bash
npm run validate
```

### 3) Deploy to users

- Go to Microsoft 365 admin center.
- Use **Integrated apps** (centralized deployment) and upload the manifest.
- Assign users/groups and complete deployment.

### 4) Runtime requirements

- Your internal OpenAI-compatible endpoint must allow requests from add-in origins.
- Authentication and CORS must be configured for Outlook WebView/browser clients.

## Validation note

This project can be built and linted cross-platform, but full runtime behavior should still be verified in **Outlook Desktop on Windows**.

Suggested runtime checklist:
- Compose new email: run Improve Draft and Translate.
- Reply to email: run Draft Reply and Improve Reply Draft.
- Read email: run Translate in read mode.
- Confirm apply actions (`Replace draft`, `Insert at cursor`) work as expected.
