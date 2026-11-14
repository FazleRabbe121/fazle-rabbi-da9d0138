"""Offline unit & security tests (standard library + httpx):  python3 -m unittest discover -s jobhunter-agent/tests -v"""
import asyncio
import email
import os
import smtplib
import sys
import unittest
from email import policy
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.update({
    "GMAIL_ADDRESS": "me@gmail.com",
    "GMAIL_APP_PASSWORD": "x",
    "WARMUP_START": "2",
    "SEND_GAP_MIN": "0",
    "SEND_GAP_MAX": "0",
    "TELEGRAM_CHAT_ID": "42",
    "GEMINI_API_KEY": "",
})

from jobhunter import mailer as mailer_mod  # noqa: E402
from jobhunter.analyzer import classify_sponsorship_evidence, rule_analyze  # noqa: E402
from jobhunter.config import Config  # noqa: E402
from jobhunter.crawler import CrawlResult, Crawler, is_safe_ip, is_safe_url  # noqa: E402
from jobhunter.data import (  # noqa: E402
    CAREER_KEYWORDS,
    COUNTRY_PRIORITY_RANK,
    HOSPITALITY_PROFESSIONS,
    PRIORITY_GROUP_1,
    PRIORITY_GROUP_2,
    SPONSORSHIP_CATEGORIES,
    map_canonical_professions,
)
from jobhunter.db import DB  # noqa: E402
from jobhunter.drafts import make_draft  # noqa: E402
from jobhunter.inbox import process_message  # noqa: E402
from jobhunter.mailer import Mailer, SendError, smtp_deliver  # noqa: E402
from jobhunter.scoring import evaluate_four_scores, label, score_company  # noqa: E402
from jobhunter.sources import build_overpass_query, parse_overpass, validate_company_country  # noqa: E402
from jobhunter.textutil import (  # noqa: E402
    classify_email,
    domain_of,
    extract_emails,
    parse_html,
    pick_links,
)

PROFILE = {
    "full_name": "Test Person",
    "phone": "+1 555",
    "roles": ["Bartender", "Barista", "Waiter"],
    "experience_summary": "I have five years of experience in hotel bars and cafes.",
    "work_authorization": "I am currently working legally in Cyprus and would need work-permit support.",
}


def run(coro):
    return asyncio.run(coro)


class TextTests(unittest.TestCase):
    def test_email_extraction_and_obfuscation(self):
        txt = "Write to jobs [at] grandhotel [dot] hr or info@grandhotel.hr. logo@2x.png sentry@wixpress.com"
        self.assertEqual(extract_emails(txt), ["jobs@grandhotel.hr", "info@grandhotel.hr"])

    def test_classify_and_domain(self):
        self.assertEqual(classify_email("careers@x.com"), "hr")
        self.assertEqual(classify_email("info@x.com"), "general")
        self.assertEqual(classify_email("marko.kovac@x.com"), "person")
        self.assertEqual(domain_of("https://www.Hotel.hr/en/"), "hotel.hr")

    def test_pick_career_links_multilingual(self):
        html = (
            '<a href="/en/about">About</a><a href="/karriere">Karriere</a>'
            '<a href="/posao">Posao</a><a href="https://other.com/jobs">Jobs</a><a href="/contact">Contact</a>'
        )
        p = parse_html(html)
        urls = pick_links(p["links"], "https://hotel.hr/", CAREER_KEYWORDS)
        self.assertIn("https://hotel.hr/karriere", urls)
        self.assertIn("https://hotel.hr/posao", urls)
        self.assertNotIn("https://other.com/jobs", urls)

    def test_rule_analyzer(self):
        r = rule_analyze("We are hiring: Bartender and Waiter. Staff accommodation provided. Work permit support.")
        self.assertTrue(r["has_relevant_job"])
        self.assertEqual(r["visa_signal"], "explicit")
        self.assertTrue(r["accommodation"])
        neg = rule_analyze("Barista wanted, apply now. EU citizens only.")
        self.assertEqual(neg["visa_signal"], "negative")
        self.assertFalse(rule_analyze("Our server room is cooling. We are hiring.")["has_relevant_job"])
        self.assertTrue(rule_analyze("pay a fee for the visa, Barista, apply")["red_flags"])

    def test_scoring(self):
        good = {
            "reachable": True,
            "has_job": True,
            "visa_signal": "explicit",
            "accommodation": True,
            "best_email": "hr@h.hr",
            "email_matches_site": True,
            "email_kind": "hr",
            "mx_ok": True,
            "has_contact_details": True,
            "country": "HR",
            "red_flags": [],
        }
        s, why = score_company(good)
        self.assertEqual(label(s), "Strong")
        self.assertTrue(why)
        bad = dict(good, red_flags=["registration fee"], visa_signal="negative", mx_ok=False)
        self.assertEqual(label(score_company(bad)[0]), "Weak")


