export type ImageKind = "cover" | "logo";
export type LogoSize = "md" | "row" | "xl" | "detail";

export function eventImageSources(path: string, size: LogoSize) {
  if (!/^logos\/[^/]+\.webp$/i.test(path)) return { src: path };
  const variant = (suffix: string) => path.replace(/\.webp$/i, `-${suffix}.webp`);
  return {
    src: size === "row" || size === "md" ? variant("thumb") : path,
    mobile: size === "xl" ? variant("480") : undefined,
  };
}
type EdgeSample = { transparent: number; flatEdge: number };

// Reviewed assets carry an explicit fit. Sampling is only for new, unlabelled art.
export function hintedImageKind(hint: string | null): ImageKind | undefined {
  if (hint === "logo") return "logo";
  if (hint === "poster_or_photo") return "cover";
}

export function decideImageKind(
  aspect: number,
  { transparent, flatEdge }: EdgeSample,
): ImageKind {
  if (transparent >= 0.02) return "logo";
  // A wide wordmark often runs through both side edges. A landscape photo
  // also has a wide aspect, but rarely has a mostly uniform perimeter.
  return flatEdge >= (aspect >= 1.45 ? 0.55 : 0.72) ? "logo" : "cover";
}

type ImageArt = { kind: ImageKind; foreground?: HTMLCanvasElement };
export const eventImageCache = new Map<string, ImageArt>();

function canvas(width: number, height: number) {
  const surface = document.createElement("canvas");
  surface.width = width;
  surface.height = height;
  return surface;
}

function colorDistance(
  pixels: Uint8ClampedArray,
  offset: number,
  color: number[],
) {
  return Math.max(
    Math.abs(pixels[offset] - color[0]),
    Math.abs(pixels[offset + 1] - color[1]),
    Math.abs(pixels[offset + 2] - color[2]),
  );
}

function sampleEdges(image: HTMLImageElement) {
  const side = 16;
  const ctx = canvas(side, side).getContext("2d")!;
  ctx.drawImage(image, 0, 0, side, side);
  const { data } = ctx.getImageData(0, 0, side, side);
  const edges: number[] = [];
  let transparent = 0;
  for (let p = 0; p < side * side; p++) {
    if (data[p * 4 + 3] < 240) transparent++;
    else if (
      p < side ||
      p >= side * (side - 1) ||
      p % side === 0 ||
      p % side === side - 1
    )
      edges.push(p * 4);
  }
  const color = [0, 1, 2].map(
    (channel) =>
      edges.map((i) => data[i + channel]).sort((a, b) => a - b)[
        Math.floor(edges.length / 2)
      ],
  );
  const flatEdge =
    edges.filter((i) => colorDistance(data, i, color) <= 22).length /
    (4 * side - 4);
  return { transparent: transparent / (side * side), flatEdge, color };
}

// Some scanner thumbnails have a solid matte baked into the pixels. Remove
// only edge-connected matte so enclosed details (e.g. white lettering) survive.
function trimLogo(image: HTMLImageElement, matte?: number[]) {
  const scale = Math.min(
    1,
    512 / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const w = Math.max(1, Math.round(image.naturalWidth * scale));
  const h = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas(w, h).getContext("2d")!;
  ctx.drawImage(image, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h);
  const { data } = pixels;
  if (matte) {
    const pending: number[] = [];
    const clear = (p: number) => {
      const offset = p * 4;
      if (data[offset + 3] && colorDistance(data, offset, matte) <= 23) {
        data[offset + 3] = 0;
        pending.push(p);
      }
    };
    for (let x = 0; x < w; x++) {
      clear(x);
      clear((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      clear(y * w);
      clear(y * w + w - 1);
    }
    while (pending.length) {
      const p = pending.pop()!;
      if (p % w > 0) clear(p - 1);
      if (p % w < w - 1) clear(p + 1);
      if (p >= w) clear(p - w);
      if (p < (h - 1) * w) clear(p + w);
    }
  }
  let left = w,
    right = -1,
    top = h,
    bottom = -1;
  for (let p = 0; p < w * h; p++) {
    if (data[p * 4 + 3] < 12) continue;
    const x = p % w,
      y = Math.floor(p / w);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  if (
    right < left ||
    (!matte && right - left + 1 === w && bottom - top + 1 === h)
  )
    return;
  const result = canvas(right - left + 1, bottom - top + 1);
  result.getContext("2d")!.putImageData(pixels, -left, -top);
  return result;
}

export function inspectImage(image: HTMLImageElement): ImageArt {
  const src = image.currentSrc || image.src;
  const cached = eventImageCache.get(src);
  if (cached) return cached;
  const aspect = image.naturalWidth / image.naturalHeight;
  const art: ImageArt = { kind: "logo" };
  try {
    const sample = sampleEdges(image);
    art.kind = decideImageKind(aspect, sample);
    const { color, flatEdge, transparent } = sample;
    const neutral = Math.max(...color) - Math.min(...color) <= 18;
    const matte = flatEdge >= 0.72 && neutral ? color : undefined;
    if (art.kind === "logo" && (matte || transparent >= 0.02))
      art.foreground = trimLogo(image, matte);
  } catch {
    // A blocked canvas readback leaves unclassified artwork safely contained.
    art.kind = "logo";
  }
  eventImageCache.set(src, art);
  return art;
}
