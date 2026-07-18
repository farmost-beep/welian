#!/usr/bin/env python3
"""Generate PDF from CODEBASE_REPORT.md and send to WeChat via bot.

Usage:
  python3 scripts/send_report_to_wechat.py
"""
import sys
import os
import re
import json
import subprocess
from pathlib import Path

# ── 1. Parse Markdown → JSON sections for welian_pdf.py ──

def md_to_sections(md_text):
    """Convert markdown to welian_pdf.py JSON sections."""
    sections = []
    current = None
    in_code_block = False
    code_lines = []

    def escape_xml(text):
        """Escape XML special chars, but preserve our intentional <b> and <br/> tags."""
        # First escape everything
        text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        # Then restore our intentional tags
        text = text.replace('&lt;b&gt;', '<b>').replace('&lt;/b&gt;', '</b>')
        text = text.replace('&lt;br/&gt;', '<br/>')
        text = text.replace('&lt;font ', '<font ').replace('&lt;/font&gt;', '</font>')
        return text

    lines = md_text.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]

        # Handle code blocks
        if line.strip().startswith('```'):
            if in_code_block:
                if current:
                    code_text = '\n'.join(code_lines)
                    code_text = code_text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    # Use CJK font (not Courier) to support Chinese + box-drawing chars
                    current.setdefault('paragraphs', []).append(
                        f'<font face="WelianCJK" size="7">{code_text.replace(chr(10), "<br/>")}</font>'
                    )
                in_code_block = False
                code_lines = []
            else:
                in_code_block = True
                code_lines = []
            i += 1
            continue

        if in_code_block:
            code_lines.append(line)
            i += 1
            continue

        # H1 = title
        if line.startswith('# ') and not line.startswith('## '):
            i += 1
            continue

        # H2 = section heading
        if line.startswith('## '):
            if current:
                sections.append(current)
            heading = line[3:].strip()
            heading = re.sub(r'`(.+?)`', r'\1', heading)
            current = {"heading": heading, "paragraphs": [], "bullets": [], "table": None}
            i += 1
            continue

        # H3 = sub-heading (append as bold paragraph)
        if line.startswith('### '):
            if current:
                sub = line[4:].strip()
                sub = re.sub(r'`(.+?)`', r'\1', sub)
                sub = escape_xml(sub)
                current['paragraphs'].append(f'<b>{sub}</b>')
            i += 1
            continue

        # Table detection
        if '|' in line and i + 1 < len(lines) and re.match(r'^\s*\|[\s\-:|]+\|\s*$', lines[i+1]):
            if current:
                headers = [c.strip() for c in line.split('|') if c.strip()]
                headers = [re.sub(r'`(.+?)`', r'\1', h) for h in headers]
                headers = [escape_xml(h) for h in headers]
                rows = []
                i += 2  # skip separator
                while i < len(lines) and '|' in lines[i] and lines[i].strip():
                    cells = [c.strip() for c in lines[i].split('|') if c.strip()]
                    cells = [re.sub(r'`(.+?)`', r'\1', c) for c in cells]
                    cells = [escape_xml(c) for c in cells]
                    if cells:
                        rows.append(cells)
                    i += 1
                current['table'] = {"headers": headers, "rows": rows}
                continue

        # Bullet points
        if line.strip().startswith('- ') or line.strip().startswith('* '):
            if current:
                bullet = line.strip()[2:].strip()
                bullet = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', bullet)
                bullet = re.sub(r'`(.+?)`', r'\1', bullet)
                bullet = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', bullet)
                bullet = escape_xml(bullet)
                current['bullets'].append(bullet)
            i += 1
            continue

        # Regular paragraph
        text = line.strip()
        if text:
            if current is None:
                current = {"heading": "", "paragraphs": [], "bullets": []}
            text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
            text = re.sub(r'`(.+?)`', r'\1', text)
            text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text)
            text = escape_xml(text)
            current['paragraphs'].append(text)
        i += 1

    if current:
        sections.append(current)

    # Convert "paragraphs" list → single "paragraph" string (welian_pdf.py schema)
    for sec in sections:
        paras = sec.pop("paragraphs", [])
        if paras:
            sec["paragraph"] = "<br/><br/>".join(paras)

    return sections


