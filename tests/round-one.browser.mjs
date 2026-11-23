// Run against a production Vite preview with Node's test runner.
// Set PLAYWRIGHT_CORE_PATH to an external playwright-core/index.mjs when needed.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH).href : "playwright-core");
const origin = process.env.PLANNER_PREVIEW_URL ?? "http://127.0.0.1:4173";
const auditTime = new Date("2026-11-24T03:00:00Z");
const desktop = { viewport: { width: 1440, height: 1000 } };
const iPhone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const award = "AWARD X TCG Tradeshow";
let browser;

before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
});
after(async () => browser?.close());

async function open(t, options = desktop, time = auditTime, observeResponse) {
  const context = await browser.newContext({ timezoneId: "Asia/Ho_Chi_Minh", ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  if (observeResponse) page.on("response", observeResponse);
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, []);
  });
  await page.clock.setFixedTime(time);
  await page.goto(origin);
  await page.getByLabel("Search events").waitFor();
  return page;
}

const button = (page, name) => page.getByRole("button", { name, exact: true });
const stage = (page, name) => page.locator("main:not([hidden])").getByLabel("Pipeline stage for " + name, { exact: true });
const eventRows = page => page.locator("tr[data-event-id]");
const rowIds = page => eventRows(page).evaluateAll(nodes => nodes.map(node => node.dataset.eventId));
const listCount = page => page.locator(".list-count");
const reminders = ".upcoming-milestones, .outreach-follow-ups";

test("undoes both hidden stages and restores the row in place, with the toast still available after 7.5 seconds", async t => {
  const page = await open(t);
  await page.clock.install({ time: auditTime });
  const before = await rowIds(page);
  assert.ok(before.includes("r-awardx"));
  for (const target of ["Passed", "Too expensive"]) {
    assert.equal(await stage(page, award).inputValue(), "Not reviewed");
    await stage(page, award).focus();
    await stage(page, award).selectOption(target);
    assert.equal(await eventRows(page).count(), before.length - 1);
    assert.equal(await stage(page, award).count(), 0);
    const toast = page.locator(".going-toast[role=status]");
    assert.match(await toast.innerText(), new RegExp("Moved " + award + " to " + target));
    const undo = button(page, "Undo");
    await page.waitForFunction(() => document.activeElement === document.querySelector(".going-toast button"));
    if (target === "Passed") await page.clock.fastForward(7500);
    assert.equal(await undo.evaluate(el => document.activeElement === el), true);
    await page.keyboard.press("Enter");
    assert.deepEqual(await rowIds(page), before);
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Pipeline stage for AWARD X TCG Tradeshow");
  }
  await page.reload();
  assert.equal(await stage(page, award).inputValue(), "Not reviewed");
});

test("offers stage Undo from Grid, Pipeline and the detail route", async t => {
  const page = await open(t);
  await button(page, "Grid").click();
  const choose = async (target) => {
    await stage(page, award).selectOption(target);
    assert.match(await page.locator(".going-toast").innerText(), new RegExp("Moved " + award + " to " + target));
    await button(page, "Undo").click();
    assert.equal(await stage(page, award).inputValue(), "Not reviewed");
  };
  await choose("Considering");
  await button(page, "Pipeline").click();
  await choose("Contacted");
  await page.goto(origin + "/event/r-awardx");
  await choose("Too expensive");
});

test("returns keyboard focus to the List when a hidden event's Undo expires", async t => {
  const page = await open(t);
  await page.clock.install({ time: auditTime });
  await stage(page, award).focus();
  await stage(page, award).selectOption("Passed");
  const undo = button(page, "Undo");
  await page.waitForFunction(() => document.activeElement === document.querySelector(".going-toast button"));
  await page.clock.fastForward(8100);
  await page.waitForFunction(() => document.activeElement?.id === "workspace-title");
  assert.equal(await undo.count(), 0);
  assert.equal(await stage(page, award).count(), 0);
});

test("discloses hidden stages, 2026 events and past Timeline dates", async t => {
  const page = await open(t);
  const originalCount = await eventRows(page).count();
  await stage(page, award).selectOption("Passed");
  assert.match(await listCount(page).innerText(), /1 hidden \(passed\)/);
  await button(page, "Show passed").click();
  assert.equal(await eventRows(page).count(), originalCount);
  assert.equal(await stage(page, award).inputValue(), "Passed");
  assert.equal(await stage(page, award).locator("..").getAttribute("data-stage"), "Passed");
  await button(page, "Hide passed").click();
  assert.match(await listCount(page).innerText(), /\d+ hidden \(2026\)/);
  await button(page, "Show 2026").click();
  assert.ok(await eventRows(page).count() > originalCount);
  await button(page, "Hide 2026").click();
  assert.equal(await eventRows(page).count(), originalCount - 1);

  await page.clock.setFixedTime(new Date("2027-02-01T03:00:00Z"));
  await page.reload();
  await button(page, "Timeline").click();
  assert.equal(await button(page, "Show 2026").count(), 0);
  assert.match(await listCount(page).innerText(), /\d+ hidden \(past\)/);
  assert.equal(await page.getByRole("heading", { name: /^January 2027/ }).count(), 0);
  await button(page, "Show past").click();
  assert.equal(await page.getByRole("heading", { name: /^January 2027/ }).count(), 1);
  assert.match(await listCount(page).innerText(), /\d+ hidden \(2026\)/);
  await button(page, "Show 2026").click();
  assert.ok(await page.getByRole("heading", { name: /2026/ }).count() > 0);
  await button(page, "Hide 2026").click();
  await page.reload();
  await button(page, "Timeline").click();
  assert.equal(await page.getByRole("heading", { name: /^January 2027/ }).count(), 1);
  await button(page, "Hide past").click();
  assert.equal(await page.getByRole("heading", { name: /^January 2027/ }).count(), 0);
});

