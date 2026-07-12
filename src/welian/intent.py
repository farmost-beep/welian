"""Intent parser — natural language → action mapping.

Supports the four verbs (SPEC §4.2):
- 记 (record): "记一下：..." / "note: ..."
- 问 (ask): "该联系谁" / "who to reach out" / "明天见X，上次聊到哪了"
- 拟 (draft): "给X拟条消息" / "draft a message to X"
- 报 (report): "本月角色回顾" / "monthly review" / "周报"

Also supports:
- "X最近咋样" / "how is X doing" → nurture check
- "X是X" → set alias
- "帮助" / "help" → help text
"""
import re
from . import engine

# Intent types
INTENT_RECORD = "record"
INTENT_ASK = "ask"
INTENT_DRAFT = "draft"
INTENT_REPORT = "report"
INTENT_CHECK = "check"        # check a specific bond
INTENT_HELP = "help"
INTENT_UNKNOWN = "unknown"

# ── Patterns ──

RECORD_PATTERNS = [
    r"^[记记]\s*[一下下]*[:：]\s*(.+)",
    r"^note[:：\s]\s*(.+)",
    r"^记录[:：\s]\s*(.+)",
    r"^log[:：\s]\s*(.+)",
]

ASK_PATTERNS = [
    r"该联系谁", r"who.*(reach|contact|connect)", r"建议联系",
    r"本周.*联系", r"this week.*contact",
    r"明天见.*上次", r"见面.*功课",
]

DRAFT_PATTERNS = [
    r"^[给给](.+?)拟.*消息",
    r"^draft.*(?:message|msg).*?(?:to\s+)?(.+)",
    r"^拟.*消息.*给(.+)",
    r"^(.+?)的.*问候",
]

REPORT_PATTERNS = [
    r"角色回顾", r"月度.*报", r"本月.*回顾",
    r"monthly.*review", r"this month",
    r"周报", r"weekly.*report",
]

CHECK_PATTERNS = [
    r"^(.+?)最近咋样", r"^(.+?)怎么样",
    r"^how is (.+?) doing", r"^(.+?) status",
    r"^查.*(.+?)",
]

HELP_PATTERNS = [
    r"^帮助$", r"^help$", r"^怎么用", r"^what can you",
]

def parse(text):
    """Parse user text into (intent, payload) tuple."""
    t = text.strip()
    if not t:
        return INTENT_UNKNOWN, {}

    # Help
    for pat in HELP_PATTERNS:
        if re.search(pat, t, re.IGNORECASE):
            return INTENT_HELP, {}

    # Record
    for pat in RECORD_PATTERNS:
        m = re.match(pat, t, re.IGNORECASE)
        if m:
            content = m.group(1).strip()
            contact_name, summary = _extract_contact_and_summary(content)
            return INTENT_RECORD, {"contact": contact_name, "summary": summary, "raw": content}

    # Ask
    for pat in ASK_PATTERNS:
        if re.search(pat, t, re.IGNORECASE):
            return INTENT_ASK, {}

    # Report
    for pat in REPORT_PATTERNS:
        if re.search(pat, t, re.IGNORECASE):
            return INTENT_REPORT, {}

    # Draft
    for pat in DRAFT_PATTERNS:
        m = re.match(pat, t, re.IGNORECASE)
        if m:
            target = m.group(1).strip()
            return INTENT_DRAFT, {"target": target, "raw": t}

    # Check
    for pat in CHECK_PATTERNS:
        m = re.match(pat, t, re.IGNORECASE)
        if m:
            target = m.group(1).strip()
            return INTENT_CHECK, {"target": target}

    return INTENT_UNKNOWN, {"raw": t}

def _extract_contact_and_summary(content):
    """Extract contact name and summary from a record string.

    Examples:
    "和张总聊了预算方案" → ("张总", "聊了预算方案")
    "met with Sarah about Q3 plan" → ("Sarah", "met about Q3 plan")
    "老周父亲住院" → ("老周", "父亲住院")
    """
    # Chinese pattern: 和X.../跟X...
    m = re.match(r"^[和跟与](.+?)(?:聊了|说了|谈了|讨论了|沟通了|见了|吃了|通了)(.+)", content)
    if m:
        return m.group(1).strip(), content
    # English pattern: met with X / talked to X / called X
    m = re.match(r"^(?:met with|talked to|called|emailed|messaged)\s+(.+?)(?:\s+about\s+|\s+re\s+|$)", content, re.IGNORECASE)
    if m:
        return m.group(1).strip(), content
    # Fallback: first 2-3 chars might be a name
    # Try to resolve as contact name
    contact, _ = engine.resolve_contact(content[:4])
    if contact:
        return contact["name"], content
    # No contact found, return whole thing as summary
    return None, content
