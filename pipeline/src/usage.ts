// Log token usage and estimated cost of one Claude API call.
// NOTE: AI-generated (Claude, via Claude Code).

import type Anthropic from "@anthropic-ai/sdk";

// Claude Opus 5.5 list prices, USD per million tokens. Update if the model changes.
const PRICE_PER_MTOK = {
    input: 4,
    output: 20,
    cacheWrite: 5,   // 1.25 × input
    cacheRead: 0.2,
};

export function logUsage(label: string, usage: Anthropic.Beta.BetaUsage): void {
    const input = usage.input_tokens;
    const output = usage.output_tokens;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;

    const cost =
        (input * PRICE_PER_MTOK.input +
            output * PRICE_PER_MTOK.output +
            cacheWrite * PRICE_PER_MTOK.cacheWrite +
            cacheRead * PRICE_PER_MTOK.cacheRead) /
        1_000_000;

    console.log(
        `[usage] ${label}: ${input} in, ${output} out` +
            (cacheWrite || cacheRead ? `, ${cacheWrite} cache write, ${cacheRead} cache read` : "") +
            ` ≈ $${cost.toFixed(4)}`,
    );
}