test("limits reminders to List and restores first-run and reminder preferences from a backup", async t => {
  const page = await open(t, iPhone);
  const tip = page.getByRole("complementary", { name: "Planning quick start" });
  assert.match(await tip.innerText(), /Mark events Going to build your shortlist/);
  assert.ok((await tip.boundingBox()).height <= 844 * 0.15);
  await button(page, "Find events").click();
  assert.equal(await page.getByLabel("Search events").evaluate(el => document.activeElement === el), true);
  assert.ok((await button(page, "Got it").boundingBox()).height >= 44);
  assert.ok((await page.getByLabel("Search events").boundingBox()).y <= 420);
  const summaries = page.locator(".reminder-summary");
  assert.equal(await summaries.count(), 2);
  for (const summary of await summaries.all()) {
    assert.equal(await summary.getAttribute("aria-expanded"), "false");
    assert.ok((await summary.boundingBox()).height >= 44);
  }
  await summaries.first().click();
  assert.equal(await summaries.first().getAttribute("aria-expanded"), "true");
  await summaries.last().click();
  await summaries.last().click();
  await button(page, "Got it").click();
  assert.equal(await page.evaluate(() => localStorage.getItem("tcg-first-run-dismissed")), "true");
  await page.reload();
  assert.equal(await tip.count(), 0);
  assert.equal(await summaries.first().getAttribute("aria-expanded"), "true");
  assert.equal(await summaries.last().getAttribute("aria-expanded"), "false");

  for (const name of ["Top picks", "Calendar", "Timeline", "Watchlist", "Recurring SG", "Pipeline"]) {
    const tab = button(page, name);
    assert.ok((await tab.getAttribute("title")).length > 5);
    await tab.click();
    assert.equal(await page.locator(reminders).count(), 0);
  }
  const considering = page.locator('.pipeline-column[data-stage="Considering"]');
  assert.match(await considering.innerText(), /Mark an event Going to see it here/);
  await button(considering, "Browse events").click();
  assert.equal(await page.locator(reminders).count(), 2);

  await button(page, "Tools").click();
  const exported = page.waitForEvent("download");
  await button(page, "Export backup").click();
  const file = await (await exported).path();
  const backup = JSON.parse(await readFile(file, "utf8"));
  assert.equal(backup.listPreferences.firstRunDismissed, true);
  assert.equal(backup.listPreferences.deadlinesExpanded, true);
  assert.equal(backup.listPreferences.followUpsExpanded, false);

  const restored = await open(t, iPhone);
  assert.equal(await button(restored, "Got it").count(), 1);
  await button(restored, "Tools").click();
  await restored.locator('input[type="file"]').setInputFiles(file);
  await button(restored, "Confirm import").click();
  await button(restored, "Close tools").click();
  await restored.reload();
  assert.equal(await button(restored, "Got it").count(), 0);
  assert.equal(await restored.locator(".reminder-summary").first().getAttribute("aria-expanded"), "true");

  await button(restored, "Tools").click();
  const upload = async contents => {
    await restored.locator('input[type="file"]').setInputFiles({
      name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(contents)),
    });
    await restored.getByLabel("Import mode").selectOption("replace");
    await button(restored, "Confirm import").click();
  };
  const { listPreferences, ...olderBackup } = backup;
  await upload(olderBackup);
  assert.equal(await restored.evaluate(() => localStorage.getItem("tcg-first-run-dismissed")), "true");
  await upload({ ...olderBackup, listPreferences: {} });
  assert.equal(await restored.evaluate(() => localStorage.getItem("tcg-first-run-dismissed")), null);
  const savedBeforeReplace = await restored.evaluate(() =>
    Object.keys(localStorage).filter(key => key.startsWith("tcg-pipeline-v1-before-replace-"))
      .map(key => JSON.parse(localStorage.getItem(key)).listPreferences),
  );
  assert.deepEqual(savedBeforeReplace.at(-1), listPreferences);
  await button(restored, "Close tools").click();
  assert.equal(await button(restored, "Got it").count(), 1);
  assert.equal(await restored.locator(".reminder-summary").first().getAttribute("aria-expanded"), "false");
});

