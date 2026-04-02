import { describe, it, expect, vi } from "vitest";

vi.mock("@vectis/shared", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("fluent-ffmpeg", () => {
  const mockCommand: any = {};
  const methods = ["complexFilter", "outputOptions", "output", "run"];
  for (const m of methods) {
    mockCommand[m] = vi.fn().mockReturnValue(mockCommand);
  }
  // Simulate ffmpeg completing successfully
  mockCommand.on = vi.fn((event: string, cb: Function) => {
    if (event === "end") {
      // Defer so the promise can be constructed first
      setTimeout(() => cb(), 0);
    }
    return mockCommand;
  });

  return {
    default: vi.fn().mockReturnValue(mockCommand),
    __mockCommand: mockCommand,
  };
});

import { FORMAT_SPECS, convertFormat } from "../format.js";
import ffmpeg from "fluent-ffmpeg";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("FORMAT_SPECS", () => {
  it("defines 9:16 as 1080x1920", () => {
    expect(FORMAT_SPECS["9:16"]).toEqual({ width: 1080, height: 1920 });
  });

  it("defines 16:9 as 1920x1080", () => {
    expect(FORMAT_SPECS["16:9"]).toEqual({ width: 1920, height: 1080 });
  });

  it("defines 1:1 as 1080x1080", () => {
    expect(FORMAT_SPECS["1:1"]).toEqual({ width: 1080, height: 1080 });
  });
});

describe("convertFormat", () => {
  it("generates correct output path with format suffix", async () => {
    const result = await convertFormat("/tmp/video.mp4", "16:9");

    expect(result).toBe("/tmp/video-16x9.mp4");
  });

  it("generates correct output path for 1:1 format", async () => {
    const result = await convertFormat("/tmp/my-video.mp4", "1:1");

    expect(result).toBe("/tmp/my-video-1x1.mp4");
  });

  it("generates correct output path for 9:16 (no-op) format", async () => {
    const result = await convertFormat("/tmp/video.mp4", "9:16");

    expect(result).toBe("/tmp/video-9x16.mp4");
  });

  it("uses copy codec for 9:16 (no conversion needed)", async () => {
    await convertFormat("/tmp/video.mp4", "9:16");

    const mockCmd = (ffmpeg as any)();
    // 9:16 should NOT use complexFilter, just copy
    // The outputOptions should include "-c" "copy"
    const outputOptionsCalls = vi.mocked(ffmpeg).mock.results[0]?.value.outputOptions.mock.calls;
    const allArgs = outputOptionsCalls.flat().flat();
    expect(allArgs).toContain("copy");
  });

  it("uses complexFilter with pad for 16:9 letterboxing", async () => {
    await convertFormat("/tmp/video.mp4", "16:9");

    const cmd = vi.mocked(ffmpeg).mock.results[0]?.value;
    const filterCalls = cmd.complexFilter.mock.calls;
    expect(filterCalls.length).toBeGreaterThan(0);

    const filterArg = filterCalls[0][0][0];
    expect(filterArg).toContain("pad=1920:1080");
    expect(filterArg).toContain("color=black");
  });

  it("uses complexFilter with crop for 1:1 center-cropping", async () => {
    await convertFormat("/tmp/video.mp4", "1:1");

    const cmd = vi.mocked(ffmpeg).mock.results[0]?.value;
    const filterCalls = cmd.complexFilter.mock.calls;
    expect(filterCalls.length).toBeGreaterThan(0);

    const filterArg = filterCalls[0][0][0];
    // crop=1080:1080:0:420 (cropY = floor((1920 - 1080) / 2) = 420)
    expect(filterArg).toContain("crop=1080:1080:0:420");
  });

  it("calculates correct crop Y offset: floor((1920 - height) / 2)", () => {
    const cropY = Math.floor((1920 - 1080) / 2);
    expect(cropY).toBe(420);
  });
});
