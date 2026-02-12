import { exitExpandedMode } from '@devvit/web/client';
import type {
  DailyStateResponse,
  DailyStateErrorResponse,
  SubmitScoreRequest,
  SubmitScoreResponse,
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
  imageLoaded: boolean;
  hintActive: boolean;
};

let gameState: GameState = {
  puzzle: null,
  dailyState: null,
  difficulty: 3,
  stats: {
    moves: 0,
    startTime: 0,
    elapsedTime: 0,
  },
  isSolved: false,
  imageLoaded: false,
  hintActive: false,
};

// Store the original image URL and dimensions for CSS cropping
let imageData: {
  url: string;
  width: number;
  height: number;
  squareSize: number;
} | null = null;

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
const hintContainer = document.querySelector('.hint-container') as HTMLDivElement;

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
 * Load and measure the image to prepare for CSS-based cropping
 */
async function loadImageForCropping(
  imageUrl: string,
  size: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tryLoad = (useCrossOrigin: boolean) => {
      const img = new Image();
      
      if (useCrossOrigin) {
        img.crossOrigin = 'anonymous';
      }
      
      img.onload = () => {
        // Calculate square dimensions (use the smaller dimension for center crop)
        const minDimension = Math.min(img.width, img.height);
        const squareSize = minDimension;
        
        // Calculate source crop offsets for center crop
        const sourceX = (img.width - squareSize) / 2;
        const sourceY = (img.height - squareSize) / 2;
        
        imageData = {
          url: imageUrl,
          width: img.width,
          height: img.height,
          squareSize: squareSize,
        };
        
        console.log(`[IMAGE] Loaded image: ${img.width}x${img.height}, square: ${squareSize}x${squareSize}`);
        console.log(`[IMAGE] Crop offset: (${sourceX}, ${sourceY})`);
        resolve();
      };
      
      img.onerror = () => {
        if (useCrossOrigin) {
          // Try again without crossOrigin
          tryLoad(false);
        } else {
          reject(new Error('Failed to load image'));
        }
      };
      
      img.src = imageUrl;
    };
    
    // Start with crossOrigin
    tryLoad(true);
  });
}

/**
 * Create a tile element for the puzzle
 */
function createTileElement(
  tileValue: number,
  size: number,
  isEmpty: boolean,
  gridIndex?: number
): HTMLDivElement {
  const tile = document.createElement('div');
  tile.className = `puzzle-tile ${isEmpty ? 'empty' : ''}`;
  tile.dataset.tileIndex = tileValue.toString();
  if (gridIndex !== undefined) {
    tile.dataset.gridIndex = gridIndex.toString();
  }
  
  if (!isEmpty && imageData) {
    const img = document.createElement('img');
    img.src = imageData.url;
    img.alt = `Tile ${tileValue + 1}`;
    
    // Calculate which portion of the image this tile should show
    // tileValue 0-8 represents the original position (0,0) through (2,2)
    const row = Math.floor(tileValue / size);
    const col = tileValue % size;
    
    // Calculate the square crop (center crop) in the original image
    const sourceX = (imageData.width - imageData.squareSize) / 2;
    const sourceY = (imageData.height - imageData.squareSize) / 2;
    
    // Calculate tile size within the square
    const tileSizeInSquare = imageData.squareSize / size;
    
    // Calculate the position of this tile within the square
    const tileXInSquare = col * tileSizeInSquare;
    const tileYInSquare = row * tileSizeInSquare;
    
    // Calculate the absolute position in the original image
    const absoluteX = sourceX + tileXInSquare;
    const absoluteY = sourceY + tileYInSquare;
    
    // Scale the image so that the square portion fills size * 100% of the container
    // For a 3x3 grid, we want the square (which is 1/1 of the square) to be 300% of container
    // So the full image needs to be scaled proportionally
    // If squareSize is the size we want to show at 300%, then:
    // imageScale = (imageData.width / imageData.squareSize) * size * 100
    const imageScalePercent = (imageData.width / imageData.squareSize) * size * 100;
    
    // Calculate object-position to align the tile correctly
    // object-position is a percentage of (image size - container size)
    // We want the point (absoluteX, absoluteY) to be at the top-left of the container
    // Formula: position = (point - container/2) / (image - container) * 100
    // But since we're using percentages, it's simpler:
    // We want absoluteX to align with the left edge, so:
    const xPercent = (absoluteX / imageData.width) * 100;
    const yPercent = (absoluteY / imageData.height) * 100;
    
    // Apply styles for CSS cropping
    img.style.width = `${imageScalePercent}%`;
    img.style.height = `${imageScalePercent}%`;
    img.style.objectFit = 'none';
    img.style.objectPosition = `${xPercent}% ${yPercent}%`;
    
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
  
  // Update grid CSS class for size
  puzzleGrid.className = `puzzle-grid size-${size}`;
  
  // Clear hint highlighting
  gameState.hintActive = false;
  
  for (let i = 0; i < grid.length; i++) {
    const tileValue = grid[i];
    const isEmpty = tileValue === emptyValue;
    const tile = createTileElement(
      tileValue,
      size,
      isEmpty,
      i
    );
    
    // Add click handler
    if (!isEmpty) {
      tile.addEventListener('click', () => handleTileClick(i));
    }
    
    puzzleGrid.appendChild(tile);
  }
  
  // Update hint button state
  hintButton.disabled = gameState.isSolved;
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
    hintButton.disabled = true;
    showSolvedOverlay();
  } else {
    renderPuzzle();
  }
}

/**
 * Submit score to leaderboard
 */
