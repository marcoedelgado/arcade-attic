# Arcade Attic

A collection of tiny static browser games, hosted on GitHub Pages at
`marcoedelgado.github.io/arcade-attic`. Grows one small game at a time.

- **No build step, no frameworks, no dependencies.** Plain HTML/CSS/JS, ES modules.
- Home page (`index.html` + `assets/app.js`) reads `games.json` and renders the grid.
- Each game is a self-contained folder: `games/<slug>/index.html` (+ optional `game.css`, `game.js`).
- Shared design tokens and the game "shell" (back link, buttons) live in `assets/styles.css`.
- Use **relative** paths everywhere — the site is served from the `/arcade-attic/` subpath.
- Deploys from `main` branch root (no workflow). `.nojekyll` keeps Pages from processing files.

See `README.md` for the full "how to add a game" walkthrough.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, each label string equal to its name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
