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
