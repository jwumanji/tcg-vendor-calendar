import { load } from "cheerio";
import type { CheerioAPI } from "cheerio";
export const clean = (s: string) =>
  s
    .replace(/\u200b/g, "")
    .replace(/\s+/g, " ")
    .trim();
export function document(html: string) {
  const $ = load(html);
  $("script,style,noscript").remove();
  $("br").replaceWith("\n");
  return $;
}
export function urlOf(href: string | undefined, base: string) {
  if (!href) return null;
  const u = new URL(href, base);
  return ["https:", "http:"].includes(u.protocol) ? u.href : null;
}
export function link($: CheerioAPI, label: RegExp, base: string) {
  return urlOf(
    $("a[href]")
      .filter((_, a) => label.test(clean($(a).text())))
      .first()
      .attr("href"),
    base,
  );
}
export function required(value: string | undefined | null, field: string) {
  if (!value?.trim()) throw Error(`Missing ${field} in public HTML`);
  return value.trim();
}
