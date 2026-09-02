// Tic-Tac-Toe — hot-seat two-player. Plain ES module, no build step.
// This file is a good template to copy for a new grid/turn-based game.

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],            // diagonals
];

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const resetEl = document.getElementById('reset');

let cells = Array(9).fill('');
let turn = 'X';
let over = false;

function winningLine() {
  return LINES.find(([a, b, c]) => cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) ?? null;
}

function render() {
  const line = winningLine();
  const full = cells.every(Boolean);

  boardEl.innerHTML = '';
  cells.forEach((mark, i) => {
    const btn = document.createElement('button');
    btn.className = `ttt-cell${mark === 'O' ? ' o' : ''}${line && line.includes(i) ? ' win' : ''}`;
    btn.type = 'button';
    btn.textContent = mark;
    btn.disabled = over || Boolean(mark);
    btn.setAttribute('aria-label', mark ? `Cell ${i + 1}, ${mark}` : `Cell ${i + 1}, empty`);
    btn.addEventListener('click', () => play(i));
    boardEl.appendChild(btn);
  });

  statusEl.classList.remove('win', 'draw');
  if (line) {
    statusEl.textContent = `${cells[line[0]]} wins!`;
    statusEl.classList.add('win');
  } else if (full) {
    statusEl.textContent = "Cat's game — it's a draw";
    statusEl.classList.add('draw');
  } else {
    statusEl.textContent = `${turn} to play`;
  }
}

function play(i) {
  if (over || cells[i]) return;
  cells[i] = turn;
  if (winningLine() || cells.every(Boolean)) {
    over = true;
  } else {
    turn = turn === 'X' ? 'O' : 'X';
  }
  render();
}

function reset() {
  cells = Array(9).fill('');
  turn = 'X';
  over = false;
  render();
}

resetEl.addEventListener('click', reset);
render();
