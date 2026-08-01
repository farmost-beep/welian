"""Sensor base class and platform sensors for Welian perception layer.

Each sensor wraps an ego-browser script to perceive a specific platform.
Sensors return structured data that the scheduler feeds into the LLM for
interpretation and storage.
"""
import json
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..ego_runner import EgoBrowserRunner, PerceptionError


class Sensor:
    """Base sensor — defines the perceive interface."""

    PLATFORM = "generic"

    def __init__(self, runner: EgoBrowserRunner):
        self._runner = runner

    def perceive(self, contact: dict) -> Dict[str, Any]:
        """Perceive a contact's activity on this platform.

        Args:
            contact: Contact dict with platform-specific IDs

        Returns:
            {"status": "success"|"needs_login"|"error"|"skipped", ...}
        """
        raise NotImplementedError

    def _build_result(
        self, contact: dict, status: str, data=None, error=""
    ) -> Dict[str, Any]:
        return {
            "contact_id": contact.get("id", ""),
            "contact_name": contact.get("name", ""),
            "platform": self.PLATFORM,
            "status": status,
            "data": data or {},
            "error": error,
            "timestamp": datetime.now().isoformat(),
        }


class LinkedInSensor(Sensor):
    """Perceives LinkedIn profile changes and activity."""

    PLATFORM = "linkedin"

    def perceive(self, contact: dict) -> Dict[str, Any]:
        linkedin_id = self._extract_linkedin_id(contact)
        if not linkedin_id:
            return self._build_result(contact, "skipped", error="no_linkedin_id")

        try:
            result = self._runner.perceive_linkedin(linkedin_id)
        except PerceptionError as e:
            return self._build_result(contact, "error", error=str(e))

        if result.get("status") == "needs_login":
            return self._build_result(
                contact, "needs_login", error=result.get("url", "")
            )
        if result.get("status") != "success":
            return self._build_result(
                contact, "error", error=result.get("error", "unknown")
            )

        data = result.get("data", {})
        signals = self._extract_signals(data, contact)
        return self._build_result(
            contact, "success", data={**data, "signals": signals}
        )

    def _extract_linkedin_id(self, contact: dict) -> str:
        """Extract LinkedIn profile slug from contact."""
        # Check dedicated field
        lid = contact.get("linkedin_id", "")
        if lid:
            return lid
        # Check social links
        for link in contact.get("social_links", []):
            if "linkedin.com/in/" in link:
                return link.rstrip("/").split("/in/")[-1]
        # Check notes for LinkedIn URL
        for m in contact.get("memories", []):
            content = m.get("content", "")
            if "linkedin.com/in/" in content:
                import re
                m_match = re.search(r"linkedin\.com/in/([\w\-]+)", content)
                if m_match:
                    return m_match.group(1)
        return ""

    def _extract_signals(self, data: dict, contact: dict) -> List[Dict[str, Any]]:
        """Extract actionable signals from LinkedIn data."""
        signals = []
        name = contact.get("name", "联系人")

        # Job change signal — compare headline with known role
        headline = data.get("headline", "")
        known_role = contact.get("relation", "")
        if headline and known_role and known_role.lower() not in headline.lower():
            signals.append({
                "type": "potential_job_change",
                "description": f"{name}的LinkedIn标题可能已变更：{headline}",
                "priority": "high",
            })

        # Recent activity
        about = data.get("about", "")
        if about:
            signals.append({
                "type": "profile_update",
                "description": f"{name}更新了LinkedIn简介",
                "priority": "low",
            })

        return signals


