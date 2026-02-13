export type DailyState = {
  imageUrl: string;
  postId: string;
  shuffleSeed: number;
  date: string; // ISO date string (YYYY-MM-DD)
};

export type PuzzleState = {
  grid: number[];
  emptyIndex: number;
  size: number; // 3, 4, or 5
};

export type GameStats = {
  moves: number;
  startTime: number;
  elapsedTime: number;
};

export type SeededRandom = {
  seed: number;
  next: () => number;
};

/**
 * Creates a seeded random number generator using a simple LCG
 */
export function createSeededRandom(seed: number): SeededRandom {
  let currentSeed = seed;
  return {
    seed,
    next: () => {
      // Linear Congruential Generator
      currentSeed = (currentSeed * 1664525 + 1013904223) % 2 ** 32;
      return currentSeed / 2 ** 32;
    },
  };
}

/**
 * Fisher-Yates shuffle with seeded random
 */
export function seededShuffle<T>(array: T[], rng: SeededRandom): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }
  return shuffled;
}

/**
 * Counts inversions in a permutation (for solvability check)
 */
function countInversions(grid: number[], size: number): number {
  let inversions = 0;
  for (let i = 0; i < grid.length; i++) {
    const valI = grid[i];
    if (valI === undefined || valI === size * size - 1) continue; // Skip empty tile
    for (let j = i + 1; j < grid.length; j++) {
      const valJ = grid[j];
      if (valJ === undefined || valJ === size * size - 1) continue; // Skip empty tile
      if (valI > valJ) inversions++;
    }
  }
  return inversions;
}

/**
 * Gets the row number (0-indexed) of the empty tile
 */
function getEmptyRow(grid: number[], size: number): number {
  const emptyIndex = grid.indexOf(size * size - 1);
  return Math.floor(emptyIndex / size);
}

/**
 * Checks if a puzzle configuration is solvable
 * For a 15-puzzle (or N-puzzle), a configuration is solvable if:
 * - (inversions + emptyRow) is even for odd-sized grids
 * - (inversions + emptyRow) is odd for even-sized grids
 */
export function isSolvable(grid: number[], size: number): boolean {
  const inversions = countInversions(grid, size);
  const emptyRow = getEmptyRow(grid, size);
  
  if (size % 2 === 1) {
    // Odd-sized grid: solvable if inversions is even
    return inversions % 2 === 0;
  } else {
    // Even-sized grid: solvable if (inversions + emptyRow) is even
    return (inversions + emptyRow) % 2 === 0;
  }
}

/**
 * Creates a solvable shuffled puzzle
 */
export function createShuffledPuzzle(size: number, seed: number): PuzzleState {
  const totalTiles = size * size;
  const solvedGrid = Array.from({ length: totalTiles }, (_, i) => i);
  const emptyIndex = totalTiles - 1;
  
  const rng = createSeededRandom(seed);
  let grid: number[];
  let attempts = 0;
  
  // Keep shuffling until we get a solvable configuration
  do {
    grid = seededShuffle(solvedGrid, rng);
    attempts++;
    if (attempts > 100) {
      // Fallback: if we can't find a solvable config, use a simple swap
      grid = [...solvedGrid];
      const last = grid[totalTiles - 1];
      const secondLast = grid[totalTiles - 2];
      if (last !== undefined && secondLast !== undefined) {
        grid[totalTiles - 1] = secondLast;
        grid[totalTiles - 2] = last;
      }
      break;
    }
  } while (!isSolvable(grid, size));
  
  return {
    grid,
    emptyIndex: grid.indexOf(emptyIndex),
    size,
  };
}

/**
 * Gets valid adjacent indices for a given index in a grid
 */
function getAdjacentIndices(index: number, size: number): number[] {
  const row = Math.floor(index / size);
  const col = index % size;
  const adjacent: number[] = [];
  
  if (row > 0) adjacent.push(index - size); // Up
  if (row < size - 1) adjacent.push(index + size); // Down
  if (col > 0) adjacent.push(index - 1); // Left
  if (col < size - 1) adjacent.push(index + 1); // Right
  
  return adjacent;
}

/**
 * Checks if a move is valid (tile is adjacent to empty space)
 */
export function isValidMove(
  puzzle: PuzzleState,
  tileIndex: number
): boolean {
  const adjacent = getAdjacentIndices(tileIndex, puzzle.size);
  return adjacent.includes(puzzle.emptyIndex);
}

/**
 * Makes a move if valid, returns new puzzle state or null if invalid
 */
export function makeMove(
  puzzle: PuzzleState,
  tileIndex: number
): PuzzleState | null {
  if (!isValidMove(puzzle, tileIndex)) {
    return null;
  }
  
  const newGrid = [...puzzle.grid];
  const tileValue = newGrid[tileIndex];
  const emptyValue = newGrid[puzzle.emptyIndex];
  
  if (tileValue === undefined || emptyValue === undefined) {
    return null;
  }
  
  newGrid[tileIndex] = emptyValue;
  newGrid[puzzle.emptyIndex] = tileValue;
  
  return {
    grid: newGrid,
    emptyIndex: tileIndex,
    size: puzzle.size,
  };
}

/**
 * Checks if the puzzle is solved
 */
export function isSolved(puzzle: PuzzleState): boolean {
  return puzzle.grid.every((value, index) => value === index);
}
