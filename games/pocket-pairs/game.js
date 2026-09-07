// game.js — DOM wiring for Pocket Pairs. The only file that touches the DOM
// or timers. All rules live in engine.js.
import { createGame, winnerOf } from './engine.js';
import { mascotImg } from './sprites.js';

const MODES = {
  easy:   { pairs: 6,  cols: 4 },
  medium: { pairs: 8,  cols: 4 },
  hard:   { pairs: 12, cols: 6 },
};
const MISMATCH_MS = 800;

const el = (id) => document.getElementById(id);
const startScreen = el('start');
const playScreen = el('play');
const boardEl = el('board');
const hudEl = el('hud');
const overlayEl = el('overlay');
const resultEl = el('result');

let game = null;
let mode = null;      // { pairs, cols }
let players = 1;
let busy = false;     // UI lock during the mismatch delay
let startedAt = 0;
let tickId = 0;
let newBest = false;

function chosen(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

function bestKey(m) {
  const rows = (m.pairs * 2) / m.cols;
  return `pocket-pairs:best:${m.cols}x${rows}`;
}

function readBest(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.moves === 'number' && typeof v?.seconds === 'number') return v;
  } catch { /* ignore */ }
  return null;
}

function writeBest(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function isBetter(a, b) {
  if (!b) return true;
  if (a.moves !== b.moves) return a.moves < b.moves;
  return a.seconds < b.seconds;
}

function elapsed() {
  return startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
}

function mmss(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function startGame() {
  mode = MODES[chosen('mode')];
  players = Number(chosen('players'));
  game = createGame({ pairs: mode.pairs, players });
  busy = false;
  boardEl.style.setProperty('--cols', mode.cols);
  overlayEl.hidden = true;
  startScreen.hidden = true;
  playScreen.hidden = false;
  onGameStart();          // hook for Task 9 (timer)
  render();
}

function render() {
  renderBoard();
  renderHud(game.state());
}

function renderBoard() {
  boardEl.innerHTML = '';
  game.cards.forEach((card, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pp-card${card.faceUp ? ' up' : ''}${card.matched ? ' matched' : ''}`;
    btn.disabled = busy || card.faceUp || card.matched || game.state().won;

    const inner = document.createElement('span');
    inner.className = 'pp-card-inner';
    const cover = document.createElement('span');
    cover.className = 'pp-cover';
    cover.textContent = '?';
    const reveal = document.createElement('span');
    reveal.className = 'pp-reveal';
    if (card.faceUp || card.matched) reveal.appendChild(mascotImg(card.mascot));
    inner.append(cover, reveal);
    btn.appendChild(inner);

    btn.addEventListener('click', () => onFlip(i));
    boardEl.appendChild(btn);
  });
}

function renderHud(state) {
  hudEl.textContent = '';
  if (state.players === 1) {
    hudEl.append(chip(`Moves ${state.moves}`), chip(`Time ${mmss(elapsed())}`));
  } else {
    renderHud2p(state);   // added in Task 10
  }
}

function chip(text, active = false) {
  const span = document.createElement('span');
  span.className = `pp-chip${active ? ' active' : ''}`;
  span.textContent = text;
  return span;
}

function renderHud2p(state) {
  const [s1, s2] = state.scores;
  hudEl.append(
    chip(`P1  ${s1}`, state.turn === 0),
    chip(`P2  ${s2}`, state.turn === 1),
    chip(`Player ${state.turn + 1}'s turn`),
  );
}

function result2p(state) {
  const [s1, s2] = state.scores;
  const w = winnerOf(state.scores);
  if (w === null) return `It's a tie! ${s1}–${s2}`;
  return w === 0 ? `Player 1 wins ${s1}–${s2}` : `Player 2 wins ${s2}–${s1}`;
}

function onFlip(index) {
  if (busy) return;
  game.flip(index);
  onFirstFlip();             // hook for Task 9 (start timer)
  render();
  if (!game.isLocked()) return;

  const [a, b] = game.cards.filter((c) => c.faceUp && !c.matched);
  const isMatch = a.mascot === b.mascot;
  if (isMatch) {
    game.resolve();
    render();
    afterResolve(game.state());
  } else {
    busy = true;
    renderBoard();           // disable all cards during the pause
    setTimeout(() => {
      game.resolve();
      busy = false;
      render();
      afterResolve(game.state());
    }, MISMATCH_MS);
  }
}

function afterResolve(state) {
  if (state.won && state.players === 1) {
    const key = bestKey(mode);
    const result = { moves: state.moves, seconds: elapsed() };
    const prev = readBest(key);
    if (isBetter(result, prev)) {
      writeBest(key, result);
      newBest = true;
    }
  }
  maybeEndGame(state);
}

function maybeEndGame(state) {
  if (!state.won) return;
  onGameEnd();               // hook for Task 9 (stop timer)
  resultEl.textContent = resultText(state);
  overlayEl.hidden = false;
}

function resultText(state) {
  if (state.players === 1) {
    const line = `Cleared in ${state.moves} moves · ${mmss(elapsed())}`;
    return newBest ? `New best!\n${line}` : line;
  }
  return result2p(state);   // added in Task 10
}

// --- lifecycle hooks ---
function onGameStart() {
  startedAt = 0;
  newBest = false;
  clearInterval(tickId);
  tickId = 0;
}

function onFirstFlip() {
  if (players !== 1 || startedAt) return;
  startedAt = Date.now();
  tickId = setInterval(() => renderHud(game.state()), 1000);
}

function onGameEnd() {
  clearInterval(tickId);
  tickId = 0;
}

// --- wiring ---
el('start-btn').addEventListener('click', startGame);
el('new-game').addEventListener('click', () => {
  onGameEnd();               // stop the solo timer if the game was abandoned mid-play
  overlayEl.hidden = true;
  playScreen.hidden = true;
  startScreen.hidden = false;
});
el('again').addEventListener('click', startGame);
el('change').addEventListener('click', () => {
  onGameEnd();               // stop the solo timer if the game was abandoned mid-play
  overlayEl.hidden = true;
  playScreen.hidden = true;
  startScreen.hidden = false;
});
