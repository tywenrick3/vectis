import type { GameplayTag } from "./types.js";

export const GAMEPLAY_TAGS: readonly GameplayTag[] = [
  "minecraft-parkour",
  "subway-surfers",
] as const;

export const TAG_QUERIES: Record<GameplayTag, string> = {
  "minecraft-parkour": "minecraft parkour",
  "subway-surfers": "subway surfers gameplay",
};

// Title regex per tag — filters cross-game uploads when a seed channel posts
// content for multiple games (e.g. Orbital posts both minecraft and subway).
export const TAG_TITLE_PATTERNS: Record<GameplayTag, RegExp> = {
  "minecraft-parkour": /minecraft|parkour/i,
  "subway-surfers": /subway\s*surf/i,
};

export interface ChannelSeed {
  channelId: string;
  handle: string;
  title: string;
}

export const TAG_CHANNELS: Record<GameplayTag, ChannelSeed[]> = {
  "minecraft-parkour": [
    {
      channelId: "UCTGjE7hWuBRNqU-OnVSzq3Q",
      handle: "@orbitalncg",
      title: "Orbital - No Copyright Gameplay",
    },
    {
      channelId: "UCqaKdeZLqCfDfOuBevHqHuw",
      handle: "@nocopyrightminecraft",
      title: "No Copyright Minecraft",
    },
    {
      channelId: "UCeNpxxCL859iNt8LPLC5B1w",
      handle: "@blockvistas",
      title: "BlockVista - No Copyright Gameplay",
    },
    {
      channelId: "UC50JSjwwQqBaiPNPtzwK1AA",
      handle: "@rephyr",
      title: "Rephyr - No Copyright Gameplay",
    },
    {
      channelId: "UCyVqWqR52coGXHDRMvnOxtg",
      handle: "@governare-nocopyrightgameplay",
      title: "Governare - No Copyright Gameplay",
    },
  ],
  "subway-surfers": [
    {
      channelId: "UCTGjE7hWuBRNqU-OnVSzq3Q",
      handle: "@orbitalncg",
      title: "Orbital - No Copyright Gameplay",
    },
    {
      channelId: "UCgmtBEPZNMWfZGiW9lrqh6A",
      handle: "@non-copyright-gameplay",
      title: "Non Copyright Gameplay",
    },
    {
      channelId: "UCtMymcMSBYSzTPPLlqNnkIw",
      handle: "@freegameplaysource",
      title: "Free Gameplay Source",
    },
    {
      channelId: "UCQ6ptSFZHrHcUULo9Z2UG7Q",
      handle: "@queengamesfree",
      title: "Queen Games Free",
    },
    {
      channelId: "UCPSFcVEoU6ZRTT1qpqc1qrw",
      handle: "@nocopyrightgameplaydaily",
      title: "No Copyright Gameplay Daily",
    },
  ],
};
