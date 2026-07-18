#!/usr/bin/env python3
"""Generate OpenAPI 3.0 spec for Welian Cloud Worker API."""
import json

ST = {"type": "string"}
INT = {"type": "integer"}
NUM = {"type": "number"}
BOOL = {"type": "boolean"}

def ref(name):
    return {"$ref": f"#/components/schemas/{name}"}

def obj(props, required=None):
    """Create an object schema."""
    s = {"type": "object", "properties": props}
    if required:
        s["required"] = required
    return s

def arr(items):
    """Create an array schema."""
    return {"type": "array", "items": items}

def json_body(props, required=None, required_body=False):
    schema = obj(props, required)
    return {"required": required_body, "content": {"application/json": {"schema": schema}}}

def resp(desc, schema=None):
    r = {"description": desc}
    if schema:
        r["content"] = {"application/json": {"schema": schema}}
    return r

def err(desc):
    return resp(desc, ref("Error"))

def param(name, location="query", required=False, schema_type="string", desc=""):
    return {"name": name, "in": location, "required": required, "schema": {"type": schema_type}, "description": desc}

def enum_str(*vals):
    return {"type": "string", "enum": list(vals)}

# Auth security schemes
clerk_sec = [{"clerkBearer": []}]
clerk_or_body = [{"clerkBearer": []}, {"sessionTokenBody": []}]
sync_sec = [{"syncToken": []}]
no_sec = []

UNAUTH = {"$ref": "#/components/responses/Unauthorized"}

spec = {
    "openapi": "3.0.3",
    "info": {
        "title": "Welian Cloud AI API",
        "description": "Welian Cloud Worker API — 数据归你，智能来云。\n\nThis Cloudflare Worker receives only minimal context snippets from edge clients. It processes AI requests, manages user data in KV, handles billing, and never stores full user data.\n\n## Authentication\n\nMost endpoints require authentication via one of:\n- **Clerk JWT Bearer**: `Authorization: Bearer <clerk_jwt>`\n- **Sync Token**: `Authorization: Bearer <user_id>:<sync_secret>` or `session_token` in body\n- **Demo Token**: `demo_<scenario>:demo_secret` (simulation mode)\n\nSome endpoints accept the token in the request body as `session_token` as a fallback.",
        "version": "2.0.0",
        "contact": {"name": "Welian", "url": "https://welian.app"}
    },
    "servers": [
        {"url": "https://api.welian.app", "description": "Production"},
        {"url": "https://cloud-worker.welian.workers.dev", "description": "Cloudflare Workers dev"}
    ],
    "tags": [
        {"name": "AI", "description": "AI-powered endpoints: draft, extract, advise, chat, reports, diagnostics"},
        {"name": "Data", "description": "Cloud-native data CRUD: contacts, timeline, todos, memory, goals, sessions, skills, profile"},
        {"name": "Auth", "description": "Authentication: WeChat OAuth, SMS OTP, WeChat bot binding"},
        {"name": "Discovery", "description": "Tunnel discovery: register and lookup edge agent URLs"},
        {"name": "Billing", "description": "Billing, credits, orders, coupons, gifting"},
        {"name": "Paddle", "description": "Paddle payment integration: checkout, webhook, cancel, config"},
        {"name": "System", "description": "Health check and API info"}
    ],
    "components": {
        "securitySchemes": {
            "clerkBearer": {
                "type": "http", "scheme": "bearer", "bearerFormat": "JWT",
                "description": "Clerk JWT token. Pass as `Authorization: Bearer <jwt>`. Verified via JWKS from Clerk."
            },
            "syncToken": {
                "type": "apiKey", "in": "header", "name": "Authorization",
                "description": "Sync token for edge agent / WeChat bot. Format: `Bearer <user_id>:<sync_secret>`. Secret must match WELIAN_SYNC_SECRET env var. WeChat bot tokens use `wechat_<hash>:<secret>`."
            },
            "sessionTokenBody": {
                "type": "apiKey", "in": "body", "name": "session_token",
                "description": "Fallback: pass token in request body as `session_token` field. Accepts Clerk JWT, sync token, or demo token."
            }
        },
        "responses": {
            "Unauthorized": err("Authentication required")
        },
        "schemas": {
            "Error": obj({"error": ST, "detail": ST}),
            "OkResponse": obj({"ok": BOOL}),
            "BillingInfo": obj({
                "plan": enum_str("free", "pro"), "used": NUM, "remaining": NUM,
                "allowance": NUM, "rollover": NUM, "purchased": NUM,
                "subscription": {"type": "object", "nullable": True}
            }),
            "Contact": obj({
                "id": ST, "name": ST, "relation": ST, "sub_relation": ST,
                "company": ST, "title": ST, "nature": enum_str("leverage", "nurture", "dual"),
                "role": ST, "strength": INT, "tags": arr(ST),
                "phone": ST, "email": ST, "notes": ST,
                "memories": arr(obj({})), "important_dates": arr(obj({})),
                "leverage": obj({}), "nurture": obj({}),
                "aliases": arr(ST), "snooze_until": ST,
                "updated": {"type": "string", "format": "date-time"}
            }),
            "Todo": obj({
                "id": ST, "contact": ST, "task": ST,
                "priority": enum_str("P0", "P1", "P2"),
                "due": {"type": "string", "format": "date"},
                "status": enum_str("pending", "done", "canceled"),
                "source": ST, "created": {"type": "string", "format": "date-time"}
            }),
            "TimelineEntry": obj({
                "id": ST, "contact": ST, "date": {"type": "string", "format": "date"},
                "summary": ST, "sentiment": ST, "created": {"type": "string", "format": "date-time"}
            }),
            "Memory": obj({
                "id": ST, "type": enum_str("preference", "context", "milestone", "contact_note"),
                "title": ST, "content": ST, "tags": arr(ST),
                "timestamp": {"type": "string", "format": "date-time"}
            }),
            "Goal": obj({
                "id": ST, "title": ST,
                "criteria": arr(obj({
                    "id": ST, "text": ST, "status": enum_str("pending", "satisfied"),
                    "evidence": arr(obj({}))
                })),
                "status": enum_str("active", "completed", "abandoned"),
                "created_at": {"type": "string", "format": "date-time"},
                "updated_at": {"type": "string", "format": "date-time"}
            }),
            "Session": obj({
                "id": ST, "title": ST,
                "messages": arr(obj({
                    "role": enum_str("user", "assistant"),
                    "content": ST, "timestamp": {"type": "string", "format": "date-time"}
                })),
                "created_at": {"type": "string", "format": "date-time"},
                "updated_at": {"type": "string", "format": "date-time"}
            }),
            "CustomSkill": obj({
                "id": ST, "name": ST, "triggers": arr(ST),
                "content": ST, "usage_count": INT,
                "last_used": {"type": "string", "nullable": True},
                "avg_score": {"type": "number", "nullable": True},
                "status": enum_str("active", "monitoring", "disabled"),
                "created_at": {"type": "string", "format": "date-time"},
                "updated_at": {"type": "string", "format": "date-time"}
            }),
            "Pricing": obj({
                "points_per_1k_input": NUM, "points_per_1k_output": NUM,
                "free_monthly": NUM, "pro_monthly": NUM,
                "pro_price_usd": NUM, "pro_price_yearly_usd": NUM,
                "credit_pack_100_usd": NUM, "credit_pack_500_usd": NUM,
                "discount": NUM,
                "pro_price_usd_display": NUM, "pro_price_yearly_usd_display": NUM,
                "credit_pack_100_usd_display": NUM, "credit_pack_500_usd_display": NUM
            })
        }
    },
    "paths": {}
}

