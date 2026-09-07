// game.js — DOM wiring for Pocket Pairs. The only file that touches the DOM
// or timers. All rules live in engine.js.
import { createGame, winnerOf } from './engine.js';
import { mascotImg } from './sprites.js';
import { MASCOTS } from './mascots.js';

const MODES = {
  easy:   { pairs: 6,  cols: 4 },
  medium: { pairs: 8,  cols: 4 },
  hard:   { pairs: 12, cols: 6 },
};
const MISMATCH_MS = 800;
const NAMES = new Map(MASCOTS.map((m) => [m.id, m.name]));

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
let pendingFlip = 0;  // setTimeout id for the pending mismatch flip-back
let cardEls = [];     // the card <button>s, built once per game
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
  clearTimeout(pendingFlip);
  pendingFlip = 0;
  mode = MODES[chosen('mode')];
  players = Number(chosen('players'));
  game = createGame({ pairs: mode.pairs, players });
  busy = false;
  boardEl.style.setProperty('--cols', mode.cols);
  overlayEl.hidden = true;
  startScreen.hidden = true;
  playScreen.hidden = false;
  onGameStart();          // reset the solo timer + best-score flag
  buildBoard();
  render();
}

function render() {
  syncBoard();
  renderHud(game.state());
}

// Build the card buttons once per game. Later renders only mutate them, so the
// CSS flip transition fires on an element that already existed and keyboard
// focus survives a flip.
function buildBoard() {
  boardEl.innerHTML = '';
  cardEls = game.cards.map((card, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pp-card';

    const inner = document.createElement('span');
    inner.className = 'pp-card-inner';
    const cover = document.createElement('span');
    cover.className = 'pp-cover';
    cover.textContent = '?';
    const reveal = document.createElement('span');
    reveal.className = 'pp-reveal';
    inner.append(cover, reveal);
    btn.appendChild(inner);

    btn.addEventListener('click', () => onFlip(i));
    boardEl.appendChild(btn);
    return btn;
  });
}

function syncBoard() {
  const state = game.state();
  game.cards.forEach((card, i) => {
    const btn = cardEls[i];
    btn.classList.toggle('up', card.faceUp);
    btn.classList.toggle('matched', card.matched);
    btn.disabled = busy || card.faceUp || card.matched || state.won;
    if (card.faceUp || card.matched) {
      const reveal = btn.querySelector('.pp-reveal');
      if (!reveal.firstChild) {
        reveal.appendChild(mascotImg(card.mascot, NAMES.get(card.mascot)));
      }
    }
  });
}

function renderHud(state) {
  hudEl.textContent = '';
  if (state.players === 1) {
    hudEl.append(
      chip(`Moves ${state.moves}`),
      chip(`Pairs ${state.matchedPairs}/${state.totalPairs}`),
      chip(`Time ${mmss(elapsed())}`),
    );
  } else {
    renderHud2p(state);   // 2-player HUD
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
  onFirstFlip();             // start the solo timer on the first flip
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
    syncBoard();             // disable all cards during the pause
    pendingFlip = setTimeout(() => {
      pendingFlip = 0;
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
  onGameEnd();               // stop the solo timer
  resultEl.textContent = resultText(state);
  overlayEl.hidden = false;
}

function resultText(state) {
  if (state.players === 1) {
    const line = `Cleared in ${state.moves} moves · ${mmss(elapsed())}`;
    return newBest ? `New best!\n${line}` : line;
  }
  return result2p(state);   // 2-player result line
}

// --- lifecycle hooks: solo timer + pending-flip cleanup ---
function onGameStart() {
  startedAt = 0;
  newBest = false;
  clearInterval(tickId);
  tickId = 0;
  clearTimeout(pendingFlip);
  pendingFlip = 0;
}

function onFirstFlip() {
  if (players !== 1 || startedAt) return;
  startedAt = Date.now();
  tickId = setInterval(() => renderHud(game.state()), 1000);
}

function onGameEnd() {
  clearInterval(tickId);
  tickId = 0;
  clearTimeout(pendingFlip);
  pendingFlip = 0;
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
