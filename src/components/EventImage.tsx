import { useCallback, useState } from "react";
import { eventImageCache, inspectImage } from "../eventImage";

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
  const [art, setArt] = useState(() =>
    eventImageCache.get(new URL(src, document.baseURI).href),
  );
  const kind = art?.kind || "logo";
  const foreground = art?.foreground;
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
          onLoad={(ev) => setArt(inspectImage(ev.currentTarget, hint))}
          onError={onError}
        />
      )}
    </>
  );
}
