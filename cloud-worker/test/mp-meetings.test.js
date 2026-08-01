// 测试 meetings-logic: formatDate
import { describe, it, expect } from "vitest";
import { formatDate } from "../miniprogram/utils/meetings-logic.js";

const NOW = new Date(2026, 6, 27); // 2026-07-27

function dayOffset(n) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe("meetings-logic: formatDate", () => {
  it("空字符串 → 空字符串", () => {
    expect(formatDate("", NOW)).toBe("");
    expect(formatDate(null, NOW)).toBe("");
  });
  it("今天 → '今天 M月D日'", () => {
    expect(formatDate(dayOffset(0), NOW)).toBe("今天 7月27日");
  });
  it("明天 → '明天 M月D日'", () => {
    expect(formatDate(dayOffset(1), NOW)).toBe("明天 7月28日");
  });
  it("昨天 → '昨天 M月D日'", () => {
    expect(formatDate(dayOffset(-1), NOW)).toBe("昨天 7月26日");
  });
  it("其他日期 → 'M月D日'", () => {
    expect(formatDate(dayOffset(10), NOW)).toBe("8月6日");
    expect(formatDate(dayOffset(-10), NOW)).toBe("7月17日");
  });
  it("无效日期 → 返回原字符串", () => {
    expect(formatDate("not-a-date", NOW)).toBe("not-a-date");
  });
  it("跨月", () => {
    expect(formatDate("2026-08-15", NOW)).toBe("8月15日");
    expect(formatDate("2026-06-15", NOW)).toBe("6月15日");
  });
});
