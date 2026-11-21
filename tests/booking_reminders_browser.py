"""Run after npm run build with Python Playwright and Chromium installed."""

from datetime import datetime
from json import dumps
from os import environ
from pathlib import Path
import re
from unittest import TestCase, main
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright


DIST = Path(__file__).resolve().parents[1] / "dist"
ORIGIN = "http://localhost:8080"


def serve_build(route):
    path = urlsplit(route.request.url).path
    asset = "index.html" if path == "/" or path.startswith("/event/") else path.lstrip("/")
    route.fulfill(path=DIST / asset)


class PlannerBrowser(TestCase):
    @classmethod
    def setUpClass(cls):
        playwright = sync_playwright().start()
        cls.addClassCleanup(playwright.stop)
        cls.browser = playwright.chromium.launch(executable_path=environ.get("CHROMIUM_PATH"))
        cls.addClassCleanup(cls.browser.close)

    def setUp(self):
        context = self.browser.new_context(
            viewport={"width": 390, "height": 844}, timezone_id="Asia/Ho_Chi_Minh",
        )
        self.addCleanup(context.close)
        context.route(f"{ORIGIN}/**", serve_build)
        self.page = context.new_page()
        self.strip = self.page.get_by_role("region", name="Upcoming vendor deadlines & openings")

    def test_outreach_queue_fits_both_themes_and_opens_events_by_keyboard(self):
        page = self.page
        page.clock.set_fixed_time(datetime.fromisoformat("2026-11-24T00:00:00+00:00"))
        page.goto(ORIGIN)
        queue = page.get_by_role("region", name="Outreach follow-ups")
        toggle_theme = page.get_by_role("button", name="Toggle light and dark theme")
        cards = queue.get_by_role("listitem")
        expand = queue.get_by_role("button", name="Show 3 more follow-ups")
        for width in (390, 1440):
            page.set_viewport_size({"width": width, "height": 900})
            for theme in ("dark", "light"):
                with self.subTest(width=width, theme=theme):
                    if page.locator("html").get_attribute("data-theme") != theme:
                        toggle_theme.click()
                    expect(page.locator("html")).to_have_attribute("data-theme", theme)
                    expect(cards).to_have_count(3)
                    expand.focus()
                    page.keyboard.press("Enter")
                    expect(cards).to_have_count(6)
                    expect(queue.get_by_role("button", name="Show fewer follow-ups")).to_have_attribute("aria-expanded", "true")
                    acknowledgement = queue.get_by_role("button", name=re.compile(r"HKTDC.*Organizer nudge due"))
                    expect(acknowledgement).to_contain_text("Last exchange · Automatic acknowledgement · 20 Nov 2026")
                    expect(acknowledgement).to_contain_text("22:01:26 UTC")
                    expect(acknowledgement).not_to_contain_text("1a1f5d493ba2a84d")
                    notes = cards.first.locator(".outreach-follow-up-notes")
                    expect(notes).to_have_css("-webkit-line-clamp", "2")
                    self.assertLessEqual(queue.evaluate("(el) => el.scrollWidth"), queue.evaluate("(el) => el.clientWidth"))
                    self.assertLessEqual(page.locator("html").evaluate("(el) => el.scrollWidth"), width)
                    page.keyboard.press("Enter")
                    expect(expand).to_be_focused()
                    expect(cards).to_have_count(3)

        japan = queue.get_by_role("button", name="Japan Expo Thailand 2027 Your reply is due")
        japan.focus()
        page.keyboard.press("Enter")
        page.wait_for_url("**/event/jet-2027")
        outreach = page.get_by_role("region", name="Outreach", exact=True)
        action = outreach.get_by_label("Next action")
        expect(action.locator("option:checked")).to_have_text("Your reply is due")
        expect(outreach.get_by_label("Quoted price")).to_have_value("")
        page.set_viewport_size({"width": 390, "height": 844})
        self.assertGreater(outreach.get_by_label("Response date").bounding_box()["width"], 230)
        page.keyboard.press("Escape")
        expect(japan).to_be_focused()

    def test_outreach_loads_an_older_backup_and_can_clear_the_last_due_action(self):
        page = self.page
        legacy_backup = (DIST.parent / "tests" / "fixtures" / "outreach-backup-v1.json").read_text()
        page.add_init_script(f"""
            if (!localStorage.getItem("tcg-pipeline-v1")) {{
                localStorage.setItem("tcg-pipeline-v1", {dumps(legacy_backup)});
            }}
        """)
        page.clock.set_fixed_time(datetime.fromisoformat("2026-11-21T00:00:00+00:00"))
        page.goto(ORIGIN)
        queue = page.get_by_role("region", name="Outreach follow-ups")
        queue.get_by_role("button", name="Japan Expo Thailand 2027 Your reply is due").click()
        outreach = page.get_by_role("region", name="Outreach", exact=True)
        expect(outreach.get_by_label("Outreach notes")).to_have_value("Local note to keep.")
        expect(outreach.get_by_label("Message reference")).to_have_value("1a1f365362759e5c")
        outreach.get_by_label("Next action").select_option(label="No follow-up")
        outreach.get_by_role("button", name="Save outreach").click()
        expect(outreach.get_by_role("status")).to_have_text("Saved on this device")
        page.get_by_role("button", name="Back to events", exact=False).click()
        expect(queue).to_have_count(0)
        expect(page.locator("#workspace-title")).to_be_focused()

    def test_later_quote_clears_the_reply_and_focuses_the_next_follow_up(self):
        page = self.page
        page.clock.set_fixed_time(datetime.fromisoformat("2026-11-24T00:00:00+00:00"))
        page.goto(ORIGIN)
        queue = page.get_by_role("region", name="Outreach follow-ups")
        queue.get_by_role("button", name="Japan Expo Thailand 2027 Your reply is due").click()
        outreach = page.get_by_role("region", name="Outreach", exact=True)
        outreach.get_by_label("Follow-up due date").fill("2026-11-24")
        outreach.get_by_role("button", name="Save outreach").click()
        expect(outreach.get_by_role("status")).to_have_text("Saved on this device")
        outreach.get_by_label("Outreach status").select_option("quoted")
        expect(outreach.get_by_label("Response date")).to_have_value("2026-11-24")
        expect(outreach.get_by_label("Next action")).to_have_value("")
        expect(outreach.get_by_label("Follow-up due date")).to_have_value("")
        outreach.get_by_label("Response date").fill("2026-11-23")
        outreach.get_by_label("Quoted price").fill("THB 9,000")
        outreach.get_by_label("Outreach notes").fill("Test reply with a table quote.")
        outreach.get_by_label("Message reference").fill("test-reply")
        outreach.get_by_role("button", name="Save outreach").click()
        expect(outreach.get_by_role("status")).to_have_text("Saved on this device")
        page.get_by_role("button", name="Back to events", exact=False).click()
        expect(queue.get_by_role("button", name=re.compile(r"Comifuro.*Organizer nudge due"))).to_be_focused()
        expect(queue.get_by_text("Japan Expo Thailand 2027")).to_have_count(0)
        page.goto(f"{ORIGIN}/event/jet-2027")
        page.reload()
        expect(outreach.get_by_label("Outreach status")).to_have_value("quoted")
        expect(outreach.get_by_label("Response date")).to_have_value("2026-11-23")
        expect(outreach.get_by_label("Quoted price")).to_have_value("THB 9,000")
        expect(outreach.get_by_label("Outreach notes")).to_have_value("Test reply with a table quote.")
        expect(outreach.get_by_label("Message reference")).to_have_value("test-reply")

    def test_hktdc_reply_preserves_the_acknowledgement(self):
        page = self.page
        page.clock.set_fixed_time(datetime.fromisoformat("2026-11-24T00:00:00+00:00"))
        page.goto(f"{ORIGIN}/event/hktdc")
        outreach = page.get_by_role("region", name="Outreach", exact=True)
        ack = outreach.get_by_text("2026-11-20", exact=True)
        expect(ack).to_be_visible()
        outreach.get_by_label("Outreach status").select_option("replied")
        outreach.get_by_role("button", name="Save outreach").click()
        expect(outreach.get_by_role("status")).to_have_text("Saved on this device")
        page.reload()
        expect(outreach.get_by_label("Outreach status")).to_have_value("replied")
        expect(ack).to_be_visible()

    def test_outreach_focus_moves_when_the_visible_queue_changes(self):
        page = self.page
        page.clock.set_fixed_time(datetime.fromisoformat("2026-11-24T00:00:00+00:00"))
        page.goto(ORIGIN)
        queue = page.get_by_role("region", name="Outreach follow-ups")
        queue.get_by_role("button", name=re.compile(r"Comifuro.*Organizer nudge due")).focus()
        page.clock.set_fixed_time(datetime.fromisoformat("2026-11-21T00:00:00+00:00"))
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        expect(queue.get_by_role("button", name="Japan Expo Thailand 2027 Your reply is due")).to_be_focused()
        page.clock.set_fixed_time(datetime.fromisoformat("2026-11-18T00:00:00+00:00"))
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        expect(queue).to_have_count(0)
        expect(page.locator("#workspace-title")).to_be_focused()

    def test_home_base_updates_priority_across_views_and_survives_reload(self):
        page = self.page
        page.clock.set_fixed_time(datetime.fromisoformat("2026-11-21T00:00:00+00:00"))
        page.goto(ORIGIN)
        page.get_by_label("Search events").fill("Card Con 3 by MyRepublic")
        page.get_by_role("button", name="Grid", exact=True).click()
        grid_score = page.locator(".event-card .priority-chip")
        expect(grid_score).to_have_attribute("aria-label", re.compile(r"^Score \d+ of 100"))
        default_score = grid_score.get_attribute("aria-label")

        tools_button = page.get_by_role("button", name="Tools", exact=True)
        tools_button.click()
        tools = page.get_by_role("dialog", name="Tools")
        settings = tools.get_by_role("region", name="Priority and travel")
        base = settings.get_by_label("Home base")
        expect(settings.get_by_role("button", name="Score weights")).to_be_visible()
        expect(base).to_have_value("vn-ho-chi-minh-city")
        expect(base.locator('optgroup[label="Vietnam"] option:checked')).to_have_text("Ho Chi Minh City (default)")
        base.select_option("au-sydney")
        tools.get_by_role("button", name="Close tools").click()

        expect(grid_score).not_to_have_attribute("aria-label", default_score)
        updated_score = grid_score.get_attribute("aria-label")
        page.get_by_role("button", name="Rows", exact=True).click()
        expect(page.locator(".event-rows .priority-chip")).to_have_attribute("aria-label", updated_score)
        page.get_by_role("button", name="Top picks", exact=True).click()
        pick = page.locator(".pick")
        expect(pick.locator(".priority-chip")).to_have_attribute("aria-label", updated_score)
        pick.get_by_role("button", name="Card Con 3 by MyRepublic", exact=False).click()
        priority = page.get_by_role("region", name="Priority score")
        expect(priority.locator(".priority-chip")).to_have_attribute("aria-label", updated_score)
        priority.locator("summary").filter(has_text="Logistics").click()
        expect(priority.get_by_text("Travel from Sydney, Australia to Singapore (estimated: Other international)")).to_be_visible()

        page.reload()
        expect(priority.locator(".priority-chip")).to_have_attribute("aria-label", updated_score)
        page.get_by_role("button", name="Back to events", exact=False).click()
        tools_button.click()
        expect(base).to_have_value("au-sydney")

    def test_home_base_import_previews_changes_and_keeps_the_current_base_for_unknown_ids(self):
        page = self.page
        page.goto(ORIGIN)
        page.get_by_role("button", name="Tools", exact=True).click()
        tools = page.get_by_role("dialog", name="Tools")
        base = tools.get_by_label("Home base")
        base.select_option("vn-hanoi")
        preview = tools.get_by_role("region", name="Import preview")

        def preview_backup(home_base):
            data = {
                "version": 1,
                "exportedAt": "2026-11-21T00:00:00.000Z",
                "entries": {},
                "priority": {"weights": {}, "overrides": {}, "homeBase": home_base},
            }
            tools.get_by_label("Import JSON").set_input_files({
                "name": "backup.json", "mimeType": "application/json", "buffer": dumps(data).encode(),
            })

        preview_backup("au-sydney")
        expect(preview).to_contain_text("Home base will change from Hanoi, Vietnam to Sydney, Australia.")
        preview.get_by_role("button", name="Confirm import").click()
        expect(base).to_have_value("au-sydney")

        preview_backup("unknown-preset")
        expect(preview).to_contain_text("The backup specifies an unknown home base. Your home base will stay set to Sydney, Australia.")
        preview.get_by_role("button", name="Confirm import").click()
        expect(preview).to_have_count(0)
        expect(tools.get_by_text("Imported 0 entries (merge).")).to_be_visible()
        expect(base).to_have_value("au-sydney")

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
