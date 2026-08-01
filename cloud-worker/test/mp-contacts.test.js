// 测试 Contacts 纯逻辑函数（miniprogram/utils/contacts-logic.js）
import { describe, it, expect } from "vitest";
import { groupContactsBy, groupLabels, filterContacts } from "../miniprogram/utils/contacts-logic.js";

const CONTACTS = [
  { id: "1", name: "张三", company: "腾讯", relationship: "合作方", tags: ["VIP"] },
  { id: "2", name: "李四", company: "腾讯", relationship: "同学", tags: ["VIP"] },
  { id: "3", name: "王五", company: "阿里", relationship: "合作方", tags: [] },
  { id: "4", name: "赵六", company: "", relationship: "", tags: [] },
];

describe("contacts-logic: groupContactsBy", () => {
  it("none 模式 → 空数组", () => {
    expect(groupContactsBy(CONTACTS, "none")).toEqual([]);
    expect(groupContactsBy(CONTACTS, "")).toEqual([]);
  });
  it("按公司分组", () => {
    const grouped = groupContactsBy(CONTACTS, "company");
    const keys = grouped.map(g => g.key);
    expect(keys).toContain("腾讯");
    expect(keys).toContain("阿里");
    expect(keys).toContain("未填写");
    const tencent = grouped.find(g => g.key === "腾讯");
    expect(tencent.count).toBe(2);
    expect(tencent.items).toHaveLength(2);
  });
  it("按关系分组", () => {
    const grouped = groupContactsBy(CONTACTS, "relation");
    const keys = grouped.map(g => g.key);
    expect(keys).toContain("合作方");
    expect(keys).toContain("同学");
    expect(keys).toContain("未分类");
  });
  it("按标签分组（取第一个标签）", () => {
    const grouped = groupContactsBy(CONTACTS, "tag");
    const keys = grouped.map(g => g.key);
    expect(keys).toContain("VIP");
    expect(keys).toContain("无标签");
    const vip = grouped.find(g => g.key === "VIP");
    expect(vip.count).toBe(2);
  });
  it("'未填写'类排最后", () => {
    const grouped = groupContactsBy(CONTACTS, "company");
    expect(grouped[grouped.length - 1].key).toBe("未填写");
  });
  it("正常组按拼音排序", () => {
    const grouped = groupContactsBy(CONTACTS, "company");
    const normalKeys = grouped.filter(g => g.key !== "未填写").map(g => g.key);
    // 阿里 < 腾讯（拼音 A < T）
    expect(normalKeys[0]).toBe("阿里");
    expect(normalKeys[1]).toBe("腾讯");
  });
  it("空列表 → 空分组", () => {
    expect(groupContactsBy([], "company")).toEqual([]);
  });
});

describe("contacts-logic: groupLabels", () => {
  it("生成 '名称（数量）' 格式", () => {
    const grouped = [
      { key: "腾讯", count: 2, items: [] },
      { key: "阿里", count: 1, items: [] },
    ];
    expect(groupLabels(grouped)).toEqual(["腾讯（2）", "阿里（1）"]);
  });
  it("空数组 → 空数组", () => {
    expect(groupLabels([])).toEqual([]);
  });
});

describe("contacts-logic: filterContacts", () => {
  it("空关键词 → null（表示不搜索）", () => {
    expect(filterContacts(CONTACTS, "")).toBeNull();
    expect(filterContacts(CONTACTS, "   ")).toBeNull();
  });
  it("按名字搜索", () => {
    const result = filterContacts(CONTACTS, "张三");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("张三");
  });
  it("按公司搜索", () => {
    const result = filterContacts(CONTACTS, "腾讯");
    expect(result).toHaveLength(2);
  });
  it("按关系搜索", () => {
    const result = filterContacts(CONTACTS, "合作方");
    expect(result).toHaveLength(2);
  });
  it("按标签搜索", () => {
    const result = filterContacts(CONTACTS, "VIP");
    expect(result).toHaveLength(2);
  });
  it("大小写不敏感", () => {
    const result = filterContacts(CONTACTS, "vip");
    expect(result).toHaveLength(2);
  });
  it("无匹配 → 空数组", () => {
    const result = filterContacts(CONTACTS, "不存在的名字");
    expect(result).toEqual([]);
  });
});
