#!/usr/bin/env python3
"""
AGI Monitor Engine — 每日AGI进展监测与分析

死循环运行：采集 → 分析 → 报告 → 学习 → 再采集
每天生成一篇深度分析报告，追踪AGI最有可能的突破方向。

数据源：
  1. arxiv — 最新AI论文（API）
  2. GitHub — AI/ML trending仓库（爬取）
  3. HuggingFace — 新模型动态（API）
  4. RSS — AI新闻源和公司博客
  5. Benchmarks — AI基准排行榜变化

用法：
  python3 agi_monitor.py              # 跑一轮
  python3 agi_monitor.py --loop       # 死循环（每天一轮）
  python3 agi_monitor.py --report     # 只生成报告（用缓存数据）
"""

import json
import os
import re
import sqlite3
import sys
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

# ─── 配置 ───
HOME = Path.home()
DATA_DIR = HOME / ".welian" / "agi_monitor"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "agi.db"
REPORT_DIR = DATA_DIR / "reports"
REPORT_DIR.mkdir(exist_ok=True)

# LLM 配置（复用 MiniMax）
LLM_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.minimaxi.com/v1")
LLM_API_KEY = os.environ.get("OPENAI_API_KEY", "")
LLM_MODEL = os.environ.get("AGI_MONITOR_MODEL", "MiniMax-M3")

# 监测关键词
AGI_KEYWORDS = [
    "AGI", "artificial general intelligence", "frontier model",
    "reasoning", "planning", "world model", "agent",
    "self-play", "reinforcement learning", "scaling",
    "emergent ability", "chain of thought", "tool use",
    "multimodal", "embodied AI", "robotics",
    "benchmark", "GPT", "Claude", "Gemini", "Llama",
    "o1", "o3", "reasoning model", "inference scaling",
    "test-time compute", "constitutional AI", "RLHF",
    "mixture of experts", "sparse model", "long context",
    "AI safety", "alignment", "interpretability",
    "scaling laws", "compute optimal", "chinchilla",
]

# 监测的 arxiv 分类
ARXIV_CATEGORIES = ["cs.AI", "cs.CL", "cs.LG", "cs.MA", "cs.RO"]

# RSS 源
RSS_FEEDS = [
    # 公司博客
    ("OpenAI", "https://openai.com/blog/rss.xml"),
    ("DeepMind", "https://deepmind.google/blog/rss.xml"),
    ("HuggingFace", "https://huggingface.co/blog/feed.xml"),
    # AI 新闻
    ("MIT Tech Review AI", "https://www.technologyreview.com/topic/artificial-intelligence/feed"),
    ("AI News", "https://artificialintelligence-news.com/feed/"),
    ("TechCrunch AI", "https://techcrunch.com/category/artificial-intelligence/feed/"),
    ("The Decoder", "https://the-decoder.com/feed/"),
]

# 关键研究者 X/Twitter（通过 RSS bridge 或 nitter）
KEY_RESEARCHERS = [
    "ylecun", "sama", "karpathy", "demaboris", "gdb",
    "AnthropicAI", "OpenAI", "GoogleDeepMind", "xai",
    "DeepSeek_AI", "MistralAI", "Figure_AI",
]

