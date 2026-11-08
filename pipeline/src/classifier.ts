// ============================================================================
// classifier.ts — Pipeline step 2: classify a job posting against the taxonomy
// ----------------------------------------------------------------------------
// NOTE: This file was AI-generated (Claude, via Claude Code). Read it with
// that in mind before relying on or changing it.
//
// Role:
//   Takes a job description and a taxonomy, and returns a Classification: a
//   dense vector of weights (0–1), one per taxonomy label, saying how relevant
//   each backend concept is to the role. Later pipeline steps use this vector
//   for the coverage test and to rank concepts by shortfall.
//
// How it works:
//   The classification itself is done by an LLM (the Claude API). This file is
//   the scaffolding around that call: it constrains the model's output with a
//   schema so it can only return real labels, checks for failures (refusal,
//   truncation, unparseable output), and converts the answer into a dense
//   vector in taxonomy order.
//
// Version-agnostic by design:
//   No label names appear in this file. The caller (the pipeline) owns the
//   taxonomy version and passes the loaded taxonomy in; the label set, the
//   output schema, and the vector order all come from it.
//
// Note: LLM output can vary between runs, so store each classification
// rather than re-classifying the same posting.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Classification, LabelId, Taxonomy } from "../../shared/types.ts";
import { logUsage } from "./usage.ts";

const MODEL = "claude-opus-5-5";

const SYSTEM_PROMPT = `You classify software job postings against a taxonomy of backend engineering concepts.

For each label, estimate how relevant that concept is to the day-to-day work implied by the posting, as a weight from 0 to 1:
- 1.0: central to the role (explicitly required, or unavoidable given the domain and stack)
- 0.5: likely to come up regularly
- 0.1-0.3: plausible but peripheral
- omit the label entirely if it is not relevant

Infer from the domain, stack, and scale, not only from literal mentions. For example, payments work implies idempotency and transactions even if those words never appear.
Ignore company boilerplate, benefits, and EEO text.`;

const client = new Anthropic(); // ANTHROPIC_API_KEY, or an `ant auth login` profile

export async function classify(jobDescription: string, taxonomy: Taxonomy): Promise<Classification> {
  if (jobDescription.trim().length === 0) throw new Error("Job description is empty");
  if (taxonomy.labels.length === 0) throw new Error(`Taxonomy ${taxonomy.version} has no labels`);

  const schema = z.object({
    weights: z.array(
      z.object({
        label: z.enum(taxonomy.labels as [string, ...string[]]),
        weight: z.number(),
      }),
    ),
  });

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // on a safety refusal, the API re-runs on a fallback model
    output_config: { format: betaZodOutputFormat(schema), effort: "low" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<labels>\n${taxonomy.labels.join("\n")}\n</labels>\n\n<posting>\n${jobDescription}\n</posting>`,
      },
    ],
  });

  logUsage("classify", response.usage);

  if (response.stop_reason === "refusal") {
    throw new Error(`Classification refused (${response.stop_details?.category ?? "unknown"})`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Classification hit max_tokens before finishing");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Classification returned no parseable output");

  const byLabel = new Map<LabelId, number>();
  for (const { label, weight } of parsed.weights) {
    byLabel.set(label, Math.min(1, Math.max(0, weight)));
  }

  return {
    taxonomyVersion: taxonomy.version,
    weights: taxonomy.labels.map((label) => byLabel.get(label) ?? 0),
  };
}