async function submitScore(): Promise<void> {
  if (!gameState.puzzle) return;
  
  try {
    const scoreRequest: SubmitScoreRequest = {
      time: gameState.stats.elapsedTime,
      moves: gameState.stats.moves,
      difficulty: gameState.difficulty,
    };
    
    const response = await fetch('/api/submit-score', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scoreRequest),
    });
    
    if (!response.ok) {
      console.error('Failed to submit score');
      return;
    }
    
    const result = (await response.json()) as SubmitScoreResponse;
    console.log(`Score submitted! Rank: #${result.rank}`);
  } catch (error) {
    console.error('Error submitting score:', error);
  }
}

/**
 * Show solved overlay
 */
function showSolvedOverlay(): void {
  finalTimeEl.textContent = formatTime(gameState.stats.elapsedTime);
  finalMovesEl.textContent = gameState.stats.moves.toString();
  solvedOverlay.style.display = 'flex';
  
  // Submit score to leaderboard
  void submitScore();
}

/**
 * Reset the puzzle
 */
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
  gameState.hintActive = false;
  
  stopTimer();
  updateMovesDisplay();
  timeDisplay.textContent = '00:00';
  solvedOverlay.style.display = 'none';
  hintButton.disabled = false;
  
  renderPuzzle();
}

/**
 * Get the next best move for hint
 * Returns the index of the tile that should be moved next
 */
function getNextMoveHint(puzzle: PuzzleState): number | null {
  // Simple heuristic: find the tile that's furthest from its correct position
  // and can be moved towards it
  let bestTile: number | null = null;
  let bestScore = -1;
  
  const { grid, emptyIndex, size } = puzzle;
  
  // Get all valid moves (tiles adjacent to empty space)
  const validMoves: number[] = [];
  const row = Math.floor(emptyIndex / size);
  const col = emptyIndex % size;
  
  if (row > 0) validMoves.push(emptyIndex - size); // Up
  if (row < size - 1) validMoves.push(emptyIndex + size); // Down
  if (col > 0) validMoves.push(emptyIndex - 1); // Left
  if (col < size - 1) validMoves.push(emptyIndex + 1); // Right
  
  // Score each valid move by how much closer it gets to its target
  for (const tileIndex of validMoves) {
    const tileValue = grid[tileIndex];
    const targetIndex = tileValue;
    
    // Calculate Manhattan distance from current position to target
    const currentRow = Math.floor(tileIndex / size);
    const currentCol = tileIndex % size;
    const targetRow = Math.floor(targetIndex / size);
    const targetCol = targetIndex % size;
    
    const currentDist = Math.abs(currentRow - targetRow) + Math.abs(currentCol - targetCol);
    
    // Calculate distance if we move this tile to empty space
    const newRow = Math.floor(emptyIndex / size);
    const newCol = emptyIndex % size;
    const newDist = Math.abs(newRow - targetRow) + Math.abs(newCol - targetCol);
    
    // Score is how much closer we get (negative means further, positive means closer)
    const score = currentDist - newDist;
    
    if (score > bestScore) {
      bestScore = score;
      bestTile = tileIndex;
    }
  }
  
  return bestTile;
}

/**
 * Show hint by highlighting the next best move
 */
function showHint(): void {
  if (!gameState.puzzle || gameState.isSolved || gameState.hintActive) return;
  
  const hintTileIndex = getNextMoveHint(gameState.puzzle);
  
  if (hintTileIndex !== null) {
    gameState.hintActive = true;
    const tile = puzzleGrid.querySelector(`[data-grid-index="${hintTileIndex}"]`) as HTMLElement;
    
    if (tile && !tile.classList.contains('empty')) {
      tile.classList.add('hint-highlight');
      
      // Remove hint after 3 seconds
      setTimeout(() => {
        tile.classList.remove('hint-highlight');
        gameState.hintActive = false;
      }, 3000);
    }
  }
}

/**
 * Initialize the game
 */
async function initGame(): Promise<void> {
  try {
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    puzzleGrid.style.display = 'none';
    
    // Get difficulty from localStorage (default to 3 if not set)
    const storedDifficulty = localStorage.getItem('puzzleDifficulty');
    if (storedDifficulty) {
      const difficulty = Number.parseInt(storedDifficulty) as Difficulty;
      if (difficulty === 3 || difficulty === 4 || difficulty === 5) {
        gameState.difficulty = difficulty;
      }
    }
    
    // Fetch daily state
    const dailyState = await fetchDailyState();
    gameState.dailyState = dailyState;
    
    // Create shuffled puzzle with selected difficulty
    gameState.puzzle = createShuffledPuzzle(
      gameState.difficulty,
      dailyState.shuffleSeed
    );
    
    // Load and measure the image for CSS cropping
    loadingEl.textContent = 'Loading puzzle image...';
    await loadImageForCropping(dailyState.imageUrl, gameState.difficulty);
    gameState.imageLoaded = true;
    
    // Render puzzle
    loadingEl.style.display = 'none';
    puzzleGrid.style.display = 'grid';
    if (hintContainer) {
      hintContainer.classList.add('visible');
    }
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

/**
 * Handle back button click
 */
async function handleBackClick(event: PointerEvent): Promise<void> {
  try {
    await exitExpandedMode(event);
  } catch (error) {
    console.error('Failed to exit expanded mode:', error);
    // Fallback: try to navigate back using browser history if available
    if (window.history.length > 1) {
      window.history.back();
    }
  }
}

// Event listeners
resetButton.addEventListener('click', resetPuzzle);
backButton.addEventListener('click', (e) => {
  void handleBackClick(e);
});
hintButton.addEventListener('click', showHint);

// Initialize on load
void initGame();