test("opens a full-height mobile filter sheet with sticky actions, large targets and focus restoration", async t => {
  const page = await open(t, iPhone);
  const targets = page.locator(".tabs button, .quick-filters button, .country-filter > button, .list-switch button, .row-sort-control button, .row-sort-control select");
  for (const target of await targets.all()) {
    const box = await target.boundingBox();
    assert.ok(box.height >= 44 && box.width >= 44, await target.innerText());
  }
  assert.equal(await page.locator("html").evaluate(el => el.scrollWidth), 390);
  const trigger = page.getByRole("button", { name: /^Filters/ });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await sheet.waitFor();
  assert.equal(await page.locator("body").evaluate(el => getComputedStyle(el).overflowY), "hidden");
  const sections = sheet.locator("details");
  assert.deepEqual(await sections.evaluateAll(nodes => nodes.map(node => node.open)), [true, true, false, false, false]);
  const show = sheet.getByRole("button", { name: /^Show \d+ event/ });
  const footer = await show.boundingBox();
  assert.ok(footer.y + footer.height <= 844);
  assert.equal(await sheet.locator(".filter-foot").evaluate(el => getComputedStyle(el).position), "sticky");
  for (const label of await sheet.locator("details[open] label").all()) {
    assert.ok((await label.boundingBox()).height >= 44);
  }
  await show.focus();
  await page.keyboard.press("Tab");
  assert.equal(await sheet.getByRole("button", { name: "Close filters" }).evaluate(el => document.activeElement === el), true);
  await page.keyboard.press("Escape");
  assert.equal(await sheet.count(), 0);
  assert.equal(await trigger.evaluate(el => document.activeElement === el), true);

  await trigger.click();
  await sheet.getByRole("checkbox", { name: /^Singapore / }).check();
  await show.click();
  assert.equal(await trigger.innerText(), "Filters · 1");
  assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
  assert.ok((await eventRows(page).count()) > 0);
  assert.ok((await eventRows(page).locator(".row-place .place").allTextContents()).every(place => /Singapore/.test(place)));
  await trigger.click();
  await button(sheet, "Close filters").click();
  assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
  await trigger.click();
  await sheet.locator("summary").getByText("Score and stage").click();
  await sheet.getByRole("checkbox", { name: "Show passed / too expensive" }).check();
  await button(sheet, "Reset filters").click();
  assert.equal(await show.evaluate(el => document.activeElement === el), true);
  assert.equal(await sheet.getByRole("checkbox", { name: /^Singapore / }).isChecked(), false);
  assert.equal(await sheet.getByRole("checkbox", { name: "Show passed / too expensive" }).isChecked(), false);
  await show.click();
  assert.equal(await trigger.innerText(), "Filters");
});

async function listFields(page) {
  return page.locator("main:not([hidden]) [data-event-id]").evaluateAll(nodes => nodes.slice(0, 5).map(node => {
    const read = selector => node.querySelector(selector);
    const name = read(".row-name, .stretched-button").firstChild.textContent.trim();
    const status = read(".row-dates .badge, .card-when .badge");
    const going = read(".going-button");
    return {
      id: node.dataset.eventId,
      name,
      dates: read(".row-date-label")?.textContent ?? null,
      place: read(".place").textContent.trim(),
      status: status.textContent.trim(),
      game: [...node.querySelectorAll(".game-tag, .game-tag-more")].map(tag => tag.textContent.trim()),
      score: read(".priority-chip").ariaLabel,
      stage: read(".stage-control").dataset.stage,
      going: [going.ariaLabel, going.textContent, going.getAttribute("aria-pressed")],
      apply: read(".apply-cta")?.href ?? null,
    };
  }));
}

test("keeps Grid and Rows in parity through filters, sort changes and reload", async t => {
  const page = await open(t);
  const sort = page.getByLabel("Sort by", { exact: true });
  assert.equal(await sort.count(), 1);
  assert.equal(await page.locator(".row-sort-control label").innerText(), "Sort by");
  assert.equal(await page.locator(".event-rows thead button").count(), 0);
  assert.equal(await page.getByRole("group", { name: "Quick sort" }).count(), 0);
  await sort.selectOption("name");
  assert.equal(await page.getByRole("columnheader", { name: "Event" }).getAttribute("aria-sort"), "ascending");
  await button(page, "Sort descending").click();
  assert.equal(await page.getByRole("columnheader", { name: "Event" }).getAttribute("aria-sort"), "descending");
  await button(page, "Singapore").click();
  const rows = await listFields(page);
  assert.equal(rows.length, 5);
  assert.ok(rows.every(row => row.place.includes("Singapore")));
  await button(page, "Grid").click();
  assert.deepEqual(await listFields(page), rows);
  assert.equal(await sort.inputValue(), "name");
  assert.equal(await button(page, "Sort descending").getAttribute("aria-pressed"), "true");
  await page.reload();
  assert.equal(await sort.inputValue(), "name");
  assert.deepEqual(await listFields(page), rows);

  await page.getByLabel("Search events").fill("Asia Comic Expo 005");
  const withApply = await listFields(page);
  assert.equal(withApply[0]?.id, "scan-suntec-asia-comic-expo-005-202701");
  assert.match(withApply[0]?.apply, /^https:/);
  await button(page, "Rows").click();
  assert.deepEqual(await listFields(page), withApply);
});

