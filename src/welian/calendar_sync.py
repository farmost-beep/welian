"""Calendar sync — inject Welian todos into macOS Calendar.

Reads pending todos from local data, creates calendar events with
relationship context (last interaction, memories, leverage goals).

Ethical guardrails (AGENTS.md):
- Leverage todos: include goals, last interaction, professional context
- Nurture todos: include memories, important dates, warm language
- No ROI scoring, no auto-messaging, just calendar reminders

Usage:
  welian sync-calendar              # sync pending todos to Calendar
  welian sync-calendar --days 14    # look ahead 14 days
  welian sync-calendar --dry-run    # preview without creating events
  welian sync-calendar --clean      # remove events for completed todos
"""
import json
import os
import subprocess
from datetime import date, datetime, timedelta
from pathlib import Path

from . import engine

CALENDAR_NAME = "Welian"

# Sync map file: { todo_id: { event_id, synced_at, due, title } }
SYNC_FILE = engine._DATA_DIR / "calendar_sync.json"


# ── Sync map persistence ──

def _load_sync_map():
    if not SYNC_FILE.exists():
        return {}
    try:
        with open(SYNC_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}

def _save_sync_map(data):
    with open(SYNC_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ── AppleScript helpers ──

def _run_applescript(script):
    """Execute AppleScript via osascript, return stdout."""
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"AppleScript error: {result.stderr.strip()}")
    return result.stdout.strip()

def _ensure_welian_calendar():
    """Create 'Welian' calendar if it doesn't exist."""
    script = f'''
    tell application "Calendar"
        if not (exists calendar "{CALENDAR_NAME}") then
            make new calendar with properties {{name:"{CALENDAR_NAME}"}}
        end if
        return "ok"
    end tell
    '''
    _run_applescript(script)

def _create_event(title, start_dt, end_dt, description):
    """Create a calendar event, return its uid."""
    _ensure_welian_calendar()
    title_esc = _escape_applescript(title)
    desc_esc = _escape_applescript(description)
    # AppleScript date format: "YYYY,MM,DD,HH,MM,SS"
    start_str = start_dt.strftime("%Y,%m,%d,%H,%M,%S")
    end_str = end_dt.strftime("%Y,%m,%d,%H,%M,%S")

    script = f'''
    tell application "Calendar"
        tell calendar "{CALENDAR_NAME}"
            set newEvent to make new event with properties {{summary:"{title_esc}", start date:date "{start_str}", end date:date "{end_str}", description:"{desc_esc}"}}
            return uid of newEvent
        end tell
    end tell
    '''
    return _run_applescript(script)

def _delete_event(event_uid):
    """Delete a calendar event by uid."""
    uid_esc = _escape_applescript(event_uid)
    script = f'''
    tell application "Calendar"
        tell calendar "{CALENDAR_NAME}"
            if exists event id "{uid_esc}" then
                delete event id "{uid_esc}"
                return "deleted"
            end if
        end tell
    end tell
    '''
    return _run_applescript(script)

def _escape_applescript(text):
    """Escape characters for AppleScript string literals."""
    # Backslash first, then double quote
    text = text.replace("\\", "\\\\")
    text = text.replace('"', '\\"')
    # Collapse newlines — AppleScript string can't have literal newlines
    text = text.replace("\n", "\\n")
    return text


# ── Event content builder ──

