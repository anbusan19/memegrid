import type {
  DailyStateResponse,
  DailyStateErrorResponse,
} from '../shared/api';
import {
  createShuffledPuzzle,
  makeMove,
  isSolved,
  type PuzzleState,
} from '../shared/puzzle';

const PUZZLE_SIZE = 3;

type GameState = {
  puzzle: PuzzleState | null;
  dailyState: DailyStateResponse | null;
  stats: {
    moves: number;
    startTime: number;
    elapsedTime: number;
  };
  isSolved: boolean;
  imageLoaded: boolean;
};

let gameState: GameState = {
  puzzle: null,
  dailyState: null,
  stats: {
    moves: 0,
    startTime: 0,
    elapsedTime: 0,
  },
  isSolved: false,
  imageLoaded: false,
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

/**
 * Fetch daily puzzle state from server
 */
async function fetchDailyState(): Promise<DailyStateResponse> {
  const response = await fetch('/api/daily-state');
  if (!response.ok) {
    const error = (await response.json()) as DailyStateErrorResponse;
    throw new Error(error.message || 'Failed to fetch daily state');
  }
  return (await response.json()) as DailyStateResponse;
}

/**
 * Format time in MM:SS format
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Update the timer display
 */
function updateTimer(): void {
  if (!gameState.stats.startTime) return;
  
  const elapsed = Math.floor((Date.now() - gameState.stats.startTime) / 1000);
  gameState.stats.elapsedTime = elapsed;
  timeDisplay.textContent = formatTime(elapsed);
}

/**
 * Start the game timer
 */
function startTimer(): void {
  if (timerInterval) return;
  
  gameState.stats.startTime = Date.now();
  timerInterval = window.setInterval(updateTimer, 100);
  updateTimer();
}

/**
 * Stop the game timer
 */
function stopTimer(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/**
 * Update moves display
 */
function updateMovesDisplay(): void {
  movesDisplay.textContent = gameState.stats.moves.toString();
}

/**
 * Create a tile element for the puzzle
 */
function createTileElement(
  tileValue: number,
  imageUrl: string,
  size: number,
  isEmpty: boolean
): HTMLDivElement {
  const tile = document.createElement('div');
  tile.className = `puzzle-tile ${isEmpty ? 'empty' : ''}`;
  tile.dataset.tileIndex = tileValue.toString();
  
  if (!isEmpty) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = `Tile ${tileValue + 1}`;
    
    // Calculate crop position for this tile
    // Each tile should show 1/size of the image
    const row = Math.floor(tileValue / size);
    const col = tileValue % size;
    
    // Calculate the position and size for cropping
    // object-position uses percentages, and we need to position
    // the image so the correct tile is visible
    const tileWidthPercent = 100 / size;
    const xOffset = col * tileWidthPercent;
    const yOffset = row * tileWidthPercent;
    
    // Scale image to show the correct portion
    img.style.width = `${size * 100}%`;
    img.style.height = `${size * 100}%`;
    img.style.objectFit = 'none';
    img.style.objectPosition = `${xOffset}% ${yOffset}%`;
    
    tile.appendChild(img);
  }
  
  return tile;
}

/**
 * Render the puzzle grid
 */
function renderPuzzle(): void {
  if (!gameState.puzzle || !gameState.dailyState) return;
  
  puzzleGrid.innerHTML = '';
  
  const { grid, size } = gameState.puzzle;
  const emptyValue = size * size - 1;
  
  for (let i = 0; i < grid.length; i++) {
    const tileValue = grid[i];
    const isEmpty = tileValue === emptyValue;
    const tile = createTileElement(
      tileValue,
      gameState.dailyState.imageUrl,
      size,
      isEmpty
    );
    
    // Add click handler
    if (!isEmpty) {
      tile.addEventListener('click', () => handleTileClick(i));
    }
    
    puzzleGrid.appendChild(tile);
  }
}

/**
 * Handle tile click
 */
function handleTileClick(tileIndex: number): void {
  if (!gameState.puzzle || gameState.isSolved) return;
  
  const newPuzzle = makeMove(gameState.puzzle, tileIndex);
  if (!newPuzzle) return; // Invalid move
  
  gameState.puzzle = newPuzzle;
  gameState.stats.moves++;
  updateMovesDisplay();
  
  // Start timer on first move
  if (gameState.stats.moves === 1) {
    startTimer();
  }
  
  // Check if solved
  if (isSolved(gameState.puzzle)) {
    gameState.isSolved = true;
    stopTimer();
    showSolvedOverlay();
  } else {
    renderPuzzle();
  }
}

/**
 * Show solved overlay
 */
function showSolvedOverlay(): void {
  finalTimeEl.textContent = formatTime(gameState.stats.elapsedTime);
  finalMovesEl.textContent = gameState.stats.moves.toString();
  solvedOverlay.style.display = 'flex';
}

/**
 * Reset the puzzle
 */
function resetPuzzle(): void {
  if (!gameState.dailyState) return;
  
  gameState.puzzle = createShuffledPuzzle(
    PUZZLE_SIZE,
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

/**
 * Initialize the game
 */
async function initGame(): Promise<void> {
  try {
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    puzzleGrid.style.display = 'none';
    
    // Fetch daily state
    const dailyState = await fetchDailyState();
    gameState.dailyState = dailyState;
    
    // Create shuffled puzzle
    gameState.puzzle = createShuffledPuzzle(
      PUZZLE_SIZE,
      dailyState.shuffleSeed
    );
    
    // Wait for image to load
    // Note: Reddit images may have CORS restrictions, so we try without crossOrigin first
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      
      // Try with crossOrigin first, but fallback to without if it fails
      let triedCrossOrigin = false;
      
      const tryLoad = (useCrossOrigin: boolean) => {
        const newImg = new Image();
        if (useCrossOrigin) {
          newImg.crossOrigin = 'anonymous';
        }
        
        newImg.onload = () => {
          gameState.imageLoaded = true;
          resolve();
        };
        
        newImg.onerror = (error) => {
          console.error('Image load error:', error);
          if (!triedCrossOrigin && useCrossOrigin) {
            // Try again without crossOrigin
            triedCrossOrigin = true;
            tryLoad(false);
          } else {
            reject(new Error(`Failed to load puzzle image from: ${dailyState.imageUrl}`));
          }
        };
        
        newImg.src = dailyState.imageUrl;
      };
      
      tryLoad(true);
    });
    
    // Render puzzle
    loadingEl.style.display = 'none';
    puzzleGrid.style.display = 'grid';
    renderPuzzle();
    
    updateMovesDisplay();
    timeDisplay.textContent = '00:00';
  } catch (error) {
    console.error('Error initializing game:', error);
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    
    let errorMessage = 'Failed to load puzzle. Please try again later.';
    if (error instanceof Error) {
      errorMessage = error.message;
      // Provide more helpful error messages
      if (error.message.includes('Daily puzzle not yet initialized')) {
        errorMessage = 'Daily puzzle not ready yet. The scheduler will fetch a new puzzle at midnight UTC.';
      } else if (error.message.includes('Failed to load puzzle image')) {
        errorMessage = 'Failed to load puzzle image. The image URL may be invalid or blocked.';
      }
    }
    
    errorEl.textContent = errorMessage;
  }
}

// Event listeners
resetButton.addEventListener('click', resetPuzzle);

// Initialize on load
void initGame();
