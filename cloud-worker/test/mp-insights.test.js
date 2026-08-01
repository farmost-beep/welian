// 测试 GET /ai/insights 端点（自进化行为洞察读取）
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader } from "./helpers.js";

describe("GET /ai/insights", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("无洞察 → 返回空数组", async () => {
    const res = await worker.fetch(new Request("https://api.welian.app/ai/insights", {
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.insights).toEqual([]);
  });

  it("有洞察 → 解析为数组返回", async () => {
    const insights = `## 行为洞察
- 建议包含具体人名时采纳率78%，泛泛建议仅12%
- 经营型联系人的互动频率偏低（4周仅3次）
- 待办完成率高（85%），用户执行力强`;
    await env.USER_DATA.put("prompt:behavioral_insights:testuser.md", insights);

    const res = await worker.fetch(new Request("https://api.welian.app/ai/insights", {
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.insights).toHaveLength(3);
    expect(data.insights[0]).toContain("采纳率78%");
    expect(data.insights[1]).toContain("互动频率偏低");
    expect(data.insights[2]).toContain("待办完成率高");
  });

  it("过滤掉标题行和短行", async () => {
    const insights = `## 行为洞察

- 第一条洞察足够长可以保留
短
- 第二条洞察足够长可以保留`;
    await env.USER_DATA.put("prompt:behavioral_insights:testuser.md", insights);

    const res = await worker.fetch(new Request("https://api.welian.app/ai/insights", {
      headers: authHeader(),
    }), env, {});
    const data = await res.json();
    // "## 行为洞察" 被过滤（#开头），"短" 被过滤（长度<=10）
    expect(data.insights).toHaveLength(2);
  });

  it("未认证 → 401", async () => {
    const res = await worker.fetch(new Request("https://api.welian.app/ai/insights"), env, {});
    expect(res.status).toBe(401);
  });
});
