"""PerceptionScheduler — orchestrates ego-browser sensors.

Manages trigger conditions, runs sensors in priority order, stores results,
and generates LLM-interpreted briefings for the user.

Trigger types:
- meeting:  "明天见XX" → perceive XX's recent activity before the meeting
- cooldown: daily scan of long-inactive contacts
- weekly:   Monday batch perception of key contacts
- signal:   signal engine detected anomaly → confirm via perception
- manual:   user explicitly requests perception
- new:      new contact added → enrich with web background
"""
import json
import os
import time
import uuid
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional

from .ego_runner import EgoBrowserRunner, PerceptionError
from .sensors import get_sensor, LinkedInSensor, TwitterSensor, GitHubSensor

# ── Trigger constants ──

TRIGGER_MEETING = "meeting"
TRIGGER_COOLDOWN = "cooldown"
TRIGGER_WEEKLY = "weekly"
TRIGGER_SIGNAL = "signal"
TRIGGER_MANUAL = "manual"
TRIGGER_NEW_CONTACT = "new_contact"


class PerceptionScheduler:
    """Schedules and executes perception tasks using ego-browser sensors.

    Integrates with Welian's engine for contact lookup and timeline storage.
    """

    def __init__(
        self,
        runner: Optional[EgoBrowserRunner] = None,
        store=None,
        llm_client=None,
    ):
        """Initialize scheduler.

        Args:
            runner: EgoBrowserRunner instance. If None, lazily created.
            store: DataStore for persistence. If None, uses engine's default.
            llm_client: LLM client for interpreting results. If None, lazily created.
        """
        self._runner = runner
        self._store = store
        self._llm = llm_client

    # ── Lazy initialization ──

    @property
    def runner(self) -> EgoBrowserRunner:
        if self._runner is None:
            self._runner = EgoBrowserRunner()
        return self._runner

    @property
    def store(self):
        if self._store is None:
            from ..engine import get_store
            self._store = get_store()
        return self._store

    @property
    def llm(self):
        if self._llm is None:
            from ..llm.router import get_client
            import os
            cloud_url = os.environ.get("WELIAN_CLOUD_URL", "")
            user_token = os.environ.get("WELIAN_USER_TOKEN", "")
            self._llm = get_client(cloud_url=cloud_url, user_token=user_token)
        return self._llm

    # ── Public API ──

    def trigger_for_meeting(self, contact_name: str) -> Dict[str, Any]:
        """Pre-meeting perception: gather contact's recent web activity.

        Triggered when user says "明天见XX" or similar.

        Args:
            contact_name: Contact name or alias to look up

        Returns:
            {"contact": {...}, "results": [...], "briefing": "..."}
        """
        contact = self._resolve_contact(contact_name)
        if not contact:
            return {
                "status": "error",
                "error": f"contact_not_found: {contact_name}",
            }

        results = self._run_sensors_for_contact(contact, TRIGGER_MEETING)
        briefing = self._generate_briefing(contact, results, "meeting")

        # Store perception log + memory
        self._log_perception(contact, TRIGGER_MEETING, results, briefing)
        if briefing:
            self._add_memory(contact, f"[会前感知] {briefing}")

        return {
            "status": "success",
            "contact": contact,
            "results": results,
            "briefing": briefing,
        }

    def trigger_for_cooldown(self, max_contacts: int = 10) -> List[Dict[str, Any]]:
        """Daily cooldown perception: scan long-inactive contacts.

        Args:
            max_contacts: Max contacts to perceive (rate-limit protection)

        Returns:
            List of perception results for cooled contacts
        """
        cooled = self._get_cooled_contacts(days=30, limit=max_contacts)
        all_results = []

        for contact in cooled:
            results = self._run_sensors_for_contact(contact, TRIGGER_COOLDOWN)
            briefing = self._generate_briefing(contact, results, "cooldown")
            self._log_perception(contact, TRIGGER_COOLDOWN, results, briefing)

            if briefing:
                all_results.append({
                    "contact": contact,
                    "results": results,
                    "briefing": briefing,
                })

            # Rate limit: 5-second pause between contacts
            time.sleep(5)

        return all_results

    def trigger_for_weekly(self, max_contacts: int = 20) -> List[Dict[str, Any]]:
        """Weekly batch perception: Monday scan of key contacts.

        Args:
            max_contacts: Max contacts to perceive

        Returns:
            List of perception results
        """
        key_contacts = self._get_key_contacts(limit=max_contacts)
        all_results = []

        # Process in batches of 5 with 60s pause between batches
        batch_size = 5
        for i in range(0, len(key_contacts), batch_size):
            batch = key_contacts[i : i + batch_size]
            for contact in batch:
                results = self._run_sensors_for_contact(contact, TRIGGER_WEEKLY)
                briefing = self._generate_briefing(contact, results, "weekly")
                self._log_perception(contact, TRIGGER_WEEKLY, results, briefing)

                all_results.append({
                    "contact": contact,
                    "results": results,
                    "briefing": briefing,
                })
                time.sleep(3)  # Small pause between contacts in batch

            # 60s pause between batches
            if i + batch_size < len(key_contacts):
                time.sleep(60)

        return all_results

    def trigger_manual(
        self, contact_name: str, platforms: List[str] = None
    ) -> Dict[str, Any]:
        """Manual perception: user explicitly requests.

        Args:
            contact_name: Contact to perceive
            platforms: List of platforms to perceive (default: all available)
        """
        contact = self._resolve_contact(contact_name)
        if not contact:
            return {"status": "error", "error": f"contact_not_found: {contact_name}"}

        results = self._run_sensors_for_contact(
            contact, TRIGGER_MANUAL, platforms=platforms
        )
        briefing = self._generate_briefing(contact, results, "manual")
        self._log_perception(contact, TRIGGER_MANUAL, results, briefing)

        return {
            "status": "success",
            "contact": contact,
            "results": results,
            "briefing": briefing,
        }

    def trigger_for_new_contact(self, contact_name: str) -> Dict[str, Any]:
        """New contact enrichment: gather web background.

        Triggered when user adds a new contact.
        """
        contact = self._resolve_contact(contact_name)
        if not contact:
            return {"status": "error", "error": f"contact_not_found: {contact_name}"}

        results = self._run_sensors_for_contact(contact, TRIGGER_NEW_CONTACT)
        briefing = self._generate_briefing(contact, results, "new_contact")
        self._log_perception(contact, TRIGGER_NEW_CONTACT, results, briefing)

        if briefing:
            self._add_memory(contact, f"[背景感知] {briefing}")

        return {
            "status": "success",
            "contact": contact,
            "results": results,
            "briefing": briefing,
        }

    # ── Internal methods ──

    def _run_sensors_for_contact(
        self,
        contact: dict,
        trigger: str,
        platforms: List[str] = None,
    ) -> List[Dict[str, Any]]:
        """Run all applicable sensors for a contact."""
        all_platforms = ["linkedin", "twitter", "github"]
        target_platforms = platforms or all_platforms

        results = []
        for platform in target_platforms:
            sensor = get_sensor(platform, self.runner)
            if sensor is None:
                continue
            try:
                result = sensor.perceive(contact)
                results.append(result)
            except PerceptionError as e:
                results.append({
                    "contact_id": contact.get("id", ""),
                    "platform": platform,
                    "status": "error",
                    "error": str(e),
                    "timestamp": datetime.now().isoformat(),
                })
            except Exception as e:
                results.append({
                    "contact_id": contact.get("id", ""),
                    "platform": platform,
                    "status": "error",
                    "error": f"unexpected: {e}",
                    "timestamp": datetime.now().isoformat(),
                })

        return results

    def _generate_briefing(
        self, contact: dict, results: List[Dict[str, Any]], trigger: str
    ) -> str:
        """Use LLM to interpret perception results into a briefing."""
        # Collect successful data
        signals = []
        data_parts = []
        needs_login = []

        for r in results:
            if r.get("status") == "success":
                data = r.get("data", {})
                sigs = data.get("signals", [])
                signals.extend(sigs)
                # Collect data for LLM context
                platform = r.get("platform", "")
                data_parts.append(f"[{platform}] {json.dumps(data, ensure_ascii=False)[:500]}")
            elif r.get("status") == "needs_login":
                needs_login.append(r.get("platform", ""))

        if not data_parts and not needs_login:
            return ""

        # Build LLM prompt
        name = contact.get("name", "联系人")
        context_parts = []
        if data_parts:
            context_parts.append("感知到的动态：\n" + "\n".join(data_parts))
        if needs_login:
            context_parts.append(
                f"以下平台需要登录才能感知：{', '.join(needs_login)}"
            )

        trigger_desc = {
            TRIGGER_MEETING: "会前功课",
            TRIGGER_COOLDOWN: "冷却期检查",
            TRIGGER_WEEKLY: "周报聚合",
            TRIGGER_SIGNAL: "信号确认",
            TRIGGER_MANUAL: "用户主动查询",
            TRIGGER_NEW_CONTACT: "新联系人背景",
        }.get(trigger, "感知")

        system = f"""你是 Welian 关系网络智能体的感知层。根据 ego-browser 从 Web 上感知到的{name}的动态，生成一段简洁的中文简报。

要求：
1. 100-200字
2. 只包含有价值的信号，不罗列原始数据
3. 如果有重大变动（职位变化、高互动帖子等），优先提及
4. 如果没有有价值的信号，返回空字符串
5. 不要编造数据中没有的信息
6. 不要使用"你"称呼用户"""

        prompt = f"触发原因：{trigger_desc}\n联系人：{name}\n\n" + "\n\n".join(context_parts)

        try:
            briefing = self.llm.complete(prompt, system=system, max_tokens=300, temperature=0.3)
            return briefing.strip()
        except Exception:
            # Fallback: simple signal summary
            if signals:
                return "；".join(s["description"] for s in signals[:3])
            return ""

    def _resolve_contact(self, name: str) -> Optional[dict]:
        """Resolve a contact by name or alias."""
        from ..engine import resolve_contact
        contact, _ = resolve_contact(name)
        return contact

    def _get_cooled_contacts(self, days: int = 30, limit: int = 10) -> List[dict]:
        """Get contacts with no interaction in N days (leverage only)."""
        from ..engine import list_contacts, _days_since_last, NATURE_LEVERAGE, NATURE_DUAL

        contacts = list_contacts(nature=NATURE_LEVERAGE) + [
            c for c in list_contacts(nature=NATURE_DUAL)
        ]
        cooled = []
        for c in contacts:
            if c.get("relation") == "self":
                continue
            days_since = _days_since_last(c["id"])
            if days_since >= days:
                cooled.append(c)
        cooled.sort(key=lambda c: -_days_since_last(c["id"]))
        return cooled[:limit]

    def _get_key_contacts(self, limit: int = 20) -> List[dict]:
        """Get key contacts for weekly perception (leverage + dual, sorted by strength)."""
        from ..engine import list_contacts, NATURE_LEVERAGE, NATURE_DUAL

        contacts = list_contacts(nature=NATURE_LEVERAGE) + [
            c for c in list_contacts(nature=NATURE_DUAL)
        ]
        contacts = [c for c in contacts if c.get("relation") != "self"]
        contacts.sort(key=lambda c: -(c.get("strength", 1)))
        return contacts[:limit]

    def _log_perception(
        self,
        contact: dict,
        trigger: str,
        results: List[Dict[str, Any]],
        briefing: str,
    ):
        """Store perception log in SQLite."""
        log_id = str(uuid.uuid4())[:12]
        record = {
            "id": log_id,
            "contact_id": contact.get("id", ""),
            "contact_name": contact.get("name", ""),
            "trigger": trigger,
            "timestamp": datetime.now().isoformat(),
            "results": results,
            "briefing": briefing,
        }
        try:
            self.store.db.conn.execute(
                "INSERT OR REPLACE INTO perception_log (id, contact_id, sensor, trigger, status, data, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    log_id,
                    contact.get("id", ""),
                    ",".join(r.get("platform", "") for r in results),
                    trigger,
                    "success" if any(r.get("status") == "success" for r in results) else "failed",
                    json.dumps(results, ensure_ascii=False),
                    briefing,
                    datetime.now().isoformat(),
                ),
            )
            self.store.db.conn.commit()
        except Exception:
            pass  # Table may not exist yet — non-fatal

    def _add_memory(self, contact: dict, content: str):
        """Add a memory entry to the contact."""
        try:
            from ..engine import add_memory
            add_memory(contact["id"], content)
        except Exception:
            pass  # Non-fatal

    # ── Query methods ──

    def get_perception_history(
        self, contact_id: str = None, days: int = 30
    ) -> List[Dict[str, Any]]:
        """Query perception history from SQLite."""
        since = (date.today() - timedelta(days=days)).isoformat()
        sql = "SELECT * FROM perception_log WHERE created_at >= ?"
        params = [since]
        if contact_id:
            sql += " AND contact_id = ?"
            params.append(contact_id)
        sql += " ORDER BY created_at DESC LIMIT 100"
        try:
            rows = self.store.db.conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]
        except Exception:
            return []

    def is_available(self) -> bool:
        """Check if ego-browser is available."""
        try:
            return self.runner.check_available()
        except PerceptionError:
            return False
