#!/usr/bin/env python3
"""Send any Markdown file to WeChat via Welian bot (uses welian_pdf.py + IlinkApi).

Usage:
  python3 send_custom_md_to_wechat.py <md_path> <pdf_out_path> [title] [caption]
"""
import sys
import os
import json
import plistlib
import subprocess
import re
from pathlib import Path


def md_to_sections(md_text: str) -> list:
    """Convert markdown to welian_pdf.py sections schema (subset of send_report_to_wechat.py)."""
    def escape_xml(text):
        text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        text = text.replace('&lt;b&gt;', '<b>').replace('&lt;/b&gt;', '</b>')
        text = text.replace('&lt;br/&gt;', '<br/>')
        return text

    sections = []
    current = None
    in_code = False
    code_lines = []

    lines = md_text.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]

        if line.strip().startswith('```'):
            if in_code:
                if current:
                    code_text = '\n'.join(code_lines)
                    code_text = code_text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    current.setdefault('paragraphs', []).append(
                        f'<font face="WelianCJK" size="7">{code_text.replace(chr(10), "<br/>")}</font>'
                    )
                in_code = False
                code_lines = []
            else:
                in_code = True
                code_lines = []
            i += 1
            continue
        if in_code:
            code_lines.append(line)
            i += 1
            continue

        if line.startswith('# ') and not line.startswith('## '):
            i += 1
            continue
        if line.startswith('## '):
            if current:
                sections.append(current)
            current = {"heading": line[3:].strip(), "paragraphs": [], "bullets": [], "table": None}
            i += 1
            continue
        if line.startswith('### '):
            if current:
                sub = escape_xml(re.sub(r'`(.+?)`', r'\1', line[4:].strip()))
                current['paragraphs'].append(f'<b>{sub}</b>')
            i += 1
            continue
        if '|' in line and i + 1 < len(lines) and re.match(r'^\s*\|[\s\-:|]+\|\s*$', lines[i+1]):
            if current:
                headers = [escape_xml(re.sub(r'`(.+?)`', r'\1', c.strip())) for c in line.split('|') if c.strip()]
                rows = []
                i += 2
                while i < len(lines) and '|' in lines[i] and lines[i].strip():
                    cells = [escape_xml(re.sub(r'`(.+?)`', r'\1', c.strip())) for c in lines[i].split('|') if c.strip()]
                    if cells:
                        rows.append(cells)
                    i += 1
                current['table'] = {"headers": headers, "rows": rows}
                continue
        if line.strip().startswith('- ') or line.strip().startswith('* '):
            if current:
                bullet = escape_xml(re.sub(r'\[(.+?)\]\(.+?\)', r'\1',
                                            re.sub(r'`(.+?)`', r'\1',
                                                   re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', line.strip()[2:].strip()))))
                current['bullets'].append(bullet)
            i += 1
            continue

        text = line.strip()
        if text:
            if current is None:
                current = {"heading": "", "paragraphs": [], "bullets": []}
            text = escape_xml(re.sub(r'\[(.+?)\]\(.+?\)', r'\1',
                                     re.sub(r'`(.+?)`', r'\1',
                                            re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text))))
            current['paragraphs'].append(text)
        i += 1

    if current:
        sections.append(current)
    for sec in sections:
        paras = sec.pop("paragraphs", [])
        if paras:
            sec["paragraph"] = "<br/><br/>".join(paras)
    return sections


def get_bot_token() -> str:
    tok = os.environ.get("WELIAN_BOT_TOKEN", "")
    if tok:
        return tok
    plist_path = Path.home() / "Library/LaunchAgents/com.welian.bot.plist"
    if plist_path.exists():
        with open(plist_path, "rb") as f:
            return plistlib.load(f).get("EnvironmentVariables", {}).get("WELIAN_BOT_TOKEN", "")
    return ""


def main():
    if len(sys.argv) < 3:
        print("Usage: send_custom_md_to_wechat.py <md> <pdf_out> [title] [caption]")
        sys.exit(1)
    md_path = Path(sys.argv[1]).resolve()
    pdf_path = Path(sys.argv[2]).resolve()
    title = sys.argv[3] if len(sys.argv) > 3 else md_path.stem
    caption = sys.argv[4] if len(sys.argv) > 4 else f"{title} · PDF 报告已生成"

    print(f"📖 Reading: {md_path}")
    md = md_path.read_text(encoding="utf-8")

    m = re.search(r'^# (.+)$', md, re.MULTILINE)
    actual_title = m.group(1) if m else title
    print(f"📝 Title: {actual_title}")

    print(f"🔄 Converting Markdown → sections...")
    sections = md_to_sections(md)
    print(f"   {len(sections)} sections")

    doc = {
        "title": actual_title,
        "subtitle": f"行业研究报告 · {os.popen('date +%Y-%m-%d').read().strip()}",
        "sections": sections,
        "footer": "Welian 小维 · welian.app",
    }
    json_path = Path("/tmp/_welian_custom_report.json")
    json_path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    print(f"📄 Generating PDF: {pdf_path}")
    pdf_script = Path("/Users/cyingfang/devin/projects/welian/scripts/welian_pdf.py")
    result = subprocess.run(["python3", str(pdf_script), str(json_path), str(pdf_path)],
                            capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ PDF failed: {result.stderr}")
        sys.exit(1)
    size_kb = pdf_path.stat().st_size // 1024
    print(f"✅ PDF generated: {pdf_path} ({size_kb} KB)")

    bot_token = get_bot_token()
    if not bot_token:
        print("❌ No WELIAN_BOT_TOKEN")
        sys.exit(1)
    users_path = Path.home() / ".welian/bot_users.json"
    users = json.loads(users_path.read_text())
    if not users:
        print("❌ No bot users")
        sys.exit(1)
    target = users[0]
    print(f"💬 Sending to {target[:20]}...")

    sys.path.insert(0, "/Users/cyingfang/devin/projects/welian/src")
    from welian.bot.handler import IlinkApi
    api = IlinkApi(bot_token)
    # 用 send_combined_message 单次 HTTP 请求发文字+文件（item_list 含 type=1+4）
    # 根除跨类型限流：服务端只看到"一条消息"
    combined_text = f"📋 {actual_title}\n\n{caption}"
    ok = api.send_combined_message(target, combined_text, str(pdf_path))
    if ok:
        print("✅ Sent to WeChat (combined message)")
    else:
        print("❌ send_combined_message failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
