import Groq from "groq-sdk";

// Single shared entry point for every coach text generation (move comments in
// blunderDetector, on-demand /api/explain, insightsGenerator). Exists because
// the three call sites each swallowed Groq errors silently — when the free
// tier's daily token cap ran out mid-batch, comments just stopped appearing
// with nothing in the logs, which reads as "the AI connection broke".
//
// Two things this centralizes:
//  1. Fallback model. llama-3.3-70b-versatile and llama-3.1-8b-instant have
//     SEPARATE free-tier rate/token buckets — when the 70B's quota is spent
//     (HTTP 429), the 8B usually still has plenty, so a slightly plainer
//     comment beats a missing one.
//  2. Real logging. Render's logs now show which model failed with which
//     status instead of nothing.
const PRIMARY_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama-3.1-8b-instant";

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

export const coachAvailable = groq !== null;

export async function coachChat(
  prompt: string,
  opts: { temperature: number; maxTokens: number },
): Promise<string | null> {
  if (!groq) return null;
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      // The SDK already retries transient 429/5xx twice with backoff before
      // throwing — by the time we catch, that model's bucket is really dry.
      const res = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
      });
      const text = res.choices[0]?.message?.content?.trim() ?? "";
      if (text) return text;
      console.error(`[groq] ${model} returned an empty completion`);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[groq] ${model} failed${status ? ` (HTTP ${status})` : ""}: ${msg}`);
      // A bad key fails identically on every model — don't burn a second call.
      if (status === 401) return null;
    }
  }
  return null;
}
