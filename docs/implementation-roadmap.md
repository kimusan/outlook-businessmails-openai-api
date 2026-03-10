# Outlook Add-in Feature Roadmap

Date: 2026-03-10
Status legend: `[ ]` pending, `[-]` in progress, `[x]` completed

## Scope
This roadmap covers implementation of the following requested capabilities:
- OpenAI-compatible API integration with configurable endpoint and credentials (for internal service usage).
- Reply drafting from the email thread plus user direction.
- Draft optimization for new compose emails with simple writing controls.
- Reply-draft optimization that also considers language/style in referenced thread.
- Translation between English, Korean, and Danish for both received and composed emails.

## Step 1: Foundation for configurable AI service
Status: `[x]`

Deliverables:
- Add a reusable AI client module based on `fetch` for OpenAI-compatible `/chat/completions` endpoints.
- Add typed config model (endpoint, auth mode/header, API key, model, temperature).
- Add config persistence helpers (Office roaming settings with localStorage fallback).
- Remove hardcoded API key usage from command/taskpane code paths.

Validation:
- `npm run build`
- `npm run lint`

Commit target:
- `feat(ai): add configurable openai-compatible client`

## Step 2: Outlook context utilities
Status: `[x]`

Deliverables:
- Add Promise-based wrappers for Office async APIs (get body text, set body text, insert selected text).
- Add compose-mode helpers and reply-thread extraction heuristics (`draft` vs quoted `thread`).
- Add safe truncation helpers for prompt context limits.

Validation:
- `npm run build`

Commit target:
- `feat(outlook): add compose and thread context helpers`

## Step 3: Taskpane UX for configuration + workflows
Status: `[x]`

Deliverables:
- Replace current two-action taskpane with workflow-driven UI:
  - Service configuration panel
  - Draft reply (thread + user direction)
  - Improve draft (tone/formality/length)
  - Improve reply draft (thread-aware)
  - Translate content (EN/KO/DA)
- Keep read/compose behavior contextual via URL parameter.
- Add result panel and apply actions (replace draft / insert at cursor where appropriate).

Validation:
- `npm run build`
- `npm run lint`

Commit target:
- `feat(taskpane): add reply draft improve and translation workflows`

## Step 4: Command surface cleanup + manifest text refresh
Status: `[x]`

Deliverables:
- Remove remaining direct OpenAI usage from command function.
- Replace compose quick action with a safe informational notification.
- Update manifest labels/tooltips to match new assistant capabilities.

Validation:
- `npm run validate`
- `npm run build`

Commit target:
- `chore(manifest): align command labels with ai assistant workflows`

## Step 5: Documentation and operational notes
Status: `[x]`

Deliverables:
- Update README for configuration and feature usage.
- Add Linux validation notes and Windows runtime verification checklist.

Validation:
- Manual doc review

Commit target:
- `docs(readme): document internal endpoint setup and new features`

## Step 6: Final verification and handoff
Status: `[x]`

Deliverables:
- Run final local checks and summarize pass/fail:
  - `npm run build`
  - `npm run lint`
  - `npm run validate`
- Provide implementation summary and any runtime caveats for Outlook Desktop verification.

Commit target:
- No new commit unless fixes are required.

## Notes
- Since development is performed off Windows, runtime behavior inside Outlook Desktop cannot be fully executed here.
- Validation emphasis will be on static/build/lint/manifest checks and API-safe Office.js usage patterns.
- Final verification (2026-03-10):
  - `npm run lint`: passed.
  - `npm run build`: passed.
  - `npm run validate`: passed (confirmed in your environment with full manifest validation output).
