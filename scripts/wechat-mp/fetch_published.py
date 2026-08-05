#!/usr/bin/env python3
"""
通过 Playwright 登录微信公众平台后台，抓取已发布文章列表。
登录后自动从"图文消息"页面提取已发布文章的标题、URL、发布时间。

用法:
    python3 fetch_published.py
"""
import json, os, re, time
from datetime import datetime

OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "published_articles.json")

def main():
    from playwright.sync_api import sync_playwright

    print("[1/4] 启动浏览器，登录微信公众平台...")
    p = sync_playwright().start()
    browser = p.chromium.launch(headless=False)
    ctx = browser.new_context(
        viewport={"width": 1280, "height": 800},
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )
    page = ctx.new_page()

    # 登录
    page.goto("https://mp.weixin.qq.com/")
    print("  请扫码登录微信公众平台...")
    page.wait_for_url(lambda u: "token=" in u, timeout=300000)
    token_match = re.search(r'token=(\d+)', page.url)
    token = token_match.group(1) if token_match else ""
    print(f"  登录成功，token: {token}")

    # 已发布文章列表页面
    # 微信后台"发表内容"页面
    print("[2/4] 打开已发布文章列表...")
    list_url = f"https://mp.weixin.qq.com/cgi-bin/appmsg?type=77&token={token}&lang=zh_CN&action=list&begin=0&count=20&f=json"
    
    all_articles = []
    begin = 0
    count = 20
    
    while True:
        url = f"https://mp.weixin.qq.com/cgi-bin/appmsg?token={token}&lang=zh_CN&f=json&ajax=1&type=77&action=list&begin={begin}&count={count}&query=&fakeid=&type=77"
        
        # 用 page.evaluate 发起请求（带 cookie）
        result = page.evaluate(
            """async (url) => {
                const r = await fetch(url, {credentials: 'include'});
                return await r.text();
            }""",
            url,
        )
        
        try:
            data = json.loads(result)
        except:
            print(f"  解析失败 at begin={begin}")
            break
        
        articles = data.get("app_msg_list", [])
        if not articles:
            break
        
        for a in articles:
            all_articles.append({
                "title": a.get("title", ""),
                "url": a.get("link", ""),
                "pub_time": datetime.fromtimestamp(a.get("create_time", 0)).isoformat() if a.get("create_time") else "",
                "update_time": datetime.fromtimestamp(a.get("update_time", 0)).isoformat() if a.get("update_time") else "",
                "author": a.get("author", ""),
                "digest": a.get("digest", ""),
                "cover": a.get("cover", ""),
                "aid": a.get("aid", ""),
                "media_id": a.get("media_id", ""),
            })
        
        total = data.get("app_msg_cnt", 0)
        print(f"  已获取 {len(all_articles)}/{total} 篇")
        
        begin += count
        if begin >= total or len(articles) < count:
            break
        time.sleep(1)
    
    print(f"[3/4] 共 {len(all_articles)} 篇已发布文章")
    
    # 按发布时间排序
    all_articles.sort(key=lambda x: x.get("pub_time", ""), reverse=True)
    
    output = {
        "fetch_time": datetime.now().isoformat(),
        "total_published": len(all_articles),
        "articles": all_articles,
    }
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"[4/4] 已保存: {OUTPUT_FILE}")
    print(f"\n最新5篇:")
    for a in all_articles[:5]:
        print(f"  {a['pub_time'][:16]} | {a['title'][:50]}")
    print(f"\n最早5篇:")
    for a in all_articles[-5:]:
        print(f"  {a['pub_time'][:16]} | {a['title'][:50]}")
    
    browser.close()
    p.stop()

if __name__ == "__main__":
    main()