P = spec["paths"]

def op(tag, summary, description, security=None, parameters=None, request_body=None, responses=None):
    """Build a single operation object."""
    o = {"tags": [tag], "summary": summary, "description": description}
    if security is not None:
        o["security"] = security
    if parameters:
        o["parameters"] = parameters
    if request_body:
        o["requestBody"] = request_body
    o["responses"] = responses or {"200": resp("Success")}
    return o

# ── System ──
P["/health"] = {"get": op("System", "Health check",
    "Returns service status, version, and configured LLM model.", security=no_sec,
    responses={"200": resp("Service is healthy", obj({"status": ST, "version": ST, "mode": ST, "model": ST}))})}

P["/"] = {"get": op("System", "API info",
    "Returns API name, version, and list of available endpoints.", security=no_sec,
    responses={"200": resp("API information", obj({"name": ST, "version": ST, "endpoints": arr(ST), "spec": ST}))})}

# ── AI ──
P["/ai/draft"] = {"post": op("AI", "Draft a message",
    "Draft a short, natural message from minimal context (name, nature, memories, last interaction). Returns the drafted message text. Auth is best-effort for usage tracking.",
    security=clerk_or_body,
    request_body=json_body({"name": ST, "nature": enum_str("nurture", "leverage"),
        "memories": arr(ST), "last_interaction": ST, "user_context": ST,
        "tone": {"type": "string", "default": "warm"}, "session_token": ST}),
    responses={"200": resp("Drafted message", obj({"result": ST}))})}

P["/ai/extract"] = {"post": op("AI", "Extract todos and key points",
    "Extract actionable items (pending tasks, key points) from interaction text using LLM. Returns JSON with pending and key_points fields.",
    security=no_sec,
    request_body=json_body({"interaction_text": ST, "contact_name": ST}),
    responses={"200": resp("Extracted items", obj({"result": obj({"pending": ST, "key_points": arr(ST)})}))})}

P["/ai/advise"] = {"post": op("AI", "Format advise from candidate list",
    "Takes leverage and nurture candidate lists from the client, formats them into a warm, human-readable weekly advise using LLM.",
    security=no_sec,
    request_body=json_body({"leverage": arr(obj({"name": ST, "days_since": INT,
        "leverage_goals": arr(ST), "last_interaction": ST})),
        "nurture": arr(obj({"type": enum_str("important_date", "memory_followup"),
            "name": ST, "label": ST, "content": ST}))}),
    responses={"200": resp("Formatted advise", obj({"result": ST}))})}

P["/ai/advise_cloud"] = {"post": op("AI", "Cloud suggestion engine",
    "Queries KV directly for contacts, timeline, and todos. Scores leverage contacts by days since last interaction, pending todos, and strength. Finds nurture reminders from important dates and memory follow-ups. Generates LLM-enhanced advise.",
    security=clerk_or_body, request_body=json_body({"session_token": ST}),
    responses={"200": resp("Cloud-generated advise", obj({"result": ST, "raw": arr(ST),
        "advise_id": {"type": "string", "nullable": True}})), "401": UNAUTH})}

P["/ai/chat"] = {"post": op("AI", "Chat with LLM (billing gateway)",
    "Forwards chat messages to LLM with Welian's wholesale API key. Checks billing balance before the call, deducts points after (with model tier multiplier). Returns reply, usage stats, and billing info. Content filter circuit breaker included.",
    security=clerk_or_body,
    request_body=json_body({"messages": arr(obj({"role": enum_str("user", "assistant"), "content": ST})),
        "system": ST, "max_tokens": {"type": "integer", "default": 1024},
        "temperature": {"type": "number", "default": 0.7},
        "model_tier": enum_str("standard", "enhanced", "premium"), "session_token": ST},
        required=["messages"], required_body=True),
    responses={"200": resp("Chat reply with usage and billing", obj({
        "reply": ST, "usage": obj({"input_tokens": INT, "output_tokens": INT, "points": NUM}),
        "billing": ref("BillingInfo"), "content_filtered": BOOL})),
        "400": err("messages must be a non-empty array"), "401": UNAUTH,
        "402": err("联点已用完 (credits exhausted)"), "502": err("LLM call failed")})}

P["/ai/search"] = {"post": op("AI", "Web search",
    "Performs a web search using Tavily > Brave > DuckDuckGo > Google > Mojeek > Sogou > Bing CN > Wikipedia fallback chain. Returns formatted search context and raw results.",
    security=clerk_or_body,
    request_body=json_body({"query": ST, "session_token": ST}, required=["query"], required_body=True),
    responses={"200": resp("Search results", obj({"search_context": ST, "provider": ST,
        "result_count": INT, "results": arr(obj({"title": ST, "snippet": ST, "url": ST}))})),
        "400": err("query required"), "401": UNAUTH})}

P["/ai/read_url"] = {"post": op("AI", "Read web page as Markdown",
    "Fetches a web page and returns it as Markdown using Jina Reader API. Includes SSRF protection (blocks localhost, private IPs, non-http(s)). Content truncated to 8000 chars.",
    security=clerk_or_body,
    request_body=json_body({"url": {"type": "string", "format": "uri"}, "session_token": ST}, required=["url"], required_body=True),
    responses={"200": resp("Page content", obj({"status": enum_str("ok", "error"), "title": ST,
        "url": ST, "content": ST, "length": INT, "cached": BOOL, "error": ST})),
        "400": err("url required"), "401": UNAUTH})}

P["/ai/extract_intent"] = {"post": op("AI", "Extract intent and execute data actions",
    "Analyzes user message to extract intent (query_contact, query_todo, record, draft, advise, report, chat, help, update_profile), keywords, and data actions (add_contact, add_timeline, add_todo, complete_todo, delete_todo, update_contact, merge_contact). Executes data write actions directly in KV. Also auto-extracts profile updates, memories, and goal evidence.",
    security=clerk_or_body,
    request_body=json_body({"text": ST, "onboarding": BOOL, "session_token": ST}, required=["text"], required_body=True),
    responses={"200": resp("Extracted intent and action results", obj({
        "intent": ST, "contact_name": ST, "keywords": arr(ST),
        "actions": arr(obj({})), "action_results": arr(obj({})),
        "profile_updates": obj({}), "profile_updated": BOOL,
        "memory_save": {"type": "object", "nullable": True}, "memory_saved": BOOL,
        "goal_evidence": {"type": "object", "nullable": True}, "goal_evidence_linked": BOOL,
        "needs_search": BOOL, "search_query": ST})),
        "400": err("text required"), "401": UNAUTH,
        "500": err("Internal error"), "502": err("LLM call failed")})}

