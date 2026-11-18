import { junk } from "./junk.ts";

export const fold = (text: string) =>
  text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
const weights: [RegExp, number][] = [
  [
    /\b(?:card\s?show|trading cards?|tcg|pokemon|one piece card|lorcana|yu[- ]gi[- ]oh|magic: the gathering|digimon|card games?|commandfest)\b/,
    0.8,
  ],
  [
    /\b(?:collectibles?|hobby|toys?|comic[- ]?(?:con|expo)|anime|gacha|figur(?:e|ine)s?|cosplay|pop culture|manga)\b/,
    0.6,
  ],
  [/\b(?:games?|gaming)\b/, 0.22],
  [
    /\b(?:shows?|tradeshow|trade fair|convention|expo|fest(?:a|ival)?|swap meet|market|vendors?|exhibitors?)\b/,
    0.28,
  ],
];
export function relevance(name: string, evidence = "") {
  const full = fold(name + " " + evidence);
  if (junk.some((r) => r.test(name))) return 0;
  if (
    /\b(?:weekly|league night|store (?:championship|tournament)|friday night magic)\b/.test(
      full,
    ) &&
    !/\b(?:vendors?|booths?|card show|tradeshow|swap meet|market|convention|expo|fest)\b/.test(
      full,
    )
  )
    return 0;
  return Math.min(
    1,
    Math.round(
      weights.reduce(
        (sum, [pattern, w]) => sum + (pattern.test(full) ? w : 0),
        0,
      ) * 100,
    ) / 100,
  );
}