def _build_event(todo, contact, due_date):
    """Build event title and description from a todo + contact.

    Ethical guardrail: leverage vs nurture get different language (AGENTS.md).
    """
    task = todo.get("task") or todo.get("content") or ""
    priority = todo.get("priority", "P1")

    if contact:
        name = contact.get("name", "")
        nature = engine.infer_nature(contact)

        # Title: 📌 联系人 — task前20字
        title = f"📌 {name} — {task[:20]}"

        desc_parts = ["📋 Welian 待办提醒", ""]
        desc_parts.append(f"待办：{task}")
        desc_parts.append(f"联系人：{name}")
        desc_parts.append(f"优先级：{priority}")
        desc_parts.append("")

        # 见面功课
        desc_parts.append("见面功课：")

        # Last interaction
        tls = engine.list_timeline(contact["id"], days=9999)
        if tls:
            last = tls[0]
            last_date_str = last.get("date", "")
            try:
                last_date = date.fromisoformat(last_date_str)
                days_ago = (date.today() - last_date).days
                last_summary = last.get("summary", "")[:50]
                desc_parts.append(f"· 上次互动：{last_date_str} {last_summary}（{days_ago}天前）")
            except (ValueError, TypeError):
                pass

        # Nature-specific context
        if nature == engine.NATURE_LEVERAGE:
            lev = contact.get("leverage") or {}
            if lev.get("goals"):
                goals_str = ", ".join(lev["goals"]) if isinstance(lev["goals"], list) else lev["goals"]
                desc_parts.append(f"· 锚定目标：{goals_str}")
            if lev.get("how"):
                desc_parts.append(f"· 联结方式：{lev['how'][:60]}")
            if contact.get("notes"):
                desc_parts.append(f"· 备注：{contact['notes'][:80]}")
        elif nature == engine.NATURE_NURTURE:
            memories = contact.get("memories", [])
            for m in memories[:3]:
                desc_parts.append(f"· 记得：{m.get('content', '')[:50]}")
            nurture = contact.get("nurture") or {}
            if nurture.get("bond"):
                desc_parts.append(f"· 你们的纽带：{nurture['bond'][:60]}")
            for d in contact.get("important_dates", [])[:2]:
                desc_parts.append(f"· 重要日期：{d.get('label', '')} ({d.get('date', '')})")
            desc_parts.append("· 用心陪伴，不需要理由 💛")
        else:
            # Dual: both professional and personal context
            if contact.get("notes"):
                desc_parts.append(f"· 备注：{contact['notes'][:80]}")
            memories = contact.get("memories", [])
            if memories:
                desc_parts.append(f"· 记得：{memories[0].get('content', '')[:50]}")

        desc_parts.append("")
        desc_parts.append("—— 小维帮你准备的，见面顺利 🤝")
        description = "\n".join(desc_parts)
    else:
        # No contact associated
        title = f"📌 {task[:25]}"
        description = f"📋 Welian 待办提醒\n\n待办：{task}\n优先级：{priority}\n\n—— 小维"

    return title, description


# ── Main sync logic ──

def sync_todos_to_calendar(dry_run=False, days_ahead=7, clean=False):
    """Sync pending todos to macOS Calendar.

    Args:
        dry_run: preview without creating events
        days_ahead: only sync todos due within this many days
        clean: remove calendar events for completed/cancelled todos

    Returns summary string.
    """
    sync_map = _load_sync_map()

    # Clean mode: remove events for completed todos
    if clean:
        removed = 0
        all_todos = engine.list_todos(status=None)
        for t in all_todos:
            if t.get("status") != "pending" and t["id"] in sync_map:
                entry = sync_map[t["id"]]
                event_uid = entry.get("event_id")
                if event_uid and not dry_run:
                    try:
                        _delete_event(event_uid)
                    except RuntimeError:
                        pass  # Event may already be gone
                del sync_map[t["id"]]
                removed += 1
        if not dry_run:
            _save_sync_map(sync_map)
        return f"清理完成：移除 {removed} 个已完成待办的日历事件"

    # Sync mode: create events for pending todos
    todos = engine.list_todos(status="pending")
    today = date.today()
    cutoff = today + timedelta(days=days_ahead)

    created = 0
    skipped = 0
    expired = 0
    errors = 0

    for t in todos:
        # Skip already synced
        if t["id"] in sync_map:
            skipped += 1
            continue

        due_str = t.get("due", "")
        if not due_str:
            continue

        try:
            due_date = date.fromisoformat(due_str[:10])
        except ValueError:
            continue

        # Skip if due date is too far ahead
        if due_date > cutoff:
            continue

        # Skip if due date is more than 1 day in the past
        if due_date < today - timedelta(days=1):
            expired += 1
            continue

        # Resolve contact — try ID first, then fuzzy name match
        contact_id = t.get("contact", "")
        contact = None
        if contact_id:
            contact = engine.get_contact(contact_id)
            if not contact:
                # contact field may be a name, not an ID — try fuzzy resolve
                contact, _ = engine.resolve_contact(contact_id)

        # Build event
        title, description = _build_event(t, contact, due_date)

        # Default time: 9:00-9:30 on due date
        start_dt = datetime(due_date.year, due_date.month, due_date.day, 9, 0)
        end_dt = datetime(due_date.year, due_date.month, due_date.day, 9, 30)

        if dry_run:
            print(f"  [DRY RUN] {title}")
            print(f"    日期：{due_str}")
            print(f"    描述：{description[:80]}...")
            print()
            created += 1
            continue

        try:
            event_uid = _create_event(title, start_dt, end_dt, description)
            if event_uid:
                sync_map[t["id"]] = {
                    "event_id": event_uid,
                    "synced_at": datetime.now().isoformat(),
                    "due": due_str,
                    "title": title,
                }
                created += 1
        except RuntimeError as e:
            print(f"  ✗ 创建失败：{title} — {e}")
            errors += 1

    if not dry_run:
        _save_sync_map(sync_map)

    parts = [f"同步完成：创建 {created} 个日历事件"]
    if skipped:
        parts.append(f"跳过 {skipped} 个已同步")
    if expired:
        parts.append(f"过期 {expired} 个")
    if errors:
        parts.append(f"失败 {errors} 个")
    return "，".join(parts)