P["/ai/session_summary"] = {"post": op("AI", "Generate session summary",
    "Generates a brief LLM summary (≤100 chars) of a chat session for next-day welcome. Takes session_id, loads session messages, and produces a concise summary.",
    security=clerk_or_body,
    request_body=json_body({"session_id": ST, "session_token": ST}, required=["session_id"], required_body=True),
    responses={"200": resp("Session summary", obj({"summary": ST})),
        "400": err("session_id required"), "401": UNAUTH, "404": err("session not found")})}

P["/ai/import"] = {"post": op("AI", "Import contacts from file",
    "Accepts a base64-encoded file (vCard, CSV, PDF, image, xlsx, docx) and extracts contacts using AI (enhanced model) or direct parsers. Deduplicates against existing contacts. Deducts billing points (enhanced model ×3).",
    security=clerk_or_body,
    request_body=json_body({"base64": ST, "filename": ST, "mime_type": ST, "session_token": ST}, required=["base64"], required_body=True),
    responses={"200": resp("Import results", obj({"imported": INT, "skipped": INT, "total": INT, "message": ST})),
        "400": err("文件内容为空 / 文件内容不足"), "401": UNAUTH, "502": err("AI 提取失败")})}

P["/ai/import_batch"] = {"post": op("AI", "Batch import pre-parsed contacts",
    "Accepts an array of pre-parsed contact objects (from client-side parsing). Deduplicates by name. No LLM call — pure data operation.",
    security=clerk_or_body,
    request_body=json_body({"contacts": arr(obj({"name": ST, "relation": ST, "company": ST,
        "title": ST, "phone": ST, "email": ST, "notes": ST})), "session_token": ST},
        required=["contacts"], required_body=True),
    responses={"200": resp("Batch import results", obj({"imported": INT, "skipped": INT, "total": INT})),
        "400": err("没有联系人"), "401": UNAUTH})}

P["/ai/import_chunk"] = {"post": op("AI", "Extract contacts from text chunk",
    "LLM extracts contacts from a single text chunk. Used for chunked processing of large files. Returns extracted contacts without saving. Deducts billing (enhanced model ×3).",
    security=clerk_or_body,
    request_body=json_body({"text": ST, "session_token": ST}, required=["text"], required_body=True),
    responses={"200": resp("Extracted contacts from chunk", obj({"contacts": arr(obj({
        "name": ST, "relation": ST, "company": ST, "title": ST, "phone": ST, "email": ST, "notes": ST}))})),
        "401": UNAUTH, "502": err("AI 提取失败")})}

P["/ai/proactive"] = {"post": op("AI", "Proactive suggestion",
    "Generates 1-2 personalized tips based on full user context (stale contacts, overdue todos, upcoming dates, environment info like weather/city/holidays). Deducts billing points.",
    security=clerk_or_body,
    request_body=json_body({"context": obj({"city": ST, "weather": ST, "timeSlot": ST,
        "device": ST, "holidays": arr(ST), "traveling": BOOL}), "session_token": ST}),
    responses={"200": resp("Proactive suggestions", obj({"suggestions": arr(obj({"text": ST, "action": ST})),
        "reason": ST})), "401": UNAUTH})}

P["/ai/diagnostics"] = {"post": op("AI", "Relationship behavior diagnostics",
    "Analyzes timeline data to extract interaction patterns: frequency distribution (pulse vs steady), contact concentration, procrastination patterns, tool-type vs emotional-type ratio, overdue todos. Generates recommendations.",
    security=clerk_or_body, request_body=json_body({"session_token": ST}),
    responses={"200": resp("Behavior diagnostics", obj({"summary": ST, "patterns": arr(obj({})),
        "recommendations": arr(ST), "stats": obj({"total_interactions": INT, "total_contacts": INT,
            "avg_monthly": ST, "active_months": INT})})), "401": UNAUTH})}

P["/ai/skills"] = {"get": op("AI", "Get skills by intent",
    "Returns built-in skills (follow-up-strategy, reconnection-outreach, conflict-repair, gift-suggestion) and custom user skills matching the given intent. Merges custom skills from user's KV store.",
    security=clerk_sec, parameters=[param("intent", desc="Intent to match skills against (e.g. advise, draft, chat, report)")],
    responses={"200": resp("Matching skills", obj({"skills": arr(obj({"id": ST, "name": ST,
        "content": ST, "custom": BOOL})), "intent": ST}))})}

P["/ai/config"] = {"get": op("AI", "Get routing configuration",
    "Returns routing config (mode, timeouts) and data priority for frontend to decide Live vs Cloud mode. Also returns configured LLM model tiers.",
    security=no_sec,
    responses={"200": resp("Routing configuration", obj({
        "routing": obj({"mode": ST, "live_timeout_ms": INT, "agent_context_timeout_ms": INT}),
        "data_priority": arr(ST), "tiers": obj({"standard": ST, "enhanced": ST, "premium": ST})}))})}

P["/ai/meeting_prep"] = {"post": op("AI", "Meeting prep briefing",
    "Generates a concise meeting prep briefing for a contact: last conversation recap, pending items, and 2-3 conversation tips based on memories and important dates. Deducts billing points.",
    security=clerk_or_body,
    request_body=json_body({"contact_id": ST, "contact_name": ST, "session_token": ST}),
    responses={"200": resp("Meeting prep briefing", obj({"contact": obj({}),
        "timeline": arr(ref("TimelineEntry")), "todos": arr(ref("Todo")), "prep": ST,
        "usage": obj({"points": NUM, "remaining": NUM})})),
        "401": UNAUTH, "404": err("contact not found"), "500": err("LLM call failed")})}

P["/ai/weekly_report"] = {"post": op("AI", "Generate weekly report",
    "Generates a structured weekly relationship review (greeting, review stats, suggested contacts, upcoming dates, todo reminders, closing). Cached per day (25h TTL). Deducts billing points.",
    security=clerk_or_body, request_body=json_body({"session_token": ST}),
    responses={"200": resp("Weekly report", obj({"ok": BOOL, "report": obj({}), "raw_data": obj({})})),
        "401": UNAUTH})}

P["/ai/monthly_report"] = {"post": op("AI", "Generate monthly report",
    "Generates a structured monthly relationship dashboard (stats, role review by friends/family/collaborators, trends, achievements, suggestions). Cached per day (25h TTL). Deducts billing points.",
    security=clerk_or_body, request_body=json_body({"session_token": ST}),
    responses={"200": resp("Monthly report", obj({"ok": BOOL, "report": obj({}), "raw_data": obj({})})),
        "401": UNAUTH})}

P["/ai/hn_signals"] = {"post": op("AI", "HN signals briefing",
    "Fetches top Hacker News stories and generates a personalized tech signal briefing. Connects HN stories to user's professional network and relationship goals. Cached per day (25h TTL). Deducts billing points.",
    security=clerk_or_body, request_body=json_body({"session_token": ST}),
    responses={"200": resp("HN signals briefing", obj({"ok": BOOL, "report": obj({}), "raw_data": obj({})})),
        "401": UNAUTH})}

