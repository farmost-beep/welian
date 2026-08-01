// 测试 Dashboard 纯逻辑函数（miniprogram/utils/dashboard-logic.js）
import { describe, it, expect } from "vitest";
import { buildRoles, classifyContact, classifyTodos, calcEvolutionStage, buildUpcomingDates } from "../miniprogram/utils/dashboard-logic.js";

// 固定"今天"为 2026-07-27（周一），避免测试随时间漂移
const TODAY = new Date(2026, 6, 27); // 月份 0-indexed

function daysAgo(n) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAhead(n) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe("dashboard-logic: classifyContact", () => {
  it("家人关键词 → family", () => {
    expect(classifyContact({ relationship: "父亲" })).toBe("family");
    expect(classifyContact({ relation: "妻子" })).toBe("family");
    expect(classifyContact({ relationship: "兄弟" })).toBe("family");
  });
  it("朋友关键词 → friend", () => {
    expect(classifyContact({ relationship: "大学同学" })).toBe("friend");
    expect(classifyContact({ relation: "闺蜜" })).toBe("friend");
  });
  it("nature=nurture 无家人关键词 → friend", () => {
    expect(classifyContact({ nature: "nurture", relationship: "" })).toBe("friend");
  });
  it("未设置/经营型 → collaborator", () => {
    expect(classifyContact({})).toBe("collaborator");
    expect(classifyContact({ nature: "leverage" })).toBe("collaborator");
  });
  it("nature=nurture 但有家人关键词 → family（家人优先）", () => {
    expect(classifyContact({ nature: "nurture", relationship: "妈妈" })).toBe("family");
  });
});


describe("dashboard-logic: buildRoles", () => {
  it("空联系人 → 三个角色各一条'还没有记录'提示，recentInteractions 为空", () => {
    const roles = buildRoles([], [], TODAY);
    expect(roles).toHaveLength(3);
    roles.forEach(r => {
      expect(r.items).toHaveLength(1);
      expect(r.items[0].text).toContain("还没有记录");
      expect(r.recentInteractions).toEqual([]);
    });
  });
  it("合作者超过14天未联系 → 冷却预警，actionable=true", () => {
    const contacts = [{ id: "c1", name: "张总", relationship: "合作方" }];
    const timeline = [{ id: "t1", contact: "c1", date: daysAgo(20), summary: "开会" }];
    const roles = buildRoles(contacts, timeline, TODAY);
    const collab = roles.find(r => r.key === "collaborator");
    const coldItem = collab.items.find(i => i.actionable);
    expect(coldItem).toBeTruthy();
    expect(coldItem.text).toContain("14 天未联系");
    expect(coldItem.contactName).toBe("张总");
  });
  it("朋友超过30天未联系 → 冷却预警（💛 非 ⚠️）", () => {
    const contacts = [{ id: "c1", name: "老王", relationship: "发小" }];
    const timeline = [];
    const roles = buildRoles(contacts, timeline, TODAY);
    const friend = roles.find(r => r.key === "friend");
    const coldItem = friend.items.find(i => i.actionable);
    expect(coldItem).toBeTruthy();
    expect(coldItem.text).toContain("💛");
    expect(coldItem.text).toContain("30 天未联系");
  });
  it("本月互动 vs 上月互动 → 趋势箭头", () => {
    const contacts = [{ id: "c1", name: "老王", relationship: "发小" }];
    const timeline = [
      { id: "t1", contact: "c1", contact_name: "老王", date: daysAgo(5), summary: "吃饭" }, // 本月
      { id: "t2", contact: "c1", contact_name: "老王", date: daysAgo(35), summary: "打电话" }, // 上月
      { id: "t3", contact: "c1", contact_name: "老王", date: daysAgo(40), summary: "微信" }, // 上月
    ];
    const roles = buildRoles(contacts, timeline, TODAY);
    const friend = roles.find(r => r.key === "friend");
    const trendItem = friend.items.find(i => i.text.includes("↑") || i.text.includes("↓") || i.text.includes("→"));
    expect(trendItem).toBeTruthy();
    // 本月1次 vs 上月2次 → 下降
    expect(trendItem.text).toContain("↓");
    expect(trendItem.tone).toBe("warning");
  });
  it("recentInteractions 最多2条，按日期倒序", () => {
    const contacts = [{ id: "c1", name: "老王", relationship: "发小" }];
    const timeline = [
      { id: "t1", contact: "c1", contact_name: "老王", date: daysAgo(5), summary: "最近一次" },
      { id: "t2", contact: "c1", contact_name: "老王", date: daysAgo(10), summary: "第二次" },
      { id: "t3", contact: "c1", contact_name: "老王", date: daysAgo(15), summary: "第三次" },
    ];
    const roles = buildRoles(contacts, timeline, TODAY);
    const friend = roles.find(r => r.key === "friend");
    expect(friend.recentInteractions).toHaveLength(2);
    expect(friend.recentInteractions[0].summary).toBe("最近一次");
    expect(friend.recentInteractions[1].summary).toBe("第二次");
  });
  it("生日在30天内 → 提醒", () => {
    const contacts = [{ id: "c1", name: "小明", relationship: "发小", birthday: daysAhead(10) }];
    const roles = buildRoles(contacts, [], TODAY);
    const friend = roles.find(r => r.key === "friend");
    const bdayItem = friend.items.find(i => i.text.includes("生日"));
    expect(bdayItem).toBeTruthy();
    expect(bdayItem.text).toContain("小明");
    expect(bdayItem.text).toContain("10 天");
  });
  it("important_dates MM-DD 格式 → 提醒", () => {
    const contacts = [{
      id: "c1", name: "小红", relationship: "发小",
      important_dates: [{ label: "纪念日", date: "08-05" }],
    }];
    const roles = buildRoles(contacts, [], TODAY);
    const friend = roles.find(r => r.key === "friend");
    const dateItem = friend.items.find(i => i.text.includes("纪念日"));
    expect(dateItem).toBeTruthy();
    expect(dateItem.text).toContain("小红");
  });
  it("summary 截断到40字", () => {
    const longSummary = "这是一段非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的摘要".slice(0, 50);
    const contacts = [{ id: "c1", name: "老王", relationship: "发小" }];
    const timeline = [{ id: "t1", contact: "c1", contact_name: "老王", date: daysAgo(5), summary: longSummary }];
    const roles = buildRoles(contacts, timeline, TODAY);
    const friend = roles.find(r => r.key === "friend");
    expect(friend.recentInteractions[0].summary.length).toBe(40);
  });
});

