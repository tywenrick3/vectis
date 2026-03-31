export { publishToTikTok } from "./tiktok/upload.js";
export { handleTikTokCallback, refreshTokenIfNeeded } from "./tiktok/auth.js";
export { publishToYouTube } from "./youtube/upload.js";
export { getAuthUrl as getYouTubeAuthUrl, handleYouTubeCallback, refreshYouTubeToken } from "./youtube/auth.js";
export type { Platform } from "./platform.js";