P["/ai/onboarding/create_contacts"] = {"post": op("AI", "Onboarding: batch create contacts",
    "Creates up to 10 contacts during onboarding with nature and relationship. Sends welcome email on first onboarding. Generates first advise immediately for value delivery.",
    security=clerk_or_body,
    request_body=json_body({"people": arr(obj({"name": ST, "nature": enum_str("leverage", "nurture", "dual"),
        "relationship": ST})), "session_token": ST}, required=["people"], required_body=True),
    responses={"200": resp("Contacts created with first advise", obj({"ok": BOOL,
        "created": arr(obj({"id": ST, "name": ST, "nature": ST})),
        "first_advise": {"type": "string", "nullable": True}})),
        "400": err("people array required / Max 10 contacts"), "401": UNAUTH})}

P["/ai/push_poll"] = {"post": op("AI", "Push poll (bot picks up queued messages)",
    "WeChat bot polls for queued push messages (e.g. weekly reports). Auth via wechat_ sync token. Returns queued messages and clears the queue.",
    security=sync_sec,
    responses={"200": resp("Queued messages", obj({"messages": arr(obj({"type": ST, "content": ST,
        "timestamp": {"type": "string", "format": "date-time"}}))})), "401": err("Bot auth required")})}

# ── Billing ──
P["/ai/billing"] = {"post": op("Billing", "Query billing balance",
    "Returns current billing status: plan, used, remaining, allowance, rollover, purchased credits, subscription info, and recent history (last 10 entries).",
    security=clerk_or_body, request_body=json_body({"session_token": ST}),
    responses={"200": resp("Billing status", obj({"plan": ST, "used": NUM, "remaining": NUM,
        "allowance": NUM, "rollover": NUM, "purchased": NUM,
        "subscription": {"type": "object", "nullable": True}, "recent_history": arr(obj({}))})),
        "401": UNAUTH})}

P["/ai/upgrade"] = {"post": op("Billing", "Upgrade plan (mock)",
    "Directly upgrades user to Pro plan. In production, use Paddle checkout instead. Sets plan to 'pro' and creates subscription record with expiry.",
    security=clerk_or_body,
    request_body=json_body({"plan": enum_str("pro_monthly", "pro_yearly"), "session_token": ST}, required=["plan"], required_body=True),
    responses={"200": resp("Upgrade successful", obj({"ok": BOOL, "plan": ST,
        "subscription": obj({}), "remaining": NUM, "allowance": NUM})),
        "400": err("plan required / invalid plan"), "401": UNAUTH})}

P["/ai/purchase_credits"] = {"post": op("Billing", "Purchase credits (mock)",
    "Directly adds purchased credits to user's balance. In production, use Paddle checkout or WeChat Pay orders instead.",
    security=clerk_or_body,
    request_body=json_body({"pack": enum_str("100", "500"), "session_token": ST}, required=["pack"], required_body=True),
    responses={"200": resp("Credits purchased", obj({"ok": BOOL, "purchased": NUM, "remaining": NUM})),
        "400": err("pack required"), "401": UNAUTH})}

P["/ai/pricing"] = {"get": op("Billing", "Get pricing info",
    "Returns points pricing configuration: cost per 1K tokens, monthly allowances, product prices (with discount applied for display).",
    security=no_sec, responses={"200": resp("Pricing configuration", ref("Pricing"))})}

P["/ai/admin/check"] = {"post": op("Billing", "Check admin status",
    "Checks if the authenticated user is an admin (by matching email against configured admin email via Clerk API).",
    security=clerk_or_body, request_body=json_body({"session_token": ST}),
    responses={"200": resp("Admin check result", obj({"is_admin": BOOL}))})}

P["/ai/admin/pricing"] = {
    "get": op("Billing", "Get pricing (admin)",
        "Same as GET /ai/pricing — returns current pricing configuration.",
        security=no_sec, responses={"200": resp("Pricing configuration", ref("Pricing"))}),
    "post": op("Billing", "Update pricing (admin only)",
        "Updates pricing configuration. Requires admin access. Allowed fields: points_per_1k_input, points_per_1k_output, free_monthly, pro_monthly, pro_price_usd, pro_price_yearly_usd, credit_pack_100_usd, credit_pack_500_usd, discount, model_multipliers.",
        security=clerk_or_body,
        request_body=json_body({"points_per_1k_input": NUM, "points_per_1k_output": NUM,
            "free_monthly": NUM, "pro_monthly": NUM, "pro_price_usd": NUM, "pro_price_yearly_usd": NUM,
            "credit_pack_100_usd": NUM, "credit_pack_500_usd": NUM, "discount": NUM,
            "model_multipliers": obj({"standard": NUM, "enhanced": NUM, "premium": NUM}),
            "session_token": ST}, required_body=True),
        responses={"200": resp("Pricing updated", obj({"ok": BOOL, "pricing": ref("Pricing")})),
            "401": UNAUTH, "403": err("Admin access required")})}

P["/ai/gift_credits"] = {"post": op("Billing", "Gift credits to another user",
    "Transfers purchased credits from sender to recipient by email. Min 10, max 500 credits. Cannot gift yourself. Deducts from sender's purchased balance, adds to recipient's purchased balance.",
    security=clerk_or_body,
    request_body=json_body({"recipient_email": {"type": "string", "format": "email"}, "points": NUM,
        "session_token": ST}, required=["recipient_email", "points"], required_body=True),
    responses={"200": resp("Credits gifted", obj({"ok": BOOL, "gifted": NUM, "remaining": NUM})),
        "400": err("Validation error"), "401": UNAUTH, "402": err("联点不足"), "404": err("收件人未注册")})}

P["/ai/create_coupon"] = {"post": op("Billing", "Create coupon code",
    "Generates a unique coupon code (WELIAN-XXXX-XXXX) with specified points. No auth required — called from frontend after completing role play. Coupon expires in 30 days.",
    security=no_sec,
    request_body=json_body({"points": {"type": "integer", "default": 100}, "scenario": ST}),
    responses={"200": resp("Coupon created", obj({"ok": BOOL, "code": ST, "points": INT}))})}

P["/ai/redeem_coupon"] = {"post": op("Billing", "Redeem coupon code",
    "Redeems a coupon code and adds the associated points to user's purchased balance. Coupon must be valid and not previously used.",
    security=clerk_or_body,
    request_body=json_body({"code": ST, "session_token": ST}, required=["code"], required_body=True),
    responses={"200": resp("Coupon redeemed", obj({"ok": BOOL, "points": INT, "remaining": NUM})),
        "400": err("Coupon already used"), "401": UNAUTH, "404": err("Invalid or already used coupon")})}