class PriorityAndHospitalityTests(unittest.TestCase):
    def test_country_priority_groups_order(self):
        self.assertEqual(PRIORITY_GROUP_1, ["PL", "PT", "HR", "NL", "MT", "ES", "LU"])
        self.assertEqual(PRIORITY_GROUP_2, ["GB-ENG", "GB-SCT", "AU", "NZ"])
        self.assertEqual(COUNTRY_PRIORITY_RANK["PL"], 1)
        self.assertEqual(COUNTRY_PRIORITY_RANK["PT"], 2)
        self.assertEqual(COUNTRY_PRIORITY_RANK["HR"], 3)
        self.assertEqual(COUNTRY_PRIORITY_RANK["NL"], 4)
        self.assertEqual(COUNTRY_PRIORITY_RANK["MT"], 5)
        self.assertEqual(COUNTRY_PRIORITY_RANK["ES"], 6)
        self.assertEqual(COUNTRY_PRIORITY_RANK["LU"], 7)
        self.assertEqual(COUNTRY_PRIORITY_RANK["GB-ENG"], 8)
        self.assertEqual(COUNTRY_PRIORITY_RANK["GB-SCT"], 9)
        self.assertEqual(COUNTRY_PRIORITY_RANK["AU"], 10)
        self.assertEqual(COUNTRY_PRIORITY_RANK["NZ"], 11)

    def test_all_14_hospitality_professions_mapped(self):
        self.assertEqual(len(HOSPITALITY_PROFESSIONS), 14)
        sample_roles = [
            "barkeeper",
            "specialty coffee barista",
            "waitress",
            "fine dining server",
            "chef de rang",
            "f&b attendant",
            "f&b supervisor",
            "floor supervisor",
            "head bartender",
            "cocktail specialist",
            "breakfast server",
            "hospitality team member",
            "hotel receptionist",
            "guest services associate",
        ]
        mapped = map_canonical_professions(sample_roles)
        for prof in HOSPITALITY_PROFESSIONS:
            self.assertIn(prof, mapped, f"Expected {prof} to be mapped")

    def test_sponsorship_categories_a_to_e(self):
        cat_a = classify_sponsorship_evidence("We are an A-rated sponsor and Identità single permit sponsor.")
        self.assertEqual(cat_a["category"], "A")
        cat_b = classify_sponsorship_evidence("Visa sponsorship and work permit assistance available for non-EU staff.")
        self.assertEqual(cat_b["category"], "B")
        cat_c = classify_sponsorship_evidence("Staff accommodation and relocation assistance provided.")
        self.assertEqual(cat_c["category"], "C")
        cat_d = classify_sponsorship_evidence("Hiring bartender and barista for our city café.")
        self.assertEqual(cat_d["category"], "D")
        cat_e = classify_sponsorship_evidence("EU citizens only. Must already have the right to work.")
        self.assertEqual(cat_e["category"], "E")

    def test_four_scores_evaluation(self):
        good = {
            "reachable": True,
            "has_job": True,
            "visa_signal": "explicit",
            "sponsorship_category": "A",
            "accommodation": True,
            "best_email": "hr@valamar.com",
            "mx_ok": True,
            "country": "HR",
            "roles": ["Bartender", "Waiter / Waitress"],
            "red_flags": [],
        }
        scores = evaluate_four_scores(good, PROFILE)
        self.assertGreaterEqual(scores["job_suitability_score"], 85)
        self.assertGreaterEqual(scores["sponsorship_evidence_score"], 95)
        self.assertGreaterEqual(scores["work_permit_feasibility_score"], 85)
        self.assertGreaterEqual(scores["overall_priority_score"], 85)

        ineligible = dict(good, sponsorship_category="E", visa_signal="negative")
        scores_e = evaluate_four_scores(ineligible, PROFILE)
        self.assertEqual(scores_e["sponsorship_evidence_score"], 0)
        self.assertEqual(scores_e["overall_priority_score"], 0)