# ─── 数据库 ───
def init_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS papers (
            id TEXT PRIMARY KEY,
            title TEXT, authors TEXT, abstract TEXT,
            categories TEXT, published TEXT, url TEXT,
            collected_at TEXT
        );
        CREATE TABLE IF NOT EXISTS models (
            id TEXT PRIMARY KEY,
            name TEXT, author TEXT, downloads INTEGER,
            likes INTEGER, tags TEXT, created_at TEXT,
            collected_at TEXT
        );
        CREATE TABLE IF NOT EXISTS repos (
            id TEXT PRIMARY KEY,
            name TEXT, description TEXT, stars INTEGER,
            language TEXT, url TEXT, collected_at TEXT
        );
        CREATE TABLE IF NOT EXISTS news (
            id TEXT PRIMARY KEY,
            source TEXT, title TEXT, summary TEXT,
            url TEXT, published TEXT, collected_at TEXT
        );
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            date TEXT, content TEXT, created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT, signal_type TEXT, entity TEXT,
            description TEXT, significance INTEGER,
            created_at TEXT
        );
    """)
    conn.commit()
    return conn


# ─── 数据源：arxiv ───
def fetch_arxiv(conn, days=1):
    """从 arxiv API 获取最新 AI 论文"""
    papers = []
    today = datetime.utcnow()
    date_from = (today - timedelta(days=days)).strftime("%Y%m%d")
    date_to = today.strftime("%Y%m%d")

    # 搜索 AGI 相关关键词
    query = " OR ".join(f"abs:%22{k}%22" for k in [
        "AGI", "artificial general intelligence",
        "frontier model", "reasoning model",
        "world model", "scaling laws",
        "emergent ability", "test-time compute",
        "inference scaling", "self-improving AI",
    ])
    url = (
        f"http://export.arxiv.org/api/query?search_query={urllib.parse.quote(query)}"
        f"&start=0&max_results=50"
        f"&sortBy=submittedDate&sortOrder=descending"
    )

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AGI-Monitor/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            xml_data = resp.read().decode("utf-8")
        root = ET.fromstring(xml_data)
        ns = {"atom": "http://www.w3.org/2005/Atom"}

        for entry in root.findall("atom:entry", ns):
            paper_id = entry.find("atom:id", ns).text.split("/")[-1]
            title = entry.find("atom:title", ns).text.strip().replace("\n", " ")
            abstract = entry.find("atom:summary", ns).text.strip().replace("\n", " ")
            published = entry.find("atom:published", ns).text
            authors = ", ".join(a.find("atom:name", ns).text for a in entry.findall("atom:author", ns))
            categories = ",".join(t.attrib.get("term", "") for t in entry.findall("atom:category", ns))
            link = entry.find("atom:id", ns).text

            # 存入数据库（去重）
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO papers VALUES (?,?,?,?,?,?,?,?)",
                    (paper_id, title, authors, abstract[:2000], categories,
                     published, link, datetime.now().isoformat())
                )
                papers.append({"title": title, "abstract": abstract[:500],
                               "authors": authors[:100], "url": link})
            except sqlite3.IntegrityError:
                pass

        conn.commit()
        print(f"  [arxiv] 收集 {len(papers)} 篇新论文")
    except Exception as e:
        print(f"  [arxiv] 错误: {e}")
    return papers


# ─── 数据源：HuggingFace ───
def fetch_huggingface(conn):
    """从 HuggingFace API 获取热门新模型"""
    models = []
    try:
        # 获取最近创建的热门模型
        url = "https://huggingface.co/api/models?sort=downloads&direction=-1&limit=30&full=false"
        req = urllib.request.Request(url, headers={"User-Agent": "AGI-Monitor/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        for m in data:
            model_id = m.get("id", "")
            author = m.get("author", "")
            downloads = m.get("downloads", 0)
            likes = m.get("likes", 0)
            tags = ",".join(m.get("tags", [])[:10])
            created = m.get("createdAt", "")

            # 只关注 AGI 相关的
            model_lower = model_id.lower()
            if any(k in model_lower for k in ["gpt", "llama", "claude", "gemini",
                    "mistral", "qwen", "deepseek", "reason", "agent", "o1", "o3"]):
                try:
                    conn.execute(
                        "INSERT OR REPLACE INTO models VALUES (?,?,?,?,?,?,?,?)",
                        (model_id, model_id, author, downloads, likes, tags,
                         created, datetime.now().isoformat())
                    )
                    models.append({"name": model_id, "author": author,
                                   "downloads": downloads, "likes": likes})
                except sqlite3.IntegrityError:
                    pass

        conn.commit()
        print(f"  [huggingface] 收集 {len(models)} 个模型")
    except Exception as e:
        print(f"  [huggingface] 错误: {e}")
    return models


# ─── 数据源：RSS ───
def fetch_rss(conn):
    """从 RSS 源获取 AI 新闻"""
    news_items = []
    for source_name, feed_url in RSS_FEEDS:
        try:
            req = urllib.request.Request(feed_url, headers={"User-Agent": "AGI-Monitor/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                xml_data = resp.read().decode("utf-8", errors="replace")
            root = ET.fromstring(xml_data)

            # RSS 2.0 or Atom
            items = root.findall(".//item")
            if not items:
                items = root.findall(".//{http://www.w3.org/2005/Atom}entry")

            for item in items[:5]:  # 每源最多5条
                title_el = item.find("title") or item.find("{http://www.w3.org/2005/Atom}title")
                link_el = item.find("link") or item.find("{http://www.w3.org/2005/Atom}link")
                desc_el = item.find("description") or item.find("{http://www.w3.org/2005/Atom}summary")
                date_el = item.find("pubDate") or item.find("{http://www.w3.org/2005/Atom}published")

                title = title_el.text.strip() if title_el is not None and title_el.text else ""
                link = ""
                if link_el is not None:
                    link = link_el.text or link_el.attrib.get("href", "")
                desc = desc_el.text.strip()[:500] if desc_el is not None and desc_el.text else ""
                pub_date = date_el.text if date_el is not None and date_el.text else ""

                if title:
                    news_id = f"{source_name}:{hash(title)}"
                    try:
                        conn.execute(
                            "INSERT OR IGNORE INTO news VALUES (?,?,?,?,?,?,?)",
                            (news_id, source_name, title, desc, link,
                             pub_date, datetime.now().isoformat())
                        )
                        news_items.append({"source": source_name, "title": title,
                                           "summary": desc[:200], "url": link})
                    except sqlite3.IntegrityError:
                        pass

            print(f"  [rss:{source_name}] OK")
        except Exception as e:
            print(f"  [rss:{source_name}] 错误: {e}")

    conn.commit()
    return news_items


# ─── 数据源：GitHub Trending ───
def fetch_github_trending(conn):
    """爬取 GitHub trending AI/ML 仓库"""
    repos = []
    try:
        url = "https://github.com/trending?since=daily"
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            html = resp.read().decode("utf-8", errors="replace")

        # 解析 trending 仓库
        repo_pattern = re.compile(
            r'<h2 class="h3 lh-condensed">.*?<a href="(/[^"]+)"', re.DOTALL
        )
        desc_pattern = re.compile(r'<p class="col-9 color-fg-muted.*?>(.*?)</p>', re.DOTALL)
        stars_pattern = re.compile(r'(\d+)\s*stars\s*today')

        repo_matches = repo_pattern.findall(html)
        desc_matches = desc_pattern.findall(html)

        for i, repo_path in enumerate(repo_matches[:20]):
            repo_name = repo_path.strip("/")
            desc = desc_matches[i].strip() if i < len(desc_matches) else ""
            desc = re.sub(r'<[^>]+>', '', desc).strip()

            # 只关注 AI/ML 相关
            combined = (repo_name + " " + desc).lower()
            if any(k in combined for k in ["ai", "ml", "llm", "gpt", "agent",
                    "model", "neural", "transformer", "rag", "embedding",
                    "reasoning", "chat", "assistant"]):
                try:
                    conn.execute(
                        "INSERT OR REPLACE INTO repos VALUES (?,?,?,?,?,?,?)",
                        (repo_name, repo_name, desc, 0, "", f"https://github.com/{repo_name}",
                         datetime.now().isoformat())
                    )
                    repos.append({"name": repo_name, "description": desc[:200]})
                except sqlite3.IntegrityError:
                    pass

        conn.commit()
        print(f"  [github] 收集 {len(repos)} 个 trending 仓库")
    except Exception as e:
        print(f"  [github] 错误: {e}")
    return repos


# ─── LLM 调用 ───
def call_llm(system_prompt, user_prompt, max_tokens=4000):
    """调用 MiniMax/OpenAI 兼容 API"""
    if not LLM_API_KEY:
        return "（LLM API Key 未配置，跳过分析）"

    payload = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.7,
    }

    try:
        req = urllib.request.Request(
            f"{LLM_BASE_URL}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {LLM_API_KEY}",
            },
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"（LLM 调用失败: {e}）"


# ─── 报告生成 ───
SYSTEM_PROMPT = """你是AGI监测引擎的分析核心。你的任务是基于每日采集的数据，生成一篇深度分析报告。