P["/ai/estimate_cost"] = {"post": op("Billing", "Estimate cost for an action",
    "Estimates the points cost for a given action (chat, draft, advise, meeting_prep, weekly, monthly) and model tier, based on average token usage and pricing config.",
    security=no_sec,
    request_body=json_body({"action": enum_str("chat", "draft", "advise", "meeting_prep", "weekly", "monthly"),
        "model_tier": enum_str("standard", "enhanced", "premium")}, required=["action"], required_body=True),
    responses={"200": resp("Cost estimate", obj({"action": ST, "model_tier": ST, "estimated_points": NUM})),
        "400": err("unknown action")})}

P["/ai/create_order"] = {"post": op("Billing", "Create WeChat Pay order",
    "Creates a pending order for WeChat Pay (personal QR code mode). Validates product type and id against pricing. Stores order in KV and indexes by user.",
    security=clerk_or_body,
    request_body=json_body({"type": enum_str("upgrade", "purchase"), "id": ST,
        "amount": NUM, "session_token": ST}, required=["type", "id"], required_body=True),
    responses={"200": resp("Order created", obj({"order_id": ST, "amount": NUM, "status": ST})),
        "400": err("type and id required / invalid product"), "401": UNAUTH})}

P["/ai/confirm_order"] = {"post": op("Billing", "Confirm WeChat Pay order",
    "Confirms a pending order. Applies the purchase (upgrade plan or add credits) to user's billing. Only the order owner can confirm.",
    security=clerk_or_body,
    request_body=json_body({"order_id": ST, "session_token": ST}, required=["order_id"], required_body=True),
    responses={"200": resp("Order confirmed", obj({"ok": BOOL, "status": ST, "plan": ST,
        "remaining": NUM, "already_confirmed": BOOL})),
        "400": err("order_id required"), "401": UNAUTH, "403": err("not your order"), "404": err("order not found")})}

P["/ai/list_orders"] = {"post": op("Billing", "List user orders",
    "Returns the last 10 orders for the authenticated user.",
    security=clerk_or_body, request_body=json_body({"session_token": ST}),
    responses={"200": resp("User orders", obj({"orders": arr(obj({"order_id": ST, "type": ST,
        "id": ST, "amount": NUM, "status": ST, "created_at": {"type": "string", "format": "date-time"},
        "confirmed_at": {"type": "string", "nullable": True}}))})), "401": UNAUTH})}

# ── Paddle ──
P["/ai/paddle/checkout"] = {"post": op("Paddle", "Get Paddle checkout info",
    "Returns Paddle price_id, discount_id (if applicable), product type, and user_id for frontend Paddle.Checkout.open(). Creates discount via Paddle API if pricing discount < 100%.",
    security=clerk_or_body,
    request_body=json_body({"product": enum_str("pro_monthly", "pro_yearly", "credits_100", "credits_500"),
        "session_token": ST}, required=["product"], required_body=True),
    responses={"200": resp("Checkout info", obj({"price_id": ST,
        "discount_id": {"type": "string", "nullable": True}, "product_type": ST, "product_id": ST, "user_id": ST})),
        "400": err("invalid product"), "401": UNAUTH, "500": err("Paddle price ID not configured")})}

P["/ai/paddle/webhook"] = {"post": op("Paddle", "Paddle webhook receiver",
    "Receives Paddle webhook events (transaction.completed, subscription.created/updated/canceled, payment_succeeded). Verifies HMAC-SHA256 signature. Applies purchases (upgrade or credits), handles subscription renewals, sends receipt emails.",
    security=no_sec,
    responses={"200": resp("Webhook processed", obj({"ok": BOOL, "handled": ST, "ignored": ST,
        "status": ST, "user_id": ST, "plan": ST})),
        "401": err("Signature verification failed"), "500": err("Webhook secret not configured")})}

P["/ai/paddle/cancel"] = {"post": op("Paddle", "Cancel Paddle subscription",
    "Cancels the user's active Paddle subscription via Paddle API. Falls back to local cancel if API fails. Updates billing state.",
    security=clerk_or_body, request_body=json_body({"session_token": ST}),
    responses={"200": resp("Subscription canceled", obj({"ok": BOOL, "status": ST})),
        "400": err("No active subscription"), "401": UNAUTH})}

P["/ai/paddle/config"] = {"get": op("Paddle", "Get Paddle configuration",
    "Returns Paddle environment (sandbox/production), client token, and available product keys for frontend Paddle initialization.",
    security=no_sec,
    responses={"200": resp("Paddle configuration", obj({"environment": enum_str("sandbox", "production"),
        "client_token": ST, "products": arr(ST)}))})}

# ── Auth ──
P["/auth/wechat"] = {"get": op("Auth", "Redirect to WeChat OAuth",
    "Redirects to WeChat OAuth qrconnect page. The 'redirect' query param is passed as state for post-login redirect.",
    security=no_sec, parameters=[param("redirect", desc="Frontend URL to redirect back to after OAuth")],
    responses={"302": {"description": "Redirect to WeChat OAuth"}, "500": err("WeChat App ID not configured")})}

P["/auth/wechat/callback"] = {"get": op("Auth", "WeChat OAuth callback",
    "Handles WeChat OAuth callback: exchanges code for access_token, gets user info, finds or creates Clerk user by WeChat openid, creates session, and redirects back to frontend with session token.",
    security=no_sec,
    parameters=[param("code", required=True, desc="WeChat OAuth authorization code"), param("state", desc="Original redirect URL")],
    responses={"302": {"description": "Redirect to frontend with clerk_session_token"},
        "400": err("Missing code parameter"), "500": err("WeChat/Clerk error")})}

P["/auth/sms/send"] = {"post": op("Auth", "Send SMS OTP via Aliyun",
    "Sends a 6-digit OTP code to a Chinese phone number via Aliyun SMS API. Code stored in KV with 5-min TTL. Phone must match pattern 1[3-9]\\d{9}.",
    security=no_sec,
    request_body=json_body({"phone": ST}, required=["phone"], required_body=True),
    responses={"200": resp("Code sent", obj({"ok": BOOL, "message": ST})),
        "400": err("Invalid phone number"), "500": err("SMS service not configured / SMS send failed")})}

P["/auth/sms/verify"] = {"post": op("Auth", "Verify SMS OTP, return Clerk session",
    "Verifies the SMS OTP code. On success, finds or creates Clerk user by phone number external_id, creates a session, and returns a JWT session token.",
    security=no_sec,
    request_body=json_body({"phone": ST, "code": ST, "redirect": ST}, required=["phone", "code"], required_body=True),
    responses={"200": resp("Verification successful", obj({"ok": BOOL, "clerk_session_token": ST})),
        "400": err("Missing phone or code / Invalid or expired code"), "500": err("Clerk not configured / error")})}

P["/ai/bind_wechat"] = {"post": op("Auth", "Bind WeChat user to Clerk account",
    "Binds a WeChat user ID to a Clerk user ID. Called from web after Clerk login. Stores bidirectional mapping (wechat_bind and wechat_user). Notifies WeChat user via bot. Supports both Clerk JWT and sync token auth.",
    security=[{"clerkBearer": []}, {"syncToken": []}],
    request_body=json_body({"wechat_user_id": ST, "clerk_user_id": ST, "session_token": ST}, required=["wechat_user_id"], required_body=True),
    responses={"200": resp("Binding successful", obj({"ok": BOOL, "wechat_user_id": ST,
        "clerk_user_id": ST, "name": ST, "email": ST, "message": ST})),
        "400": err("wechat_user_id required"), "401": err("Authentication required")})}