class SSRFAndCountryValidationTests(unittest.TestCase):
    def test_ssrf_guard_blocks_private_loopback_and_metadata(self):
        self.assertFalse(is_safe_ip("127.0.0.1"))
        self.assertFalse(is_safe_ip("169.254.169.254"))
        self.assertFalse(is_safe_ip("192.168.1.1"))
        self.assertFalse(is_safe_ip("10.0.0.1"))
        self.assertFalse(is_safe_url("http://127.0.0.1:8080/admin", resolve_dns=False))
        self.assertFalse(is_safe_url("http://localhost:3000/api", resolve_dns=False))
        self.assertFalse(is_safe_url("http://169.254.169.254/latest/meta-data/", resolve_dns=False))
        self.assertFalse(is_safe_url("file:///etc/passwd", resolve_dns=False))

    def test_country_validation_separates_england_and_scotland(self):
        self.assertTrue(validate_company_country("GB-ENG", formatted_address="Strand, London, England"))
        self.assertFalse(validate_company_country("GB-ENG", formatted_address="Princes St, Edinburgh, Scotland"))
        self.assertTrue(validate_company_country("GB-SCT", formatted_address="Princes St, Edinburgh, Scotland"))
        self.assertFalse(validate_company_country("PL", addr_country="DE"))


class SourceTests(unittest.TestCase):
    def test_overpass(self):
        q = build_overpass_query("Zagreb", "all", cc="HR")
        self.assertIn("Zagreb", q)
        self.assertIn("restaurant", q)
        self.assertIn('ISO3166-1"="HR"', q)
        q_sct = build_overpass_query("Edinburgh", "hotels", cc="GB-SCT")
        self.assertIn('ISO3166-2"="GB-SCT"', q_sct)
        data = {
            "elements": [
                {"tags": {"name": "Hotel A", "website": "www.hotela.hr", "phone": "+385", "email": "A@hotela.hr"}},
                {"tags": {"name": "Hotel A again", "website": "https://hotela.hr/x"}},
                {"tags": {"name": "FB page", "website": "https://facebook.com/p"}},
                {"tags": {"name": "No site"}},
            ]
        }
        out = parse_overpass(data, "Zagreb", "HR")
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["domain"], "hotela.hr")
        self.assertEqual(out[0]["osm_email"], "a@hotela.hr")


