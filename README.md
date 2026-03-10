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

- Node.js 18 LTS (recommended)
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

## Validation note

This project can be built and linted cross-platform, but full runtime behavior should still be verified in **Outlook Desktop on Windows**.

Suggested runtime checklist:
- Compose new email: run Improve Draft and Translate.
- Reply to email: run Draft Reply and Improve Reply Draft.
- Read email: run Translate in read mode.
- Confirm apply actions (`Replace draft`, `Insert at cursor`) work as expected.
