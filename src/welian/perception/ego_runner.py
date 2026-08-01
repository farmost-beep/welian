"""EgoBrowserRunner — Python wrapper for ego-browser CLI.

Executes ego-browser nodejs heredoc scripts via subprocess, parses cliLog
output, and provides sensor-specific convenience methods.

Usage:
    runner = EgoBrowserRunner()
    result = runner.perceive_linkedin("zhang-san-123")
    if result["status"] == "needs_login":
        # user needs to log in via ego-browser handOff
        ...
    elif result["status"] == "success":
        data = result["data"]
"""
import json
import os
import shutil
import subprocess
import uuid
from typing import Any, Dict, Optional

# ── Exceptions ──

class PerceptionError(Exception):
    """Base error for perception layer failures."""

class EgoBrowserNotInstalled(PerceptionError):
    """ego-browser CLI is not on PATH."""

class EgoBrowserTimeout(PerceptionError):
    """ego-browser script exceeded timeout."""

class EgoBrowserScriptError(PerceptionError):
    """ego-browser script returned non-zero exit code."""


# ── Runner ──

_DEFAULT_TIMEOUT = 120  # seconds
_TASK_SPACE_PREFIX = "welian-"


class EgoBrowserRunner:
    """Runs ego-browser nodejs scripts and parses output.

    Each platform gets a persistent task space (e.g. welian-linkedin) so
    login state is preserved across perception runs.
    """

    def __init__(self, timeout: int = _DEFAULT_TIMEOUT):
        self._timeout = timeout
        self._cli_path = self._find_cli()

    def _find_cli(self) -> str:
        """Locate ego-browser executable."""
        path = shutil.which("ego-browser")
        if not path:
            # Check common install locations
            candidates = [
                os.path.expanduser("~/.local/bin/ego-browser"),
                "/usr/local/bin/ego-browser",
            ]
            for c in candidates:
                if os.path.isfile(c) and os.access(c, os.X_OK):
                    path = c
                    break
        if not path:
            raise EgoBrowserNotInstalled(
                "ego-browser not found. Install from https://lite.ego.app/download"
            )
        return path

    def run_script(self, script: str, timeout: Optional[int] = None) -> Dict[str, Any]:
        """Execute a ego-browser nodejs script and parse cliLog output.

        The script must use cliLog() to emit a JSON string as its final
        output. This method parses that JSON and returns it as a dict.

        Returns:
            dict with at least {"status": "success"|"error", ...}

        Raises:
            EgoBrowserTimeout: script exceeded timeout
            EgoBrowserScriptError: script exited non-zero
        """
        to = timeout or self._timeout
        try:
            result = subprocess.run(
                [self._cli_path, "nodejs"],
                input=script,
                capture_output=True,
                text=True,
                timeout=to,
            )
        except subprocess.TimeoutExpired:
            raise EgoBrowserTimeout(
                f"ego-browser script timed out after {to}s"
            )

        if result.returncode != 0:
            stderr = result.stderr.strip()[:500] if result.stderr else ""
            stdout = result.stdout.strip()[:500] if result.stdout else ""
            raise EgoBrowserScriptError(
                f"ego-browser exited {result.returncode}: {stderr or stdout}"
            )

        # Parse cliLog output — look for JSON lines
        return self._parse_output(result.stdout)

    def _parse_output(self, stdout: str) -> Dict[str, Any]:
        """Extract the last JSON object from cliLog output."""
        lines = stdout.strip().split("\n")
        # Walk backwards to find the last parseable JSON line
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                if isinstance(data, dict):
                    return data
            except json.JSONDecodeError:
                continue
        # No JSON found — return raw output as error
        return {
            "status": "error",
            "error": "no_json_output",
            "raw": stdout[-500:] if stdout else "",
        }

    # ── Platform-specific perception methods ──

    def perceive_linkedin(self, linkedin_id: str) -> Dict[str, Any]:
        """Perceive a LinkedIn contact's recent activity.

        Args:
            linkedin_id: LinkedIn profile slug (e.g. "zhang-san-123")

        Returns:
            {"status": "success", "data": {...}} or
            {"status": "needs_login", "url": "..."} or
            {"status": "error", "error": "..."}
        """
        script = _LINKEDIN_SCRIPT.format(
            task_space=_TASK_SPACE_PREFIX + "linkedin",
            linkedin_id=linkedin_id,
        )
        return self.run_script(script)

    def perceive_twitter(self, handle: str) -> Dict[str, Any]:
        """Perceive a Twitter/X contact's recent tweets.

        Args:
            handle: Twitter handle without @ (e.g. "zhangsan")

        Returns:
            {"status": "success", "data": [...]} or
            {"status": "needs_login"} or
            {"status": "error", "error": "..."}
        """
        script = _TWITTER_SCRIPT.format(
            task_space=_TASK_SPACE_PREFIX + "x",
            handle=handle,
        )
        return self.run_script(script)

    def perceive_github(self, username: str) -> Dict[str, Any]:
        """Perceive a GitHub user's recent activity.

        Args:
            username: GitHub username (e.g. "zhangsan")

        Returns:
            {"status": "success", "data": {...}} or
            {"status": "error", "error": "..."}
        """
        script = _GITHUB_SCRIPT.format(
            task_space=_TASK_SPACE_PREFIX + "github",
            username=username,
        )
        return self.run_script(script)

    def perceive_generic(self, url: str) -> Dict[str, Any]:
        """Perceive an arbitrary web page (semantic snapshot).

        Args:
            url: Full URL to perceive

        Returns:
            {"status": "success", "snapshot": "...", "url": "..."} or
            {"status": "error", "error": "..."}
        """
        task_id = str(uuid.uuid4())[:8]
        script = _GENERIC_SCRIPT.format(
            task_space=_TASK_SPACE_PREFIX + "generic-" + task_id,
            url=url,
        )
        return self.run_script(script)

    def check_available(self) -> bool:
        """Check if ego-browser is available and responsive."""
        try:
            result = self.run_script(
                "cliLog(JSON.stringify({status: 'ok'}))",
                timeout=10,
            )
            return result.get("status") == "ok"
        except PerceptionError:
            return False


