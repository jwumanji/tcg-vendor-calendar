import sharp from "sharp";
import { copyFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import events from "../data/events.json";
import { describe, expect, it } from "vitest";
import { decideImageKind, eventImageSources, hintedImageKind } from "./eventImage";
import { generateEventImageVariants } from "../scripts/event-image-variants";

describe("event artwork fit", () => {
  it("chooses thumbnails for rows and a mobile candidate for cards", () => {
    const path = "logos/awardx.webp";
    expect(eventImageSources(path, "row")).toEqual({ src: "logos/awardx-thumb.webp" });
    expect(eventImageSources(path, "xl")).toEqual({ src: path, mobile: "logos/awardx-480.webp" });
    expect(eventImageSources(path, "detail")).toEqual({ src: path });
    expect(eventImageSources("other/image.webp", "row")).toEqual({ src: "other/image.webp" });
  });

  it("generates distinct 160px and 480px copies and caps the thumbnail at 20 KB", async () => {
    const directory = await mkdtemp(join(tmpdir(), "event-image-variants-"));
    try {
      await copyFile("public/logos/bkkcardshow.webp", join(directory, "bkk.webp"));
      await generateEventImageVariants(directory);
      const thumbnail = join(directory, "bkk-thumb.webp");
      const mobile = join(directory, "bkk-480.webp");
      expect((await sharp(thumbnail).metadata()).width).toBe(160);
      expect((await sharp(mobile).metadata()).width).toBe(480);
      expect((await stat(thumbnail)).size).toBeLessThanOrEqual(20_000);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("uses a reviewed fit before the first image decode", () => {
    expect(hintedImageKind("poster_or_photo")).toBe("cover");
    expect(hintedImageKind("logo")).toBe("logo");
    expect(hintedImageKind(null)).toBeUndefined();
  });

  it.each(["awardx", "mtg"])("ships the complete wide %s wordmark without square padding", async (name) => {
    const path = `logos/${name}.webp`;
    const metadata = await sharp("public/" + path).metadata();
    expect(metadata.width / metadata.height).toBeGreaterThan(2);
    expect(metadata.hasAlpha).toBe(true);
    const uses = events.filter((event) => event.logo === path);
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.every((event) => hintedImageKind(event.logo_kind) === "logo")).toBe(true);
  });

  it("distinguishes a landscape photograph from a wide wordmark without a hint", () => {
    expect(decideImageKind(2, { transparent: 0, flatEdge: 0.15 })).toBe("cover");
    expect(decideImageKind(2, { transparent: 0, flatEdge: 0.6 })).toBe("logo");
  });

  it("protects transparent and flat-edged unlabelled logos", () => {
    expect(decideImageKind(0.85, { transparent: 0.02, flatEdge: 0 })).toBe("logo");
    expect(decideImageKind(1, { transparent: 0, flatEdge: 0.72 })).toBe("logo");
  });
});