# ── Launchd cron management ──

def _get_python_path():
    """Get the python3 path used by other welian launchd services."""
    # Try the same path as weekly plist
    candidate = "/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/bin/python3"
    if os.path.exists(candidate):
        return candidate
    # Fallback: find python3 in PATH
    result = subprocess.run(["which", "python3"], capture_output=True, text=True)
    return result.stdout.strip() or "python3"

def install_cron():
    """Install launchd cron for daily calendar sync (every day at 8:00 AM)."""
    user = os.environ.get("USER", "cyingfang")
    home = os.path.expanduser("~")
    welian_home = os.environ.get("WELIAN_HOME", f"{home}/.welian")
    python_path = _get_python_path()
    log_dir = f"{welian_home}/logs"
    os.makedirs(log_dir, exist_ok=True)

    plist_path = os.path.expanduser(f"~/Library/LaunchAgents/com.welian.calendar-sync.plist")

    # Check if already loaded
    result = subprocess.run(["launchctl", "list", "com.welian.calendar-sync"], capture_output=True)
    if result.returncode == 0:
        return False, "Calendar sync cron already installed. Run 'welian sync-calendar-uninstall' first."

    plist_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.welian.calendar-sync</string>

    <key>ProgramArguments</key>
    <array>
        <string>{python_path}</string>
        <string>-m</string>
        <string>welian.cli</string>
        <string>sync-calendar</string>
        <string>--clean</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>WELIAN_HOME</key>
        <string>{welian_home}</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:{home}/Library/Python/3.9/bin</string>
    </dict>

    <!-- Every day at 08:00 -->
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>{log_dir}/calendar-sync-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>{log_dir}/calendar-sync-stderr.log</string>

    <key>WorkingDirectory</key>
    <string>{home}</string>
</dict>
</plist>'''

    os.makedirs(os.path.dirname(plist_path), exist_ok=True)
    with open(plist_path, "w") as f:
        f.write(plist_content)

    subprocess.run(["launchctl", "load", plist_path], check=True)
    return True, plist_path

def uninstall_cron():
    """Uninstall launchd cron."""
    plist_path = os.path.expanduser("~/Library/LaunchAgents/com.welian.calendar-sync.plist")
    subprocess.run(["launchctl", "unload", plist_path], capture_output=True)
    if os.path.exists(plist_path):
        os.remove(plist_path)
    return True

def cron_status():
    """Check if cron is running."""
    result = subprocess.run(["launchctl", "list", "com.welian.calendar-sync"], capture_output=True)
    return result.returncode == 0, result.stdout.decode()