# ── ego-browser nodejs scripts ──

_LINKEDIN_SCRIPT = """\
const task = await useOrCreateTaskSpace('{task_space}')
await openOrReuseTab('https://www.linkedin.com/in/{linkedin_id}/', {{ wait: true, timeout: 15 }})
await wait(3)

const info = await pageInfo()
if (info.url && (info.url.includes('/login') || info.url.includes('/signin') || info.url.includes('/uas/login'))) {{
    await handOffTaskSpace()
    cliLog(JSON.stringify({{ status: 'needs_login', url: info.url }}))
}} else {{
    const data = await js(String.raw`(() => {{
        const name = document.querySelector('h1')?.textContent?.trim() || ''
        const headline = document.querySelector('.text-body-medium')?.textContent?.trim() || ''
        const about = document.querySelector('#about')?.closest('section')?.textContent?.trim()?.substring(0, 500) || ''
        const expItems = [...document.querySelectorAll('#experience ~ * .pvs-entity, [data-field*="experience"] .pvs-entity')].slice(0, 3).map(el => el.textContent.trim().substring(0, 200))
        return {{ name, headline, about, recent_roles: expItems }}
    }})()`)
    cliLog(JSON.stringify({{ status: 'success', data: data }}))
}}
"""

_TWITTER_SCRIPT = """\
const task = await useOrCreateTaskSpace('{task_space}')
await openOrReuseTab('https://x.com/{handle}', {{ wait: true, timeout: 15 }})
await wait(3)

const info = await pageInfo()
if (info.url && (info.url.includes('/login') || info.url.includes('/i/flow/login'))) {{
    await handOffTaskSpace()
    cliLog(JSON.stringify({{ status: 'needs_login', url: info.url }}))
}} else {{
    const data = await js(String.raw`(() => {{
        const articles = [...document.querySelectorAll('article[data-testid="tweet"]')]
        return articles.slice(0, 5).map(a => ({{
            text: a.querySelector('[data-testid="tweetText"]')?.textContent?.trim()?.substring(0, 280) || '',
            time: a.querySelector('time')?.getAttribute('datetime') || '',
            likes: a.querySelector('[data-testid="like"]')?.textContent?.trim() || '0',
            retweets: a.querySelector('[data-testid="retweet"]')?.textContent?.trim() || '0'
        }}))
    }})()`)
    cliLog(JSON.stringify({{ status: 'success', data: data }}))
}}
"""

_GITHUB_SCRIPT = """\
const task = await useOrCreateTaskSpace('{task_space}')
await openOrReuseTab('https://github.com/{username}', {{ wait: true, timeout: 15 }})
await wait(3)

const data = await js(String.raw`(() => {{
    const name = document.querySelector('.vcard-fullname')?.textContent?.trim() || ''
    const bio = document.querySelector('.user-profile-bio')?.textContent?.trim() || ''
    const repos = [...document.querySelectorAll('.pinned-item-list-item')].slice(0, 6).map(r => ({{
        name: r.querySelector('.repo')?.textContent?.trim() || '',
        desc: r.querySelector('.pinned-item-desc')?.textContent?.trim()?.substring(0, 150) || '',
        stars: r.querySelector('.octicon-star')?.parentElement?.textContent?.trim() || '0'
    }}))
    const contrib = document.querySelector('.js-yearly-contributions')?.textContent?.trim()?.substring(0, 200) || ''
    return {{ name, bio, pinned_repos: repos, contribution_summary: contrib }}
}})()`)
cliLog(JSON.stringify({{ status: 'success', data: data }}))
"""

_GENERIC_SCRIPT = """\
const task = await useOrCreateTaskSpace('{task_space}')
await openOrReuseTab('{url}', {{ wait: true, timeout: 15 }})
await wait(3)
const snapshot = await snapshotText()
const info = await pageInfo()
cliLog(JSON.stringify({{ status: 'success', snapshot: snapshot.substring(0, 3000), url: info.url }}))
"""