class TwitterSensor(Sensor):
    """Perceives Twitter/X recent tweets and engagement."""

    PLATFORM = "twitter"

    def perceive(self, contact: dict) -> Dict[str, Any]:
        handle = self._extract_twitter_handle(contact)
        if not handle:
            return self._build_result(contact, "skipped", error="no_twitter_handle")

        try:
            result = self._runner.perceive_twitter(handle)
        except PerceptionError as e:
            return self._build_result(contact, "error", error=str(e))

        if result.get("status") == "needs_login":
            return self._build_result(contact, "needs_login")
        if result.get("status") != "success":
            return self._build_result(
                contact, "error", error=result.get("error", "unknown")
            )

        tweets = result.get("data", [])
        signals = self._extract_signals(tweets, contact)
        return self._build_result(
            contact, "success", data={"tweets": tweets, "signals": signals}
        )

    def _extract_twitter_handle(self, contact: dict) -> str:
        """Extract Twitter handle (without @) from contact."""
        handle = contact.get("twitter_handle", "")
        if handle:
            return handle.lstrip("@")
        for link in contact.get("social_links", []):
            if "x.com/" in link or "twitter.com/" in link:
                handle = link.rstrip("/").split("/")[-1]
                if handle and handle != "home":
                    return handle.lstrip("@")
        return ""

    def _extract_signals(self, tweets: list, contact: dict) -> List[Dict[str, Any]]:
        """Extract signals from recent tweets."""
        signals = []
        name = contact.get("name", "联系人")

        if not tweets:
            signals.append({
                "type": "inactive",
                "description": f"{name}近期没有发推",
                "priority": "low",
            })
            return signals

        # High engagement tweet
        for tweet in tweets[:3]:
            try:
                likes = int(tweet.get("likes", "0").replace("K", "000").replace("M", "000000"))
            except (ValueError, TypeError):
                likes = 0
            if likes >= 100:
                signals.append({
                    "type": "high_engagement_post",
                    "description": f"{name}的一条推文获得{likes}+赞：{tweet.get('text', '')[:80]}",
                    "priority": "medium",
                })

        # Recent activity
        if len(tweets) >= 3:
            signals.append({
                "type": "active_posting",
                "description": f"{name}近期发布了{len(tweets)}条推文",
                "priority": "low",
            })

        return signals


class GitHubSensor(Sensor):
    """Perceives GitHub activity — repos, contributions."""

    PLATFORM = "github"

    def perceive(self, contact: dict) -> Dict[str, Any]:
        username = contact.get("github_username", "")
        if not username:
            return self._build_result(contact, "skipped", error="no_github_username")

        try:
            result = self._runner.perceive_github(username)
        except PerceptionError as e:
            return self._build_result(contact, "error", error=str(e))

        if result.get("status") != "success":
            return self._build_result(
                contact, "error", error=result.get("error", "unknown")
            )

        data = result.get("data", {})
        signals = self._extract_signals(data, contact)
        return self._build_result(
            contact, "success", data={**data, "signals": signals}
        )

    def _extract_signals(self, data: dict, contact: dict) -> List[Dict[str, Any]]:
        signals = []
        name = contact.get("name", "联系人")

        repos = data.get("pinned_repos", [])
        if repos:
            signals.append({
                "type": "active_developer",
                "description": f"{name}有{len(repos)}个pinned repo",
                "priority": "low",
            })

        contrib = data.get("contribution_summary", "")
        if contrib and "0 contributions" not in contrib.lower():
            signals.append({
                "type": "contributing",
                "description": f"{name}在GitHub上有活跃贡献",
                "priority": "low",
            })

        return signals


class GenericWebSensor(Sensor):
    """Perceives an arbitrary web page via semantic snapshot."""

    PLATFORM = "generic_web"

    def perceive(self, contact: dict, url: str = None) -> Dict[str, Any]:
        if not url:
            # Try to extract URL from contact
            url = contact.get("website", "")
            if not url:
                return self._build_result(contact, "skipped", error="no_url")

        try:
            result = self._runner.perceive_generic(url)
        except PerceptionError as e:
            return self._build_result(contact, "error", error=str(e))

        if result.get("status") != "success":
            return self._build_result(
                contact, "error", error=result.get("error", "unknown")
            )

        return self._build_result(
            contact, "success",
            data={"snapshot": result.get("snapshot", ""), "url": result.get("url", url)}
        )


# ── Sensor registry ──

SENSORS = {
    "linkedin": LinkedInSensor,
    "twitter": TwitterSensor,
    "github": GitHubSensor,
    "generic_web": GenericWebSensor,
}


def get_sensor(platform: str, runner: EgoBrowserRunner) -> Optional[Sensor]:
    """Get a sensor instance for a platform."""
    cls = SENSORS.get(platform)
    if cls:
        return cls(runner)
    return None
