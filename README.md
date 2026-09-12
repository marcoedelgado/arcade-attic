# Arcade Attic

Live: <https://arcade.delgadosanchez.com/>

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

## Running tests

Some games have a small pure-logic test file under `tests/`. Run them all with
Node's built-in test runner (Node 20+, no install needed) — it auto-discovers
the files under `tests/`:

```
node --test
```

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

   > If your game has sortable/config data (like `bins-on-the-moon/items.json`),
   > keep it in a JSON file in the game folder — it's safe for non-coders (or the
   > kids) to edit without touching the game code.

4. **Check it** — run the local server, confirm the card shows up on the home
   page and links through to your game.

5. **Commit and push.** GitHub Pages redeploys automatically (see below).

That's it. No config, no registration, no rebuild.

### Touch guards (any game played by tapping or dragging)

Most of these games are played on a phone. Without the guards below, a tap that
misses slightly pans the whole page, pull-to-refresh fires mid-game, and iOS can
read a tap that swaps the screen as a swipe-back (you get bounced to the home
page). Add to your `game.css`:

```css
body { overscroll-behavior: contain; }   /* no rubber-band / pull-to-refresh / swipe-back */
.your-play-area { touch-action: none; }   /* a tap or drag here never scrolls the page */
.aa-btn { touch-action: manipulation; }   /* taps fire instantly, no double-tap-zoom delay */
```

Use `touch-action: none` on the actual play surface (board, canvas, drag area);
keep the space around it scrollable so a tall layout still fits a small screen.
Every game except the first (`tic-tac-toe`) carries a version of this — copy from
`asteroid-run`, `bins-on-the-moon`, `waffle-wednesday`, or `pocket-pairs`.

If a tap handler does a big synchronous DOM change (swapping a menu for a board,
building a grid of cards), defer it one frame with `requestAnimationFrame` so iOS
doesn't mistake the tap for a swipe-back — see `games/pocket-pairs/game.js`.

### The `[hidden]` trap (any element you show/hide from JS)

If you give an element a `display` in your CSS **and** hide it with the `hidden`
attribute, it will not hide. An author `display` out-ranks the UA stylesheet's
`[hidden] { display: none }`, so the element stays on screen forever. Guard every
such element:

```css
.your-panel[hidden] { display: none; }
```

This has bitten twice now — `pocket-pairs` (`4771ff2`) and `deep-glow`, where an
`inset: 0` fallback panel sat opaque over the canvas and made a perfectly working
game look like a dead renderer. It is invisible to unit tests and easy to miss in
review, because the markup says `hidden` and reads as correct. Grep your
`game.css` for `display:` and check each one that JS ever toggles.

### Games with a shader (so far only `deep-glow`)

A GLSL typo is not like a JS typo: the shader fails to compile, the game falls
back to its "needs a newer browser" panel, and every unit test still passes.
Nothing in this repo's toolchain opens a browser, so nothing catches it.

You can compile both shaders from the command line without a browser, and it
takes about a minute to set up:

1. Download Khronos's `glslang` release for your platform (the Windows zip gives
   you `bin/glslang.exe`) and unzip it **outside the repo** — it is a checking
   tool, never a dependency.
2. Write a short script that calls your `makeMedium` / `makeBatch` with a stub
   `glx` whose `program(vert, frag)` just records the two source strings, writes
   each to a `.vert` / `.frag` file, and runs `glslang` over it. Capturing the
   sources this way (rather than reading them out of the file) keeps working when
   the shader is assembled at runtime, as `deep-glow/medium.js` does with its
   generated `#define`s.

It catches typos and type errors, not driver quirks — a phone GPU can still
reject something desktop tooling accepts — so it narrows the gap, it doesn't
close it. Keep every mood-setting constant in one `// ---- TUNING ----` block,
as `deep-glow/medium.js` does, since none of it can be unit-tested and it will
all need adjusting by eye later.

### Bringing in a Claude Design export

Several games here got their look from a Claude Design project (`waffle-wednesday`,
`pocket-pairs`, `deep-glow`). What works:

- **Treat the export as material, not a decision.** It doesn't know which of its
  ideas are free here and which are impossible. Sort the ideas cheapest-first,
  and reject anything needing an image file, a font file, or a game-over screen.
- **Ask for a specification, not just a picture.** Concrete colours, named layers
  with their strengths, shapes described as shapes. A beautiful export that can't
  be turned into numbers can't be built here.
- **Transcribe data tables with a script, not by hand.** `deep-glow`'s twenty
  creatures came across as an op list generated straight from the export's own
  source — 174 lines nobody had to retype or proofread.
- **Read its code before copying it.** A design canvas is written to look right in
  one browser tab, not to survive in a game loop. `deep-glow`'s import carried
  five real bugs, each documented in the commit that avoided it: an animation clock
  that jumped whenever speed changed, one value driving two unrelated effects,
  game logic duplicated where no test could reach it, a value read in the wrong
  pixel units, and coordinates going negative where a hash needed them positive.
- **Keep the decisions in tested code.** Put the tables and rules in a pure module
  and let the shader multiply what it's handed; then a design rule ("at least four
  layers visible at every depth") becomes a test rather than a note.

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
Every push to `main` publishes within a minute or two. The `.nojekyll` file at the
repo root tells Pages to serve the files as-is.

Served at **<https://arcade.delgadosanchez.com/>** via a custom domain (the
`CNAME` file at the repo root), mirroring `world-cup-sweepstake`.

**One-time setup:**

1. **DNS** (at the `delgadosanchez.com` registrar / DNS host): add a `CNAME`
   record — `arcade` → `marcoedelgado.github.io` (same shape as the
   `worldcup26` record).
2. **GitHub → repo → Settings → Pages:**
   - Source: **Deploy from a branch** → Branch: **`main`** / **`/ (root)`**
   - Custom domain: **`arcade.delgadosanchez.com`** → Save (this reads the
     committed `CNAME` file; the DNS check goes green once step 1 propagates)
   - Tick **Enforce HTTPS** once the certificate is issued (can take up to ~15 min)
