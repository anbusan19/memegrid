import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';
import { fetchDailyPuzzle } from './scheduler';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      400
    );
  }
});

/**
 * Manually trigger the daily puzzle fetch (for testing)
 */
menu.post('/fetch-daily', async (c) => {
  try {
    const result = await fetchDailyPuzzle();
    
    if (result.success) {
      return c.json<UiResponse>(
        {
          showToast: result.message || 'Daily puzzle fetched successfully!',
        },
        200
      );
    } else {
      return c.json<UiResponse>(
        {
          showToast: `Failed: ${result.message || 'Unknown error'}`,
        },
        400
      );
    }
  } catch (error) {
    console.error('Error fetching daily puzzle:', error);
    return c.json<UiResponse>(
      {
        showToast: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      500
    );
  }
});
