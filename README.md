# MemeJak: The Daily Meme Scramble

A daily sliding-tile puzzle game powered by Reddit’s hottest content.

Unscramble the internet's favorite image of the day and beat the clock.

---

## Project Overview

**MemeJak** is a daily sliding-tile puzzle game built on the **Reddit Devvit Platform**.

Every 24 hours, the game automatically fetches the top "Hot" post from a chosen subreddit (e.g., `r/memes` or `r/pics`). The image is sliced into a grid (3x3 - easy, 4x4 - medium, or 5x5 - hard) and shuffled.

Players race against time to solve the puzzle using classic sliding-tile mechanics.

---

## Key Features

### The Daily Drop (Recurring Content)

#### Automated Content Pipeline

* Uses Reddit API to fetch the daily "Hot" post at 00:00 UTC
* No manual curation required
* Fully automated daily refresh

#### Universal Seed

* Every player receives the same shuffle configuration
* Ensures fairness and shared experience
* Daily state resets every 24 hours

---

### Gameplay Mechanics

#### Difficulty Modes

* **Casual (3x3)** – Quick, lightweight challenge
* **Puzzler (4x4)** – Standard sliding puzzle experience
* **Expert (5x5)** – High-difficulty, high-detail challenge

#### Game Logic

* Classic 15-puzzle sliding mechanics
* Click a tile adjacent to the empty space to move it
* Only valid adjacent swaps are allowed
* Puzzle completes when all tiles return to original order

#### Live Stats Tracking

* Time Elapsed
* Move Counter

---

## Technical Architecture

### Tech Stack

* **Platform:** Devvit (Reddit Developer Platform)
* **Frontend:** Devvit UI (Blocks, Stack, Image)
* **Data Storage:** Reddit Redis Plugin (Daily State)
* **Scheduler:** Devvit Scheduler

---

## Data Flow

### Daily Scheduler (Cron Job)

Runs once per day at 00:00 UTC.

```ts
Devvit.configure({
  redditAPI: true,
});

Devvit.addMenuItem({
  location: 'subreddit',
  label: 'Show hot meme image',
  onPress: async (_event, context) => {
    // 1. Get hot posts from a subreddit, e.g. "memes"
    const listing = context.reddit.getHotPosts({
      subredditName: 'memes',
      limit: 1,
      pageSize: 1,
    }); // returns Listing<Post> [[getHotPosts](https://developers.reddit.com/docs/api/redditapi/RedditAPIClient/classes/RedditAPIClient#gethotposts)]

    const [post] = await listing.all();
    if (!post) {
      await context.ui.showToast('No hot posts found');
      return;
    }

    // 2. Get the thumbnail image URL
    const thumb = post.thumbnail; // { url, width, height } or undefined [[Post.thumbnail](https://developers.reddit.com/docs/api/redditapi/models/classes/Post#get-signature-35)]

    if (!thumb?.url) {
      await context.ui.showToast('Post has no thumbnail image');
      return;
    }

    // 3. Use the image URL (here we just show it in a toast)
    await context.ui.showToast(`Image URL: ${thumb.url}`);
  },
});
```

#### Flow:

1. Fetch Hot post
2. Extract image URL
3. Store image URL in Redis
4. Store post ID in Redis
5. Generate and store daily shuffle seed

---

### Client (Game Rendering)

#### Fetch Daily State

* `daily_image_url`
* `shuffle_seed`

#### Grid Rendering

* Uses 9 / 16 / 25 separate `<Image>` blocks
* Each block loads the same image URL
* Cropping handled using:

  * `imageWidth`
  * `imageHeight`
  * `resizeMode`

#### Local Puzzle State

```ts
const grid = [0, 1, 2, 3, 4, 5, 6, 7, 8];
```

* Shuffle using deterministic seed
* Swap indices on valid moves
* Detect completion when grid matches original order

---

## Core Puzzle Logic

### Shuffle Strategy

* Fisher-Yates shuffle
* Seeded random generator for deterministic daily puzzle
* Ensure puzzle remains solvable

### Move Validation

A tile can move only if:

* It is adjacent (up, down, left, right) to the empty tile
* The move maintains valid board state

### Completion Check

```ts
const isSolved = grid.every((value, index) => value === index);
```

---

## Development Roadmap

### Phase 1: Core Loop (MVP)

* [ ] Configure `Devvit.configure` with Reddit API
* [ ] Implement `fetchHotPost` logic
* [ ] Build 3x3 grid UI using Devvit Blocks
* [ ] Implement shuffle logic
* [ ] Implement move validation logic
* [ ] Milestone: Playable puzzle with hardcoded image

---

### Phase 2: Daily Infrastructure

* [ ] Implement `Devvit.addSchedulerJob`
* [ ] Store daily image in Redis
* [ ] Store daily shuffle seed
* [ ] Ensure 24-hour shared puzzle state

---

### Phase 3: Polish & UX

* [ ] Add timer
* [ ] Add move counter
* [ ] Add difficulty selector (3x3 / 4x4 / 5x5)
* [ ] Add reset button

---

## Hackathon Categorization

**Primary Category:** Best Daily Game (Recurring Mechanic)

**Secondary Category:** Best Use of Reddit Content (Community-Powered Content Pipeline)

---

## How to Run

```bash
devvit upload
```

1. Clone the repository
2. Run the upload command
3. Open your test subreddit
4. Launch the **MemeJak** menu item

---

## Why MemeJak?

* Turns Reddit’s daily content into an interactive habit
* Encourages repeat engagement every 24 hours
* Combines automation, deterministic gameplay, and community-driven content
* Lightweight, replayable, and highly extensible

---

Built for the Reddit Games Hackathon
