// 测试 timeline-logic: filterAndGroup + formatDateInput
import { describe, it, expect } from "vitest";
import { filterAndGroup, formatDateInput } from "../miniprogram/utils/timeline-logic.js";

const RAW = [
  { id: "1", contact_name: "张三", summary: "聊了项目", date: "2026-07-15" },
  { id: "2", contact_name: "李四", summary: "吃了饭", date: "2026-07-20" },
  { id: "3", contact_name: "张三", summary: "电话沟通", date: "2026-06-10" },
  { id: "4", contact_name: "王五", summary: "微信聊天", date: "2026-07-25" },
];

describe("timeline-logic: filterAndGroup", () => {
  it("无搜索 → 全部按月分组", () => {
    const groups = filterAndGroup(RAW, "");
    expect(groups).toHaveLength(2); // 7月 + 6月
    expect(groups[0].key).toBe("2026-7");
    expect(groups[1].key).toBe("2026-6");
  });
  it("按日期降序（7月组在前）", () => {
    const groups = filterAndGroup(RAW, "");
    expect(groups[0].label).toBe("2026年7月");
    expect(groups[1].label).toBe("2026年6月");
  });
  it("组内条目也按日期降序", () => {
    const groups = filterAndGroup(RAW, "");
    const july = groups[0];
    expect(july.entries[0].date).toBe("2026-07-25");
    expect(july.entries[1].date).toBe("2026-07-20");
    expect(july.entries[2].date).toBe("2026-07-15");
  });
  it("搜索联系人名 → 过滤", () => {
    const groups = filterAndGroup(RAW, "张三");
    expect(groups).toHaveLength(2); // 7月 + 6月各一条
    const allEntries = groups.flatMap(g => g.entries);
    expect(allEntries).toHaveLength(2);
    expect(allEntries.every(e => e.contact_name === "张三")).toBe(true);
  });
  it("搜索摘要关键词 → 过滤", () => {
    const groups = filterAndGroup(RAW, "饭");
    const allEntries = groups.flatMap(g => g.entries);
    expect(allEntries).toHaveLength(1);
    expect(allEntries[0].contact_name).toBe("李四");
  });
  it("搜索大小写不敏感", () => {
    const data = [{ id: "1", contact_name: "Alice", summary: "Meeting", date: "2026-07-01" }];
    const groups = filterAndGroup(data, "alice");
    expect(groups[0].entries).toHaveLength(1);
  });
  it("每条加 dateLabel（M月D日）", () => {
    const groups = filterAndGroup(RAW, "");
    const entry = groups[0].entries[0]; // 2026-07-25
    expect(entry.dateLabel).toBe("7月25日");
  });
  it("空列表 → 空分组", () => {
    expect(filterAndGroup([], "")).toEqual([]);
  });
  it("无匹配搜索 → 空分组", () => {
    expect(filterAndGroup(RAW, "不存在的人")).toEqual([]);
  });
  it("搜索关键词前后空格被 trim", () => {
    const groups = filterAndGroup(RAW, "  张三  ");
    expect(groups.flatMap(g => g.entries)).toHaveLength(2);
  });
});

describe("timeline-logic: formatDateInput", () => {
  it("Date → YYYY-MM-DD", () => {
    expect(formatDateInput(new Date(2026, 6, 27))).toBe("2026-07-27");
    expect(formatDateInput(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("补前导零", () => {
    expect(formatDateInput(new Date(2026, 11, 1))).toBe("2026-12-01");
  });
});