P["/ai/check_bind"] = {"post": op("Auth", "Check WeChat binding status",
    "Checks if a WeChat user is bound to a Clerk account. Called by the bot. Returns bound status, clerk_user_id, and user display info. Optional X-Check-Notify header to check for just-bound notifications.",
    security=no_sec,
    request_body=json_body({"wechat_user_id": ST}, required=["wechat_user_id"], required_body=True),
    responses={"200": resp("Binding status", obj({"bound": BOOL,
        "clerk_user_id": {"type": "string", "nullable": True}, "name": ST, "email": ST, "just_bound": BOOL})),
        "400": err("wechat_user_id required")})}

P["/ai/unbind_wechat"] = {"post": op("Auth", "Unbind WeChat user from Clerk account",
    "Removes the binding between a WeChat user and their Clerk account. Requires sync token with wechat_ prefix for auth.",
    security=sync_sec,
    request_body=json_body({"wechat_user_id": ST}, required=["wechat_user_id"], required_body=True),
    responses={"200": resp("Unbinding successful", obj({"ok": BOOL, "message": ST})),
        "400": err("wechat_user_id required"), "401": err("Authentication required")})}

# ── Discovery ──
P["/discover/register"] = {"post": op("Discovery", "Register tunnel URL",
    "Registers an edge agent tunnel URL under a device_id or user_id key. TTL 24 hours. Used for tunnel discovery by the frontend.",
    security=no_sec,
    request_body=json_body({"device_id": ST, "user_id": ST, "tunnel_url": ST}, required=["tunnel_url"], required_body=True),
    responses={"200": resp("Registered", ref("OkResponse")), "400": err("device_id/user_id and tunnel_url required")})}

P["/discover/lookup"] = {"get": op("Discovery", "Lookup tunnel URL",
    "Looks up a tunnel URL by Clerk user_id (or device_id). Tries direct lookup first, then indirect via user→device mapping.",
    security=no_sec, parameters=[param("user_id", required=True, desc="Clerk user ID or device ID")],
    responses={"200": resp("Lookup result", obj({"found": BOOL, "tunnel_url": ST})),
        "400": err("user_id required")})}

# ── Data ──
P["/data/sync"] = {"post": op("Data", "Sync data context (agent)",
    "Stores minimal data context snippet from edge agent in KV with 7-day TTL. Used for AI processing without full data sync.",
    security=sync_sec,
    request_body=json_body({"data_context": ST, "sync_token": ST}, required=["data_context", "sync_token"], required_body=True),
    responses={"200": resp("Sync result", obj({"ok": BOOL, "synced_at": {"type": "string", "format": "date-time"}, "reason": ST})),
        "401": err("Invalid sync token")})}

P["/data/sync_full"] = {"post": op("Data", "Bidirectional full data sync",
    "Merges edge data (contacts, todos, timeline) with cloud data. Deduplicates by ID, keeps newer records. Returns cloud-only items for agent to merge locally.",
    security=sync_sec,
    request_body=json_body({"contacts": arr(ref("Contact")), "todos": arr(ref("Todo")),
        "timeline": arr(ref("TimelineEntry")), "sync_token": ST}, required=["sync_token"], required_body=True),
    responses={"200": resp("Sync result with cloud-only items", obj({"ok": BOOL,
        "synced_at": {"type": "string", "format": "date-time"},
        "counts": obj({"contacts": INT, "todos": INT, "timeline": INT}),
        "cloud_only": obj({"contacts": arr(ref("Contact")), "todos": arr(ref("Todo")),
            "timeline": arr(ref("TimelineEntry"))})})), "401": err("Invalid sync token")})}

P["/data/search"] = {"post": op("Data", "Search contacts in cloud KV",
    "Searches contacts by keywords or contact name. Returns detailed context for matched contacts (top 10) including timeline, todos, and important dates. If no keywords, returns data_context overview.",
    security=clerk_or_body,
    request_body=json_body({"keywords": arr(ST), "contact_name": ST, "session_token": ST}),
    responses={"200": resp("Search results", obj({"data_context": ST, "matched_count": INT, "reason": ST})),
        "401": UNAUTH, "500": err("Failed to parse contacts data")})}

P["/data/context"] = {"get": op("Data", "Get stored data context",
    "Returns the stored data context snippet for the authenticated user (previously synced by agent).",
    security=clerk_sec,
    responses={"200": resp("Data context", obj({"data_context": ST, "synced_at": {"type": "string", "nullable": True}})),
        "401": UNAUTH})}

P["/data/pull"] = {"get": op("Data", "Pull all datasets from cloud",
    "Returns all contacts, todos, and timeline for the authenticated user from cloud KV. Used for cloud → edge one-way pull.",
    security=clerk_sec,
    responses={"200": resp("All datasets", obj({"contacts": arr(ref("Contact")), "todos": arr(ref("Todo")),
        "timeline": arr(ref("TimelineEntry")), "pulled_at": {"type": "string", "format": "date-time"}})),
        "401": UNAUTH})}

P["/data/push"] = {"post": op("Data", "Push contacts to cloud",
    "Overwrites contacts in cloud KV with the provided array. One-way push from edge to cloud.",
    security=clerk_sec,
    request_body=json_body({"contacts": arr(ref("Contact"))}, required=["contacts"], required_body=True),
    responses={"200": resp("Push result", obj({"ok": BOOL, "count": INT})),
        "400": err("No contacts array"), "401": UNAUTH})}

# Contacts CRUD
P["/data/contacts"] = {
    "get": op("Data", "List all contacts",
        "Returns all contacts with key fields for display (id, name, relation, nature, strength, tags, phone, email, leverage, nurture, important_dates, memories, etc.).",
        security=clerk_or_body,
        responses={"200": resp("Contact list", obj({"contacts": arr(ref("Contact")), "total": INT})), "401": UNAUTH}),
    "post": op("Data", "Create or update a contact",
        "Creates a new contact or updates an existing one (if id is provided and found). New contacts get default fields (nature=leverage, strength=3).",
        security=clerk_or_body,
        request_body=json_body({"id": ST, "name": ST, "relation": ST, "sub_relation": ST,
            "nature": enum_str("leverage", "nurture", "dual"), "strength": INT,
            "tags": arr(ST), "phone": ST, "email": ST, "notes": ST,
            "important_dates": arr(obj({})), "leverage": obj({}), "nurture": obj({}),
            "aliases": arr(ST), "session_token": ST}, required=["name"], required_body=True),
        responses={"200": resp("Contact created/updated", obj({"ok": BOOL, "contact": ref("Contact")})),
            "400": err("name required"), "401": UNAUTH}),
    "put": op("Data", "Deduplicate contacts by name",
        "Merges duplicate contacts by name, keeping the richer record. Merges tags (union), fills empty fields from the duplicate. Returns count of removed duplicates.",
        security=clerk_or_body,
        responses={"200": resp("Deduplication result", obj({"ok": BOOL, "total": INT, "removed": INT,
            "merged_ids": arr(ST)})), "401": UNAUTH}),
    "delete": op("Data", "Delete a contact",
        "Deletes a contact by id. Also removes related timeline entries and todos.",
        security=clerk_or_body, parameters=[param("id", required=True)],
        responses={"200": resp("Contact deleted", ref("OkResponse")),
            "400": err("id required"), "401": UNAUTH})}

