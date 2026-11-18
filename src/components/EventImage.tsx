import { useCallback, useState } from "react";
import { eventImageCache, hintedImageKind, inspectImage } from "../eventImage";

export function EventImage({
  path,
  hint,
  eager,
  onError,
}: {
  path: string;
  hint: string | null;
  eager: boolean;
  onError: () => void;
}) {
  const src = import.meta.env.BASE_URL + path;
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

  return (
    <>
      {kind === "logo" && (
        <img
          className="image-backdrop"
          src={src}
          alt=""
          loading={loading}
          decoding="async"
        />
      )}
      {foreground ? (
        <canvas
          className="image-face"
          data-kind="logo"
          width={foreground.width}
          height={foreground.height}
          ref={paint}
        />
      ) : (
        <img
          className="image-face"
          data-kind={kind}
          src={src}
          alt=""
          loading={loading}
          decoding="async"
          onLoad={knownKind ? undefined : (ev) => setSampled(inspectImage(ev.currentTarget))}
          onError={onError}
        />
      )}
    </>
  );
}
