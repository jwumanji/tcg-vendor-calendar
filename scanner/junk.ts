// Titles from broad venue calendars and common keyword collisions.
export const junk = [
  /\b(?:furniture|wellness|beauty|concert|baby products|fitness|career fair|piloxing|dartslive)\b/i,
  /\b(?:stock market|forex|crypto trading|traders? (?:fair|expo)|greeting[- ]cards?|figure skating|game theory)\b/i,
  /\b(?:cancelled|canceled|postponed)\b/i,
  /bandai card games fest.*\b(?:tokyo|shanghai)\b/i, // official play weekends in Japan/China, no third-party booths
  /\bjump festa\b/i, // publisher-led manga convention; exhibitors are invited companies
  /\bcommandfest\b/i, // MTG Commander play weekend, no vendor programme
];

