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

function chosen(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
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

function renderHud() {
  hudEl.textContent = '';   // replaced in Tasks 9 and 10
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
  maybeEndGame(state);       // Tasks 9/10 add scoring/best-score work before this
}

function maybeEndGame(state) {
  if (!state.won) return;
  onGameEnd();               // hook for Task 9 (stop timer)
  resultEl.textContent = resultText(state);
  overlayEl.hidden = false;
}

function resultText() {
  return 'Well done!';       // replaced in Tasks 9 and 10
}

// --- lifecycle hooks, filled by later tasks ---
function onGameStart() {}
function onFirstFlip() {}
function onGameEnd() {}

// --- wiring ---
el('start-btn').addEventListener('click', startGame);
el('new-game').addEventListener('click', () => {
  overlayEl.hidden = true;
  playScreen.hidden = true;
  startScreen.hidden = false;
});
el('again').addEventListener('click', startGame);
el('change').addEventListener('click', () => {
  overlayEl.hidden = true;
  playScreen.hidden = true;
  startScreen.hidden = false;
});
