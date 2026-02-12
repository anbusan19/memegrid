export type InitResponse = {
  type: "init";
  postId: string;
  count: number;
  username: string;
};

export type IncrementResponse = {
  type: "increment";
  postId: string;
  count: number;
};

export type DecrementResponse = {
  type: "decrement";
  postId: string;
  count: number;
};

export type DailyStateResponse = {
  imageUrl: string;
  postId: string;
  shuffleSeed: number;
  date: string;
};

export type DailyStateErrorResponse = {
  status: "error";
  message: string;
};

export type LeaderboardEntry = {
  username: string;
  time: number; // seconds
  moves: number;
  difficulty: 3 | 4 | 5;
  date: string; // ISO date string (YYYY-MM-DD)
};

export type SubmitScoreRequest = {
  time: number;
  moves: number;
  difficulty: 3 | 4 | 5;
};

export type SubmitScoreResponse = {
  status: "success";
  rank: number;
  message: string;
};

export type SubmitScoreErrorResponse = {
  status: "error";
  message: string;
};

export type LeaderboardResponse = {
  entries: LeaderboardEntry[];
  date: string;
  difficulty: 3 | 4 | 5;
};

export type LeaderboardErrorResponse = {
  status: "error";
  message: string;
};
