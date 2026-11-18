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
  const name = required(
    field("イベント名").match(/JUMP FESTA \d{4}/i)?.[0],
    "event name",
  );
  const m = field("開催日時").match(
    /(20\d\d)年(\d+)月(\d+)日\([^)]+\)・(\d+)月(\d+)日/,
  );
  if (!m) throw Error("Missing Jump Festa event dates");
  const date = (month: string, day: string) =>
    [m[1], month.padStart(2, "0"), day.padStart(2, "0")].join("-");
  return [
    {
      name,
      date: date(m[2], m[3]) + " / " + date(m[4], m[5]),
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
