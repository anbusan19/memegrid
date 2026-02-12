import { navigateTo, requestExpandedMode } from '@devvit/web/client';
import type { LeaderboardResponse } from '../shared/api';

const docsLink = document.getElementById('docs-link') as HTMLDivElement;
const playtestLink = document.getElementById('playtest-link') as HTMLDivElement;
const discordLink = document.getElementById('discord-link') as HTMLDivElement;
const startButton = document.getElementById('start-button') as HTMLButtonElement;
const leaderboardButton = document.getElementById('leaderboard-button') as HTMLButtonElement;
const difficultyModal = document.getElementById('difficulty-modal') as HTMLDivElement;
const difficultyOptions = document.querySelectorAll('.difficulty-option') as NodeListOf<HTMLButtonElement>;
const leaderboardModal = document.getElementById('leaderboard-modal') as HTMLDivElement;
const leaderboardList = document.getElementById('leaderboard-list') as HTMLDivElement;
const closeLeaderboardButton = document.getElementById('close-leaderboard') as HTMLButtonElement;
const filterButtons = document.querySelectorAll('.filter-btn') as NodeListOf<HTMLButtonElement>;

// Show difficulty modal when start button is clicked
startButton.addEventListener('click', () => {
  difficultyModal.style.display = 'flex';
});

// Handle difficulty selection
difficultyOptions.forEach((option) => {
  option.addEventListener('click', async (e) => {
    const difficulty = Number.parseInt(option.dataset.difficulty || '3');
    
    // Store difficulty in localStorage
    localStorage.setItem('puzzleDifficulty', difficulty.toString());
    
    // Hide modal and navigate to game
    difficultyModal.style.display = 'none';
    
    try {
      await requestExpandedMode(e, 'game');
    } catch (error) {
      console.error('Failed to enter expanded mode:', error);
    }
  });
});

// Close modal when clicking outside (optional)
difficultyModal.addEventListener('click', (e) => {
  if (e.target === difficultyModal) {
    difficultyModal.style.display = 'none';
  }
});

// Leaderboard functionality
let currentDifficulty: 3 | 4 | 5 = 3;

/**
 * Format time in MM:SS format
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Load and display leaderboard
 */
async function loadLeaderboard(difficulty: 3 | 4 | 5): Promise<void> {
  try {
    leaderboardList.innerHTML = '<div class="loading">Loading leaderboard...</div>';
    
    const today = new Date().toISOString().split('T')[0];
    const response = await fetch(`/api/leaderboard?date=${today}&difficulty=${difficulty}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch leaderboard');
    }
    
    const data = (await response.json()) as LeaderboardResponse;
    
    if (data.entries.length === 0) {
      leaderboardList.innerHTML = '<div class="loading">No scores yet for today!</div>';
      return;
    }
    
    leaderboardList.innerHTML = '';
    
    data.entries.forEach((entry, index) => {
      const rank = index + 1;
      const entryEl = document.createElement('div');
      entryEl.className = `leaderboard-entry rank-${rank <= 3 ? rank : ''}`;
      
      entryEl.innerHTML = `
        <span class="leaderboard-rank">#${rank}</span>
        <span class="leaderboard-username">${entry.username}</span>
        <div class="leaderboard-stats">
          <span class="leaderboard-time">${formatTime(entry.time)}</span>
          <span class="leaderboard-moves">${entry.moves} moves</span>
        </div>
      `;
      
      leaderboardList.appendChild(entryEl);
    });
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    leaderboardList.innerHTML = '<div class="loading" style="color: #ff0000;">Failed to load leaderboard</div>';
  }
}

// Show leaderboard modal when button is clicked
leaderboardButton.addEventListener('click', () => {
  leaderboardModal.style.display = 'flex';
  void loadLeaderboard(currentDifficulty);
});

// Close leaderboard modal
closeLeaderboardButton.addEventListener('click', () => {
  leaderboardModal.style.display = 'none';
});

// Close modal when clicking outside
leaderboardModal.addEventListener('click', (e) => {
  if (e.target === leaderboardModal) {
    leaderboardModal.style.display = 'none';
  }
});

// Handle difficulty filter changes
filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const difficulty = Number.parseInt(btn.dataset.difficulty || '3') as 3 | 4 | 5;
    currentDifficulty = difficulty;
    
    // Update active state
    filterButtons.forEach((b) => {
      if (Number.parseInt(b.dataset.difficulty || '3') === difficulty) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
    
    // Reload leaderboard
    void loadLeaderboard(difficulty);
  });
});

docsLink?.addEventListener('click', () => {
  navigateTo('https://developers.reddit.com/docs');
});

playtestLink?.addEventListener('click', () => {
  navigateTo('https://www.reddit.com/r/Devvit');
});

discordLink?.addEventListener('click', () => {
  navigateTo('https://discord.com/invite/R7yu2wh9Qz');
});

function init() {
  // Title is set in HTML, no need to update
}

init();
