#!/usr/bin/env python3
"""
拉取公众号已发布文章列表 + 图文分析数据（阅读量、分享、收藏等）。
输出 JSON 文件，作为后续选题评估系统的输入。

用法:
    python3 fetch_articles.py                    # 拉取全部文章
    python3 fetch_articles.py --days 30          # 最近30天
    python3 fetch_articles.py --output out.json  # 指定输出路径
"""
import argparse, json, os, time, requests
from datetime import datetime, timedelta

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.local.json")
BASE = "https://api.weixin.qq.com/cgi-bin"

def load_config():
    with open(CONFIG_FILE) as f:
        cfg = json.load(f)
    return cfg["app_id"], cfg["app_secret"]

APPID, SECRET = load_config()

def get_token():
    """获取 access_token，带简单重试。"""
    for attempt in range(3):
        r = requests.get(
            f"{BASE}/token",
            params={"grant_type": "client_credential", "appid": APPID, "secret": SECRET},
            timeout=10,
        ).json()
        if "access_token" in r:
            return r["access_token"]
        print(f"[token] attempt {attempt+1} failed: {r}")
        time.sleep(2)
    raise RuntimeError(f"Failed to get access_token: {r}")

def fetch_articles(token, begin_date, end_date):
    """
    分页拉取已发布文章列表。
    微信 API: /cgi-bin/material/batchget_material (type=news)
    每次 count 最多 20。
    """
    articles = []
    offset = 0
    count = 20
    while True:
        r = requests.post(
            f"{BASE}/material/batchget_material",
            params={"access_token": token},
            json={"type": "news", "offset": offset, "count": count},
            timeout=15,
        ).json()
        if r.get("errcode"):
            print(f"[articles] error: {r}")
            break
        items = r.get("item", [])
        if not items:
            break
        for item in items:
            news_items = item.get("content", {}).get("news_item", [])
            update_time = datetime.fromtimestamp(item.get("update_time", 0))
            for ni in news_items:
                pub_date = datetime.fromtimestamp(item.get("update_time", 0))
                # 日期过滤
                if begin_date and pub_date.date() < begin_date:
                    continue
                if end_date and pub_date.date() > end_date:
                    continue
                articles.append({
                    "media_id": item.get("media_id", ""),
                    "title": ni.get("title", ""),
                    "digest": ni.get("digest", ""),
                    "url": ni.get("url", ""),
                    "author": ni.get("author", ""),
                    "pub_date": pub_date.isoformat(),
                    "content_url": ni.get("content_url", ""),
                    "thumb_url": ni.get("thumb_url", ""),
                })
        total = r.get("total_count", 0)
        offset += count
        if offset >= total:
            break
        time.sleep(0.5)  # 避免频率限制
    return articles

def fetch_article_stats(token, articles):
    """
    拉取图文分析数据。
    微信 API: /datacube/getarticlesummary (按天汇总)
    和 /datacube/getarticletotal (按文章汇总)

    由于 getarticlesummary 需要按天查询且只能查最近3天，
    getarticletotal 也是按天查询，最多查最近1天。
    这里改用 article URL 从页面抓取阅读量（更可靠）。

    实际方案：用 getuserreadpage API 或直接从文章 URL 抓取。
    由于微信 API 限制，这里先返回文章列表，
    阅读量数据需要通过其他方式获取（见下方说明）。
    """
    # 微信图文分析 API 限制：
    # - getarticlesummary: 按天查，最多查最近1天
    # - getarticletotal: 按天查，最多查最近1天
    # - 历史数据无法通过 API 批量获取
    #
    # 替代方案：通过文章 URL 用 requests 抓取页面中的阅读量
    # （微信文章页面有 __read_num 等字段，但需要特定 cookie/token）
    #
    # 最可靠方案：用微信公众平台后台的"图文分析"导出功能
    # 或使用第三方工具如"西瓜数据"等

    stats = {}
    for article in articles:
        url = article.get("url") or article.get("content_url")
        if not url:
            continue
        # 尝试从文章 URL 抓取阅读量
        # 注意：微信文章页面的阅读量需要特定的 referer 和 cookie
        # 这里先记录 URL，后续可通过 Playwright 抓取
        stats[article["media_id"]] = {
            "url": url,
            "read_num": None,  # 需要浏览器抓取
            "like_num": None,
            "share_num": None,
        }
    return stats

def fetch_recent_stats(token, days=1):
    """
    通过微信数据统计 API 拉取最近1天的图文数据。
    API: /datacube/getarticlesummary
    """
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    try:
        r = requests.post(
            f"{BASE}/datacube/getarticlesummary",
            params={"access_token": token},
            json={"begin_date": yesterday, "end_date": yesterday},
            timeout=15,
        ).json()
        if r.get("errcode"):
            print(f"[stats] error: {r}")
            return []
        return r.get("list", [])
    except Exception as e:
        print(f"[stats] exception: {e}")
        return []

def main():
    parser = argparse.ArgumentParser(description="拉取公众号文章数据")
    parser.add_argument("--days", type=int, default=0, help="最近N天（0=全部）")
    parser.add_argument("--output", type=str, default="", help="输出文件路径")
    args = parser.parse_args()

    begin_date = None
    end_date = None
    if args.days > 0:
        end_date = datetime.now().date()
        begin_date = end_date - timedelta(days=args.days)

    print("[1/3] 获取 access_token...")
    token = get_token()
    print(f"  token: {token[:20]}...")

    print("[2/3] 拉取文章列表...")
    articles = fetch_articles(token, begin_date, end_date)
    print(f"  共 {len(articles)} 篇文章")

    print("[3/3] 拉取图文统计数据（最近1天）...")
    recent_stats = fetch_recent_stats(token)
    print(f"  最近1天统计: {len(recent_stats)} 条")

    # 合并统计数据到文章
    stats_map = {}
    for s in recent_stats:
        stats_map[s.get("msgid", "")] = s

    output = {
        "fetch_time": datetime.now().isoformat(),
        "total_articles": len(articles),
        "articles": articles,
        "recent_stats": recent_stats,
        "note": "阅读量/收益数据受微信API限制，历史数据需通过后台导出或浏览器抓取获取",
    }

    # 写入输出文件
    if not args.output:
        output_dir = os.path.dirname(os.path.abspath(__file__))
        args.output = os.path.join(output_dir, "articles_data.json")

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n✅ 数据已保存: {args.output}")
    print(f"   文章数: {len(articles)}")
    if articles:
        print(f"   最新文章: {articles[0]['title']} ({articles[0]['pub_date'][:10]})")
        print(f"   最早文章: {articles[-1]['title']} ({articles[-1]['pub_date'][:10]})")

if __name__ == "__main__":
    main()
