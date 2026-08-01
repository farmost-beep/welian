// 测试 /ai/config 端点（config-driven 架构核心）
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader } from "./helpers.js";

describe("GET /ai/config", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("返回默认 config（含 thresholds + feature_flags + evolution_stages）", async () => {
    const res = await worker.fetch(new Request("https://api.welian.app/ai/config", {
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.routing).toBeDefined();
    expect(data.tiers).toBeDefined();
    expect(data.thresholds).toBeDefined();
    expect(data.thresholds.cooldown_leverage).toBe(14);
    expect(data.thresholds.cooldown_nurture).toBe(30);
    expect(data.thresholds.page_size_contacts).toBe(100);
    expect(data.feature_flags).toBeDefined();
    expect(data.feature_flags.insights).toBe(true);
    expect(data.feature_flags.signals).toBe(true);
    expect(data.evolution_stages).toHaveLength(5);
    expect(data.evolution_stages[0].name).toBe("初生");
    expect(data.evolution_stages[4].name).toBe("精通");
    expect(data.labels.priority.P1).toBe("紧急");
    expect(data.labels.postpone_days).toEqual([1, 3, 7, 14]);
    expect(data.subscribe_templates.todo_due).toBeDefined();
  });

  it("KV config:app 可覆盖默认值", async () => {
    await env.USER_DATA.put("config:app", JSON.stringify({
      feature_flags: { insights: false, signals: true },
      thresholds: { cooldown_leverage: 21 },
    }));
    const res = await worker.fetch(new Request("https://api.welian.app/ai/config", {
      headers: authHeader(),
    }), env, {});
    const data = await res.json();
    expect(data.feature_flags.insights).toBe(false);
    expect(data.feature_flags.signals).toBe(true);
    expect(data.thresholds.cooldown_leverage).toBe(21);
    // 未覆盖的保持默认
    expect(data.thresholds.cooldown_nurture).toBe(30);
  });

  it("无需认证即可访问", async () => {
    const res = await worker.fetch(new Request("https://api.welian.app/ai/config"), env, {});
    expect(res.status).toBe(200);
  });
});
