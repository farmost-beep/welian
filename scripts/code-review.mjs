#!/usr/bin/env node
// L3: Multi-agent code review with confidence scoring
// Inspired by Anthropic's Code Review Plugin — 4 parallel agents + 80-confidence threshold.
//
// Usage:
//   node scripts/code-review.mjs                    # Review current branch's diff vs main
//   node scripts/code-review.mjs --pr 123           # Review specific PR
//   node scripts/code-review.mjs --pr 123 --comment # Post review as PR comment
//
// Requires:
//   - ANTHROPIC_API_KEY (or LLM_API_KEY + LLM_BASE_URL env vars)
//   - gh CLI authenticated (for --comment and --pr modes)
//
// Architecture (Swiss Cheese Model — L3):
//   Agent 1: CLAUDE.md compliance checker (sonnet-class)
//   Agent 2: CLAUDE.md compliance checker (sonnet-class, independent run)
//   Agent 3: Bug detector — syntax errors, logic errors, missing imports (opus-class)
//   Agent 4: Security + logic reviewer — security issues, incorrect logic in changed code (opus-class)
//   Step 5: Confidence scoring — each issue scored 0-100, only ≥80 reported
//   Step 6: Validation — parallel sub-agents verify each issue before reporting

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ── Config ──
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY;
const BASE_URL = process.env.ANTHROPIC_BASE_URL || process.env.LLM_BASE_URL || "https://api.anthropic.com";
const MODEL = process.env.ANTHROPIC_MODEL || process.env.LLM_MODEL || "claude-sonnet-4-20250514";
const MODEL_STRONG = process.env.ANTHROPIC_MODEL_STRONG || process.env.LLM_MODEL_PREMIUM || MODEL;
const CONFIDENCE_THRESHOLD = 80;

// Parse args
const args = process.argv.slice(2);
const prNumber = args.includes("--pr") ? args[args.indexOf("--pr") + 1] : null;
const shouldComment = args.includes("--comment");
const diffFromStdin = args.includes("--stdin");

// ── LLM call helper ──
async function callLLM(prompt, system, model = MODEL) {
  if (!API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY or LLM_API_KEY required");
    process.exit(1);
  }
  const resp = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LLM API error ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  return data.content?.[0]?.text || "";
}