class DBTests(unittest.TestCase):
    def test_one_initial_per_address(self):
        db = DB(":memory:")
        a = db.add_draft(1, "HR@x.com", "s", "b", "en")
        self.assertIsNotNone(a)
        self.assertIsNone(db.add_draft(2, "hr@x.com", "s", "b", "en"))  # duplicate blocked by the database
        db.skip(a)
        self.assertIsNotNone(db.add_draft(2, "hr@x.com", "s", "b", "en"))  # allowed again after skip

    def test_claim_is_exclusive_and_recovery_never_resends(self):
        db = DB(":memory:")
        rid = db.add_draft(1, "a@x.com", "s", "b", "en", status="approved")
        self.assertEqual(db.claim_next_to_send(), rid)
        self.assertIsNone(db.claim_next_to_send())
        self.assertEqual(db.recover_stuck_sending(), 1)
        self.assertEqual(db.get_outbox(rid)["status"], "needs_review")
        self.assertIsNone(db.claim_next_to_send())

    def test_crash_recovery_and_gemini_cache(self):
        db = DB(":memory:")
        cid = db.add_company("Hotel Test", "https://test.pl/", "test.pl", "PL", "Warsaw")
        db.set_company(cid, status="crawling")
        sid = db.add_search("Warsaw", "PL", "hotels")
        db.x("UPDATE searches SET status='running' WHERE id=?", (sid,))
        rec = db.recover_crashed_tasks()
        self.assertEqual(rec["crawls_recovered"], 1)
        self.assertEqual(rec["searches_recovered"], 1)
        self.assertEqual(db.get_company(cid)["status"], "new")

        # Gemini SQLite cache test
        self.assertIsNone(db.get_cached_gemini("sample prompt"))
        db.set_cached_gemini("sample prompt", {"has_relevant_job": True, "roles": ["bartender"]}, "gemini-2.5-flash")
        cached = db.get_cached_gemini("sample prompt")
        self.assertTrue(cached["has_relevant_job"])