test("renders opaque sticky chrome and uses thumbnails within the mobile transfer budget", async t => {
  const imageResponses = [];
  const page = await open(t, iPhone, auditTime, response => {
    const request = response.request();
    if (request.resourceType() === "image" && response.ok()) {
      imageResponses.push(request.sizes().then(size => ({
        name: response.url(), bytes: size.responseBodySize + size.responseHeadersSize,
      })));
    }
  });
  await page.evaluate(() => window.scrollTo({ top: 2200, behavior: "instant" }));
  for (const theme of ["dark", "light"]) {
    await page.locator("html").evaluate((el, value) => { el.dataset.theme = value; }, theme);
    for (const selector of [".header", ".tabs"]) {
      const chrome = page.locator(selector);
      assert.match(await chrome.evaluate(el => getComputedStyle(el).backgroundColor), /^rgb\([^)]*\)$/);
      assert.equal(await chrome.evaluate(el => getComputedStyle(el).maskImage), "none");
    }
  }
  const tabs = await page.locator(".tabs").boundingBox();
  const dividers = page.locator(".month-divider");
  const visible = await dividers.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top)
    .filter(top => top >= 0 && top < 844));
  assert.ok(visible.includes(tabs.y + tabs.height));
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise(resolve => setTimeout(resolve, 60));
    }
  });
  await page.waitForLoadState("networkidle");
  const transfers = await Promise.all(imageResponses);
  const bytes = transfers.reduce((sum, transfer) => sum + transfer.bytes, 0);
  t.diagnostic("Mobile Rows image transfer " + bytes.toLocaleString("en-US") + " bytes");
  assert.ok(bytes > 0 && bytes <= 800_000);
  const logos = transfers.filter(entry => entry.name.includes("/logos/"));
  assert.ok(logos.length > 40 && logos.every(entry => entry.name.endsWith("-thumb.webp")));
  assert.equal(await page.locator("tr img.image-face:not([width]), tr img.image-face:not([height])").count(), 0);
  assert.equal(await eventRows(page).evaluateAll(rows => rows.filter(row => {
    const games = row.querySelector(".row-games").getBoundingClientRect();
    const score = row.querySelector(".row-priority .priority-chip").getBoundingClientRect();
    return games.left < score.right && games.right > score.left;
  }).length), 0);
  await button(page, "Grid").click();
  await page.locator(".event-card .image-face").first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector(".event-card .image-face")?.currentSrc.endsWith("-480.webp"));
});