# Timeline CRUD
P["/data/timeline"] = {
    "get": op("Data", "List timeline entries",
        "Returns timeline entries sorted by date descending (max 200). Optional contact_id filter to get entries for a specific contact.",
        security=clerk_or_body, parameters=[param("contact_id", desc="Filter by contact ID")],
        responses={"200": resp("Timeline entries", obj({"timeline": arr(ref("TimelineEntry"))})), "401": UNAUTH}),
    "post": op("Data", "Add a timeline entry",
        "Creates a new timeline entry or updates an existing one (if id provided and found). Requires summary.",
        security=clerk_or_body,
        request_body=json_body({"id": ST, "contact_id": ST, "contact": ST,
            "date": {"type": "string", "format": "date"}, "summary": ST, "sentiment": ST, "session_token": ST},
            required=["summary"], required_body=True),
        responses={"200": resp("Timeline entry created/updated", obj({"ok": BOOL, "entry": ref("TimelineEntry")})),
            "400": err("summary required"), "401": UNAUTH}),
    "put": op("Data", "Update a timeline entry",
        "Updates an existing timeline entry by id. Requires id and summary.",
        security=clerk_or_body,
        request_body=json_body({"id": ST, "summary": ST, "date": {"type": "string", "format": "date"},
            "contact_id": ST, "contact": ST, "sentiment": ST, "session_token": ST},
            required=["id", "summary"], required_body=True),
        responses={"200": resp("Timeline entry updated", obj({"ok": BOOL, "entry": ref("TimelineEntry")})),
            "400": err("id and summary required"), "401": UNAUTH, "404": err("timeline entry not found")}),
    "delete": op("Data", "Delete a timeline entry",
        "Deletes a timeline entry by id.",
        security=clerk_or_body, parameters=[param("id", required=True)],
        responses={"200": resp("Entry deleted", ref("OkResponse")), "401": UNAUTH})}

# Todos CRUD
P["/data/todos"] = {
    "get": op("Data", "List todos",
        "Returns pending todos sorted by due date. Use ?status=done to get completed todos. Also returns done_count and canceled_count. Auto-cleans empty task todos.",
        security=clerk_or_body, parameters=[param("status", desc="Set to 'done' to return only completed todos")],
        responses={"200": resp("Todo list", obj({"todos": arr(ref("Todo")), "done_count": INT, "canceled_count": INT})),
            "401": UNAUTH}),
    "post": op("Data", "Create or update a todo",
        "Creates a new todo or updates an existing one (if id provided). Deduplicates by normalized task + contact. Default due date is 7 days from now if not provided.",
        security=clerk_or_body,
        request_body=json_body({"id": ST, "task": ST, "contact_id": ST, "contact": ST,
            "priority": enum_str("P0", "P1", "P2"), "due": {"type": "string", "format": "date"},
            "location": ST, "source": ST, "session_token": ST}, required=["task"], required_body=True),
        responses={"200": resp("Todo created/updated", obj({"ok": BOOL, "todo": ref("Todo"), "dedup": BOOL})),
            "400": err("task required"), "401": UNAUTH}),
    "delete": op("Data", "Delete a todo",
        "Deletes a todo by id.",
        security=clerk_or_body, parameters=[param("id", required=True)],
        responses={"200": resp("Todo deleted", ref("OkResponse")), "401": UNAUTH})}

P["/data/todos/done"] = {"post": op("Data", "Mark todo as done",
    "Marks a todo as done by setting status='done' and done=true. Records completed_at timestamp.",
    security=clerk_or_body,
    request_body=json_body({"id": ST, "session_token": ST}, required=["id"], required_body=True),
    responses={"200": resp("Todo marked done", ref("OkResponse")), "401": UNAUTH, "404": err("todo not found")})}

P["/data/todos/reopen"] = {"post": op("Data", "Reopen a done todo",
    "Reverts a done todo back to pending status. Removes completed_at timestamp.",
    security=clerk_or_body,
    request_body=json_body({"id": ST, "session_token": ST}, required=["id"], required_body=True),
    responses={"200": resp("Todo reopened", ref("OkResponse")), "401": UNAUTH, "404": err("todo not found")})}

P["/data/todos/cancel"] = {"post": op("Data", "Cancel a todo",
    "Marks a todo as canceled. Records canceled_at timestamp.",
    security=clerk_or_body,
    request_body=json_body({"id": ST, "session_token": ST}, required=["id"], required_body=True),
    responses={"200": resp("Todo canceled", ref("OkResponse")), "401": UNAUTH, "404": err("todo not found")})}

P["/data/todos/postpone"] = {"post": op("Data", "Postpone a todo",
    "Updates the due date of a todo. Tracks postpone count and previous due date.",
    security=clerk_or_body,
    request_body=json_body({"id": ST, "due": {"type": "string", "format": "date"}, "session_token": ST},
        required=["id", "due"], required_body=True),
    responses={"200": resp("Todo postponed", obj({"ok": BOOL, "todo": ref("Todo")})),
        "400": err("id and due required"), "401": UNAUTH, "404": err("todo not found")})}

# Profile
P["/data/profile"] = {
    "get": op("Data", "Get user profile",
        "Returns the user's profile (name, occupation, company, industry, location, communication style, etc.).",
        security=clerk_or_body,
        responses={"200": resp("User profile", obj({"profile": {"type": "object", "nullable": True, "properties": {
            "name": ST, "occupation": ST, "company": ST, "industry": ST, "location": ST,
            "communication_style": ST, "address_habit": ST, "focus_areas": ST,
            "message_tone": ST, "career_goal": ST, "current_projects": ST,
            "network_direction": ST, "notes": ST, "updated": {"type": "string", "format": "date-time"}}}})),
            "401": UNAUTH}),
    "post": op("Data", "Save user profile",
        "Saves the user's profile. All fields are optional — only provided fields are stored.",
        security=clerk_or_body,
        request_body=json_body({"name": ST, "occupation": ST, "company": ST, "industry": ST,
            "location": ST, "communication_style": ST, "address_habit": ST, "focus_areas": ST,
            "message_tone": ST, "career_goal": ST, "current_projects": ST, "network_direction": ST,
            "notes": ST, "session_token": ST}, required_body=True),
        responses={"200": resp("Profile saved", obj({"ok": BOOL, "profile": obj({})})), "401": UNAUTH})}

