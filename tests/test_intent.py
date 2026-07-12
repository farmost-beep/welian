"""Tests for intent parser — four verbs (记/问/拟/报)."""
import unittest
import os
import tempfile

_test_dir = tempfile.mkdtemp(prefix="welian_intent_")
os.environ["WELIAN_HOME"] = _test_dir

from welian import intent

class TestIntentParse(unittest.TestCase):
    def test_record_chinese(self):
        i, p = intent.parse("记一下：和张总聊了预算方案")
        self.assertEqual(i, intent.INTENT_RECORD)
        self.assertIn("张总", p.get("summary", ""))

    def test_record_english(self):
        i, p = intent.parse("note: met with Sarah about Q3 plan")
        self.assertEqual(i, intent.INTENT_RECORD)

    def test_ask_chinese(self):
        i, p = intent.parse("该联系谁")
        self.assertEqual(i, intent.INTENT_ASK)

    def test_ask_english(self):
        i, p = intent.parse("who to reach out this week")
        self.assertEqual(i, intent.INTENT_ASK)

    def test_draft_chinese(self):
        i, p = intent.parse("给老同学拟条消息")
        self.assertEqual(i, intent.INTENT_DRAFT)
        self.assertIn("老同学", p.get("target", ""))

    def test_draft_english(self):
        i, p = intent.parse("draft a message to an old friend")
        self.assertEqual(i, intent.INTENT_DRAFT)

    def test_report_chinese(self):
        i, p = intent.parse("本月角色回顾")
        self.assertEqual(i, intent.INTENT_REPORT)

    def test_report_english(self):
        i, p = intent.parse("monthly review")
        self.assertEqual(i, intent.INTENT_REPORT)

    def test_check_chinese(self):
        i, p = intent.parse("老周最近咋样")
        self.assertEqual(i, intent.INTENT_CHECK)
        self.assertIn("老周", p.get("target", ""))

    def test_check_english(self):
        i, p = intent.parse("how is Sarah doing")
        self.assertEqual(i, intent.INTENT_CHECK)

    def test_help(self):
        i, p = intent.parse("help")
        self.assertEqual(i, intent.INTENT_HELP)

    def test_unknown(self):
        i, p = intent.parse("今天天气真好")
        self.assertEqual(i, intent.INTENT_UNKNOWN)

class TestContactExtraction(unittest.TestCase):
    def test_extract_chinese_pattern(self):
        name, summary = intent._extract_contact_and_summary("和张总聊了预算方案")
        self.assertEqual(name, "张总")

    def test_extract_english_pattern(self):
        name, summary = intent._extract_contact_and_summary("met with Sarah about Q3 plan")
        self.assertEqual(name, "Sarah")

if __name__ == "__main__":
    unittest.main()