test("fits the recurring event detail in 1,700 desktop pixels and preserves the stage and notes path", async t => {
  const page = await open(t);
  await page.goto(origin + "/event/r-tradeting");
  await page.getByRole("heading", { name: "THE TRADE T!NG", exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  const height = await page.locator("html").evaluate(el => el.scrollHeight);
  t.diagnostic("Trade T!ng desktop detail height " + height + " px");
  assert.ok(height <= 1700);
  assert.equal(await page.getByLabel("Your notes").isVisible(), true);
  const current = () => page.evaluate(() => document.activeElement.getAttribute("aria-label") ?? document.activeElement.textContent.trim());
  await page.keyboard.press("Tab");
  assert.equal(await current(), "Going: THE TRADE T!NG");
  await page.keyboard.press("Tab");
  assert.equal(await current(), "Pipeline stage for THE TRADE T!NG");
  await page.keyboard.press("Tab");
  assert.equal(await current(), "Ask organizer");

  const dates = page.locator("#published-event-dates > span");
  assert.equal(await dates.count(), 3);
  assert.equal(await page.locator(".detail-date").innerText(), "2–3 Jan 2027");
  assert.doesNotMatch(await dates.allTextContents().then(items => items.join(" ")), /2–3 Jan 2027/);
  const toggle = button(page, "Show all 9");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  await toggle.click();
  const collapse = button(page, "Show fewer dates");
  assert.equal(await collapse.getAttribute("aria-expanded"), "true");
  assert.equal(await dates.count(), 9);
  await collapse.click();
  assert.equal(await dates.count(), 3);
  assert.doesNotMatch(await page.locator(".event-layout").innerText(), /change the pipeline stage in decide|start_date|end_date|on the page/i);
});


test("keeps Pipeline pages bounded and preserves the empty stage hint at both review sizes", async t => {
  for (const [options, height] of [[iPhone, 844], [desktop, 1000]]) {
    const page = await open(t, options);
    await button(page, "Pipeline").click();
    const column = page.locator('.pipeline-column[data-stage="Not reviewed"]');
    const cards = column.locator(".pipeline-card");
    const ids = () => cards.evaluateAll(nodes => nodes.map(node => node.dataset.eventId));
    const first = await ids();
    assert.ok(first.length >= 6 && first.length <= 8);
    assert.ok(await page.locator("html").evaluate(el => el.scrollHeight) < 3 * height);
    assert.match(await page.locator('.pipeline-column[data-stage="Considering"] .pipeline-empty').textContent(),
      /Mark an event Going to see it here/);
    const more = column.getByRole("button", { name: /^Show [1-8] more$/ });
    await more.click();
    const next = await ids();
    assert.equal(next.length, first.length);
    assert.ok(next.every(id => !first.includes(id)));
    assert.equal(await column.locator("h3").evaluate(el => document.activeElement === el), true);
    assert.ok(await page.locator("html").evaluate(el => el.scrollHeight) < 3 * height);
    await button(column, "Previous").click();
    assert.deepEqual(await ids(), first);
    await more.click();
    await page.getByLabel("Search events").fill(award);
    assert.deepEqual(await ids(), ["r-awardx"]);
    assert.equal(await more.count(), 0);
    await page.getByLabel("Search events").clear();
    assert.deepEqual(await ids(), first);
  }
});

test("starts desktop with compact reminders and at least three full Rows events visible", async t => {
  const page = await open(t);
  await page.evaluate(() => document.fonts.ready);
  const states = await page.locator(".reminder-summary").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-expanded")));
  assert.deepEqual(states, ["false", "false"]);
  assert.ok(await eventRows(page).evaluateAll(nodes =>
    nodes.filter(node => node.getBoundingClientRect().bottom <= innerHeight).length) >= 3);
});

test("keeps wrapped counts and compact touch actions aligned in both mobile layouts", async t => {
  const page = await open(t, iPhone);
  await page.evaluate(() => document.fonts.ready);
  const scroller = page.locator(".quick-filters");
  assert.match(await scroller.evaluate(el => getComputedStyle(el).maskImage), /linear-gradient/);
  await stage(page, award).selectOption("Passed");
  const hidden = listCount(page).locator(".visibility-option");
  assert.equal(await hidden.count(), 2);
  for (const item of await hidden.all()) {
    assert.doesNotMatch(await item.textContent(), /·/);
    const text = await item.locator("span").boundingBox();
    const toggle = await item.locator("button").boundingBox();
    assert.equal(Math.round(text.y + text.height / 2), Math.round(toggle.y + toggle.height / 2));
  }
  await button(page, "Undo").click();
  for (const [layout, selector] of [["Rows", "tr"], ["Grid", ".event-card"]]) {
    await button(page, layout).click();
    const events = page.locator(selector + "[data-event-id]");
    const heights = await events.evaluateAll(nodes => nodes.map(node => node.offsetHeight).sort((a, b) => a - b));
    assert.ok(heights[Math.floor(heights.length / 2)] <= 180, layout + " median card height");
    for (const id of ["r-awardx", "scan-suntec-asia-comic-expo-005-202701"]) {
      const event = page.locator(`${selector}[data-event-id="${id}"]`);
      const actions = await event.evaluate(node =>
        [...node.querySelectorAll(".stage-picker, .going-button, .apply-cta")].map(el => {
          const { y, width, height } = el.getBoundingClientRect();
          return { center: y + height / 2, width, height };
        }));
      assert.ok(actions.length >= 2);
      assert.ok(actions.every(({ width, height }) => width >= 43.99 && height >= 43.99),
        `${layout} action size for ${id}: ${JSON.stringify(actions)}`);
      assert.ok(actions.every(({ center }) => Math.abs(center - actions[0].center) <= 1));
    }
    assert.equal(await page.locator("html").evaluate(el => el.scrollWidth), 390);
  }
});

test("shares optional fields and bulk selection across mobile Grid and Rows", async t => {
  const page = await open(t, iPhone);
  await page.getByLabel("Search events").fill("Singapore");
  await button(page, "Grid").click();
  await button(page, "Columns").click();
  await page.getByRole("checkbox", { name: "Fit score" }).check();
  await page.getByRole("checkbox", { name: "Source" }).check();
  assert.ok(await page.locator(".card-option-scanner").count() > 2);
  assert.equal(await page.locator(".card-option-source").count(), await page.locator(".card-option-scanner").count());
  await button(page, "Bulk select").click();
  const cards = page.locator(".event-card");
  await cards.nth(0).getByRole("checkbox").check();
  await cards.nth(2).locator(".stretched-button").click({ modifiers: ["Shift"] });
  assert.equal(await page.locator(".event-card[data-selected=true]").count(), 3);
  await button(page, "Rows").click();
  assert.equal(await eventRows(page).locator(".row-scanner").count(), await eventRows(page).count());
  assert.equal(await page.locator("tr[data-selected=true]").count(), 3);
  await page.getByRole("checkbox", { name: "Select all visible" }).check();
  assert.equal(await page.locator("tr[data-selected=true]").count(), await eventRows(page).count());
  await button(page, "Mark Going").click();
  assert.equal(await page.locator("tr[data-going=true]").count(), await eventRows(page).count());
  assert.equal(await page.locator("tr[data-selected=true]").count(), 0);
  await button(page, "Undo").click();
  assert.equal(await page.locator("tr[data-going=true]").count(), 0);
});

const pinButton = (page, id) => page.locator(`[data-event-id="${id}"] .compare-toggle`);
const compareDialog = page => page.getByRole("dialog", { name: "Compare events" });
const compareValues = (page, field) => compareDialog(page).getByRole("row")
  .filter({ has: page.getByRole("rowheader", { name: field, exact: true }) }).getByRole("cell");

test("keeps comparison pins through filters, layout and view changes, bulk Going and reload", async t => {
  const page = await open(t);
  const compare = button(page, "Compare");
  const tray = page.getByRole("region", { name: "Compare events" });
  const ids = ["r-awardx", "r-tradeting", "r-sunday", "r-kip"];
  const exportBackup = async () => {
    await button(page, "Tools").click();
    const exported = page.waitForEvent("download");
    await button(page, "Export backup").click();
    const backup = JSON.parse(await readFile(await (await exported).path(), "utf8"));
    await button(page, "Close tools").click();
    return backup;
  };
  const storage = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  const backupBeforePinning = await exportBackup();
  const storageBeforePinning = await storage();
  assert.equal(await compare.isDisabled(), true);
  await pinButton(page, ids[0]).press("Space");
  assert.equal(await pinButton(page, ids[0]).getAttribute("aria-pressed"), "true");
  assert.equal(await compare.isDisabled(), true);
  assert.equal(await pinButton(page, ids[0]).evaluate(el => document.activeElement === el), true);
  await pinButton(page, ids[0]).press("g");
  assert.equal(await page.locator(`tr[data-event-id="${ids[0]}"]`).getAttribute("data-going"), "false");
  await pinButton(page, ids[1]).click();
  assert.equal(await compare.isEnabled(), true);
  const { "tcg-compare-pins-v1": pins, ...otherStorage } = await storage();
  assert.deepEqual(JSON.parse(pins).map(({ id }) => id), ids.slice(0, 2));
  assert.deepEqual(otherStorage, storageBeforePinning);
  assert.deepEqual(await exportBackup(), backupBeforePinning);
  await button(page, "Grid").click();
  assert.equal(await pinButton(page, ids[1]).getAttribute("aria-pressed"), "true");
  await pinButton(page, ids[2]).click();
  await button(page, "Rows").click();
  await button(page, "Bulk select").click();
  await pinButton(page, ids[3]).click();
  assert.equal(await page.locator("tr[data-selected=true]").count(), 0);
  assert.equal(await pinButton(page, "urban").getAttribute("aria-disabled"), "true");
  await pinButton(page, "urban").press("Space");
  assert.equal(await tray.locator(".compare-pin").count(), 4);
  assert.equal(await pinButton(page, "urban").getAttribute("aria-pressed"), "false");
  await page.locator('tr[data-event-id="urban"] input[type="checkbox"]').check();
  await button(page, "Mark Going").click();
  assert.equal(await page.locator('tr[data-event-id="urban"]').getAttribute("data-going"), "true");
  assert.equal(await tray.locator(".compare-pin").count(), 4);
  await page.getByLabel("Search events").fill("no matching show 37g2");
  assert.equal(await eventRows(page).count(), 0);
  assert.equal(await tray.getByText("Outside current results").count(), 4);
  await compare.press("Enter");
  const dialog = compareDialog(page);
  await dialog.waitFor();
  assert.deepEqual((await dialog.getByRole("columnheader").allTextContents()).slice(1), [
    award, "THE TRADE T!NG", "THE SUNDAY CARD SHOW by CollectFUN!", "KIP N COLLECT #3 and #4",
  ]);
  const columns = await dialog.getByRole("columnheader").evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect()));
  assert.ok(columns[1].right <= columns[2].left + 1);
  const close = dialog.getByRole("button", { name: "Close comparison" });
  assert.equal(await close.evaluate(el => document.activeElement === el), true);
  await page.keyboard.press("Shift+Tab");
  assert.match(await page.evaluate(() => document.activeElement?.tagName), /SELECT|A/);
  await page.keyboard.press("Tab");
  assert.equal(await close.evaluate(el => document.activeElement === el), true);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await compare.evaluate(el => document.activeElement === el), true);
  await compare.click();
  await close.click();
  assert.equal(await compare.evaluate(el => document.activeElement === el), true);
  await tray.getByRole("button", { name: `Remove ${award} from comparison` }).press("Enter");
  assert.equal(await tray.locator(".compare-pin").count(), 3);
  assert.match(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), /Remove THE TRADE/);
  for (const view of ["Top picks", "Watchlist", "Timeline"]) {
    await button(page, view).click();
    assert.equal(await page.locator(".compare-toggle").count(), 0);
    assert.match(await tray.innerText(), /Pin events in List/);
    assert.equal(await tray.locator(".compare-pin").count(), 3);
    await compare.click();
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await compare.evaluate(el => document.activeElement === el), true);
  }
  await page.reload();
  assert.equal(await tray.locator(".compare-pin").count(), 3);
  assert.equal(await pinButton(page, ids[1]).getAttribute("aria-pressed"), "true");
});