class MailerTests(unittest.TestCase):
    def setUp(self):
        self.cfg = Config.load()
        self.db = DB(":memory:")
        self.notes = []

        async def notify(text, buttons=None):
            self.notes.append(text)

        self.m = Mailer(self.cfg, self.db, lambda: PROFILE, notify)
        self.sent = []

    def _queue(self, to="hr@hotel.hr", n=1):
        return [
            self.db.add_draft(1, f"{i}{to}" if n > 1 else to, "Subject", "Body " * 50, "en", status="approved")
            for i in range(n)
        ]

    def test_success_and_no_double_send(self):
        rid = self._queue()[0]
        with mock.patch.object(mailer_mod, "smtp_deliver", side_effect=lambda cfg, msg: self.sent.append(msg)):
            self.assertEqual(self.db.claim_next_to_send(), rid)
            self.assertTrue(run(self.m.deliver(rid)))
            self.assertIsNone(self.db.claim_next_to_send())
            self.assertIsNone(self.db.add_draft(1, "hr@hotel.hr", "S", "B", "en", status="approved"))
            self.db.x("DROP INDEX ux_outbox_initial")
            rid2 = self.db.add_draft(1, "hr@hotel.hr", "S", "B", "en", status="sending")
            self.assertFalse(run(self.m.deliver(rid2)))
            self.assertEqual(self.db.get_outbox(rid2)["status"], "skipped")
        self.assertEqual(len(self.sent), 1)
        row = self.db.get_outbox(rid)
        self.assertEqual(row["status"], "sent")
        self.assertTrue(row["message_id"].startswith("<"))
        self.assertEqual(self.sent[0]["To"], "hr@hotel.hr")

    def test_cv_missing_enforcement_blocks_send(self):
        self.db.kv_set("require_cv", "1")
        self.cfg.cv_path = "nonexistent_cv_file.pdf"
        rid = self._queue()[0]
        self.db.claim_next_to_send()
        with mock.patch.object(mailer_mod, "smtp_deliver") as sd:
            self.assertFalse(run(self.m.deliver(rid)))
            sd.assert_not_called()
        self.assertEqual(self.db.get_outbox(rid)["status"], "failed")
        self.assertIn("CV attachment missing", self.db.get_outbox(rid)["last_error"])

    def test_ambiguous_error_goes_to_review_not_retry(self):
        rid = self._queue()[0]
        self.db.claim_next_to_send()
        with mock.patch.object(mailer_mod, "smtp_deliver", side_effect=SendError("ambiguous", "lost")):
            self.assertFalse(run(self.m.deliver(rid)))
        self.assertEqual(self.db.get_outbox(rid)["status"], "needs_review")
        self.assertIsNone(self.db.claim_next_to_send())
        self.assertTrue(any("/review" in n for n in self.notes))

    def test_retry_then_fail_after_three_attempts(self):
        rid = self._queue()[0]
        with mock.patch.object(mailer_mod, "smtp_deliver", side_effect=SendError("retry", "dns")):
            self.db.claim_next_to_send()
            run(self.m.deliver(rid))
            row = self.db.get_outbox(rid)
            self.assertEqual(row["status"], "approved")
            self.assertIsNotNone(row["next_try_at"])
            self.assertIsNone(self.db.claim_next_to_send())
            self.db.set_outbox(rid, next_try_at=None, attempts=3)
            self.db.x("UPDATE outbox SET status='sending' WHERE id=?", (rid,))
            run(self.m.deliver(rid))
        self.assertEqual(self.db.get_outbox(rid)["status"], "failed")

    def test_auth_error_pauses_everything(self):
        rid = self._queue()[0]
        self.db.claim_next_to_send()
        with mock.patch.object(mailer_mod, "smtp_deliver", side_effect=SendError("auth", "535")):
            run(self.m.deliver(rid))
        self.assertEqual(self.db.kv_get("paused"), "1")
        self.assertEqual(self.db.get_outbox(rid)["status"], "approved")

    def test_suppressed_address_is_never_mailed(self):
        rid = self._queue()[0]
        self.db.suppress("@hotel.hr", "asked to stop")
        self.db.claim_next_to_send()
        with mock.patch.object(mailer_mod, "smtp_deliver") as sd:
            self.assertFalse(run(self.m.deliver(rid)))
            sd.assert_not_called()
        self.assertEqual(self.db.get_outbox(rid)["status"], "skipped")

    def test_daily_cap_and_warmup(self):
        self._queue(n=4)
        self.assertEqual(self.m.todays_cap(), 2)

        async def fake_sleep(_):
            return None

        with mock.patch.object(mailer_mod, "smtp_deliver", side_effect=lambda cfg, msg: self.sent.append(msg)), \
                mock.patch.object(Mailer, "in_window", return_value=True), \
                mock.patch("asyncio.sleep", new=fake_sleep):
            for _ in range(6):
                run(self.m.tick())
        self.assertEqual(len(self.sent), 2)
        self.assertEqual(self.db.one("SELECT COUNT(*) c FROM outbox WHERE status='approved'")["c"], 2)

    def test_smtp_error_classification(self):
        cfg = self.cfg

        def make(login_exc=None, send_exc=None, ctor_exc=None):
            class FakeSMTP:
                def __init__(self, *a, **k):
                    if ctor_exc:
                        raise ctor_exc

                def login(self, *a):
                    if login_exc:
                        raise login_exc

                def send_message(self, msg):
                    if send_exc:
                        raise send_exc

                def quit(self):
                    pass

                def close(self):
                    pass

            return FakeSMTP

        msg = email.message.EmailMessage()
        msg["To"] = "a@b.com"
        msg.set_content("x")
        cases = [
            (dict(ctor_exc=OSError("dns")), "retry"),
            (dict(login_exc=smtplib.SMTPAuthenticationError(535, b"bad")), "auth"),
            (dict(send_exc=smtplib.SMTPServerDisconnected("gone")), "ambiguous"),
            (dict(send_exc=TimeoutError("t")), "ambiguous"),
            (dict(send_exc=smtplib.SMTPDataError(550, b"5.4.5 Daily user sending quota exceeded")), "quota"),
            (dict(send_exc=smtplib.SMTPDataError(550, b"mailbox unavailable")), "fatal"),
            (dict(send_exc=smtplib.SMTPDataError(451, b"try later")), "retry"),
            (dict(send_exc=smtplib.SMTPRecipientsRefused({"a@b.com": (550, b"no")})), "fatal"),
        ]
        for kwargs, expected in cases:
            with mock.patch.object(mailer_mod.smtplib, "SMTP_SSL", make(**kwargs)):
                with self.assertRaises(SendError) as cm:
                    smtp_deliver(cfg, msg)
                self.assertEqual(cm.exception.kind, expected, kwargs)
        with mock.patch.object(mailer_mod.smtplib, "SMTP_SSL", make()):
            smtp_deliver(cfg, msg)


