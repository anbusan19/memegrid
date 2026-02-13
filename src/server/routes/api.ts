import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  DecrementResponse,
  IncrementResponse,
  InitResponse,
  DailyStateResponse,
  DailyStateErrorResponse,
  LeaderboardEntry,
  SubmitScoreRequest,
  SubmitScoreResponse,
  SubmitScoreErrorResponse,
  LeaderboardResponse,
  LeaderboardErrorResponse,
} from '../../shared/api';
import type { DailyState } from '../../shared/puzzle';

type ErrorResponse = {
  status: 'error';
  message: string;
};

export const api = new Hono();

api.get('/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    console.error('API Init Error: postId not found in devvit context');
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required but missing from context',
      },
      400
    );
  }

  try {
    const [count, username] = await Promise.all([
      redis.get('count'),
      reddit.getCurrentUsername(),
    ]);

    return c.json<InitResponse>({
      type: 'init',
      postId: postId,
      count: count ? parseInt(count) : 0,
      username: username ?? 'anonymous',
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    let errorMessage = 'Unknown error during initialization';
    if (error instanceof Error) {
      errorMessage = `Initialization failed: ${error.message}`;
    }
    return c.json<ErrorResponse>(
      { status: 'error', message: errorMessage },
      400
    );
  }
});

api.post('/increment', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  const count = await redis.incrBy('count', 1);
  return c.json<IncrementResponse>({
    count,
    postId,
    type: 'increment',
  });
});

api.post('/decrement', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  const count = await redis.incrBy('count', -1);
  return c.json<DecrementResponse>({
    count,
    postId,
    type: 'decrement',
  });
});

/**
 * Get the daily puzzle state (image URL, shuffle seed, etc.)
 */
api.get('/daily-state', async (c) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Try to get today's state
    let dailyStateStr = await redis.get(`daily_state:${today}`);
    
    // If not found, try current (fallback)
    if (!dailyStateStr) {
      dailyStateStr = await redis.get('daily_state:current');
    }
    
    // If still not found, return error
    if (!dailyStateStr) {
      return c.json<DailyStateErrorResponse>(
        {
          status: 'error',
          message: 'Daily puzzle not yet initialized. Please wait for the scheduler to run.',
        },
        404
      );
    }

    const dailyState = JSON.parse(dailyStateStr) as DailyState;
    
    // Verify it's for today (or allow if it's the most recent)
    if (dailyState.date !== today) {
      console.warn(`[API] Daily state date mismatch: expected ${today}, got ${dailyState.date}`);
    }

    return c.json<DailyStateResponse>({
      imageUrl: dailyState.imageUrl,
      postId: dailyState.postId,
      shuffleSeed: dailyState.shuffleSeed,
      date: dailyState.date,
    });
  } catch (error) {
    console.error('[API] Error fetching daily state:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json<DailyStateErrorResponse>(
      {
        status: 'error',
        message: `Failed to fetch daily state: ${errorMessage}`,
      },
      500
    );
  }
});

/**
 * Submit a score to the leaderboard
 */
api.post('/submit-score', async (c) => {
  try {
    const body = await c.req.json<SubmitScoreRequest>();
    const { time, moves, difficulty } = body;

    if (!time || !moves || !difficulty) {
      return c.json<SubmitScoreErrorResponse>(
        {
          status: 'error',
          message: 'Missing required fields: time, moves, difficulty',
        },
        400
      );
    }

    // Get current user
    const username = await reddit.getCurrentUsername();
    if (!username) {
      return c.json<SubmitScoreErrorResponse>(
        {
          status: 'error',
          message: 'Unable to get username',
        },
        401
      );
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0]!;

    // Create leaderboard entry
    const entry: LeaderboardEntry = {
      username,
      time,
      moves,
      difficulty,
      date: today,
    };

    // Get current leaderboard for this date and difficulty
    const leaderboardKey = `leaderboard:${today}:${difficulty}`;
    const leaderboardStr = await redis.get(leaderboardKey);
    let leaderboard: LeaderboardEntry[] = leaderboardStr
      ? JSON.parse(leaderboardStr)
      : [];

    // Check if user already has an entry for today
    const existingIndex = leaderboard.findIndex(
      (e) => e.username === username
    );

    // If user has a better score (lower time, or same time with fewer moves), update it
    if (existingIndex >= 0) {
      const existing = leaderboard[existingIndex];
      if (!existing) {
        // Should not happen, but handle it
        leaderboard.push(entry);
      } else if (
        time < existing.time ||
        (time === existing.time && moves < existing.moves)
      ) {
        leaderboard[existingIndex] = entry;
      } else {
        // User's existing score is better, don't update
        const rank =
          leaderboard.filter(
            (e) =>
              e.time < existing.time ||
              (e.time === existing.time && e.moves < existing.moves)
          ).length + 1;
        return c.json<SubmitScoreResponse>({
          status: 'success',
          rank,
          message: 'Your existing score is better',
        });
      }
    } else {
      // New entry
      leaderboard.push(entry);
    }

    // Sort leaderboard: first by time (ascending), then by moves (ascending)
    leaderboard.sort((a, b) => {
      if (a.time !== b.time) {
        return a.time - b.time;
      }
      return a.moves - b.moves;
    });

    // Keep only top 100 entries
    leaderboard = leaderboard.slice(0, 100);

    // Save back to Redis
    await redis.set(leaderboardKey, JSON.stringify(leaderboard));

    // Find user's rank
    const rank =
      leaderboard.findIndex((e) => e.username === username) + 1;

    return c.json<SubmitScoreResponse>({
      status: 'success',
      rank,
      message: 'Score submitted successfully',
    });
  } catch (error) {
    console.error('[API] Error submitting score:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json<SubmitScoreErrorResponse>(
      {
        status: 'error',
        message: `Failed to submit score: ${errorMessage}`,
      },
      500
    );
  }
});

/**
 * Get leaderboard for a specific date and difficulty
 */
api.get('/leaderboard', async (c) => {
  try {
    const dateQuery = c.req.query('date');
    const date = dateQuery || new Date().toISOString().split('T')[0]!;
    const difficultyStr = c.req.query('difficulty') || '3';
    const difficulty = Number.parseInt(difficultyStr) as 3 | 4 | 5;

    if (difficulty !== 3 && difficulty !== 4 && difficulty !== 5) {
      return c.json<LeaderboardErrorResponse>(
        {
          status: 'error',
          message: 'Invalid difficulty. Must be 3, 4, or 5',
        },
        400
      );
    }

    // Get leaderboard from Redis
    const leaderboardKey = `leaderboard:${date}:${difficulty}`;
    const leaderboardStr = await redis.get(leaderboardKey);
    const leaderboard: LeaderboardEntry[] = leaderboardStr
      ? JSON.parse(leaderboardStr)
      : [];

    return c.json<LeaderboardResponse>({
      entries: leaderboard,
      date: date,
      difficulty,
    });
  } catch (error) {
    console.error('[API] Error fetching leaderboard:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json<LeaderboardErrorResponse>(
      {
        status: 'error',
        message: `Failed to fetch leaderboard: ${errorMessage}`,
      },
      500
    );
  }
});