def main():
    report_path = Path(__file__).parent.parent / "docs" / "CODEBASE_REPORT.md"
    pdf_path = Path("/tmp/welian_codebase_report.pdf")

    print(f"📖 Reading: {report_path}")
    md = report_path.read_text(encoding="utf-8")

    # Extract title from first H1
    title_match = re.search(r'^# (.+)$', md, re.MULTILINE)
    title = title_match.group(1) if title_match else "Welian 代码库报告"

    print(f"📝 Converting Markdown → PDF sections...")
    sections = md_to_sections(md)
    print(f"   {len(sections)} sections extracted")

    # Inject architecture diagram image into the "系统架构" section
    arch_png = Path("/tmp/welian_arch_diagram.png")
    if arch_png.exists():
        for sec in sections:
            if "系统架构" in sec.get("heading", ""):
                sec["image"] = str(arch_png)
                print(f"   ↳ Architecture diagram injected into '{sec['heading']}'")
                break
        else:
            # Insert as a standalone section before 系统架构
            arch_sec = {"heading": "系统架构图", "image": str(arch_png), "paragraph": "", "bullets": []}
            # Find index of 系统架构 section
            for i, sec in enumerate(sections):
                if "系统架构" in sec.get("heading", ""):
                    sections.insert(i, arch_sec)
                    print("   ↳ Architecture diagram inserted as standalone section")
                    break

    # Build JSON for welian_pdf.py
    report_json = {
        "title": title,
        "subtitle": f"Welian 代码库全面分析报告 · {os.popen('date +%Y-%m-%d').read().strip()}",
        "sections": sections,
        "footer": "Welian 小维 · welian.app",
    }

    json_path = Path("/tmp/welian_report.json")
    json_path.write_text(json.dumps(report_json, ensure_ascii=False), encoding="utf-8")

    # Generate PDF
    pdf_script = Path(__file__).parent / "welian_pdf.py"
    print(f"📄 Generating PDF: {pdf_path}")
    result = subprocess.run(
        ["python3", str(pdf_script), str(json_path), str(pdf_path)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"❌ PDF generation failed:\n{result.stderr}")
        sys.exit(1)
    print(f"✅ PDF generated: {pdf_path} ({pdf_path.stat().st_size // 1024} KB)")

    # ── 2. Send to WeChat via bot ──
    print(f"💬 Sending to WeChat...")

    # Get bot token and target user
    bot_token = os.environ.get("WELIAN_BOT_TOKEN", "")
    if not bot_token:
        # Read from LaunchAgent plist
        import plistlib
        plist_path = Path.home() / "Library/LaunchAgents/com.welian.bot.plist"
        if plist_path.exists():
            with open(plist_path, 'rb') as f:
                plist = plistlib.load(f)
            env = plist.get("EnvironmentVariables", {})
            bot_token = env.get("WELIAN_BOT_TOKEN", "")

    if not bot_token:
        print("❌ No WELIAN_BOT_TOKEN found")
        sys.exit(1)

    # Get target user
    bot_users_path = Path.home() / ".welian/bot_users.json"
    if not bot_users_path.exists():
        print("❌ No bot_users.json found")
        sys.exit(1)

    users = json.loads(bot_users_path.read_text())
    if not users:
        print("❌ No target users in bot_users.json")
        sys.exit(1)

    target_user = users[0]
    print(f"   Target: {target_user[:20]}...")

    # Import bot handler and send
    sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
    from welian.bot.handler import IlinkApi

    api = IlinkApi(bot_token)

    # Send a heads-up message first
    api.send_message(target_user, f"📋 {title}\n\n代码库全面分析报告已生成，包含 15 个章节 + 附录，覆盖架构、模块、API、计费、认证、部署等。PDF 随后发送。")

    # Send the PDF
    success = api.send_file_message(target_user, str(pdf_path))
    if success:
        print(f"✅ PDF sent to WeChat successfully!")
    else:
        print(f"❌ Failed to send PDF")
        sys.exit(1)


if __name__ == "__main__":
    main()