class InboxTests(unittest.TestCase):
    def _msg(self, raw):
        return email.message_from_string(raw, policy=policy.default)

    def setUp(self):
        self.db = DB(":memory:")
        self.rid = self.db.add_draft(1, "hr@hotel.hr", "App", "Body", "en", status="sent")
        self.db.set_outbox(self.rid, message_id="<abc123@gmail.com>")

    def test_reply_by_message_id(self):
        m = self._msg(
            "From: HR <hr@hotel.hr>\nSubject: Re: App\nIn-Reply-To: <abc123@gmail.com>\n\n"
            'Thanks, please call us.\n\nOn Mon, Me wrote:\n> If you would prefer ... reply with "stop"'
        )
        ev = process_message(self.db, m)
        self.assertEqual(ev["type"], "reply")
        self.assertIn("please call us", ev["snippet"])
        self.assertIsNotNone(self.db.get_outbox(self.rid)["replied_at"])
        self.assertFalse(self.db.is_suppressed("hr@hotel.hr"))

    def test_reply_fallback_by_sender_and_stop(self):
        m = self._msg("From: hr@hotel.hr\nSubject: Re: App\n\nPlease stop contacting us.")
        ev = process_message(self.db, m)
        self.assertEqual(ev["type"], "stop")
        self.assertTrue(self.db.is_suppressed("hr@hotel.hr"))

    def test_bounce(self):
        m = self._msg(
            "From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>\n"
            "Subject: Delivery Status Notification (Failure)\n\n"
            "Address not found.\nMessage-ID: <abc123@gmail.com>\nTo: hr@hotel.hr"
        )
        ev = process_message(self.db, m)
        self.assertEqual(ev["type"], "bounce")
        self.assertEqual(self.db.get_outbox(self.rid)["bounced"], 1)
        self.assertTrue(self.db.is_suppressed("hr@hotel.hr"))

    def test_unrelated_mail_ignored(self):
        self.assertIsNone(process_message(self.db, self._msg("From: news@shop.com\nSubject: Sale\n\nhi")))


class FakeCrawler(Crawler):
    PAGES = {
        "https://hotel.hr/": '<a href="/karriere">Karriere</a><a href="/kontakt">Kontakt</a> Welcome',
        "https://hotel.hr/karriere": (
            "<h1>We are hiring</h1><p>Bartender (m/f) and Waiter wanted. "
            "Staff accommodation. Work permit support.</p>"
        ),
        "https://hotel.hr/kontakt": "<p>Reception: info [at] hotel [dot] hr</p>",
    }

    def __init__(self, cfg):
        self.cfg = cfg

    async def fetch(self, url):
        html = self.PAGES.get(url)
        return (200, html, url) if html else (404, "", url)


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.cfg = Config.load()
        self.db = DB(":memory:")

    def test_crawl_company(self):
        res = run(FakeCrawler(self.cfg).crawl_company("https://hotel.hr/"))
        self.assertTrue(res.reachable)
        self.assertEqual(res.career_url, "https://hotel.hr/karriere")
        self.assertIn("info@hotel.hr", res.emails)
        self.assertIn("Bartender", res.career_text)

    def test_draft_template_is_valid_and_has_opt_out(self):
        company = {"name": "Hotel Grand", "city": "Zagreb", "country": "HR", "roles": "bartender", "summary": ""}
        subject, body, lang = run(make_draft(self.cfg, self.db, None, PROFILE, company))
        self.assertIn("Test Person", body)
        self.assertIn('reply with "stop"', body)
        self.assertNotIn("{", body)

    def test_end_to_end_company_to_draft(self):
        from jobhunter import agent as agent_mod

        sent = []

        class FakeTG:
            async def send(self, text, buttons=None, chat_id=None):
                sent.append((text, buttons))

        ag = agent_mod.Agent.__new__(agent_mod.Agent)
        ag.cfg, ag.db, ag.client, ag.tg = self.cfg, self.db, None, FakeTG()
        ag.crawler = FakeCrawler(self.cfg)
        ag.profile = lambda: PROFILE

        cid = self.db.add_company("Hotel Grand", "https://hotel.hr/", "hotel.hr", "HR", "Zagreb")
        with mock.patch.object(agent_mod, "check_mx", return_value=True):
            run(ag.process_company(cid))
        c = self.db.get_company(cid)
        self.assertEqual(c["status"], "analyzed")
        self.assertEqual(c["best_email"], "info@hotel.hr")
        self.assertEqual(c["has_job"], 1)
        self.assertGreaterEqual(c["score"], 70)
        self.assertGreaterEqual(c["job_suitability_score"], 75)
        self.assertEqual(c["sponsorship_category"], "B")
        draft = self.db.one("SELECT * FROM outbox")
        self.assertEqual((draft["status"], draft["to_email"]), ("draft", "info@hotel.hr"))
        self.assertTrue(sent and sent[0][1])

        self.db.set_company(cid, status="new")
        with mock.patch.object(agent_mod, "check_mx", return_value=True):
            run(ag.process_company(cid))
        self.assertEqual(self.db.one("SELECT COUNT(*) c FROM outbox")["c"], 1)


