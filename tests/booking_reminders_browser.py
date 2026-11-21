"""Run after npm run build with Python Playwright and Chromium installed."""

from datetime import datetime
from os import environ
from pathlib import Path
from unittest import TestCase, main
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright


DIST = Path(__file__).resolve().parents[1] / "dist"
ORIGIN = "http://localhost:8080"


def serve_build(route):
    path = urlsplit(route.request.url).path
    asset = "index.html" if path == "/" or path.startswith("/event/") else path.lstrip("/")
    route.fulfill(path=DIST / asset)


class BookingReminders(TestCase):
    @classmethod
    def setUpClass(cls):
        playwright = sync_playwright().start()
        cls.addClassCleanup(playwright.stop)
        cls.browser = playwright.chromium.launch(executable_path=environ.get("CHROMIUM_PATH"))
        cls.addClassCleanup(cls.browser.close)

    def setUp(self):
        context = self.browser.new_context(viewport={"width": 390, "height": 844})
        self.addCleanup(context.close)
        context.route(f"{ORIGIN}/**", serve_build)
        self.page = context.new_page()
        self.strip = self.page.get_by_role("region", name="Upcoming vendor deadlines & openings")

    def test_expired_cards_hand_off_focus_and_collapse_the_empty_strip(self):
        page = self.page
        page.clock.install(time=datetime.fromisoformat("2026-11-30T15:59:50+00:00"))
        page.goto(ORIGIN)
        card_con = self.strip.get_by_role("button", name="Add to calendar: Card Con 3", exact=False)
        card_con.focus()
        page.clock.fast_forward(30_000)
        expect(card_con).to_have_count(0)
        expect(self.strip.locator(".milestone-card").first).to_be_focused()
        expect(self.strip.locator(".milestone-card").first).to_contain_text("Bangkok International Card Show")

        page.clock.fast_forward(22 * 86_400_000)
        expect(self.strip).to_have_count(0)
        expect(page.locator("#workspace-title")).to_be_focused()

    def test_editor_handles_edge_years_and_reset_survives_reload(self):
        page = self.page
        page.clock.set_fixed_time(datetime.fromisoformat("2026-11-21T00:00:00+00:00"))
        page.goto(f"{ORIGIN}/event/cardcon3")
        milestones = page.get_by_role("region", name="Booking milestones")
        edit = milestones.get_by_role("button", name="Edit General booking opens")
        edit.click()
        dialog = page.get_by_role("dialog", name="Edit milestone")
        date = dialog.get_by_label("Date or datetime with offset")
        save = dialog.get_by_role("button", name="Save milestone")
        date.fill("9999-12-31T23:30:00-01:00")
        save.click()
        expect(dialog.get_by_role("alert")).to_contain_text("years 0001–9999")

        date.fill("0999-01-01T12:00:00Z")
        save.click()
        expect(dialog).to_have_count(0)
        expect(milestones.locator("time")).to_contain_text("1 Jan 999")
        page.reload()
        expect(milestones.locator("time")).to_contain_text("1 Jan 999")
        milestones.get_by_role("button", name="Reset to shared: General booking opens").click()
        expect(edit).to_be_focused()
        page.reload()
        expect(milestones.locator("time span").first).to_have_text("30 Nov 2026, 23:00 Saigon")
        expect(milestones.get_by_role("button", name="Reset to shared", exact=False)).to_have_count(0)

    def test_local_addition_can_be_revealed_in_the_strip_and_deleted(self):
        page = self.page
        page.clock.set_fixed_time(datetime.fromisoformat("2026-11-21T00:00:00+00:00"))
        page.goto(f"{ORIGIN}/event/cardcon3")
        milestones = page.get_by_role("region", name="Booking milestones")
        add = milestones.get_by_role("button", name="Add milestone")
        add.click()
        dialog = page.get_by_role("dialog", name="Add milestone")
        dialog.get_by_label("Label", exact=True).fill("Balance due")
        dialog.get_by_label("Date or datetime with offset").fill("2026-12-21")
        dialog.get_by_label("Organizer time zone").fill("Asia/Singapore")
        dialog.get_by_label("Source link or reference").fill("Organizer email")
        dialog.get_by_label("Verified date").check()
        dialog.get_by_role("button", name="Save milestone").click()
        expect(milestones.get_by_role("heading", name="Balance due")).to_be_visible()

        page.goto(ORIGIN)
        expect(self.strip.locator(".milestone-card")).to_have_count(3)
        self.strip.get_by_role("button", name="Show 1 more milestone").click()
        expect(self.strip.locator(".milestone-card")).to_have_count(4)
        expect(self.strip.locator(".milestone-card").last).to_contain_text("Balance due")
        self.strip.get_by_role("button", name="Show fewer milestones").click()
        expect(self.strip.locator(".milestone-card")).to_have_count(3)

        page.goto(f"{ORIGIN}/event/cardcon3")
        milestones.get_by_role("button", name="Delete local milestone: Balance due").click()
        expect(add).to_be_focused()
        page.reload()
        expect(milestones.get_by_role("heading", name="Balance due")).to_have_count(0)


if __name__ == "__main__":
    main()
