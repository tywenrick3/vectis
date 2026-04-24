export { discover, type DiscoverOptions } from "./discover.js";
export {
  findChannels,
  type ChannelCandidate,
  type FindChannelsOptions,
} from "./find-channels.js";
export {
  refreshPool,
  type RefreshOptions,
  type RefreshSummary,
  type TagSummary,
} from "./refresh.js";
export {
  pickClip,
  getPoolStats,
  type PickOptions,
  type PickResult,
  type PoolStats,
} from "./pool.js";
export {
  GAMEPLAY_TAGS,
  TAG_QUERIES,
  TAG_CHANNELS,
  type ChannelSeed,
} from "./niches.js";
export type { Candidate, GameplayTag } from "./types.js";
