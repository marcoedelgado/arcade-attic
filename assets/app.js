// Home page: reads games.json and builds the game grid.
// Plain ES module, no build step. Add games by editing games.json — see README.

const GAMES_URL = 'games.json';

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

async function loadGames() {
  const res = await fetch(GAMES_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`couldn't load ${GAMES_URL} (${res.status})`);
  const data = await res.json();
  const games = Array.isArray(data.games) ? data.games : [];
  // Newest first; entries without a date sink to the bottom.
  return games.slice().sort((a, b) => String(b.added ?? '').localeCompare(String(a.added ?? '')));
}

function renderMarquee(root) {
  const el = document.createElement('header');
  el.className = 'aa-marquee';
  el.innerHTML = `
    <h1 class="aa-title">Arcade Attic</h1>
    <p class="aa-tagline">Tiny games · one spare moment at a time</p>
  `;
  root.appendChild(el);
}

function renderGrid(root, games) {
  const bar = document.createElement('div');
  bar.className = 'aa-bar';
  bar.innerHTML = `
    <h2>The Cabinet</h2>
    <span class="aa-count">${games.length} game${games.length === 1 ? '' : 's'}</span>
  `;
  root.appendChild(bar);

  if (games.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'aa-empty';
    empty.innerHTML = `
      <div class="aa-empty-emoji">🕹️</div>
      <p><strong>More coming soon.</strong></p>
      <p>The attic is dusted and the power's on — the first game just isn't plugged in yet.</p>
      <p>Add one by dropping a folder in <code>games/</code> and a line in <code>games.json</code>.</p>
    `;
    root.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'aa-grid';
  for (const game of games) {
    const slug = escape(game.slug ?? '');
    const card = document.createElement('a');
    card.className = 'aa-card';
    card.href = `games/${slug}/`;
    card.innerHTML = `
      <span class="aa-card-emoji">${escape(game.emoji ?? '🎮')}</span>
      <span class="aa-card-title">${escape(game.title ?? slug)}</span>
      <p class="aa-card-desc">${escape(game.description ?? '')}</p>
      ${game.added ? `<span class="aa-card-date">Added ${escape(formatDate(game.added))}</span>` : ''}
    `;
    grid.appendChild(card);
  }
  root.appendChild(grid);
}

function renderFooter(root) {
  const foot = document.createElement('footer');
  foot.className = 'aa-foot';
  foot.innerHTML = `Built for fun in the <a href="https://github.com/marcoedelgado/arcade-attic">Arcade Attic</a>. Ideas welcome — especially from the kids.`;
  root.appendChild(foot);
}

async function main() {
  const root = document.getElementById('app');
  let games;
  try {
    games = await loadGames();
  } catch (err) {
    root.innerHTML = `<p class="aa-error">${escape(err.message)}</p>`;
    return;
  }
  root.innerHTML = '';
  renderMarquee(root);
  renderGrid(root, games);
  renderFooter(root);
}

main();
