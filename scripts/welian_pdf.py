#!/usr/bin/env python3
"""Welian-branded PDF generator — standalone script for Devin CLI.

Usage:
  python3 welian_pdf.py input.json output.pdf

Input JSON schema:
{
  "title": "报告标题",
  "subtitle": "副标题（可选）",
  "sections": [
    {
      "heading": "章节标题",
      "paragraph": "段落文本（可选）",
      "bullets": ["要点1", "要点2"],          # 可选
      "cards": [                                # 可选
        {"title": "卡片标题", "body": "内容", "accent": "强调文字（可选）"}
      ],
      "table": {                                # 可选
        "headers": ["列1", "列2"],
        "rows": [["值1", "值2"]]
      }
    }
  ],
  "footer": "自定义页脚（可选，默认 'Welian 小维 · welian.app'）"
}

Examples:
  python3 welian_pdf.py /tmp/report.json /tmp/report.pdf
  echo '{"title":"测试","sections":[{"heading":"第一章","paragraph":"hello"}]}' | python3 welian_pdf.py - /tmp/out.pdf
"""

import sys
import json
import io
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── Font registration (CJK support) ──

_FONT_REGISTERED = False

def _register_fonts():
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return
    candidates = [
        ("/System/Library/Fonts/STHeiti Light.ttc", "WelianCJK", "WelianCJK-Bold"),
        ("/System/Library/Fonts/PingFang.ttc", "WelianCJK", "WelianCJK-Bold"),
        ("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", "WelianCJK", "WelianCJK-Bold"),
        ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "WelianCJK", "WelianCJK-Bold"),
    ]
    for path, name, bold_name in candidates:
        if Path(path).exists():
            try:
                pdfmetrics.registerFont(TTFont(name, path, subfontIndex=0))
                pdfmetrics.registerFont(TTFont(bold_name, path, subfontIndex=0))
                _FONT_REGISTERED = True
                return
            except Exception:
                continue
    _FONT_REGISTERED = True

def _font():
    _register_fonts()
    try:
        pdfmetrics.getFont("WelianCJK")
        return "WelianCJK"
    except Exception:
        return "Helvetica"

def _font_bold():
    _register_fonts()
    try:
        pdfmetrics.getFont("WelianCJK-Bold")
        return "WelianCJK-Bold"
    except Exception:
        return "Helvetica-Bold"

# ── Brand colors ──

COLOR_ACCENT = colors.HexColor("#4A6741")
COLOR_DIM = colors.HexColor("#8B8B8B")
COLOR_LIGHT = colors.HexColor("#F5F4EE")
COLOR_BORDER = colors.HexColor("#E0E0E0")
COLOR_CARD_BG = colors.HexColor("#FAFAF7")

# ── Styles ──

def _build_styles():
    font = _font()
    fb = _font_bold()
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("WT", parent=base["Title"],
            fontName=fb, fontSize=20, textColor=COLOR_ACCENT, spaceAfter=4, leading=26),
        "subtitle": ParagraphStyle("WS", parent=base["Normal"],
            fontName=font, fontSize=10, textColor=COLOR_DIM, spaceAfter=16, leading=14),
        "h2": ParagraphStyle("WH", parent=base["Heading2"],
            fontName=fb, fontSize=14, textColor=COLOR_ACCENT, spaceBefore=16, spaceAfter=8, leading=18),
        "body": ParagraphStyle("WB", parent=base["Normal"],
            fontName=font, fontSize=10, textColor=colors.black, spaceAfter=6, leading=15),
        "small": ParagraphStyle("WSm", parent=base["Normal"],
            fontName=font, fontSize=8, textColor=COLOR_DIM, spaceAfter=2, leading=11),
        "card_title": ParagraphStyle("WCT", parent=base["Normal"],
            fontName=fb, fontSize=11, textColor=colors.black, spaceAfter=3, leading=14),
        "card_body": ParagraphStyle("WCB", parent=base["Normal"],
            fontName=font, fontSize=9.5, textColor=colors.HexColor("#333333"), spaceAfter=3, leading=13),
        "card_accent": ParagraphStyle("WCA", parent=base["Normal"],
            fontName=font, fontSize=9.5, textColor=COLOR_ACCENT, spaceAfter=3, leading=13),
        "footer": ParagraphStyle("WF", parent=base["Normal"],
            fontName=font, fontSize=8, textColor=COLOR_DIM, alignment=2, spaceBefore=20),
    }

# ── Header/footer ──

