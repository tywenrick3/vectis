export type GameplayTag = "minecraft-parkour" | "subway-surfers";

export interface Candidate {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  publishedAt: string;
  durationSec: number;
  views: number;
  score: number;
  tag: GameplayTag;
}