test("compares side by side at 390px and persists the weekend that changes a confirmed clash", async t => {
  const page = await open(t, iPhone);
  for (const layout of ["Rows", "Grid"]) {
    await button(page, layout).click();
    const targetSize = await pinButton(page, "r-tradeting").evaluate(el => [el.offsetWidth, el.offsetHeight]);
    assert.ok(targetSize.every(size => size >= 44));
    assert.equal(await page.locator("html").evaluate(el => el.scrollWidth), 390);
  }
  await pinButton(page, "r-awardx").tap();
  await pinButton(page, "r-tradeting").tap();
  await button(page, "Compare").tap();
  const dialog = compareDialog(page);
  const weekend = dialog.getByLabel("Published weekend for THE TRADE T!NG");
  assert.equal(await weekend.locator("option:checked").innerText(), "2–3 Jan 2027");
  assert.match(await compareValues(page, "Confirmed overlap").first().innerText(), /THE TRADE T!NG[\s\S]*2–3 Jan 2027/);
  assert.match(await compareValues(page, "Eligible table fee").first().innerText(), /No booth price recorded/);
  await weekend.selectOption({ label: "13–14 Mar 2027" });
  assert.match(await compareValues(page, "Confirmed overlap").first().innerText(), /No confirmed overlap/);
  const firstDate = await compareValues(page, "Dates and certainty").first().boundingBox();
  const secondDate = await compareValues(page, "Dates and certainty").nth(1).boundingBox();
  const badges = await compareValues(page, "Dates and certainty").locator(".badge").evaluateAll(nodes =>
    nodes.map(node => node.getBoundingClientRect().y));
  assert.ok(firstDate.x + firstDate.width <= secondDate.x + 1);
  assert.ok(Math.abs(badges[0] - badges[1]) <= 1);
  assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
  assert.equal(await page.locator("html").evaluate(el => el.scrollWidth), 390);
  for (const control of [weekend, dialog.getByRole("button", { name: "Close comparison" })]) {
    const targetSize = await control.evaluate(el => [el.offsetWidth, el.offsetHeight]);
    assert.ok(targetSize.every(size => size >= 44));
  }
  await dialog.getByRole("button", { name: "Close comparison" }).tap();
  await button(page, "Rows").tap();
  await button(page, "Compare").tap();
  assert.equal(await weekend.locator("option:checked").innerText(), "13–14 Mar 2027");
  await page.reload();
  await button(page, "Compare").tap();
  assert.equal(await weekend.locator("option:checked").innerText(), "13–14 Mar 2027");
});

