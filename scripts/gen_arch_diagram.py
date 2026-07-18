#!/usr/bin/env python3
"""Generate architecture diagram PNG for PDF embedding."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from pathlib import Path

# CJK font
plt.rcParams["font.sans-serif"] = ["STHeiti", "PingFang SC", "Heiti SC", "Arial Unicode MS"]
plt.rcParams["axes.unicode_minus"] = False

OUTPUT = Path("/tmp/welian_arch_diagram.png")

# Colors
C_USER = "#4A90D9"
C_EDGE = "#4A6741"
C_CLOUD = "#D97706"
C_DATA = "#8B5CF6"
C_BG = "#FAFAF7"
C_BORDER = "#E0E0E0"

fig, ax = plt.subplots(1, 1, figsize=(14, 10), dpi=150)
ax.set_xlim(0, 14)
ax.set_ylim(0, 10)
ax.axis("off")
ax.set_aspect("equal")


def box(x, y, w, h, text, color, fontsize=9, textcolor="white", bold=False):
    """Draw a rounded box with centered text."""
    rect = FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.08",
        facecolor=color, edgecolor=color, linewidth=1.5, alpha=0.9,
    )
    ax.add_patch(rect)
    weight = "bold" if bold else "normal"
    ax.text(x + w / 2, y + h / 2, text,
            ha="center", va="center", fontsize=fontsize,
            color=textcolor, fontweight=weight, linespacing=1.4)


def arrow(x1, y1, x2, y2, color="#666666", style="->", lw=1.2):
    """Draw an arrow."""
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle=style, color=color, lw=lw))


def label(x, y, text, fontsize=7, color="#555555"):
    ax.text(x, y, text, ha="center", va="center", fontsize=fontsize, color=color)

# ── Layer labels (left side) ──
ax.text(0.3, 8.8, "用户交互层", ha="center", va="center", fontsize=11,
        fontweight="bold", color=C_USER, rotation=90)
ax.text(0.3, 5.5, "边缘端\n(用户设备)", ha="center", va="center", fontsize=11,
        fontweight="bold", color=C_EDGE, rotation=90)
ax.text(0.3, 1.8, "云端\n(Cloudflare)", ha="center", va="center", fontsize=11,
        fontweight="bold", color=C_CLOUD, rotation=90)

# ── Layer 1: User Interaction ──
box(1.0, 8.2, 2.2, 1.0, "微信 Bot\n(ilink)", C_USER, fontsize=9, bold=True)
box(3.6, 8.2, 2.2, 1.0, "Web 前端\n(Pages)", C_USER, fontsize=9, bold=True)
box(6.2, 8.2, 2.2, 1.0, "CLI\n(welian)", C_USER, fontsize=9, bold=True)
box(8.8, 8.2, 2.2, 1.0, "微信小程序\n(规划中)", C_USER, fontsize=8)
box(11.4, 8.2, 2.2, 1.0, "macOS\nCalendar", C_USER, fontsize=9, bold=True)

# ── Layer 2: Edge (user device) ──
# Big container
edge_bg = FancyBboxPatch(
    (1.0, 3.5), 12.6, 4.2,
    boxstyle="round,pad=0.15",
    facecolor="#F0F0EB", edgecolor=C_EDGE, linewidth=2, alpha=0.3,
)
ax.add_patch(edge_bg)
ax.text(7.3, 7.4, "边缘端 — 用户设备", ha="center", va="center",
        fontsize=10, fontweight="bold", color=C_EDGE)

# Sub-modules
box(1.3, 5.8, 2.5, 1.2, "EdgeClient\n(edge.py)\nchat / cloud_chat", C_EDGE, fontsize=8)
box(4.1, 5.8, 2.5, 1.2, "Engine\n(engine.py)\n记/问/拟/报", C_EDGE, fontsize=8)
box(6.9, 5.8, 2.5, 1.2, "Intent\n(intent.py)\nLLM+regex", C_EDGE, fontsize=8)
box(9.7, 5.8, 2.8, 1.2, "Calendar Sync\n(calendar_sync.py)", C_EDGE, fontsize=8)

# DataStore
box(1.3, 3.8, 5.3, 1.5, "DataStore (datastore.py)\nper-user SQLite: welian.db\ncontacts | timeline | todos | usage", C_DATA, fontsize=8, bold=True)

# LLM Router
box(7.0, 3.8, 5.5, 1.5, "LLM Router (llm/router.py)\nClaude | OpenAI | Cloud\n工厂模式 + 自适应路由", C_DATA, fontsize=8, bold=True)

# Arrows: EdgeClient → Engine, Intent
arrow(2.55, 5.8, 5.35, 5.8, C_EDGE)
arrow(5.35, 5.8, 6.9, 5.8, C_EDGE)
arrow(8.2, 5.8, 9.7, 5.8, C_EDGE)

# Arrows: modules → DataStore
arrow(2.55, 5.8, 3.95, 5.3, "#888888", lw=1)
arrow(5.35, 5.8, 3.95, 5.3, "#888888", lw=1)

# Arrow: LLM Router → Cloud (down)
arrow(9.75, 3.8, 9.75, 2.8, C_CLOUD, lw=2)
label(10.8, 3.3, "最小上下文片段", fontsize=7, color=C_CLOUD)

# ── Layer 3: Cloud (Cloudflare Worker) ──
cloud_bg = FancyBboxPatch(
    (1.0, 0.3), 12.6, 2.5,
    boxstyle="round,pad=0.15",
    facecolor="#FFF8F0", edgecolor=C_CLOUD, linewidth=2, alpha=0.3,
)
ax.add_patch(cloud_bg)
ax.text(7.3, 2.5, "云端 — Cloudflare Worker (worker.js, 6707行)", ha="center", va="center",
        fontsize=10, fontweight="bold", color=C_CLOUD)

box(1.3, 0.6, 2.2, 1.5, "AI 路由\n/ai/chat\n/ai/draft\n/ai/advise", C_CLOUD, fontsize=7)
box(3.8, 0.6, 2.2, 1.5, "数据 CRUD\n/data/pull\n/data/push\n/data/sync", C_CLOUD, fontsize=7)
box(6.3, 0.6, 2.2, 1.5, "计费网关\ndeductBilling\ncalcPoints\ngetRemaining", C_CLOUD, fontsize=7)
box(8.8, 0.6, 2.2, 1.5, "认证\nClerk JWT\nSMS OTP", C_CLOUD, fontsize=7)
box(11.3, 0.6, 2.0, 1.5, "监控\nSentry\nCron", C_CLOUD, fontsize=7)

# Arrows: User layer → Edge
arrow(2.1, 8.2, 2.1, 7.0, "#666666", lw=1.5)   # 微信Bot → EdgeClient
arrow(4.7, 8.2, 4.7, 7.0, "#666666", lw=1.5)   # Web → Agent (approx)
arrow(7.3, 8.2, 7.3, 7.0, "#666666", lw=1.5)   # CLI → Engine
arrow(12.5, 8.2, 12.5, 7.0, "#666666", lw=1.5) # Calendar → CalendarSync

# Title
ax.text(7.0, 9.7, "Welian 系统架构图", ha="center", va="center",
        fontsize=14, fontweight="bold", color="#333333")

plt.tight_layout(pad=0.5)
fig.savefig(str(OUTPUT), dpi=150, bbox_inches="tight", facecolor="white")
print(f"Architecture diagram saved: {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")