def _make_header_footer(footer_text):
    def _hf(canvas, doc):
        canvas.saveState()
        w, h = A4
        canvas.setStrokeColor(COLOR_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(20*mm, 15*mm, w-20*mm, 15*mm)
        f = _font()
        canvas.setFont(f, 8)
        canvas.setFillColor(COLOR_DIM)
        # Draw footer text, and add clickable link over "welian.app" if present
        canvas.drawString(20*mm, 10*mm, footer_text)
        if "welian.app" in footer_text:
            # Calculate width of "welian.app" portion to place link rectangle
            full_w = canvas.stringWidth(footer_text, f, 8)
            link_w = canvas.stringWidth("welian.app", f, 8)
            x_start = 20*mm + (full_w - link_w)
            canvas.linkURL("https://welian.app",
                           (x_start, 9*mm, x_start + link_w, 12*mm),
                           relative=0)
        canvas.drawRightString(w-20*mm, 10*mm, f"第 {doc.page} 页")
        if doc.page == 1:
            canvas.setFillColor(COLOR_ACCENT)
            canvas.rect(0, h-8*mm, w, 8*mm, fill=1, stroke=0)
        canvas.restoreState()
    return _hf

def _card(items, styles):
    t = Table([[items]], colWidths=[170*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), COLOR_CARD_BG),
        ("BOX", (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ]))
    return t

# ── Build PDF from generic document ──

def build_pdf(doc_data: dict) -> bytes:
    styles = _build_styles()
    footer_text = doc_data.get("footer", "Welian 小维 · welian.app")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm)
    story = []

    # Title
    title = doc_data.get("title", "")
    if title:
        story.append(Paragraph(title, styles["title"]))
    subtitle = doc_data.get("subtitle", "")
    if subtitle:
        story.append(Paragraph(subtitle, styles["subtitle"]))
    elif title:
        story.append(Paragraph(f"生成于 {datetime.now().strftime('%Y-%m-%d')}", styles["subtitle"]))

    # Sections
    for sec in doc_data.get("sections", []):
        heading = sec.get("heading", "")
        if heading:
            story.append(Paragraph(heading, styles["h2"]))

        # Paragraph
        para = sec.get("paragraph", "")
        if para:
            story.append(Paragraph(para, styles["body"]))
            story.append(Spacer(1, 4))

        # Bullets
        bullets = sec.get("bullets", [])
        if bullets:
            for b in bullets:
                story.append(Paragraph(f"• {b}", styles["body"]))
            story.append(Spacer(1, 4))

        # Cards
        cards = sec.get("cards", [])
        if cards:
            for c in cards:
                items = []
                if c.get("title"):
                    items.append(Paragraph(c["title"], styles["card_title"]))
                if c.get("body"):
                    items.append(Paragraph(c["body"], styles["card_body"]))
                if c.get("accent"):
                    items.append(Paragraph(c["accent"], styles["card_accent"]))
                if items:
                    story.append(_card(items, styles))
                    story.append(Spacer(1, 4))

        # Table
        tbl = sec.get("table", {})
        if tbl and tbl.get("headers") and tbl.get("rows"):
            headers = tbl["headers"]
            rows = tbl["rows"]
            col_count = len(headers)
            # Calculate column widths
            total_w = 170 * mm
            col_w = [total_w / col_count] * col_count
            data = [[Paragraph(h, styles["card_title"]) for h in headers]]
            for row in rows:
                data.append([Paragraph(str(cell), styles["card_body"]) for cell in row])
            t = Table(data, colWidths=col_w)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,0), COLOR_LIGHT),
                ("GRID", (0,0), (-1,-1), 0.5, COLOR_BORDER),
                ("LEFTPADDING", (0,0), (-1,-1), 8),
                ("TOPPADDING", (0,0), (-1,-1), 6),
                ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ]))
            story.append(t)
            story.append(Spacer(1, 8))

        # Page break if requested
        if sec.get("page_break"):
            story.append(PageBreak())

    # Closing
    closing = doc_data.get("closing", "")
    if closing:
        story.append(Spacer(1, 12))
        story.append(Paragraph(closing, styles["body"]))

    # Footer paragraph with clickable welian.app link
    footer_html = footer_text.replace("welian.app", '<link href="https://welian.app" color="#4A6741">welian.app</link>')
    story.append(Paragraph(f"— {footer_html}", styles["footer"]))

    doc.build(story, onFirstPage=_make_header_footer(footer_text),
              onLaterPages=_make_header_footer(footer_text))
    return buf.getvalue()


def main():
    if len(sys.argv) < 3:
        print("Usage: welian_pdf.py input.json output.pdf", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if input_path == "-":
        data = json.load(sys.stdin)
    else:
        data = json.loads(Path(input_path).read_text("utf-8"))

    pdf_bytes = build_pdf(data)
    Path(output_path).write_bytes(pdf_bytes)
    print(f"✅ PDF generated: {output_path} ({len(pdf_bytes)} bytes)")


if __name__ == "__main__":
    main()
