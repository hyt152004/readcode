// ============================================================================
// exampleGenerator.ts — Pipeline step 5+: generate one code-reading example
// ----------------------------------------------------------------------------
// NOTE: This file was AI-generated (Claude, via Claude Code). Read it with
// that in mind before relying on or changing it.
//
// Role:
//   Given a target concept (a taxonomy label), asks Claude to write a small,
//   self-contained code example plus 4 multiple-choice questions about it,
//   and returns a validated Example. writeExample() puts it on disk:
//
//     <outDir>/public.json   questions and metadata (what the candidate sees)
//     <outDir>/key.json      correct answers
//     <outDir>/src/...       the example's code files
//
// Stand-in for now:
//   The pipeline's steps 6–10 (anchor file from an open-source repo, scrape,
//   self-contain, inject bugs, compile) are not built yet. Until then Claude
//   writes the code from scratch, guided by the prompt below.
//
// Split of responsibility:
//   Claude writes the creative parts (code, questions, answers, concepts).
//   This file fills in what the model must not decide: id, createdAt,
//   taxonomyVersion, and that the target concept is always in `concepts`.
// ============================================================================

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { Example, type LabelId, type Taxonomy } from "../../shared/types.ts";
import { logUsage } from "./usage.ts";

const MODEL = "claude-opus-5-5";
const QUESTION_COUNT = 4;
const CHOICES_PER_QUESTION = 4;

const SYSTEM_PROMPT = `You write code-reading exercises for backend engineers preparing for a specific job.

A candidate reads a short, realistic piece of production-style code and answers ${QUESTION_COUNT} multiple-choice questions about it. The exercise trains reading and reasoning about real code, not writing it.

The code:
- Centers on the target concept: understanding that concept must be necessary to answer at least two of the questions.
- Looks like real production code from a backend service: realistic names, structure, and error handling. Not a textbook snippet.
- Is self-contained: 1 to 4 files, roughly 80 to 250 lines in total. Files may import each other and the language's standard library or very common libraries, nothing else.
- May contain one subtle, realistic defect when the concept is naturally about a failure mode (for example a race condition or a missing timeout). Do not mark it.
- Has no comments that give away answers.

The questions:
- Exactly ${QUESTION_COUNT} questions, each with exactly ${CHOICES_PER_QUESTION} choices and exactly one correct choice.
- Answerable from the code alone, by careful reading.
- Ask about behavior, failure modes, consequences under load or failure, or the right fix. Not syntax, trivia, or naming.
- Wrong choices are plausible to someone who skims.
- Vary the position of the correct choice across questions.

Also report:
- concepts: the target concept plus any other listed labels the example genuinely exercises. Only include a label if a question depends on it or the code meaningfully demonstrates it.
- durationMinutes: a realistic time to read the code and answer all questions.`;

// What Claude returns. Array sizes are checked in code after parsing,
// since structured outputs don't enforce exact lengths.
function draftSchema(taxonomy: Taxonomy) {
    return z.object({
        title: z.string(),
        language: z.string(),
        durationMinutes: z.number(),
        files: z.array(z.object({ path: z.string(), content: z.string() })),
        questions: z.array(
            z.object({
                prompt: z.string(),
                choices: z.array(z.string()),
                answer: z.number(), // index into choices
            }),
        ),
        concepts: z.array(z.enum(taxonomy.labels as [string, ...string[]])),
    });
}

const client = new Anthropic(); // ANTHROPIC_API_KEY, or an `ant auth login` profile

export interface GenerateOptions {
    language?: string;        // default TypeScript
    jobDescription?: string;  // optional, gives the example the role's domain flavor
}

export async function generateExample(
    topic: LabelId,
    taxonomy: Taxonomy,
    options: GenerateOptions = {},
): Promise<Example> {
    if (!taxonomy.labels.includes(topic)) {
        throw new Error(`Topic ${topic} is not in taxonomy v${taxonomy.version}`);
    }
    const language = options.language ?? "TypeScript";

    const userContent = [
        `<target_concept>${topic}</target_concept>`,
        `<language>${language}</language>`,
        `<labels>\n${taxonomy.labels.join("\n")}\n</labels>`,
        options.jobDescription ? `<posting>\n${options.jobDescription}\n</posting>` : "",
    ]
        .filter(Boolean)
        .join("\n\n");

    // streamed: a large max_tokens on a non-streaming call is refused by the SDK (10-minute limit)
    const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default", // on a safety refusal, the API re-runs on a fallback model
        output_config: { format: betaZodOutputFormat(draftSchema(taxonomy)), effort: "medium" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
    });
    const response = await stream.finalMessage(); // includes parsed_output, like messages.parse

    logUsage("generateExample", response.usage);

    if (response.stop_reason === "refusal") {
        throw new Error(`Example generation refused (${response.stop_details?.category ?? "unknown"})`);
    }
    if (response.stop_reason === "max_tokens") {
        throw new Error("Example generation hit max_tokens before finishing");
    }
    const draft = response.parsed_output;
    if (!draft) throw new Error("Example generation returned no parseable output");

    // checks the schema couldn't enforce
    if (draft.questions.length !== QUESTION_COUNT) {
        throw new Error(`Expected ${QUESTION_COUNT} questions, got ${draft.questions.length}`);
    }
    draft.questions.forEach((q, i) => {
        if (q.choices.length < 2) throw new Error(`Question ${i + 1} has fewer than 2 choices`);
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) {
            throw new Error(`Question ${i + 1} has answer index ${q.answer} out of range`);
        }
    });
    if (draft.files.length === 0) throw new Error("Example has no files");
    draft.files.forEach((f) => assertSafeRelativePath(f.path));

    return Example.parse({
        public: {
            id: randomUUID(),
            title: draft.title,
            createdAt: new Date().toISOString(),
            durationMinutes: Math.max(1, Math.round(draft.durationMinutes)),
            language: draft.language,
            questions: draft.questions.map(({ prompt, choices }) => ({ prompt, choices })),
            taxonomyVersion: taxonomy.version,
            concepts: [...new Set([topic, ...draft.concepts])], // target always first, no duplicates
        },
        key: { answers: draft.questions.map((q) => q.answer) },
        files: draft.files,
    });
}

// Write an example to disk: public.json, key.json, src/<files>.
export async function writeExample(example: Example, outDir: string): Promise<void> {
    example.files.forEach((f) => assertSafeRelativePath(f.path)); // check all before writing anything
    const srcDir = path.resolve(outDir, "src");
    await mkdir(srcDir, { recursive: true });

    await writeFile(path.join(outDir, "public.json"), JSON.stringify(example.public, null, 2) + "\n");
    await writeFile(path.join(outDir, "key.json"), JSON.stringify(example.key, null, 2) + "\n");

    for (const file of example.files) {
        const target = path.resolve(srcDir, file.path);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.content);
    }
}

// File paths come from the model: keep them inside src/.
function assertSafeRelativePath(p: string): void {
    const normalized = path.posix.normalize(p.replaceAll("\\", "/"));
    if (path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || normalized === ".") {
        throw new Error(`Unsafe example file path: ${p}`);
    }
}
