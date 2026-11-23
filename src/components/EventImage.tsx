import { useCallback, useState, type ReactNode } from "react";
import { eventImageCache, eventImageSources, hintedImageKind, inspectImage, type LogoSize } from "../eventImage";

export function EventImage({
  path,
  hint,
  size,
  eager,
  onError,
}: {
  path: string;
  hint: string | null;
  size: LogoSize;
  eager: boolean;
  onError: () => void;
}) {
  const sources = eventImageSources(path, size);
  const src = import.meta.env.BASE_URL + sources.src;
  const mobile = sources.mobile && import.meta.env.BASE_URL + sources.mobile;
  const knownKind = hintedImageKind(hint);
  const [sampled, setSampled] = useState(() =>
    knownKind ? undefined : eventImageCache.get(new URL(src, document.baseURI).href),
  );
  const kind = knownKind ?? sampled?.kind ?? "logo";
  const foreground = knownKind ? undefined : sampled?.foreground;
  const paint = useCallback(
    (node: HTMLCanvasElement | null) => {
      if (node && foreground)
        node.getContext("2d")?.drawImage(foreground, 0, 0);
    },
    [foreground],
  );
  const loading = eager ? "eager" : "lazy";
  const dimension = size === "row" ? 52 : size === "md" ? 48 : 160;
  const imageProps = { src, alt: "", loading, decoding: "async", width: dimension, height: dimension } as const;
  function responsiveImage(img: ReactNode) {
    return mobile ? <picture><source media="(max-width: 640px)" srcSet={mobile} />{img}</picture> : img;
  }

  return (
    <>
      {kind === "logo" && responsiveImage(<img className="image-backdrop" {...imageProps} />)}
      {foreground ? (
        <canvas
          className="image-face"
          data-kind="logo"
          width={foreground.width}
          height={foreground.height}
          ref={paint}
        />
      ) : responsiveImage(
        <img
          className="image-face"
          data-kind={kind}
          {...imageProps}
          onLoad={knownKind ? undefined : (ev) => setSampled(inspectImage(ev.currentTarget))}
          onError={onError}
        />
      )}
    </>
  );
}
