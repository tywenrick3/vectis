import type { VideoAsset, Script } from "@vectis/shared";

export interface Platform {
  name: string;
  publish(video: VideoAsset, script: Script): Promise<string>; // returns platform publish ID
}
