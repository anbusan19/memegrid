import { Hono } from 'hono';
import type { TaskRequest, TaskResponse } from '@devvit/web/server';
import { redis, reddit } from '@devvit/web/server';
import type { DailyState } from '../../shared/puzzle';

export const scheduler = new Hono();

/**
 * Core logic for fetching and storing daily puzzle
 * Can be called from scheduler or menu
 */
export async function fetchDailyPuzzle(): Promise<{ success: boolean; message: string }> {
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    // Check if we already have today's puzzle
    const existingState = await redis.get(`daily_state:${today}`);
    if (existingState) {
      console.log(`[SCHEDULER] Daily state already exists for ${today}`);
      return { success: true, message: `Daily puzzle already exists for ${today}` };
    }

    // Fetch hot posts from r/memes
    const listing = reddit.getHotPosts({
      subredditName: 'memes',
      limit: 1,
      pageSize: 1,
    });

    const posts = await listing.all();
    const post = posts[0];

    if (!post) {
      console.error('[SCHEDULER] No hot posts found in r/memes');
      return { success: false, message: 'No hot posts found in r/memes' };
    }

    // Get image URL from post
    // Priority: full-res preview > direct image URL > thumbnail (last resort)
    // Thumbnails are ~140px and look pixelated when stretched across the puzzle grid.
    let imageUrl: string | undefined;

    if (post.preview?.images?.[0]?.source?.url) {
      // Reddit preview source is the full-resolution version
      let previewUrl = post.preview.images[0].source.url;
      // Decode HTML entities (common in Reddit preview URLs)
      previewUrl = previewUrl.replace(/&amp;/g, '&');
      imageUrl = previewUrl;
    } else if (post.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url)) {
      imageUrl = post.url;
    } else if (post.thumbnail?.url && post.thumbnail.url !== 'self' && post.thumbnail.url !== 'default') {
      // Thumbnail is the lowest quality – only use as a last resort
      imageUrl = post.thumbnail.url;
    }
    
    // Log post details for debugging
    console.log('[SCHEDULER] Post details:', {
      id: post.id,
      url: post.url,
      thumbnail: post.thumbnail,
      hasPreview: !!post.preview?.images?.[0],
      previewUrl: post.preview?.images?.[0]?.source?.url,
      extractedImageUrl: imageUrl,
    });

    if (!imageUrl) {
      console.error('[SCHEDULER] Post has no image URL');
      return { success: false, message: 'Post has no image URL' };
    }

    // Generate a deterministic shuffle seed based on today's date
    // This ensures all users get the same puzzle configuration
    const seed = hashString(today);

    // Create daily state
    const dailyState: DailyState = {
      imageUrl,
      postId: post.id,
      shuffleSeed: seed,
      date: today,
    };

    // Store in Redis with key based on date
    await redis.set(`daily_state:${today}`, JSON.stringify(dailyState));
    
    // Also store as "current" for easy access
    await redis.set('daily_state:current', JSON.stringify(dailyState));

    console.log(`[SCHEDULER] Successfully stored daily state for ${today}`);
    console.log(`[SCHEDULER] Post ID: ${post.id}, Image URL: ${imageUrl}`);

    return { success: true, message: `Daily puzzle fetched for ${today}` };
  } catch (error) {
    console.error('[SCHEDULER] Error in daily fetch:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: errorMessage };
  }
}

/**
 * Daily scheduler job that runs at 00:00 UTC
 * Fetches the top hot post from r/memes and stores it in Redis
 */
scheduler.post('/daily-fetch', async (c) => {
  try {
    const input = await c.req.json<TaskRequest>();
    console.log(`[SCHEDULER] Daily fetch job triggered at ${new Date().toISOString()}`);

    const result = await fetchDailyPuzzle();
    
    if (result.success) {
      return c.json<TaskResponse>({ status: 'ok' }, 200);
    } else {
      return c.json<TaskResponse>(
        { status: 'error', message: result.message },
        500
      );
    }
  } catch (error) {
    console.error('[SCHEDULER] Error in daily fetch job:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json<TaskResponse>(
      { status: 'error', message: errorMessage },
      500
    );
  }
});

/**
 * Simple hash function to convert a string to a number
 * Used to generate deterministic seeds from dates
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