// ── Get PR diff ──
function getDiff() {
  if (diffFromStdin) {
    return readFileSync(0, "utf-8");
  }
  if (prNumber) {
    return execSync(`gh pr diff ${prNumber} --repo farmost-beep/welian`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
  }
  // Diff current branch vs main
  try {
    return execSync("git diff main...HEAD", { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
  } catch {
    // No main branch — diff vs HEAD~1
    return execSync("git diff HEAD~1 HEAD", { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
  }
}

// ── Get PR info ──
function getPRInfo() {
  if (prNumber) {
    try {
      const info = execSync(`gh pr view ${prNumber} --repo farmost-beep/welian --json title,body,headRefName,baseRefName`, { encoding: "utf-8" });
      return JSON.parse(info);
    } catch {
      return { title: "", body: "", headRefName: "", baseRefName: "main" };
    }
  }
  try {
    const title = execSync("git log -1 --format='%s'", { encoding: "utf-8" }).trim();
    const body = execSync("git log -1 --format='%b'", { encoding: "utf-8" }).trim();
    return { title, body, headRefName: "", baseRefName: "main" };
  } catch {
    return { title: "", body: "", headRefName: "", baseRefName: "main" };
  }
}

// ── Gather CLAUDE.md files ──
function gatherClaudeMdFiles(changedFiles) {
  const files = new Set();
  // Root CLAUDE.md
  const rootClaude = join(repoRoot, "CLAUDE.md");
  if (existsSync(rootClaude)) files.add(rootClaude);
  // AGENTS.md (Welian uses AGENTS.md as equivalent)
  const rootAgents = join(repoRoot, "AGENTS.md");
  if (existsSync(rootAgents)) files.add(rootAgents);
  // cloud-worker/CLAUDE.md
  const workerClaude = join(repoRoot, "cloud-worker", "CLAUDE.md");
  if (existsSync(workerClaude)) files.add(workerClaude);
  // CLAUDE.md in directories of changed files
  const dirs = new Set(changedFiles.map(f => dirname(f)));
  for (const dir of dirs) {
    const candidate = join(repoRoot, dir, "CLAUDE.md");
    if (existsSync(candidate)) files.add(candidate);
  }
  return [...files].map(f => ({ path: f.replace(repoRoot + "/", ""), content: readFileSync(f, "utf-8") }));
}

// ── Parse changed files from diff ──
function parseChangedFiles(diff) {
  const files = [];
  for (const line of diff.split("\n")) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) files.push(m[2]);
  }
  return files;
}

// ── Agent prompts ──
const COMMON_SYSTEM = `You are a code review agent. You review code changes for issues.
You must be HIGH SIGNAL only. Do not flag style issues, nitpicks, or potential issues.
Only flag issues you are confident are real problems.

False positives to NEVER flag:
- Pre-existing issues not introduced in this PR
- Code that looks like a bug but is actually correct
- Pedantic nitpicks a senior engineer would not flag
- Issues a linter will catch
- General code quality concerns (unless explicitly in CLAUDE.md)
- Issues with lint ignore comments

Return JSON array of issues. Each issue:
{
  "file": "path/to/file",
  "line": <line number in the new file>,
  "description": "what the issue is",
  "reason": "why it's flagged (e.g. 'bug', 'CLAUDE.md violation', 'security')",
  "confidence": <0-100>
}

If no issues found, return: []`;

function agentPrompt_claudeMd(diff, claudeMdFiles, prInfo) {
  let guidelines = "";
  for (const f of claudeMdFiles) {
    guidelines += `\n--- ${f.path} ---\n${f.content}\n`;
  }
  return `PR Title: ${prInfo.title}
PR Description: ${prInfo.body}

CLAUDE.md / AGENTS.md guidelines:
${guidelines}

Code diff to review:
\`\`\`diff
${diff.slice(0, 50000)}
\`\`\`

Review this diff for CLAUDE.md / AGENTS.md compliance violations ONLY.
For each violation, quote the exact rule being broken from the CLAUDE.md file.
Only flag clear, unambiguous violations where you can cite the specific rule.`;
}

function agentPrompt_bugDetector(diff, prInfo) {
  return `PR Title: ${prInfo.title}
PR Description: ${prInfo.body}

Code diff to review:
\`\`\`diff
${diff.slice(0, 50000)}
\`\`\`

Scan for obvious bugs in the changed code. Focus ONLY on the diff itself.
Flag only:
- Code that will fail to compile or parse (syntax errors, type errors, missing imports)
- Code that will definitely produce wrong results regardless of inputs (clear logic errors)
- Missing error handling that will cause crashes

Do NOT flag:
- Style issues, naming conventions
- Potential issues that depend on specific inputs
- Subjective suggestions`;
}

function agentPrompt_securityReviewer(diff, prInfo) {
  return `PR Title: ${prInfo.title}
PR Description: ${prInfo.body}

Code diff to review:
\`\`\`diff
${diff.slice(0, 50000)}
\`\`\`

Look for problems in the introduced code:
- Security issues (hardcoded secrets, injection vulnerabilities, missing auth checks)
- Incorrect logic that produces wrong results
- Race conditions or data corruption risks
- Missing input validation that could cause failures

Only look for issues within the changed code. Do not flag pre-existing issues.`;
}

// ── Validation agent ──
async function validateIssue(issue, diff, claudeMdFiles) {
  const prompt = `You are a code review validator. Another agent flagged this issue:

File: ${issue.file}
Line: ${issue.line}
Description: ${issue.description}
Reason: ${issue.reason}
Claimed confidence: ${issue.confidence}

Here is the relevant diff:
\`\`\`diff
${diff.slice(0, 30000)}
\`\`\`

${claudeMdFiles.length > 0 ? `CLAUDE.md guidelines:\n${claudeMdFiles.map(f => f.content).join("\n")}` : ""}

Validate: Is this issue truly real? Check the actual code in the diff.
Return JSON: {"valid": true/false, "confidence": <0-100>, "reason": "why valid or invalid"}`;

  try {
    const result = await callLLM(prompt, "You are a code review validator. Be strict.", MODEL_STRONG);
    const match = result.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { valid: false, confidence: 0, reason: "parse error" };
  } catch {
    return { valid: false, confidence: 0, reason: "validation failed" };
  }
}

// ── Main ──
async function main() {
  console.log("🔍 L3 Multi-agent code review");
  console.log(`   Model: ${MODEL} | Strong: ${MODEL_STRONG}`);
  console.log(`   Confidence threshold: ${CONFIDENCE_THRESHOLD}`);

  const diff = getDiff();
  if (!diff.trim()) {
    console.log("✅ No diff found. Nothing to review.");
    return;
  }

  const changedFiles = parseChangedFiles(diff);
  console.log(`   Changed files: ${changedFiles.length}`);

  const prInfo = getPRInfo();
  console.log(`   PR: ${prInfo.title || "(current branch)"}`);

  const claudeMdFiles = gatherClaudeMdFiles(changedFiles);
  console.log(`   CLAUDE.md files: ${claudeMdFiles.map(f => f.path).join(", ") || "(none)"}`);

  // Skip trivial PRs
  if (changedFiles.length <= 2 && diff.length < 500) {
    console.log("✅ Trivial change, skipping review.");
    return;
  }

  // ── Step 1-3: Launch 4 agents in parallel ──
  console.log("\n🤖 Launching 4 review agents in parallel...");

  // Track LLM failures separately so we can report them instead of
  // silently posting "✅ No issues found" when the review didn't actually run.
  const llmErrors = [];
  function trackError(agentName) {
    return (e) => {
      llmErrors.push({ agent: agentName, error: e.message });
      return `[] // error: ${e.message}`;
    };
  }

  const [mdResult1, mdResult2, bugResult, secResult] = await Promise.all([
    callLLM(agentPrompt_claudeMd(diff, claudeMdFiles, prInfo), COMMON_SYSTEM, MODEL).catch(trackError("CLAUDE.md #1")),
    callLLM(agentPrompt_claudeMd(diff, claudeMdFiles, prInfo), COMMON_SYSTEM, MODEL).catch(trackError("CLAUDE.md #2")),
    callLLM(agentPrompt_bugDetector(diff, prInfo), COMMON_SYSTEM, MODEL_STRONG).catch(trackError("Bug detector")),
    callLLM(agentPrompt_securityReviewer(diff, prInfo), COMMON_SYSTEM, MODEL_STRONG).catch(trackError("Security/logic")),
  ]);

  // If all 4 agents failed, the review didn't run — post a warning instead of "no issues"
  if (llmErrors.length === 4) {
    console.error("⚠️  All 4 review agents failed — LLM may be unavailable.");
    for (const err of llmErrors) {
      console.error(`   ${err.agent}: ${err.error}`);
    }
    if (shouldComment && prNumber) {
      const errorList = llmErrors.map(e => `- **${e.agent}**: ${e.error}`).join("\n");
      execSync(`gh pr comment ${prNumber} --repo farmost-beep/welian --body ${JSON.stringify(
        `## ⚠️ Code review did not run\n\nAll 4 review agents failed (LLM unavailable). Please review manually.\n\n**Errors:**\n${errorList}`
      )}`);
      console.log("   Posted LLM-unavailable warning to PR.");
    }
    process.exit(1);
  }

  if (llmErrors.length > 0) {
    console.log(`⚠️  ${llmErrors.length}/4 agents failed (partial review):`);
    for (const err of llmErrors) {
      console.log(`   ${err.agent}: ${err.error}`);
    }
  }

  // Parse issues from each agent
  function parseIssues(text) {
    try {
      const match = text.match(/\[[\s\S]*\]/);
      return match ? JSON.parse(match[0]) : [];
    } catch {
      return [];
    }
  }

  let allIssues = [
    ...parseIssues(mdResult1),
    ...parseIssues(mdResult2),
    ...parseIssues(bugResult),
    ...parseIssues(secResult),
  ];

  console.log(`   Agent 1 (CLAUDE.md #1): ${parseIssues(mdResult1).length} issues`);
  console.log(`   Agent 2 (CLAUDE.md #2): ${parseIssues(mdResult2).length} issues`);
  console.log(`   Agent 3 (bug detector): ${parseIssues(bugResult).length} issues`);
  console.log(`   Agent 4 (security/logic): ${parseIssues(secResult).length} issues`);
  console.log(`   Total before filtering: ${allIssues.length}`);

  // Deduplicate by file+line+description similarity
  const seen = new Set();
  allIssues = allIssues.filter(i => {
    const key = `${i.file}:${i.line}:${i.description?.slice(0, 50)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`   After dedup: ${allIssues.length}`);

  if (allIssues.length === 0) {
    console.log("\n✅ No issues found. Checked for bugs, security, and CLAUDE.md compliance.");
    if (shouldComment && prNumber) {
      const partialNote = llmErrors.length > 0
        ? `\n\n⚠️ Note: ${llmErrors.length}/4 agents failed. Review may be incomplete.`
        : "";
      execSync(`gh pr comment ${prNumber} --repo farmost-beep/welian --body ${JSON.stringify(
        `## Code review\n\n✅ No issues found. Checked for bugs, security, and CLAUDE.md compliance.${partialNote}`
      )}`);
      console.log("   Posted clean review comment.");
    }
    return;
  }

  // ── Step 5: Validate each issue in parallel ──
  console.log("\n🔬 Validating issues in parallel...");
  const validated = await Promise.all(
    allIssues.map(async (issue) => {
      const v = await validateIssue(issue, diff, claudeMdFiles);
      return { ...issue, valid: v.valid, validated_confidence: v.confidence, validation_reason: v.reason };
    })
  );

  // ── Step 6: Filter by confidence ≥ threshold ──
  const highSignal = validated.filter(i => i.valid && (i.validated_confidence || i.confidence || 0) >= CONFIDENCE_THRESHOLD);

  console.log(`   After validation + confidence filter (≥${CONFIDENCE_THRESHOLD}): ${highSignal.length} issues`);

  if (highSignal.length === 0) {
    console.log("\n✅ No high-confidence issues found. All flagged issues were either false positives or below threshold.");
    if (shouldComment && prNumber) {
      execSync(`gh pr comment ${prNumber} --repo farmost-beep/welian --body "## Code review\n\n✅ No high-confidence issues found. Checked for bugs, security, and CLAUDE.md compliance."`);
      console.log("   Posted clean review comment.");
    }
    return;
  }

  // ── Output results ──
  console.log(`\n⚠️  Found ${highSignal.length} high-confidence issue(s):\n`);
  for (const issue of highSignal) {
    console.log(`   📄 ${issue.file}:${issue.line}`);
    console.log(`      ${issue.description}`);
    console.log(`      Reason: ${issue.reason} | Confidence: ${issue.validated_confidence || issue.confidence}`);
    console.log(`      Validation: ${issue.validation_reason}`);
    console.log();
  }

  // ── Post as PR comment ──
  if (shouldComment && prNumber) {
    const sha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    let body = `## Code review\n\nFound ${highSignal.length} high-confidence issue(s):\n\n`;
    for (let i = 0; i < highSignal.length; i++) {
      const issue = highSignal[i];
      body += `### ${i + 1}. ${issue.reason}: ${issue.description}\n\n`;
      body += `📄 [\`${issue.file}:${issue.line}\`](https://github.com/farmost-beep/welian/blob/${sha}/${issue.file}#L${issue.line})\n\n`;
      body += `Confidence: ${issue.validated_confidence || issue.confidence}/100\n\n`;
      body += `---\n\n`;
    }
    execSync(`gh pr comment ${prNumber} --repo farmost-beep/welian --body ${JSON.stringify(body)}`);
    console.log("   Posted review comment to PR.");
  }
}

main().catch(e => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
