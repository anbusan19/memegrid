import { exitExpandedMode } from '@devvit/web/client';
import type {
  DailyStateResponse,
  DailyStateErrorResponse,
  SubmitScoreRequest,
} from '../shared/api';
import {
  createShuffledPuzzle,
  makeMove,
  isSolved,
  type PuzzleState,
} from '../shared/puzzle';

type Difficulty = 3 | 4 | 5;

type GameState = {
  puzzle: PuzzleState | null;
  dailyState: DailyStateResponse | null;
  difficulty: Difficulty;
  stats: {
    moves: number;
    startTime: number;
    elapsedTime: number;
  };
  isSolved: boolean;
  hintActive: boolean;
};

function getStoredDifficulty(): Difficulty {
  const stored = localStorage.getItem('puzzleDifficulty');
  if (stored === '4') return 4;
  if (stored === '5') return 5;
  return 3;
}

let gameState: GameState = {
  puzzle: null,
  dailyState: null,
  difficulty: getStoredDifficulty(),
  stats: {
    moves: 0,
    startTime: 0,
    elapsedTime: 0,
  },
  isSolved: false,
  hintActive: false,
};

let timerInterval: number | null = null;

const puzzleGrid = document.getElementById('puzzle-grid') as HTMLDivElement;
const loadingEl = document.getElementById('loading') as HTMLDivElement;
const errorEl = document.getElementById('error') as HTMLDivElement;
const timeDisplay = document.getElementById('time-display') as HTMLSpanElement;
const movesDisplay = document.getElementById('moves-display') as HTMLSpanElement;
const solvedOverlay = document.getElementById('solved-overlay') as HTMLDivElement;
const finalTimeEl = document.getElementById('final-time') as HTMLSpanElement;
const finalMovesEl = document.getElementById('final-moves') as HTMLSpanElement;
const resetButton = document.getElementById('reset-button') as HTMLButtonElement;
const backButton = document.getElementById('back-button') as HTMLButtonElement;
const hintButton = document.getElementById('hint-button') as HTMLButtonElement;

let imageUrl: string | null = null;

async function fetchDailyState(): Promise<DailyStateResponse> {
  const response = await fetch('/api/daily-state');
  if (!response.ok) {
    const error = (await response.json()) as DailyStateErrorResponse;
    throw new Error(error.message || 'Failed to fetch daily state');
  }
  return (await response.json()) as DailyStateResponse;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}`;
}

function updateTimer(): void {
  if (!gameState.stats.startTime) return;
  const elapsed = Math.floor((Date.now() - gameState.stats.startTime) / 1000);
  gameState.stats.elapsedTime = elapsed;
  timeDisplay.textContent = formatTime(elapsed);
}

function startTimer(): void {
  if (timerInterval) return;
  gameState.stats.startTime = Date.now();
  timerInterval = window.setInterval(updateTimer, 100);
}

function stopTimer(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateMovesDisplay(): void {
  movesDisplay.textContent = gameState.stats.moves.toString();
}

function createTileElement(
  tileValue: number,
  size: number,
  isEmpty: boolean,
  gridIndex: number
): HTMLDivElement {
  const tile = document.createElement('div');
  tile.className = `puzzle-tile ${isEmpty ? 'empty' : ''}`;
  tile.dataset.gridIndex = gridIndex.toString();

  if (!isEmpty && imageUrl) {
    const row = Math.floor(tileValue / size);
    const col = tileValue % size;

    tile.style.backgroundImage = `url(${imageUrl})`;
    tile.style.backgroundRepeat = 'no-repeat';

    // CSS background-position percentages: X% means the point X% from
    // the left of the image aligns with the point X% from the left of
    // the container.  With background-size N*100%, the correct formula
    // for tile (col, row) is col/(N-1)*100 % and row/(N-1)*100 %.
    const posX = size > 1 ? (col / (size - 1)) * 100 : 0;
    const posY = size > 1 ? (row / (size - 1)) * 100 : 0;
    tile.style.backgroundPosition = `${posX}% ${posY}%`;
    tile.style.backgroundSize = `${size * 100}% ${size * 100}%`;
  }

  return tile;
}

function renderPuzzle(): void {
  if (!gameState.puzzle) return;

  puzzleGrid.innerHTML = '';
  const { grid, size } = gameState.puzzle;
  const emptyValue = size * size - 1;

  puzzleGrid.className = `puzzle-grid size-${size}`;

  for (let i = 0; i < grid.length; i++) {
    const tileValue = grid[i];
    if (tileValue === undefined) continue;
    const isEmpty = tileValue === emptyValue;

    const tile = createTileElement(
      tileValue,
      size,
      isEmpty,
      i
    );

    if (!isEmpty) {
      tile.addEventListener('click', () => handleTileClick(i));
    }

    puzzleGrid.appendChild(tile);
  }

  hintButton.disabled = gameState.isSolved;
}

function handleTileClick(tileIndex: number): void {
  if (!gameState.puzzle || gameState.isSolved) return;

  const newPuzzle = makeMove(gameState.puzzle, tileIndex);
  if (!newPuzzle) return;

  gameState.puzzle = newPuzzle;
  gameState.stats.moves++;
  updateMovesDisplay();

  if (gameState.stats.moves === 1) {
    startTimer();
  }

  if (isSolved(gameState.puzzle)) {
    gameState.isSolved = true;
    stopTimer();
    showSolvedOverlay();
  } else {
    renderPuzzle();
  }
}

async function submitScore(): Promise<void> {
  if (!gameState.puzzle) return;

  const scoreRequest: SubmitScoreRequest = {
    time: gameState.stats.elapsedTime,
    moves: gameState.stats.moves,
    difficulty: gameState.difficulty,
  };

  await fetch('/api/submit-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scoreRequest),
  });
}

function showSolvedOverlay(): void {
  finalTimeEl.textContent = formatTime(gameState.stats.elapsedTime);
  finalMovesEl.textContent = gameState.stats.moves.toString();
  solvedOverlay.style.display = 'flex';
  void submitScore();
}

function resetPuzzle(): void {
  if (!gameState.dailyState) return;

  gameState.puzzle = createShuffledPuzzle(
    gameState.difficulty,
    gameState.dailyState.shuffleSeed
  );

  gameState.stats.moves = 0;
  gameState.stats.startTime = 0;
  gameState.stats.elapsedTime = 0;
  gameState.isSolved = false;

  stopTimer();
  updateMovesDisplay();
  timeDisplay.textContent = '00:00';
  solvedOverlay.style.display = 'none';

  renderPuzzle();
}

async function initGame(): Promise<void> {
  try {
    loadingEl.style.display = 'block';
    puzzleGrid.style.display = 'none';

    const dailyState = await fetchDailyState();
    gameState.dailyState = dailyState;

    imageUrl = dailyState.imageUrl;

    gameState.puzzle = createShuffledPuzzle(
      gameState.difficulty,
      dailyState.shuffleSeed
    );

    loadingEl.style.display = 'none';
    puzzleGrid.style.display = 'grid';

    renderPuzzle();
    updateMovesDisplay();
    timeDisplay.textContent = '00:00';
  } catch (error) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent =
      error instanceof Error ? error.message : 'Failed to load puzzle.';
  }
}

async function handleBackClick(event: PointerEvent): Promise<void> {
  try {
    await exitExpandedMode(event);
  } catch {
    if (window.history.length > 1) window.history.back();
  }
}

resetButton.addEventListener('click', resetPuzzle);
backButton.addEventListener('click', (e) => {
  void handleBackClick(e);
});

void initGame();