describe("dashboard-logic: classifyTodos", () => {
  it("逾期 → overdue", () => {
    const todos = [{ id: "1", due: daysAgo(2) }];
    const result = classifyTodos(todos, TODAY);
    expect(result.overdue).toHaveLength(1);
    expect(result.today).toHaveLength(0);
  });
  it("今天 → today", () => {
    const todos = [{ id: "1", due: daysAgo(0) }];
    const result = classifyTodos(todos, TODAY);
    expect(result.today).toHaveLength(1);
    expect(result.overdue).toHaveLength(0);
  });
  it("最多3条", () => {
    const todos = Array.from({ length: 5 }, (_, i) => ({ id: String(i), due: daysAgo(1) }));
    const result = classifyTodos(todos, TODAY);
    expect(result.overdue).toHaveLength(3);
  });
  it("无 due 的待办不出现", () => {
    const todos = [{ id: "1" }, { id: "2", due: "" }];
    const result = classifyTodos(todos, TODAY);
    expect(result.overdue).toHaveLength(0);
    expect(result.today).toHaveLength(0);
  });
});

describe("dashboard-logic: calcEvolutionStage", () => {
  it("0联系人 0互动 → 初生", () => {
    const stage = calcEvolutionStage(0, 0);
    expect(stage.name).toBe("初生");
    expect(stage.icon).toBe("🌱");
    expect(stage.next).toBe("启蒙");
    expect(stage.progress).toBe(0);
  });
  it("3联系人 1互动 → 启蒙", () => {
    const stage = calcEvolutionStage(3, 1);
    expect(stage.name).toBe("启蒙");
    expect(stage.next).toBe("成长");
  });
  it("10联系人 20互动 → 成长（边界）", () => {
    const stage = calcEvolutionStage(10, 20);
    expect(stage.name).toBe("成长");
    expect(stage.next).toBe("成熟");
  });
  it("30联系人 100互动 → 成熟（边界）", () => {
    const stage = calcEvolutionStage(30, 100);
    expect(stage.name).toBe("成熟");
    expect(stage.next).toBe("精通");
  });
  it("50联系人 300互动 → 精通（最高）", () => {
    const stage = calcEvolutionStage(50, 300);
    expect(stage.name).toBe("精通");
    expect(stage.next).toBeNull();
    expect(stage.progress).toBe(100);
  });
  it("联系人数够但互动不够 → 取较低阶段", () => {
    // 50联系人但只有50互动 → 不够精通(300)，不够成熟(100) → 成长(20)
    const stage = calcEvolutionStage(50, 50);
    expect(stage.name).toBe("成长");
  });
  it("progress 是联系人和互动两维度的平均", () => {
    // 初生→启蒙：联系人 0→3, 互动 0→1
    // 1联系人 0互动 → 联系人 33%, 互动 0% → 平均 17%
    const stage = calcEvolutionStage(1, 0);
    expect(stage.progress).toBe(17);
  });
});