# Memory
P["/data/memory"] = {
    "get": op("Data", "List memories",
        "Returns memories. Use ?q=query for token-based relevance recall (top results), or without query for most recent. Use ?limit=N to control count (max 50).",
        security=clerk_or_body,
        parameters=[param("q", desc="Search query for relevance recall"),
            param("limit", schema_type="integer", desc="Max results (default 10, max 50)")],
        responses={"200": resp("Memories", obj({"memories": arr(ref("Memory"))})), "401": UNAUTH}),
    "post": op("Data", "Save or delete a memory",
        "Action 'save': creates a new memory (type, title, content, tags). Action 'delete': removes a memory by id.",
        security=clerk_or_body,
        request_body=json_body({"action": enum_str("save", "delete"), "id": ST,
            "type": enum_str("preference", "context", "milestone", "contact_note"),
            "title": ST, "content": ST, "tags": arr(ST), "session_token": ST}, required_body=True),
        responses={"200": resp("Memory saved/deleted", obj({"ok": BOOL, "memory": ref("Memory"), "deleted": BOOL})),
            "400": err("Validation error"), "401": UNAUTH, "404": err("Memory not found")})}

# Goals
P["/data/goals"] = {
    "get": op("Data", "List goals",
        "Returns relationship goals. Optional ?status=active filter to get only active goals.",
        security=clerk_or_body, parameters=[param("status", desc="Filter by status (active, completed, abandoned)")],
        responses={"200": resp("Goals", obj({"goals": arr(ref("Goal"))})), "401": UNAUTH}),
    "post": op("Data", "Manage goals",
        "Actions: create (title + criteria array), update_status (goal_id + status), add_evidence (goal_id + criterion_id + text), delete (id). Auto-completes goal when all criteria are satisfied.",
        security=clerk_or_body,
        request_body=json_body({"action": enum_str("create", "update_status", "add_evidence", "delete"),
            "id": ST, "title": ST, "criteria": arr(ST), "goal_id": ST,
            "status": enum_str("active", "completed", "abandoned"),
            "criterion_id": ST, "text": ST, "source": ST, "session_token": ST}, required_body=True),
        responses={"200": resp("Goal operation result", obj({"ok": BOOL, "goal": ref("Goal")})),
            "400": err("title required / criteria required / invalid status / unknown action"),
            "401": UNAUTH, "404": err("goal/criterion not found")})}

# Sessions
P["/data/sessions"] = {
    "get": op("Data", "List sessions or get one",
        "Without ?id: returns session metadata list (no messages). With ?id=xxx: returns full session with messages.",
        security=clerk_or_body, parameters=[param("id", desc="Session ID to get full session with messages")],
        responses={"200": resp("Sessions or single session", obj({
            "sessions": arr(obj({"id": ST, "title": ST, "message_count": INT,
                "created_at": {"type": "string", "format": "date-time"},
                "updated_at": {"type": "string", "format": "date-time"}})),
            "session": ref("Session")})), "401": UNAUTH, "404": err("session not found")}),
    "post": op("Data", "Manage sessions",
        "Actions: create (title), append (session_id + user_message + assistant_message), delete (session_id), clear. Auto-creates session if append target not found. Auto-titles from first user message.",
        security=clerk_or_body,
        request_body=json_body({"action": enum_str("create", "append", "delete", "clear"),
            "title": ST, "session_id": ST, "user_message": ST, "assistant_message": ST, "session_token": ST},
            required_body=True),
        responses={"200": resp("Session operation result", obj({"ok": BOOL, "session": ref("Session"), "session_id": ST})),
            "400": err("unknown action"), "401": UNAUTH})}

# Custom Skills
P["/data/skills"] = {
    "get": op("Data", "List custom skills",
        "Returns all custom skills for the user.",
        security=clerk_or_body,
        responses={"200": resp("Custom skills", obj({"skills": arr(ref("CustomSkill"))})), "401": UNAUTH}),
    "post": op("Data", "Manage custom skills",
        "Actions: create (name + triggers + content), update (skill_id + fields), delete (skill_id), record_use (skill_id + score). Auto-degrades to 'monitoring' status if avg score < 2.5 after 5+ uses.",
        security=clerk_or_body,
        request_body=json_body({"action": enum_str("create", "update", "delete", "record_use"),
            "skill_id": ST, "name": ST, "triggers": arr(ST), "content": ST,
            "score": NUM, "session_token": ST}, required_body=True),
        responses={"200": resp("Skill operation result", obj({"ok": BOOL, "skill": ref("CustomSkill")})),
            "400": err("unknown action"), "401": UNAUTH, "404": err("skill not found")}),
    "delete": op("Data", "Delete a custom skill",
        "Deletes a custom skill by skill_id. Same as POST with action=delete.",
        security=clerk_or_body,
        request_body=json_body({"skill_id": ST, "session_token": ST}, required=["skill_id"], required_body=True),
        responses={"200": resp("Skill deleted", ref("OkResponse")), "401": UNAUTH})}

# Calendar
P["/data/calendar/feed"] = {"get": op("Data", "iCal feed",
    "Returns an iCalendar (.ics) feed of pending todos (with due dates) and contact important dates (yearly recurrence). Auth via token query param (user_id:sync_secret). No Clerk auth.",
    security=no_sec, parameters=[param("token", required=True, desc="Auth token: user_id:sync_secret")],
    responses={"200": {"description": "iCalendar feed", "content": {"text/calendar": {"schema": {"type": "string"}}}},
        "401": {"description": "Unauthorized"}})}

P["/data/calendar/token"] = {"get": op("Data", "Get calendar sync token",
    "Returns the iCal feed URL with a long-lived token (user_id:sync_secret) for calendar subscription. Requires Clerk auth.",
    security=clerk_sec,
    responses={"200": resp("Calendar feed URL", obj({"feed_url": ST})), "401": UNAUTH})}

# Delete account
P["/data/delete_account"] = {"post": op("Data", "Delete account (注销即焚)",
    "Permanently deletes all user data: contacts, timeline, todos, billing, orders, WeChat binding, chat sessions, report caches. Also deletes the Clerk user account via Backend API.",
    security=clerk_or_body, request_body=json_body({"session_token": ST}),
    responses={"200": resp("Account deleted", obj({"ok": BOOL, "deleted": BOOL, "clerk_deleted": BOOL})),
        "401": UNAUTH})}

# Metrics
P["/data/metrics"] = {"get": op("Data", "Get metrics (North Star + adoption)",
    "Returns weekly action counters (advise_generated, todo_completed, interaction_recorded, draft_generated), adoption events, adoption rate (last 30 days), and North Star metric for this week.",
    security=clerk_sec,
    responses={"200": resp("Metrics", obj({"north_star_this_week": INT, "weekly": obj({}),
        "adoptions": arr(obj({})), "adoption_rate_30d": NUM,
        "total_advise_30d": INT, "total_adoptions_30d": INT})), "401": UNAUTH})}

# Write the spec
with open("/Users/cyingfang/devin/welian/docs/openapi.json", "w") as f:
    json.dump(spec, f, indent=2, ensure_ascii=False)

# Count endpoints
count = sum(len(v) for v in spec["paths"].values())
print(f"Generated openapi.json with {len(spec['paths'])} paths and {count} operations")
