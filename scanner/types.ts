import type { Event } from "../src/model.ts";

export type RawFind = Partial<
  Pick<
    Event,
    | "venue"
    | "organizer"
    | "description"
    | "games"
    | "website"
    | "date_status"
    | "estimated_month"
    | "expected_size"
    | "size_tier"
    | "size_tier_estimated"
    | "visitors"
    | "vendor_count"
    | "previous_editions"
    | "previous_editions_count"
    | "first_year"
    | "vendor_booths"
    | "vendor_application"
    | "vendor_deadline"
    | "vendor_cost"
    | "booth_detail"
    | "contact"
  >
> & {
  name: string;
  date: string | null;
  city: string | null;
  code: string;
  evidence?: string;
  page?: string;
  event_type?: "Card show" | "Official play" | "Pop-culture con" | "Trade fair";
};

export interface Context {
  warn(message: string): void;
  get(url: string): Promise<string>;
}
export interface Source {
  id: string;
  name: string;
  url: string;
  run(ctx: Context): Promise<RawFind[]>;
}
export function pageSource(
  id: string,
  name: string,
  url: string,
  parse: (html: string) => RawFind[],
): Source {
  return {
    id,
    name,
    url,
    async run(ctx) {
      return parse(await ctx.get(url));
    },
  };
}
