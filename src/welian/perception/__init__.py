"""Web perception layer for Welian — ego-browser powered sensors.

Uses ego-browser's CLI to drive a real Chromium browser in isolated task
spaces, inheriting the user's login state to perceive contacts' web
activity (LinkedIn, Twitter/X, GitHub, etc.).

Design principles:
- User login inheritance (no password storage, no OAuth)
- Task space isolation (one per platform, persistent)
- Semantic-first (snapshotText before raw DOM)
- On-demand perception (no bulk crawling)
- Human-in-the-loop (handOff on captcha/2FA)
- Privacy-embedded (raw data stays local, only summaries go to cloud)
"""
from .ego_runner import EgoBrowserRunner, PerceptionError
from .scheduler import PerceptionScheduler

__all__ = ["EgoBrowserRunner", "PerceptionScheduler", "PerceptionError"]