报告要求：
1. 剖析当天最值得关注的AGI进展（产品/团队/论文/思想）
2. 评估各路线的进展速度和突破概率
3. 追踪关键信号变化（与历史对比）
4. 给出AGI时间线的更新判断

报告格式（Markdown）：
# AGI日报 — {date}

## 今日核心发现
（1-2个最重大发现，为什么重要）

## 路线进展追踪
### 1. 规模化路线（OpenAI/Google）
### 2. 推理增强路线（o1/o3/DeepSeek）
### 3. 世界模型路线（LeCun/DeepMind）
### 4. 具身智能路线（Figure/Tesla）
### 5. 自进化路线（self-improving/agent）

## 值得关注的论文
（列出2-3篇，简要说明为什么重要）

## 值得关注的团队/产品
（列出1-2个，分析其战略位置）

## AGI时间线更新
- 短期（2026-2028）概率变化
- 中期（2028-2032）概率变化
- 最有可能先到达AGI的团队

## 投资启示（如适用）
（对关注AI的人有什么行动建议）

请基于实际数据分析，不要编造。数据中没有的不要猜。"""


def generate_report(conn, papers, models, news, repos):
    """用 LLM 生成日报"""
    today = datetime.now().strftime("%Y-%m-%d")

    # 获取历史信号用于对比
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    hist_signals = conn.execute(
        "SELECT entity, description, significance FROM signals WHERE date=? ORDER BY significance DESC LIMIT 10",
        (yesterday,)
    ).fetchall()

    # 构建数据摘要
    papers_text = "\n".join(
        f"- {p['title']}\n  作者: {p['authors']}\n  摘要: {p['abstract'][:200]}"
        for p in papers[:15]
    ) if papers else "（今日无新论文）"

    models_text = "\n".join(
        f"- {m['name']} (by {m['author']}, downloads: {m['downloads']}, likes: {m['likes']})"
        for m in models[:10]
    ) if models else "（今日无新模型）"

    news_text = "\n".join(
        f"[{n['source']}] {n['title']}\n  {n['summary'][:150]}"
        for n in news[:15]
    ) if news else "（今日无新闻）"

    repos_text = "\n".join(
        f"- {r['name']}: {r['description'][:100]}"
        for r in repos[:10]
    ) if repos else "（今日无 trending 仓库）"

    hist_text = "\n".join(
        f"- {s[0]}: {s[1]} (重要度: {s[2]})"
        for s in hist_signals
    ) if hist_signals else "（无昨日信号）"

    user_prompt = f"""今日采集数据（{today}）：

