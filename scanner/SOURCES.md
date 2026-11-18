# Public source review

Checked on 18 November 2026 from the scanner host. Sample counts are upcoming relevant listings before cross-source deduplication. The machine-readable run report has the full production counts. A listing is evidence of an event, while exhibitor eligibility and application status require their own evidence.

| Source | Status | Reason | How it is read | Sample result count |
|---|---|---|---|---:|
| [Singapore EXPO](https://www.singaporeexpo.com.sg/events-at-expo/) | USED | December World Edition among mostly unrelated shows | Server-rendered expo-event cards | 1 |
| [Singapore Card Show](https://www.sgcardshow.com/) | USED | December show, organiser’s forecast, hall and vendor form. Optional booth-selection fee is separate from booth rental. | Homepage event and booking sections | 1 |
| [Cardian](https://cardian.sg/market/calendar) | REJECTED | Known calendar used by Scanner, but robots.txt returned HTTP 403 to this agent. | Robots check stopped the fetch | 0 |
| [Suntec](https://www.suntecsingapore.com/visit-events) | USED | AFA, Nexus and Asia Comic Expo | Server-rendered event articles and ISO time attributes | 3 |
| [HKCEC](https://www.hkcec.com/en/event-calendar) | USED | Amazing Toy Show is on the second public page; organiser and contact are rendered | Follow the ordinary Load More anchor and read event-table rows | ≥1 |
| [Bandai Card Games Fest](https://www.bandaicardgames-fest.com/26-27/en/) | USED | Upcoming Asia stops, official product sales; third-party booth access unknown | City links and dates in the visible location list | 8 |
| [Wizards / Magic](https://magic.gg/events) | USED | CommandFest Melbourne; the official lineup confirms the location | Event schedule links and date spans in server HTML | 1 |
| [Anime Festival Asia](https://animefestival.asia/afasg26/) | USED | Dated Suntec convention with exhibitor applications | Event facts and exhibition CTA | 1 |
| [Singapore Comic Con](https://www.singaporecomiccon.com/) | USED | December show, preview night and exhibitor page | Public show text and exhibitor link | 1 |
| [Supanova](https://www.supanova.com.au/) | USED | Australian comic and gaming shows with exhibitor portal | City, date and venue cards | 6 |
| [Oz Comic-Con Sydney](https://ozcomiccon.com/sydney/) | USED | Sydney Showground dates and exhibitor expression of interest. Melbourne Xmas detail timed out. | City page countdown section | 1 |
| [Jump Festa](https://www.jumpfesta.com/) | USED | Manga, games and hobby convention with exhibiting companies | Official Japanese event facts table | 1 |
| [Dubai World Trade Centre](https://www.dwtc.com/en/events/) | REJECTED | Calendar shell reported zero events | Public HTML | 0 |
| [BITEC](https://www.bitec.co.th/whats-on/) / [KLCC](https://www.klccconventioncentre.com/whats-on) | REJECTED | Calendar controls but no dated cards in HTML | Followed venue navigation to What's On | 0 |
| [QSNCC](https://www.qsncc.com/en/) / [Marina Bay Sands](https://www.marinabaysands.com/expo-and-convention/event-directory.html) | REJECTED | QSNCC path 404 and home timed out; MBS HTTP/2 stream error | Public calendar requests | 0 |
| [MITEC](https://mitec.com.my/) | REJECTED | Seven homepage dates, none clearly relevant; linked full calendar timed out | Upcoming Events | 0 |
| [JCC](https://www.jcc.co.id/) / [ICE BSD](https://ice-indonesia.com/en/event) | REJECTED | TLS connections failed | Public pages | 0 |
| [SMX Manila](https://www.smxconventioncenter.com/smx-manila/) / [WTC Manila](https://www.wtcmanila.com.ph/calendar-activities/) | REJECTED | No matching SMX cards in the visible calendar; WTC challenge page and calendar timeout | Public calendars | 0 |
| [Pokémon Asia](https://asia.pokemon-card.com/sg/) / [Digimon](https://world.digimoncard.com/event/) | REJECTED | Pokémon news mixes store campaigns and cancellations; Seoul detail timed out. Digimon lists store events, publication dates and the Bandai series covered above. | Official news and event lists | 0 independent verified listings |
| [Comic Fiesta](https://comicfiesta.org/) / [Thailand Comic Con](https://thailandcomiccon.com/) | REJECTED | Fiesta showed historical attendance and dates; 2026 ticket detail timed out. Thailand site showed older editions. | Organiser homepages | 0 |
| Eventbrite / Meetup / Luma | REJECTED | Prior research: Eventbrite ignored SEA keywords across SG/KL/HK, Meetup returned sports and hiking, Luma had tech/startup events without HTML keyword search | Public listings | 0 |
| Peatix | REJECTED | Client-rendered search; robots disallows keyword query | No XHR used | 0 |
| AnimeCons / FanCons | REJECTED | Cloudflare challenge, HTTP 403 | Public calendars | 0 |
| 10times / AllEvents / Klook / Eventfinda / Conventions Fandom / Yu-Gi-Oh! / Pokémon players site | REJECTED | Access denied in prior research | Public pages | 0 |
| Facebook / Instagram | REJECTED | Login walls | No authenticated requests | 0 |
| TCGplayer / Play Riftbound / Pokémon event locator / Disney Lorcana | REJECTED | JS-only results or private locator APIs | Public HTML | 0 |
| One Piece Card Game / Bushiroad | REJECTED | TLS or connection failures in prior research | Official sites | 0 |

## Live review

On 18 November the first writing scan parsed 131 listings from 11 sources. Of those, 103 failed the relevance filter, two were past Bandai editions, and 26 were relevant and in range. Four matched another listing. Singapore EXPO corroborated Singapore Card Show, Suntec corroborated Anime Festival Asia and Scanner's Nexus tradeshow, and HKCEC corroborated the HKTDC Toys & Games Fair. The result was 22 additions, 12 of them before January 2027, plus the original 97 Scanner events.

Every addition was checked against its dates, city and event format. Bandai listed two Tokyo weekends on one card; they have separate IDs. Jump Festa's 2027 edition takes place in December 2026. Singapore Comic Con includes its explicitly dated preview night. Third-party vendor terms were unpublished on the Bandai schedule, Jump Festa facts table and Wizards schedule. Those entries carry no booth availability, price or application claim. The Singapore Card Show link goes to the booking form, and its optional $100 booth-selection fee does not establish the rental price.

Cardian's robots.txt returned HTTP 403 again on a separate request using the requested user agent. Suntec, EXPO and organiser pages supply independent Singapore coverage.
