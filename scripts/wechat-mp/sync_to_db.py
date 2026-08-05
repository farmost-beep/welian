#!/usr/bin/env python3
"""
将拉取的文章数据同步到公众号.db，并生成选题分析报告。
作为后续文章选题的输入和评估系统。

用法:
    python3 sync_to_db.py
"""
import json, sqlite3, os
from datetime import datetime
from collections import Counter

ARTICLES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "articles_data.json")
DB_PATH = "/Users/cyingfang/claude/公众号/公众号.db"
REPORT_PATH = "/Users/cyingfang/claude/公众号/reports/选题分析报告.json"

def sync_to_db(articles):
    """同步文章数据到公众号.db"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # 创建文章数据表（如果不存在）
    c.execute("""
        CREATE TABLE IF NOT EXISTS mp_articles (
            media_id TEXT PRIMARY KEY,
            title TEXT,
            digest TEXT,
            url TEXT,
            author TEXT,
            pub_date TEXT,
            thumb_url TEXT,
            fetched_at TEXT
        )
    """)

    # 清空旧数据并插入新数据
    c.execute("DELETE FROM mp_articles")
    for a in articles:
        c.execute(
            "INSERT OR REPLACE INTO mp_articles (media_id, title, digest, url, author, pub_date, thumb_url, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (a["media_id"], a["title"], a["digest"], a["url"], a["author"], a["pub_date"], a["thumb_url"], datetime.now().isoformat()),
        )

    conn.commit()
    conn.close()
    print(f"✅ 同步 {len(articles)} 篇文章到 {DB_PATH}")

def generate_report(articles):
    """生成选题分析报告"""
    # 按天统计发布频率
    dates = [a["pub_date"][:10] for a in articles]
    day_counts = Counter(dates)

    # 标题关键词提取（简单分词）
    all_titles = " ".join(a["title"] for a in articles)
    # 提取中文关键词（2-6字）
    import re
    keywords = re.findall(r"[\u4e00-\u9fa5]{2,6}", all_titles)
    keyword_counts = Counter(keywords)
    # 过滤停用词
    stop_words = {"的", "了", "在", "是", "和", "与", "一个", "一种", "什么", "怎么", "为什么", "如何", "从", "到", "中", "对", "为", "被", "让", "给", "这", "那", "它", "他", "她"}
    top_keywords = [(k, v) for k, v in keyword_counts.most_common(50) if k not in stop_words and len(k) >= 2][:30]

    # 按周统计
    from datetime import datetime as dt
    week_counts = Counter()
    for a in articles:
        d = dt.fromisoformat(a["pub_date"])
        iso_week = d.strftime("%G-W%V")
        week_counts[iso_week] += 1

    # 摘要关键词
    all_digests = " ".join(a["digest"] for a in articles if a["digest"])
    digest_keywords = re.findall(r"[\u4e00-\u9fa5]{2,6}", all_digests)
    digest_keyword_counts = Counter(digest_keywords)
    top_digest_keywords = [(k, v) for k, v in digest_keyword_counts.most_common(50) if k not in stop_words and len(k) >= 2][:30]

    report = {
        "report_time": datetime.now().isoformat(),
        "summary": {
            "total_articles": len(articles),
            "date_range": f"{min(dates)} ~ {max(dates)}",
            "publish_days": len(day_counts),
            "avg_per_day": round(len(articles) / len(day_counts), 1) if day_counts else 0,
            "max_per_day": max(day_counts.values()) if day_counts else 0,
            "author": dict(Counter(a["author"] for a in articles)),
        },
        "publish_frequency": {
            "by_day": dict(sorted(day_counts.items())),
            "by_week": dict(sorted(week_counts.items())),
        },
        "top_keywords": {
            "from_titles": top_keywords,
            "from_digests": top_digest_keywords,
        },
        "articles": [
            {
                "title": a["title"],
                "pub_date": a["pub_date"][:10],
                "digest": a["digest"][:100] if a["digest"] else "",
                "url": a["url"],
            }
            for a in articles
        ],
        "note": "阅读量和收益数据受微信API限制无法自动获取，需通过微信公众平台后台手动导出或浏览器抓取",
    }

    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"✅ 选题分析报告: {REPORT_PATH}")

    # 打印摘要
    print(f"\n📊 数据摘要:")
    print(f"   文章总数: {report['summary']['total_articles']}")
    print(f"   时间范围: {report['summary']['date_range']}")
    print(f"   发布天数: {report['summary']['publish_days']}")
    print(f"   日均篇数: {report['summary']['avg_per_day']}")
    print(f"   最高产日: {report['summary']['max_per_day']} 篇")
    print(f"\n🔑 标题高频词 TOP 15:")
    for k, v in top_keywords[:15]:
        print(f"   {k}: {v}")
    print(f"\n📅 周发布频率:")
    for week, count in sorted(week_counts.items()):
        print(f"   {week}: {count} 篇")

def main():
    if not os.path.exists(ARTICLES_FILE):
        print(f"❌ 文章数据文件不存在: {ARTICLES_FILE}")
        print("   请先运行: python3 fetch_articles.py")
        return

    with open(ARTICLES_FILE, encoding="utf-8") as f:
        data = json.load(f)

    articles = data["articles"]
    print(f"加载 {len(articles)} 篇文章\n")

    sync_to_db(articles)
    generate_report(articles)

if __name__ == "__main__":
    main()
