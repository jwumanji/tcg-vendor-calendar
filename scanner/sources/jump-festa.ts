import { titleSubject } from "../listing.ts";
import { document, required } from "../html.ts";
import { pageSource, type RawFind } from "../types.ts";
const url = "https://www.jumpfesta.com/";
export function parse(html: string): RawFind[] {
  const $ = document(html);
  const field = (label: string) =>
    $("th")
      .filter((_, e) => $(e).text().trim() === label)
      .next("td")
      .text()
      .trim();
  const title = field("イベント名").replace(/ジャンプフェスタ\d*（(JUMP FESTA(?: \d{4})?)）/i, "$1");
  const name = titleSubject(title) !== title ? title : required(
    title.match(/JUMP FESTA(?: \d{4})?/i)?.[0],
    "event name",
  );
  const rawDate = field("開催日時");
  const annotation = rawDate.split("\n").map((line) => line.trim()).find((line) => /\b(?:cancell?ed|postponed)\b/i.test(line));
  const m = rawDate.match(
    /(20\d\d)年(\d+)月(\d+)日\([^)]+\)・(\d+)月(\d+)日/,
  );
  if (!m && !annotation && titleSubject(name) === name) throw Error("Missing Jump Festa event dates");
  const date = (year: string, month: string, day: string) =>
    [year, month.padStart(2, "0"), day.padStart(2, "0")].join("-");
  return [
    {
      name,
      date: m ? date(m[1], m[2], m[3]) + " / " + date(m[1], m[4], m[5]) + (annotation ? " " + annotation : "") : annotation ?? rawDate,
      code: "JP",
      city: "Chiba",
      venue:
        field("会場")
          .split(/[\n〒]/)[0]
          .trim() || null,
      organizer: field("主催") || null,
      event_type: "Pop-culture con",
      evidence: "Manga and anime convention",
    },
  ];
}
export default pageSource("jump-festa", "Jump Festa", url, parse);