## 最新论文（arxiv）
{papers_text}

## 热门模型（HuggingFace）
{models_text}

## AI 新闻（RSS）
{news_text}

## GitHub Trending
{repos_text}

## 昨日信号（用于对比）
{hist_text}

请基于以上数据生成今日AGI日报。重点关注：
1. 哪些进展最接近AGI突破
2. 哪些团队/路线在加速
3. 与昨天相比有什么新变化
4. 时间线是否需要更新

报告要具体、有数据支撑、有洞察。不要泛泛而谈。"""

    print("  [llm] 正在生成报告...")
    report = call_llm(SYSTEM_PROMPT.format(date=today), user_prompt, max_tokens=4000)

    # 清理 LLM 输出中的 think 标签
    report = re.sub(r'<think>.*?</think>\s*', '', report, flags=re.DOTALL)
    report = report.strip()

    # 保存报告
    report_id = f"report_{today}"
    conn.execute(
        "INSERT OR REPLACE INTO reports VALUES (?,?,?,?)",
        (report_id, today, report, datetime.now().isoformat())
    )
    conn.commit()

    # 保存到文件
    report_file = REPORT_DIR / f"agi_report_{today}.md"
    report_file.write_text(report, encoding="utf-8")
    print(f"  [report] 已保存: {report_file}")

    # 提取信号存入数据库（用于明日对比）
    extract_signals(conn, report, today)

    # 评估关键性 — 只有重要发现才推送微信
    significance = evaluate_significance(report, papers, models, news, repos)
    print(f"  [significance] 关键性评分: {significance['score']}/10 — {significance['reason']}")

    if significance['score'] >= 6:
        print(f"  [wechat] 关键报告，推送到微信...")
        push_to_wechat(report, today, significance)
    else:
        print(f"  [wechat] 非关键报告（评分{significance['score']}），跳过推送")

    return report


def evaluate_significance(report, papers, models, news, repos):
    """评估报告的关键性 — 决定是否推送微信

    评分规则（0-10）：
    - 有重大新模型发布（GPT/Claude/Gemini新版本）: +3
    - 有重大论文（benchmark突破/新架构）: +2
    - 有重大新闻（融资/收购/政策）: +2
    - 有AGI时间线更新: +1
    - 数据量丰富（>30条）: +1
    - 静默日（无核心信号）: -3
    """
    score = 0
    reasons = []

    report_lower = report.lower()

    # 重大新模型
    major_models = ["gpt-5", "gpt-4.5", "claude 4", "claude opus", "gemini 2",
                    "o3", "o4", "llama 4", "deepseek v4", "qwen3"]
    for m in major_models:
        if m in report_lower:
            score += 3
            reasons.append(f"重大模型信号: {m}")
            break

    # 重大论文/benchmark
    paper_signals = ["benchmark", "state-of-the-art", "sota", "breakthrough",
                     "new architecture", "scaling law", "emergent"]
    for p in paper_signals:
        if p in report_lower:
            score += 2
            reasons.append(f"论文突破信号: {p}")
            break

    # 重大新闻
    news_signals = ["融资", "收购", "acquisition", "funding", "billion",
                    "policy", "监管", "executive order", "法案"]
    for n in news_signals:
        if n in report_lower:
            score += 2
            reasons.append(f"重大新闻: {n}")
            break

    # AGI时间线更新
    if "时间线更新" in report or "概率变化" in report or "时间线" in report:
        if "上调" in report or "加速" in report or "提前" in report:
            score += 1
            reasons.append("AGI时间线上调")

    # 数据量
    total_data = len(papers) + len(models) + len(news) + len(repos)
    if total_data > 30:
        score += 1
        reasons.append(f"数据丰富({total_data}条)")

    # 静默日惩罚
    if total_data < 10 and "静默" in report:
        score -= 3
        reasons.append("信息静默日")

    score = max(0, min(10, score + 3))  # 基础分3，确保正常日不全是0
    reason = "; ".join(reasons) if reasons else "常规日"
    return {"score": score, "reason": reason}


def push_to_wechat(report, date, significance):
    """推送关键报告到微信"""
    import subprocess
    import plistlib

    # 获取 bot token
    bot_token = os.environ.get("WELIAN_BOT_TOKEN", "")
    if not bot_token:
        plist_path = Path.home() / "Library/LaunchAgents/com.welian.bot.plist"
        if plist_path.exists():
            with open(plist_path, 'rb') as f:
                plist = plistlib.load(f)
            env = plist.get("EnvironmentVariables", {})
            bot_token = env.get("WELIAN_BOT_TOKEN", "")

    if not bot_token:
        print("  [wechat] 无 WELIAN_BOT_TOKEN，跳过")
        return

    # 获取目标用户
    bot_users_path = Path.home() / ".welian/bot_users.json"
    if not bot_users_path.exists():
        print("  [wechat] 无 bot_users.json，跳过")
        return

    users = json.loads(bot_users_path.read_text())
    if not users:
        print("  [wechat] 无目标用户，跳过")
        return

    target_user = users[0]

    # 导入 bot handler
    sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
    try:
        from welian.bot.handler import IlinkApi
    except ImportError:
        print("  [wechat] 无法导入 IlinkApi，跳过")
        return

    api = IlinkApi(bot_token)

    # 生成 PDF
    pdf_script = Path(__file__).parent / "welian_pdf.py"
    pdf_path = DATA_DIR / f"agi_report_{date}.pdf"
    json_path = DATA_DIR / f"agi_report_{date}.json"

    # 转换 markdown → PDF JSON
    report_json = md_to_pdf_json(report, date)
    json_path.write_text(json.dumps(report_json, ensure_ascii=False), encoding="utf-8")

    result = subprocess.run(
        ["python3", str(pdf_script), str(json_path), str(pdf_path)],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        print(f"  [wechat] PDF生成失败: {result.stderr[:200]}")
        # PDF失败则只发文本摘要
        summary = f"🤖 AGI日报 — {date}\n关键性: {significance['score']}/10\n\n{report[:800]}"
        api.send_message(target_user, summary)
        return

    # 发送文本通知
    summary = f"🤖 AGI日报 — {date}\n关键性: {significance['score']}/10\n{significance['reason']}\n\nPDF随后发送"
    api.send_message(target_user, summary)

    # 等待限流窗口过后发送 PDF
    time.sleep(10)
    success = api.send_file_message(target_user, str(pdf_path))
    if success:
        print(f"  [wechat] PDF已发送到微信")
    else:
        print(f"  [wechat] PDF发送失败")


def md_to_pdf_json(md_text, date):
    """将 markdown 报告转换为 welian_pdf.py 的 JSON 格式"""
    sections = []
    current = None

    for line in md_text.split('\n'):
        stripped = line.strip()

        if stripped.startswith('# ') and not stripped.startswith('## '):
            continue  # 跳过主标题
        if stripped.startswith('## '):
            if current:
                sections.append(current)
            current = {"heading": stripped[3:].strip(), "bullets": []}
        elif stripped.startswith('### '):
            if current:
                sections.append(current)
            current = {"heading": stripped[4:].strip(), "bullets": []}
        elif stripped.startswith('- ') or stripped.startswith('* '):
            if current:
                current["bullets"].append(stripped[2:].strip())
        elif stripped and current:
            if "paragraph" not in current:
                current["paragraph"] = ""
            current["paragraph"] += (stripped + " ") if current["paragraph"] else stripped
        elif not stripped and current and current.get("bullets"):
            pass  # 空行

    if current:
        sections.append(current)

    return {
        "title": f"AGI日报 — {date}",
        "subtitle": "AGI Monitor Engine",
        "sections": sections[:15],  # 最多15节
        "footer": "Welian AGI Monitor · 自动生成",
    }


def extract_signals(conn, report, date):
    """从报告中提取信号用于历史追踪"""
    # 用 LLM 提取关键信号
    signal_prompt = f"""从以下AGI日报中提取3-5个关键信号，返回JSON数组格式：
