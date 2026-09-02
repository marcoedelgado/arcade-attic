# Arcade Attic

Live: <https://marcoedelgado.github.io/arcade-attic/>

A growing collection of tiny static browser games — added one small game at a time,
often from ideas submitted by the kids. Plain HTML/CSS/JS, **no build step, no
frameworks, no dependencies**. Clone it, open a file, and it runs.

## Folder structure

```
/
├── index.html            ← the home page (the "attic")
├── games.json            ← the list of games the home page reads to build the grid
├── assets/
│   ├── styles.css        ← shared design tokens + home page + shared game "shell"
│   ├── app.js            ← home page logic (reads games.json, renders the grid)
│   └── favicon.svg
└── games/
    └── <game-slug>/
        ├── index.html    ← the game page
        ├── game.css      ← page-local styles (optional)
        └── game.js       ← game logic (optional)
```

Every game lives in its own folder under `games/`. Nothing else in the repo needs
to change when you add one, apart from a single entry in `games.json`.

## Running it locally

No server strictly required — you can open `index.html` straight from disk — but
the home page uses `fetch()` to read `games.json`, which some browsers block on
`file://`. So the reliable way is a one-line static server:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

(Any static server works: `npx serve`, VS Code Live Server, etc.)

## How to add a new game

1. **Pick a slug** — lowercase, hyphenated, e.g. `snake`, `memory-match`.

2. **Create the folder** `games/<slug>/` with an `index.html`. Copy
   `games/tic-tac-toe/` as your starting point — it already wires up the shared
   header, the "← The Attic" back link, and the arcade button style.

   The only things the shared shell needs from your `index.html`:

   ```html
   <link rel="stylesheet" href="../../assets/styles.css">   <!-- shared tokens + shell -->
   <link rel="stylesheet" href="game.css">                  <!-- your game's own styles -->
   ...
   <main class="aa-game">
     <div class="aa-game-top">
       <a class="aa-back" href="../../">← The Attic</a>
       <h1 class="aa-game-title">Your Game</h1>
     </div>
     <!-- your game here -->
   </main>
   <script type="module" src="game.js"></script>
   ```

   Paths are **relative** (`../../assets/...`), because the site is served from a
   subpath (`/arcade-attic/`) on GitHub Pages. Don't use leading-slash paths.

3. **Add it to `games.json`** — one object in the `games` array:

   ```json
   {
     "slug": "snake",
     "title": "Snake",
     "description": "Eat the dots. Don't bite your tail.",
     "emoji": "🐍",
     "added": "2026-09-15"
   }
   ```

   | field         | notes                                                        |
   | ------------- | ------------------------------------------------------------ |
   | `slug`        | must match the folder name in `games/`                       |
   | `title`       | shown on the card and (by you) in the game's `<title>`       |
   | `description` | one short sentence                                           |
   | `emoji`       | the card "thumbnail" — any emoji                             |
   | `added`       | `YYYY-MM-DD`; the grid sorts newest-first on this            |

4. **Check it** — run the local server, confirm the card shows up on the home
   page and links through to your game.

5. **Commit and push.** GitHub Pages redeploys automatically (see below).

That's it. No config, no registration, no rebuild.

## Design vocabulary (optional, for consistency)

`assets/styles.css` defines CSS custom properties you can reuse so every game
feels like part of the same cabinet:

- Colours: `--attic`, `--panel`, `--edge`, `--ink`, `--ink-dim`, `--neon`,
  `--neon-pink`, `--neon-green`, `--neon-blue`
- `--shadow` — the chunky offset drop shadow used everywhere
- `--font-display` (arcade pixel font, for headings) and `--font-body`
- `.aa-btn` — a ready-made arcade button class

Use them if it helps; ignore them if your game wants its own look.

## Deployment (GitHub Pages)

The site deploys straight from the `main` branch — no Actions workflow, no build.

**One-time setup** (in the GitHub repo): **Settings → Pages → Build and
deployment → Source: "Deploy from a branch" → Branch: `main` / `/ (root)`**.

After that, every push to `main` publishes to
<https://marcoedelgado.github.io/arcade-attic/> within a minute or two. The
`.nojekyll` file at the repo root tells Pages to serve the files as-is.
