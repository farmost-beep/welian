// 测试 monthly-logic: formatMonthLabel
import { describe, it, expect } from "vitest";
import { formatMonthLabel } from "../miniprogram/utils/monthly-logic.js";

describe("monthly-logic: formatMonthLabel", () => {
  it("'2026-7' → '2026年7月回顾'", () => {
    expect(formatMonthLabel("2026-7")).toBe("2026年7月回顾");
  });
  it("'2026-12' → '2026年12月回顾'", () => {
    expect(formatMonthLabel("2026-12")).toBe("2026年12月回顾");
  });
  it("'2026-01' → '2026年1月回顾'（去前导零）", () => {
    expect(formatMonthLabel("2026-01")).toBe("2026年1月回顾");
  });
  it("空字符串 → 当前月", () => {
    const result = formatMonthLabel("");
    expect(result).toMatch(/^\d{4}年\d{1,2}月回顾$/);
  });
  it("null → 当前月", () => {
    const result = formatMonthLabel(null);
    expect(result).toMatch(/^\d{4}年\d{1,2}月回顾$/);
  });
  it("undefined → 当前月", () => {
    const result = formatMonthLabel(undefined);
    expect(result).toMatch(/^\d{4}年\d{1,2}月回顾$/);
  });
  it("无效格式 → 当前月", () => {
    expect(formatMonthLabel("invalid")).toMatch(/^\d{4}年\d{1,2}月回顾$/);
    expect(formatMonthLabel("2026")).toMatch(/^\d{4}年\d{1,2}月回顾$/);
  });
});