[{{"entity": "xxx", "description": "xxx", "significance": 8, "signal_type": "paper/product/team/benchmark/idea"}}]

报告：
{report[:3000]}

只返回JSON，不要其他内容。"""

    result = call_llm("你是一个信号提取器。只返回JSON。", signal_prompt, max_tokens=800)
    try:
        # 提取 JSON
        json_match = re.search(r'\[.*\]', result, re.DOTALL)
        if json_match:
            signals = json.loads(json_match.group())
            for s in signals:
                conn.execute(
                    "INSERT INTO signals (date, signal_type, entity, description, significance, created_at) VALUES (?,?,?,?,?,?)",
                    (date, s.get("signal_type", ""), s.get("entity", ""),
                     s.get("description", ""), s.get("significance", 5),
                     datetime.now().isoformat())
                )
            conn.commit()
            print(f"  [signals] 提取 {len(signals)} 个信号")
    except Exception as e:
        print(f"  [signals] 提取失败: {e}")


# ─── 主循环 ───
def run_once(conn):
    """跑一轮完整采集+分析"""
    now = datetime.now()
    print(f"\n{'='*60}")
    print(f"AGI Monitor — {now.strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*60}")

    # 1. 采集数据
    print("\n📡 采集数据...")
    papers = fetch_arxiv(conn, days=2)
    models = fetch_huggingface(conn)
    news = fetch_rss(conn)
    repos = fetch_github_trending(conn)

    total = len(papers) + len(models) + len(news) + len(repos)
    print(f"\n总计采集: {total} 条数据 (论文{len(papers)} 模型{len(models)} 新闻{len(news)} 仓库{len(repos)})")

    if total == 0:
        print("⚠️ 未采集到任何数据，跳过报告生成")
        return None

    # 2. 生成报告
    print("\n🧠 分析生成报告...")
    report = generate_report(conn, papers, models, news, repos)

    # 3. 输出摘要
    print(f"\n{'='*60}")
    print(f"✅ 报告已生成: {REPORT_DIR}/agi_report_{now.strftime('%Y-%m-%d')}.md")
    print(f"{'='*60}")
    print(f"\n报告预览（前500字）:\n{report[:500]}")

    return report


def run_loop():
    """死循环模式：每天跑一轮"""
    conn = init_db()
    print("🔄 AGI Monitor 启动 — 死循环模式（每24小时一轮）")
    print(f"📁 数据目录: {DATA_DIR}")
    print(f"📊 数据库: {DB_PATH}")
    print(f"📝 报告目录: {REPORT_DIR}")

    while True:
        try:
            run_once(conn)
        except Exception as e:
            print(f"❌ 本轮出错: {e}")

        # 等待24小时
        next_run = datetime.now() + timedelta(days=1)
        next_run = next_run.replace(hour=8, minute=0, second=0, microsecond=0)  # 每天早上8点
        wait_seconds = (next_run - datetime.now()).total_seconds()
        if wait_seconds < 0:
            wait_seconds = 86400  # 如果过了8点，等明天

        print(f"\n⏰ 下一轮: {next_run.strftime('%Y-%m-%d %H:%M')} (等待 {wait_seconds/3600:.1f} 小时)")
        time.sleep(min(wait_seconds, 86400))  # 最多等24小时


# ─── 入口 ───
if __name__ == "__main__":
    if "--loop" in sys.argv:
        run_loop()
    elif "--report" in sys.argv:
        # 只生成报告（用已有数据）
        conn = init_db()
        today = datetime.now().strftime("%Y-%m-%d")
        papers = conn.execute("SELECT title, abstract, authors, url FROM papers ORDER BY collected_at DESC LIMIT 15").fetchall()
        models = conn.execute("SELECT name, author, downloads, likes FROM models ORDER BY collected_at DESC LIMIT 10").fetchall()
        news = conn.execute("SELECT source, title, summary, url FROM news ORDER BY collected_at DESC LIMIT 15").fetchall()
        repos = conn.execute("SELECT name, description FROM repos ORDER BY collected_at DESC LIMIT 10").fetchall()

        p = [{"title": r[0], "abstract": r[1], "authors": r[2], "url": r[3]} for r in papers]
        m = [{"name": r[0], "author": r[1], "downloads": r[2], "likes": r[3]} for r in models]
        n = [{"source": r[0], "title": r[1], "summary": r[2], "url": r[3]} for r in news]
        r = [{"name": r[0], "description": r[1]} for r in repos]

        report = generate_report(conn, p, m, n, r)
        print(report)
    else:
        # 跑一轮
        conn = init_db()
        report = run_once(conn)
        if report:
            print(f"\n完整报告:\n{report}")