test("keeps the compact tray in reach through deep mobile scrolling and bulk selection", async t => {
  const page = await open(t, iPhone);
  const tray = page.getByRole("region", { name: "Compare events" });
  const compare = button(page, "Compare");
  const toggles = page.locator(".compare-toggle");
  const lastRow = eventRows(page).last();
  assert.ok(await eventRows(page).locator(".row-name").evaluateAll(nodes => nodes.every(el => el.offsetHeight >= 44)));
  const tapDeepPin = async index => {
    const pin = toggles.nth(index);
    await pin.scrollIntoViewIfNeeded();
    await pin.tap();
    assert.ok(await pin.getByText("Pinned", { exact: true }).isVisible());
    assert.ok(await page.evaluate(() => scrollY > innerHeight));
    const { y, height } = await tray.boundingBox();
    assert.ok(y >= 0 && y + height <= iPhone.viewport.height + 1 && height >= 44);
  };
  await tapDeepPin(14);
  assert.match(await tray.innerText(), /1 of 4 pinned/);
  assert.equal(await compare.isDisabled(), true);
  for (const theme of ["dark", "light"]) {
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    const contrast = await compare.evaluate(async el => {
      await Promise.all(el.getAnimations().map(animation => animation.finished));
      const { color, backgroundColor, opacity } = getComputedStyle(el);
      if (opacity !== "1") throw new Error(`Unexpected disabled button opacity ${opacity}`);
      function luminance(rgb) {
        const linear = rgb.match(/\d+/g).map(value => {
          const channel = Number(value) / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      }
      const values = [luminance(color), luminance(backgroundColor)];
      return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
    });
    assert.ok(contrast >= 4.5, `Disabled Compare button contrast in ${theme} mode`);
    await button(page, "Toggle light and dark theme").tap();
  }
  await tapDeepPin(15);
  assert.equal(await compare.isEnabled(), true);
  await tapDeepPin(16);
  await tapDeepPin(17);
  assert.match(await toggles.nth(18).innerText(), /Remove one to pin another/);
  assert.ok((await tray.boundingBox()).height <= 160);
  assert.ok(await tray.locator(".compare-pin").evaluateAll(nodes => nodes.every(el => el.offsetHeight >= 44)));
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  const last = await lastRow.boundingBox();
  assert.ok(last.y + last.height <= (await tray.boundingBox()).y);
  await button(page, "Bulk select").tap();
  const bulk = await page.locator(".bulk-bar").boundingBox();
  const pinned = await tray.boundingBox();
  assert.ok(pinned.y + pinned.height <= bulk.y + 1);
  await compare.tap();
  await compareDialog(page).waitFor();
});

test("keeps event names at the top of the comparison and field labels in view on mobile", async t => {
  for (const options of [iPhone, { ...desktop, viewport: { width: 1440, height: 700 } }]) {
    const page = await open(t, options);
    for (const id of ["r-awardx", "r-tradeting", "r-sunday", "r-kip"]) await pinButton(page, id).press("Space");
    await button(page, "Compare").press("Enter");
    const dialog = compareDialog(page);
    const scroller = dialog.getByRole("region", { name: "Comparison fields" });
    const lastName = dialog.getByRole("columnheader").last();
    const fee = dialog.getByRole("rowheader", { name: "Eligible table fee" });
    const left = (await fee.boundingBox()).x;
    const top = (await lastName.boundingBox()).y;
    assert.ok((await fee.boundingBox()).y < options.viewport.height);
    await scroller.evaluate(el => el.scrollTo(el.scrollWidth, el.scrollHeight));
    assert.ok(await scroller.evaluate(el => el.scrollTop > 0));
    assert.ok(Math.abs((await lastName.boundingBox()).y - top) <= 1);
    if (options.hasTouch) {
      assert.ok(await scroller.evaluate(el => el.scrollLeft > 0 && el.scrollHeight <= 2 * el.clientHeight));
      assert.ok(Math.abs((await fee.boundingBox()).x - left) <= 1);
      assert.ok((await lastName.boundingBox()).x + (await lastName.boundingBox()).width <= options.viewport.width);
    }
  }
});

test("wraps long certainty badges within their comparison cells at narrow widths", async t => {
  for (const width of [320, 800]) {
    const page = await open(t, { ...desktop, viewport: { width, height: 844 } });
    for (const id of ["ycs-wcs", "r-tradeting", "r-awardx", "urban"]) await pinButton(page, id).press("Space");
    await button(page, "Compare").press("Enter");
    const badge = compareValues(page, "Dates and certainty").first().locator(".badge");
    assert.match(await badge.innerText(), /Dates not announced/);
    assert.equal(await badge.evaluate(el => {
      const cell = el.parentElement.getBoundingClientRect();
      const bounds = el.getBoundingClientRect();
      return bounds.right <= cell.right + 1 && el.scrollWidth <= el.clientWidth + 1;
    }), true);
  }
});

test("shows the same quote and effective stage in comparison and Detail", async t => {
  const page = await open(t);
  const color = "Color Fiesta #18: Bon Appétit";
  await stage(page, color).selectOption("Considering");
  await pinButton(page, "color18").click();
  await pinButton(page, "urban").click();
  await button(page, "Compare").click();
  const price = await compareValues(page, "Eligible table fee").first().locator("strong").innerText();
  const basis = await compareValues(page, "Eligible table fee").first().locator("small").first().innerText();
  const effectiveStage = await compareValues(page, "Pipeline stage").first().locator("div").innerText();
  assert.equal(price, "VND 15,000,000");
  assert.equal(basis, "Organizer quote");
  assert.equal(effectiveStage, "Considering");
  await page.keyboard.press("Escape");
  await button(page, color).click();
  assert.equal(await stage(page, color).inputValue(), effectiveStage);
  assert.ok((await page.locator(".money-summary").textContent()).includes(price));
  assert.ok((await page.locator(".money-summary").textContent()).includes(basis));
  await button(page, "← Back to events").click();
  assert.equal(await pinButton(page, "color18").getAttribute("aria-pressed"), "true");
  assert.equal(await pinButton(page, "urban").getAttribute("aria-pressed"), "true");
});

test("opens the weekly digest from every main tab and restores focus to the header", async t => {
  for (const options of [desktop, iPhone, ...[320, 366].map(width => ({ ...iPhone, viewport: { width, height: 844 } }))]) {
    const page = await open(t, options);
    const launcher = page.locator("header").getByRole("button", { name: "Weekly digest" });
    const dialog = page.getByRole("dialog", { name: "Weekly digest" });
    for (const view of ["List", "Top picks", "Calendar", "Timeline", "Watchlist", "Recurring SG", "Pipeline"]) {
      await page.getByRole("navigation", { name: "Event views" }).getByRole("button", { name: view, exact: true }).click();
      await launcher.click();
      assert.match(await dialog.getByRole("status").innerText(), /No baseline yet/);
      assert.equal(await dialog.evaluate(el => el.scrollWidth), await dialog.evaluate(el => el.clientWidth));
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await launcher.evaluate(el => document.activeElement === el), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), options.viewport.width);
    }
  }
});