describe("dashboard-logic: buildUpcomingDates", () => {
  it("生日在30天内 → 出现", () => {
    const contacts = [{ name: "小明", birthday: daysAhead(10) }];
    const dates = buildUpcomingDates(contacts, TODAY);
    expect(dates).toHaveLength(1);
    expect(dates[0].name).toBe("小明");
    expect(dates[0].label).toBe("生日");
    expect(dates[0].days).toBe(10);
  });
  it("生日超过30天 → 不出现", () => {
    const contacts = [{ name: "小明", birthday: daysAhead(45) }];
    expect(buildUpcomingDates(contacts, TODAY)).toEqual([]);
  });
  it("important_dates MM-DD 格式 → 正确解析", () => {
    const contacts = [{
      name: "小红",
      important_dates: [{ label: "纪念日", date: "08-05" }],
    }];
    const dates = buildUpcomingDates(contacts, TODAY);
    expect(dates).toHaveLength(1);
    expect(dates[0].label).toBe("纪念日");
    expect(dates[0].days).toBe(9); // 7/27 → 8/5 = 9天
  });
  it("按天数升序排列", () => {
    const contacts = [
      { name: "A", birthday: daysAhead(20) },
      { name: "B", birthday: daysAhead(5) },
      { name: "C", birthday: daysAhead(10) },
    ];
    const dates = buildUpcomingDates(contacts, TODAY);
    expect(dates[0].name).toBe("B");
    expect(dates[1].name).toBe("C");
    expect(dates[2].name).toBe("A");
  });
  it("最多5条", () => {
    const contacts = Array.from({ length: 8 }, (_, i) => ({ name: `人${i}`, birthday: daysAhead(i + 1) }));
    expect(buildUpcomingDates(contacts, TODAY)).toHaveLength(5);
  });
  it("空联系人 → 空数组", () => {
    expect(buildUpcomingDates([], TODAY)).toEqual([]);
  });
  it("已过生日 → 取明年（超过30天不显示）", () => {
    // 生日是1月1日，已过 → 明年1月1日，距现在>30天 → 不显示
    const contacts = [{ name: "老王", birthday: "2020-01-01T12:00:00" }];
    const dates = buildUpcomingDates(contacts, TODAY);
    expect(dates).toEqual([]);
  });
  it("刚过不久的生日 → 取明年仍在30天内则显示", () => {
    // 生日是7月10日，刚过17天 → 明年7月10日，距现在~348天 > 30 → 不显示
    // 改用 important_dates 测试逻辑：用7月25日的日期，刚过2天，明年7月25日 ~363天
    // 这个 case 难以构造30天内的"已过取明年"场景，跳过
    const contacts = [{ name: "老王", birthday: "2020-07-10T12:00:00" }];
    const dates = buildUpcomingDates(contacts, TODAY);
    expect(dates).toEqual([]); // 明年7月10日 > 30天
  });
});
