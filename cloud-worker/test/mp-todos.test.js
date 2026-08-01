// 测试 Todos 纯逻辑函数（miniprogram/utils/todos-logic.js）
import { describe, it, expect } from "vitest";
import { dueStatus, formatDate, formatTodos, groupTodos } from "../miniprogram/utils/todos-logic.js";

const TODAY = new Date(2026, 6, 27); // 2026-07-27

function dayOffset(n) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayOffsetTime(n, h = 14, m = 30) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  d.setHours(h, m);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

describe("todos-logic: dueStatus", () => {
  it("无 due → nodate", () => {
    expect(dueStatus({}, TODAY)).toBe("nodate");
    expect(dueStatus({ due: "" }, TODAY)).toBe("nodate");
  });
  it("今天 → today", () => {
    expect(dueStatus({ due: dayOffset(0) }, TODAY)).toBe("today");
  });
  it("昨天 → overdue", () => {
    expect(dueStatus({ due: dayOffset(-1) }, TODAY)).toBe("overdue");
  });
  it("3天后 → week", () => {
    expect(dueStatus({ due: dayOffset(3) }, TODAY)).toBe("week");
  });
  it("7天后 → week（边界）", () => {
    expect(dueStatus({ due: dayOffset(7) }, TODAY)).toBe("week");
  });
  it("8天后 → later", () => {
    expect(dueStatus({ due: dayOffset(8) }, TODAY)).toBe("later");
  });
});

describe("todos-logic: formatDate", () => {
  it("今天", () => {
    expect(formatDate(dayOffset(0), TODAY)).toBe("今天");
  });
  it("明天", () => {
    expect(formatDate(dayOffset(1), TODAY)).toBe("明天");
  });
  it("昨天", () => {
    expect(formatDate(dayOffset(-1), TODAY)).toBe("昨天");
  });
  it("逾期5天", () => {
    expect(formatDate(dayOffset(-5), TODAY)).toBe("逾期5天");
  });
  it("3天后", () => {
    expect(formatDate(dayOffset(3), TODAY)).toBe("3天后");
  });
  it("超过7天 → 月日格式", () => {
    expect(formatDate(dayOffset(10), TODAY)).toBe("8月6日");
  });
  it("带时间 → 追加 HH:MM", () => {
    expect(formatDate(dayOffsetTime(1), TODAY)).toContain("14:30");
  });
});

describe("todos-logic: formatTodos", () => {
  it("给每条加 dueStatus/dueLabel/priorityLabel", () => {
    const todos = [
      { id: "1", due: dayOffset(0), priority: "P1" },
      { id: "2", due: dayOffset(3), priority: "P2" },
      { id: "3", due: dayOffset(-1), priority: "P3" },
    ];
    const result = formatTodos(todos, TODAY);
    expect(result[0].dueStatus).toBe("today");
    expect(result[0].dueLabel).toBe("今天");
    expect(result[0].priorityLabel).toBe("🔴");
    expect(result[1].priorityLabel).toBe("🟡");
    expect(result[2].priorityLabel).toBe("");
    expect(result[2].dueStatus).toBe("overdue");
  });
  it("completed_at → completedLabel", () => {
    const todos = [{ id: "1", completed_at: dayOffset(-2) }];
    const result = formatTodos(todos, TODAY);
    expect(result[0].completedLabel).toBe("逾期2天");
  });
});

describe("todos-logic: groupTodos", () => {
  it("按 dueStatus 分组，空组不出现", () => {
    const todos = [
      { id: "1", dueStatus: "today" },
      { id: "2", dueStatus: "today" },
      { id: "3", dueStatus: "overdue" },
    ];
    const groups = groupTodos(todos);
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe("overdue");
    expect(groups[0].items).toHaveLength(1);
    expect(groups[1].key).toBe("today");
    expect(groups[1].items).toHaveLength(2);
  });
  it("顺序：overdue → today → week → later → nodate", () => {
    const todos = [
      { id: "1", dueStatus: "nodate" },
      { id: "2", dueStatus: "later" },
      { id: "3", dueStatus: "week" },
      { id: "4", dueStatus: "today" },
      { id: "5", dueStatus: "overdue" },
    ];
    const groups = groupTodos(todos);
    expect(groups.map(g => g.key)).toEqual(["overdue", "today", "week", "later", "nodate"]);
  });
  it("空数组 → 空分组", () => {
    expect(groupTodos([])).toEqual([]);
  });
});
