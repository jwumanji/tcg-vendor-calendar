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
  assert.match(await tip.innerText(), /Score.*Going.*Stage/s);
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
    const status = read(".row-dates .badge, .card-tags .badge");
    const going = read(".going-button");
    return {
      id: node.dataset.eventId,
      name,
      dates: read(".row-date-label, .card-when span")?.textContent ?? null,
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
    return games.right > score.left;
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
  const toggle = button(page, "Show all 10");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  await toggle.click();
  const collapse = button(page, "Show fewer dates");
  assert.equal(await collapse.getAttribute("aria-expanded"), "true");
  assert.equal(await dates.count(), 10);
  await collapse.click();
  assert.equal(await dates.count(), 3);
  assert.doesNotMatch(await page.locator(".event-layout").innerText(), /change the pipeline stage in decide|start_date|end_date|on the page/i);
});
