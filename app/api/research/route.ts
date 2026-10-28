import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { clampConfig, FOCUS_LABELS } from "@/lib/class-config";
import { sanitizeStudentText } from "@/lib/sanitize";
import { isTeacherAccount } from "@/lib/supabase-auth";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";
import { isTrustedUrl, RESEARCH_DOMAINS } from "@/lib/trusted-sources";
import type { PinnedSource, ResearchResult } from "@/lib/types";

// Research with sources (docs/03), teacher only. Two calls, because web search
// always attaches citations and structured output rejects citations:
//   1. Sonnet 5.5 searches the trusted sites only and writes research notes.
//   2. Haiku 5.5 turns the notes into findings, each pointing at one of the
//      sources the search returned (an enum), so no link is invented.
// Nothing is stored here; the teacher pins findings into the session settings.
export const maxDuration = 120;

const SEARCH_MODEL = "claude-sonnet-5-5";
const STRUCTURE_MODEL = "claude-haiku-5-5";
const MAX_SEARCHES = 4;
const MAX_PAUSES = 3;
const MAX_SOURCES = 12;
const MAX_FINDINGS = 5;

const SEARCH_SYSTEM = `You research training questions for a high school PE teacher. Search the trusted sites you have, then write short research notes: the practical points a PE workout should apply, each tied to the source that supports it. Stick to what the sources say; leave out anything that isn't about training high school students. Keep the notes under 300 words.`;

const STRUCTURE_SYSTEM = `Turn research notes into ${MAX_FINDINGS} or fewer findings a PE teacher can pin to a class session. Each finding is one practical takeaway for high school workouts, under 200 characters, plus the id of the source that supports it. Use only points the notes and that source support. Return fewer findings rather than weak ones.`;

interface Source { id: string; title: string; url: string; excerpt: string }

/** Every trusted page the search returned, cited ones first. */
function collectSources(responses: Anthropic.Beta.BetaMessage[]): Source[] {
  const cited = new Map<string, Source>();
  const returned = new Map<string, Source>();
  for (const res of responses) {
    for (const block of res.content) {
      if (block.type === "text") {
        for (const c of block.citations ?? []) {
          if (c.type !== "web_search_result_location" || !isTrustedUrl(c.url)) continue;
          const prev = cited.get(c.url);
          const excerpt = [prev?.excerpt, c.cited_text].filter(Boolean).join(" … ").slice(0, 400);
          cited.set(c.url, { id: "", title: c.title ?? prev?.title ?? c.url, url: c.url, excerpt });
        }
      } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (isTrustedUrl(r.url) && !returned.has(r.url)) returned.set(r.url, { id: "", title: r.title, url: r.url, excerpt: "" });
        }
      }
    }
  }
  const all = [...cited.values(), ...[...returned.values()].filter((s) => !cited.has(s.url))];
  return all.slice(0, MAX_SOURCES).map((s, i) => ({ ...s, id: `S${i + 1}` }));
}

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { account, withCookies } = await callerFromRequest(request);
  if (!account) return signInRequired();
  if (!isTeacherAccount(account)) return NextResponse.json({ error: "Research is for teachers." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const topic = sanitizeStudentText(typeof body.topic === "string" ? body.topic : "", 200);
  if (!topic) return NextResponse.json({ error: "Type a topic to research." }, { status: 400 });
  const cfg = body.config && typeof body.config === "object" ? clampConfig(body.config as Record<string, unknown>) : null;

  // Every run costs real money ($10 per 1,000 searches plus tokens).
  const limited = await checkRateLimit(createServerClient(), [
    { name: `research:user:${account.id}`, windowSeconds: WINDOW.hour, limit: 10 },
    { name: "research:global",             windowSeconds: WINDOW.day,  limit: 100 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  const context = cfg ? `\nThe class: ${cfg.duration} minutes, ${cfg.intensity} intensity, ${FOCUS_LABELS[cfg.focus] ?? cfg.focus}.` : "";
  const client = new Anthropic();

  try {
    // ── 1. Search the trusted sites ────────────────────────────
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: "user", content: `Research topic: ${topic}${context}` },
    ];
    const responses: Anthropic.Beta.BetaMessage[] = [];
    let searches = 0;
    for (let i = 0; i <= MAX_PAUSES; i++) {
      const res = await client.beta.messages.create({
        model: SEARCH_MODEL,
        max_tokens: 8000,
        output_config: { effort: "low" },
        // Server-side refusal fallback: a declined request is retried on another model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SEARCH_SYSTEM,
        tools: [{
          type: "web_search_20260209",
          name: "web_search",
          max_uses: MAX_SEARCHES,
          allowed_domains: [...RESEARCH_DOMAINS],
        }],
        messages,
      });
      responses.push(res);
      searches += res.usage.server_tool_use?.web_search_requests ?? 0;
      if (res.stop_reason === "refusal") {
        return NextResponse.json({ error: "The AI couldn't research that. Try rewording the topic." }, { status: 422 });
      }
      // A long search turn can pause; send the paused turn back unchanged to resume.
      if (res.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: res.content });
    }

    const sources = collectSources(responses);
    const notes = responses
      .flatMap((r) => r.content)
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .slice(0, 6000);
    if (sources.length === 0 || !notes) {
      return withCookies(NextResponse.json({ findings: [], searches } satisfies ResearchResult));
    }

    // ── 2. Structure the findings, links limited to real sources ─
    const schema = {
      type: "object",
      properties: {
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              takeaway: { type: "string" },
              source: { type: "string", enum: sources.map((s) => s.id) },
            },
            required: ["takeaway", "source"],
            additionalProperties: false,
          },
        },
      },
      required: ["findings"],
      additionalProperties: false,
    };
    const sourceList = sources
      .map((s) => `${s.id}: ${s.title} (${s.url})${s.excerpt ? `\n    "${s.excerpt}"` : ""}`)
      .join("\n");
    const structured = await client.messages.create({
      model: STRUCTURE_MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system: STRUCTURE_SYSTEM,
      messages: [{ role: "user", content: `TOPIC: ${topic}\n\nRESEARCH NOTES:\n${notes}\n\nSOURCES:\n${sourceList}` }],
    });
    const text = structured.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = JSON.parse(text) as { findings?: { takeaway?: unknown; source?: unknown }[] };
    const byId = new Map(sources.map((s) => [s.id, s]));
    const findings: PinnedSource[] = [];
    for (const f of parsed.findings ?? []) {
      const src = typeof f.source === "string" ? byId.get(f.source) : undefined;
      const takeaway = typeof f.takeaway === "string" ? f.takeaway.trim().slice(0, 240) : "";
      if (!src || !takeaway || !isTrustedUrl(src.url)) continue;
      findings.push({ title: src.title.slice(0, 160), url: src.url, takeaway });
      if (findings.length >= MAX_FINDINGS) break;
    }
    return withCookies(NextResponse.json({ findings, searches } satisfies ResearchResult));
  } catch (err) {
    console.error("research error:", err);
    // Web search can be switched off for the organization in the Claude Console.
    if (err instanceof Anthropic.BadRequestError && /web search/i.test(err.message)) {
      return NextResponse.json({ error: "Research isn't available right now." }, { status: 503 });
    }
    return NextResponse.json({ error: "Research failed. Try again in a minute." }, { status: 500 });
  }
}