test("reviews listing changes after the summaries and expands compact vendor notices on mobile", async t => {
  const page = await open(t, iPhone);
  const launcher = button(page, "Weekly digest");
  const dialog = page.getByRole("dialog", { name: "Weekly digest" });
  const markReviewed = dialog.getByRole("button", { name: "Mark reviewed" });
  const status = dialog.getByRole("status");
  await launcher.click();
  await markReviewed.click();
  await status.getByText("No published changes since your last review.").waitFor();
  await page.keyboard.press("Escape");

  await page.evaluate(() => {
    const key = "tcg-weekly-digest-v1";
    const baseline = JSON.parse(localStorage.getItem(key));
    delete baseline.eventsById["scan-hkcec-amazing-toy-show-2026-202612"];
    localStorage.setItem(key, JSON.stringify(baseline));
  });
  await page.reload();
  await launcher.click();
  const changes = dialog.getByRole("list", { name: "Changed events" });
  assert.match(await changes.innerText(), /New event · 11–13 Dec 2026 · Wan Chai, Hong Kong/);
  assert.equal(await changes.locator("dl").count(), 0);
  assert.equal(await changes.evaluate(el => el.nextElementSibling.querySelector("button").textContent), "Mark reviewed");
  const titleStyle = await changes.getByRole("heading").evaluate(el => {
    const { fontSize, lineHeight, marginBottom } = getComputedStyle(el);
    return { lineHeight: parseFloat(lineHeight) / parseFloat(fontSize), marginBottom: parseFloat(marginBottom) };
  });
  assert.ok(titleStyle.lineHeight >= 1.3 && titleStyle.marginBottom >= 4);
  assert.equal(await changes.getByRole("link").evaluate(el => getComputedStyle(el).textDecorationLine), "none");
  await markReviewed.click();
  await status.getByText("No published changes since your last review.").waitFor();

  const sources = dialog.locator(".digest-sources");
  assert.equal(await sources.evaluate(el => el.previousElementSibling.getAttribute("aria-labelledby")), "digest-follow-up-title");
  await sources.locator(":scope > summary").click();
  const notice = sources.locator(".digest-source-notice").filter({ hasText: /Floor-plan booking/ });
  const summary = notice.locator("summary");
  assert.equal(await summary.evaluate(el => el.scrollWidth > el.clientWidth && el.clientHeight >= 44), true);
  await summary.click();
  assert.match(await notice.locator("p").innerText(), /Floor-plan booking is first come, first served/);
  const sourceLink = notice.locator("..").getByRole("link", { name: /^Check source/ });
  assert.equal(await sourceLink.isVisible(), true);
  assert.ok((await sourceLink.boundingBox()).height >= 44);
  assert.equal(await dialog.evaluate(el => el.scrollWidth), await dialog.evaluate(el => el.clientWidth));
});
