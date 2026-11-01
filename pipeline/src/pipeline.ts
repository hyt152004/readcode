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

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { JobPosting, WeightVector, Taxonomy, Classification } from "../../shared/types.js";
import { readFileSync } from "node:fs";
import { classify } from "./classifier.js";

const JOB_DESCRIPTION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "jobDescription");
const TAXONOMY_VERSION = "0.0.0";
const TAXONOMY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "taxonomy");

// function parseJobDescription(jobDescription: String): JobPosting {
//     // call the LLM to parse the string and store it as JobPosting object
//     // return the object

//     return None;
// }


async function pipeline(jobDescription: string) {
    // let jobPosting: JobPosting = parseJobDescription(jobDescription);

    const taxonomy: Taxonomy = JSON.parse(readFileSync(path.join(TAXONOMY_DIR, `v${TAXONOMY_VERSION}.json`), "utf8"));
    let weights: Classification = await classify(jobDescription, taxonomy);

    // print non-zero weights, highest first
    console.log(`Weights (taxonomy v${weights.taxonomyVersion}):`);
    taxonomy.labels
        .map((label, i) => ({ label, weight: weights.weights[i] }))
        .filter(({ weight }) => weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .forEach(({ label, weight }) => console.log(`  ${weight.toFixed(2)}  ${label}`));

    return weights;
}

// to run: npm run pipeline
async function main() {
    const file = path.join(JOB_DESCRIPTION_DIR, "lyft_backend_intern.json");
    const { description } = JSON.parse(await readFile(file, "utf8")) as { description: string };

    await pipeline(description)
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