class CommandTests(unittest.TestCase):
    def setUp(self):
        from jobhunter.commands import Commands

        self.cfg = Config.load()
        self.db = DB(":memory:")
        self.out = []
        outer = self

        class FakeTG:
            async def send(self, text, buttons=None, chat_id=None):
                outer.out.append(text)

            async def answer(self, *a, **k):
                pass

            async def clear_buttons(self, *a, **k):
                pass

            async def send_document(self, path, caption=""):
                outer.out.append("DOC " + path)
                return True

        async def notify(*a, **k):
            pass

        self.cmds = Commands(self.cfg, self.db, FakeTG(), Mailer(self.cfg, self.db, lambda: PROFILE, notify))

    def say(self, text, chat=42):
        run(self.cmds.handle({"message": {"chat": {"id": chat}, "text": text}}))

    def test_find_status_and_security(self):
        self.say("/find Split HR all")
        row = self.db.one("SELECT * FROM searches")
        self.assertEqual((row["city"], row["country"], row["kinds"]), ("Split", "HR", "all"))
        self.say("/find Atlantis XX")
        self.assertEqual(self.db.one("SELECT COUNT(*) c FROM searches")["c"], 1)
        self.say("/status")
        self.assertIn("অবস্থা", self.out[-1])
        before = len(self.out)
        self.say("/pause", chat=999)
        self.assertEqual(len(self.out), before)
        self.assertNotEqual(self.db.kv_get("paused"), "1")

    def test_buttons_approve_and_review(self):
        rid = self.db.add_draft(None, "a@b.com", "S", "B", "en")
        cb = lambda d: run(
            self.cmds.handle(
                {"callback_query": {"id": "1", "data": d, "message": {"chat": {"id": 42}, "message_id": 7}}}
            )
        )
        cb(f"ap:{rid}")
        cb(f"ap:{rid}")
        self.assertEqual(self.db.get_outbox(rid)["status"], "approved")
        self.db.set_outbox(rid, status="needs_review")
        cb(f"rt:{rid}")
        self.assertEqual(self.db.get_outbox(rid)["status"], "approved")
        self.db.set_outbox(rid, status="needs_review")
        cb(f"ms:{rid}")
        self.assertEqual(self.db.get_outbox(rid)["status"], "sent")

    def test_modes_cap_suppress_export(self):
        self.say("/mode auto")
        self.assertEqual(self.db.kv_get("mode"), "auto")
        self.say("/cap 25")
        self.assertEqual(self.db.kv_get("daily_cap"), "25")
        self.say("/suppress @bad.com")
        self.assertTrue(self.db.is_suppressed("x@bad.com"))
        self.db.add_company("H", "https://h.hr/", "h.hr", "HR", "Zagreb")
        os.makedirs("data", exist_ok=True)
        self.say("/export")
        self.assertTrue(self.out[-1].startswith("DOC data/companies_"))
        for f in os.listdir("data"):
            if f.startswith("companies_"):
                os.remove(os.path.join("data", f))


if __name__ == "__main__":
    unittest.main()
