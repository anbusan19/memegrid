import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  DecrementResponse,
  IncrementResponse,
  InitResponse,
  DailyStateResponse,
  DailyStateErrorResponse,
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
