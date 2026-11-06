// The Pipeline
// pre-step:
// have an example bank with discrete counts (concepts covered from example: +1)
// steps:
// 1. take job posting as input
// 2. classify weights for the job posting
// 3. coverage test, proceed if not covered
// 4. rank concepts by shortfall
// 5. choose highest shortfall concept to create an example with
// 6. Anchor file is chosen from out of our open-source repo pool that scores best with the shortfall concept. The LLM picks supporting files that the file needs. score takes into account file reuse count (use example bank)
// 7. scrape the files needed to create the example
// 8. self-contain the example (no function references to files not selected)
// 9. inject bugs if relevant
// 10. Verify through compiling
// 11. generate a rubric
// 12. human review
// 13. add to the bank and update the counts.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { Plan, Taxonomy, type Classification } from "../../shared/types.ts";
import { readFileSync } from "node:fs";
import { classify } from "./classifier.ts";

const PIPELINE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const JOB_DESCRIPTION_DIR = path.join(PIPELINE_DIR, "jobDescription");
const TAXONOMY_DIR = path.join(PIPELINE_DIR, "taxonomy");

const TAXONOMY_VERSION = "0.1.0";

const EXAMPLES_PER_POSTING = 20;
const MIN_PER_TOPIC = 2;
const SHARE_POWER = 2;


// use a job description file to create a plan file
async function plan(jobDescription: string): Promise<Plan> {
    const taxonomy: Taxonomy = JSON.parse(readFileSync(path.join(TAXONOMY_DIR, `v${TAXONOMY_VERSION}.json`), "utf8"));

    // 1. classify
    const classification = await classify(jobDescription, taxonomy);

    // 2. rank concepts
    const ranked = taxonomy.labels
        .map((label, i) => ({ label, weight: classification.weights[i], i }))
        .filter((r) => r.weight > 0)
        .sort((a, b) => b.weight - a.weight || a.i - b.i);

    
    // 3. Keep only the topics that will get examples.
    let chosen = ranked.slice(0, Math.floor(EXAMPLES_PER_POSTING / MIN_PER_TOPIC));
    let counts = apportion(chosen.map((r) => r.weight));
    //    If any topic would get fewer than MIN_PER_TOPIC, drop the weakest and apportion again.
    while (chosen.length > 1 && Math.min(...counts) < MIN_PER_TOPIC) {
        chosen = chosen.slice(0, -1);
        counts = apportion(chosen.map((r) => r.weight));
    }

    return {
        taxonomyVersion: taxonomy.version,
        targets: chosen.map((r, j) => ({ label: r.label, count: counts[j] })),
    };
}

function apportion(weights: number[]): number[] {
    // 4. expontentialize the  weights - 0.6 is worth more than double 0.3, (0.6)^2 vs (0.3)^2 is a more accurate difference. '2' is a parameter
    const powered = weights.map((w) => w ** SHARE_POWER);

    // 5. calculate shares, the fraction each concept represents
    const total = powered.reduce((s, x) => s + x, 0);
    const shares = powered.map((x) => x / total);   // sums to 1

    // 6. apportion 20 examples to the concepts based on share. apportion is required because the true share fraction is not a discrete number of examples.
    // e.g. ideal    = 2.8,  3.7,  3.5
    //      counts   = 2,    3,    3
    //      leftover = 0.8 + 0.7 + 0.5 = 2
    //      final    = 3,    4,    3
    const ideal = shares.map((s) => s * EXAMPLES_PER_POSTING);   // e.g. 3.6
    const counts = ideal.map(Math.floor);                         // 3
    const leftover = EXAMPLES_PER_POSTING - counts.reduce((s, c) => s + c, 0);

    ideal
        .map((q, i) => ({ i, remainder: q - Math.floor(q) }))
        .sort((a, b) => b.remainder - a.remainder || a.i - b.i) // sort by highest remainder
        .slice(0, leftover)
        .forEach(({ i }) => counts[i]++);

    return counts;
}

async function pipeline(plan: Plan) {
    // TODO: count bank, compute shortfall, generate an example for the top topic
    console.log(`Running pipeline with ${plan.targets.length} topics (taxonomy v${plan.taxonomyVersion})`);
}

// standard:     node pipeline/src/pipeline.ts <job_description_file.txt>                          plan → pipeline
// plan only:    node pipeline/src/pipeline.ts <job_description_file.txt> --create_plan <out.json>  plan → write file
// reuse a plan: node pipeline/src/pipeline.ts --use_plan <plan.json>                               read file → pipeline
async function main() {
    const { values, positionals } = parseArgs({
        options: { create_plan: { type: "string" },
                   use_plan:    { type: "string" } },
        allowPositionals: true,
    });
    const usage = "Usage: node pipeline/src/pipeline.ts <job_description_file.txt> [--create_plan <out.json>] | --use_plan <plan.json>";

    if (values.create_plan && values.use_plan) {
        console.error("--create_plan and --use_plan can't be used together.\n" + usage);
        process.exit(1);
    }

    // --use_plan: skip planning, run the pipeline on a saved plan
    if (values.use_plan) {
        const saved = Plan.parse(JSON.parse(await readFile(values.use_plan, "utf8")));
        await pipeline(saved);
        return;
    }

    const jobDescriptionFile = positionals[0];
    if (!jobDescriptionFile) {
        console.error(usage);
        process.exit(1);
    }
    const description = await readFile(path.join(JOB_DESCRIPTION_DIR, jobDescriptionFile), "utf8");
    const result = await plan(description);

    // --create_plan: save the plan and stop
    if (values.create_plan) {
        await writeFile(values.create_plan, JSON.stringify(result, null, 2) + "\n");
        console.log(`Plan written to ${values.create_plan}`);
        return;
    }

    // standard: plan, then pipeline
    await pipeline(result);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
