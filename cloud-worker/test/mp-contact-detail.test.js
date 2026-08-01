// 测试 contact-detail-logic: calcCooldown
import { describe, it, expect } from "vitest";
import { calcCooldown } from "../miniprogram/utils/contact-detail-logic.js";

const NOW = new Date(2026, 6, 27);

function dayOffset(n) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe("contact-detail-logic: calcCooldown", () => {
  it("nurture 关系 → null（不触发冷却）", () => {
    const entries = [{ date: dayOffset(-20) }];
    expect(calcCooldown(entries, { nature: "nurture" }, NOW)).toBeNull();
  });
  it("leverage 关系 + 10天 → status=ok", () => {
    const entries = [{ date: dayOffset(-10) }];
    const result = calcCooldown(entries, { nature: "leverage" }, NOW);
    expect(result.days).toBe(10);
    expect(result.status).toBe("ok");
  });
  it("leverage 关系 + 14天 → status=cooling（边界）", () => {
    const entries = [{ date: dayOffset(-14) }];
    const result = calcCooldown(entries, { nature: "leverage" }, NOW);
    expect(result.days).toBe(14);
    expect(result.status).toBe("cooling");
  });
  it("leverage 关系 + 30天 → status=cold（边界）", () => {
    const entries = [{ date: dayOffset(-30) }];
    const result = calcCooldown(entries, { nature: "leverage" }, NOW);
    expect(result.days).toBe(30);
    expect(result.status).toBe("cold");
  });
  it("dual 关系也触发冷却", () => {
    const entries = [{ date: dayOffset(-20) }];
    const result = calcCooldown(entries, { nature: "dual" }, NOW);
    expect(result).toBeTruthy();
    expect(result.status).toBe("cooling");
  });
  it("多条记录 → 取最近的", () => {
    const entries = [
      { date: dayOffset(-40) },
      { date: dayOffset(-5) },
      { date: dayOffset(-20) },
    ];
    const result = calcCooldown(entries, { nature: "leverage" }, NOW);
    expect(result.days).toBe(5);
    expect(result.status).toBe("ok");
  });
  it("空 entries → null", () => {
    expect(calcCooldown([], { nature: "leverage" }, NOW)).toBeNull();
  });
  it("null contact → null", () => {
    expect(calcCooldown([{ date: dayOffset(-5) }], null, NOW)).toBeNull();
  });
  it("无 nature → null", () => {
    expect(calcCooldown([{ date: dayOffset(-5) }], {}, NOW)).toBeNull();
  });
  it("记录无 date → null", () => {
    const entries = [{ summary: "无日期" }];
    expect(calcCooldown(entries, { nature: "leverage" }, NOW)).toBeNull();
  });
});
