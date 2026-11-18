// FNV-1a over the stable event ID, independent of scan order and event name.
export function coverHash(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++)
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function coverPalette(id: string) {
  const hash = coverHash(id);
  return {
    hue: 249 + (hash % 31),
    saturation: 44 + ((hash >>> 7) % 17),
    lightness: 26 + ((hash >>> 12) % 9),
    angle: 125 + ((hash >>> 17) % 55),
    motif: (hash >>> 24) % 4,
  };
}

// Preferred font size as a percentage of cover width. Long words must also
// fit on a single line when a short title contains a wide tournament name.
export function coverNameSize(name: string) {
  const words = name.trim().split(/\s+/);
  const longest = Math.max(...words.map((word) => Array.from(word).length));
  const length = Array.from(words.join(" ")).length;
  return Math.max(
    10,
    Math.min(20, 132 / Math.max(longest, 1), 510 / Math.max(length, 1)),
  );
}
