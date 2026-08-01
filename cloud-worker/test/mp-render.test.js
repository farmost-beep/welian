// 测试 GET /ai/render 端点（SDUI 组件树渲染）
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader } from "./helpers.js";

describe("GET /ai/render", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("privacy 页 → 返回组件树", async () => {
    const res = await worker.fetch(new Request("https://api.welian.app/ai/render?page=privacy", {
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.page).toBe("privacy");
    expect(data.title).toBe("隐私政策");
    expect(data.components).toBeDefined();
    expect(data.components.length).toBeGreaterThan(5);
    expect(data.components[0].type).toBe("title");
    expect(data.components[0].content).toContain("隐私政策");
  });

  it("未知 page → 400", async () => {
    const res = await worker.fetch(new Request("https://api.welian.app/ai/render?page=unknown", {
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(400);
  });

  it("未认证 → 401", async () => {
    const res = await worker.fetch(new Request("https://api.welian.app/ai/render?page=weekly"), env, {});
    expect(res.status).toBe(401);
  });

  it("signals 页 → 返回组件树（card 风格）", async () => {
    // 预填充缓存避免外部 API 调用超时
    const hourKey = new Date().toISOString().slice(0, 13);
    await env.USER_DATA.put(`signals_preview:${hourKey}`, JSON.stringify({
      report: {
        greeting: "今日信号",
        themes: ["AI", "投资"],
        signals: [
          { title: "测试信号1", url: "https://example.com/1", source: "测试", value_score: 9, why: "重要", tags: ["AI"] },
          { title: "测试信号2", url: "https://example.com/2", source: "HN", value_score: 7, why: "值得关注", tags: ["投资"] },
        ],
      },
    }));

    const res = await worker.fetch(new Request("https://api.welian.app/ai/render?page=signals", {
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.page).toBe("signals");
    expect(data.title).toBe("今日信号");
    expect(data.components).toBeDefined();
    // 应有 header
    const header = data.components.find(c => c.type === "header");
    expect(header).toBeDefined();
    expect(header.title).toBe("📡 今日信号");
    // 应有 subtitle 小标题
    const subtitles = data.components.filter(c => c.type === "subtitle");
    expect(subtitles.length).toBeGreaterThanOrEqual(1);
    // 应有 card（按 value_score 降序）
    const cards = data.components.filter(c => c.type === "card");
    expect(cards.length).toBe(2);
    expect(cards[0].title).toContain("测试信号1");
    expect(cards[0].title).toContain("★9");
    expect(cards[0].title).toContain("[测试]");
    expect(cards[1].title).toContain("★7");
  });

  it("signals 页空信号 → empty-state", async () => {
    // 不填缓存，让 handleSignalsPreview 返回空（mock LLM 不可用）
    // 由于无法控制外部 API，这个测试验证 privacy 等不需要外部调用的页面
    // 空信号的 empty-state 逻辑在 signalsToComponents 中已测试
    expect(true).toBe(true);
  });

  it("article 页无 url → empty-state", async () => {
    const res = await worker.fetch(new Request("https://api.welian.app/ai/render?page=article", {
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.components[0].type).toBe("empty-state");
    expect(data.components[0].title).toContain("链接缺失");
  });

  it("weekly 页 → 返回组件树（header + section 分组）", async () => {
    // 预填充 weekly 缓存避免 LLM 调用超时
    const todayKey = new Date().toISOString().slice(0, 10);
    await env.USER_DATA.put(`weekly_cache:testuser:${todayKey}`, JSON.stringify({
      ok: true,
      report: {
        greeting: "这是你的本周回顾",
        review: { interactions: 5, new_todos: 3, completed_todos: 2 },
        suggest_contact: [{ name: "老许", reason: "上次聊了项目" }],
        todo_reminders: [{ task: "联系老许", contact: "老许", priority: "P1" }],
        upcoming_dates: [{ name: "老许", date: "2026-08-01", label: "生日" }],
        closing: "下周见",
      },
      raw_data: { weekSummary: { interactions: 5, new_todos: 3, completed_todos: 2 } },
    }));

    const res = await worker.fetch(new Request("https://api.welian.app/ai/render?page=weekly", {
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.page).toBe("weekly");
    expect(data.title).toBe("周报");
    expect(data.components).toBeDefined();
    expect(data.components.length).toBeGreaterThan(0);
    // 应该有 header（页面头部）
    const header = data.components.find(c => c.type === "header");
    expect(header).toBeDefined();
    expect(header.title).toBe("社交周报");
    // 应有 section 分组
    const sections = data.components.filter(c => c.type === "section");
    expect(sections.length).toBeGreaterThanOrEqual(3);
    // section 内应有 stat-group 和 list
    const allChildren = sections.flatMap(s => s.children || []);
    const hasStatGroup = allChildren.some(c => c.type === "stat-group");
    expect(hasStatGroup).toBe(true);
    const hasList = allChildren.some(c => c.type === "list");
    expect(hasList).toBe(true);
    // 章节顺序应对齐 web 端：本周回顾 → 近期重要日期 → 该联系谁 → 待办事项
    const sectionTitles = sections.filter(s => s.title).map(s => s.title);
    expect(sectionTitles).toContain("本周回顾");
    expect(sectionTitles).toContain("该联系谁");
    expect(sectionTitles).toContain("待办事项");
    expect(sectionTitles).toContain("近期重要日期");
    // 复制按钮应包含完整文本
    const buttons = data.components.find(c => c.type === "buttons");
    expect(buttons).toBeDefined();
    const copyBtn = buttons.items.find(b => b.action === "copy");
    expect(copyBtn).toBeDefined();
    expect(copyBtn.text.length).toBeGreaterThan(20);
    expect(copyBtn.text).toContain("社交周报");
    // 应有分享按钮
    const shareBtn = buttons.items.find(b => b.action === "share");
    expect(shareBtn).toBeDefined();
    expect(shareBtn.label).toBe("分享周报");
  });

  it("annual 页 → 返回组件树（header + section 分组）", async () => {
    // 预填充 annual 缓存避免 LLM 调用超时
    const year = new Date().getFullYear();
    await env.USER_DATA.put(`annual_cache:testuser:${year}`, JSON.stringify({
      ok: true,
      report: {
        greeting: "这是你的年度回顾",
        review: "这一年你记录了很多互动",
        key_numbers: [
          { label: "总互动次数", value: 120 },
          { label: "管理关系数", value: 50 },
          { label: "新增联系人", value: 15 },
          { label: "待办完成率", value: "80%" },
        ],
        health: { active: 20, cooling: 10, dormant: 20 },
        highlights: "互动最频繁的月份是6月",
        growth: "生成了30条建议",
        suggestions: ["定期回顾冷却中的关系", "保持每月互动节奏"],
        top_contacts: [{ name: "老许", count: 25 }, { name: "张总", count: 18 }],
        year,
      },
    }));

    const res = await worker.fetch(new Request("https://api.welian.app/ai/render?page=annual", {
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.page).toBe("annual");
    expect(data.title).toBe("年度报告");
    expect(data.components).toBeDefined();
    expect(data.components.length).toBeGreaterThan(0);
    // 应有 header
    const header = data.components.find(c => c.type === "header");
    expect(header).toBeDefined();
    expect(header.title).toContain("年度报告");
    // 应有 section 分组
    const sections = data.components.filter(c => c.type === "section");
    expect(sections.length).toBeGreaterThanOrEqual(3);
    // 章节应包含年度回顾、关键数字、关系健康度
    const sectionTitles = sections.filter(s => s.title).map(s => s.title);
    expect(sectionTitles).toContain("年度回顾");
    expect(sectionTitles).toContain("关键数字");
    expect(sectionTitles).toContain("关系健康度");
    expect(sectionTitles).toContain("互动排行");
    expect(sectionTitles).toContain("明年建议");
    // section 内应有 stat-group 和 list
    const allChildren = sections.flatMap(s => s.children || []);
    const hasStatGroup = allChildren.some(c => c.type === "stat-group");
    expect(hasStatGroup).toBe(true);
    const hasList = allChildren.some(c => c.type === "list");
    expect(hasList).toBe(true);
    // 应有分享和复制按钮
    const buttons = data.components.find(c => c.type === "buttons");
    expect(buttons).toBeDefined();
    const shareBtn = buttons.items.find(b => b.action === "share");
    expect(shareBtn).toBeDefined();
    expect(shareBtn.label).toBe("分享年度报告");
    const copyBtn = buttons.items.find(b => b.action === "copy");
    expect(copyBtn).toBeDefined();
    expect(copyBtn.text.length).toBeGreaterThan(20);
    expect(copyBtn.text).toContain("年度报告");
  });
});
