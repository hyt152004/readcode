// Server-only helpers that read example folders from disk.
// An example folder looks like:  <name>/public.json, <name>/key.json, <name>/src/**
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ExampleKey, ExamplePublic, SourceFile } from "../../shared/types";

// Where example folders live. Defaults to the repo root (one level above web/).
// turbopackIgnore: these are runtime paths, not files to bundle
export const EXAMPLES_ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.EXAMPLES_ROOT ?? path.join(process.cwd(), ".."));

export type LoadedExample = { name: string; public: ExamplePublic; key: ExampleKey; files: SourceFile[] };

// Direct child folders of EXAMPLES_ROOT (and EXAMPLES_ROOT/examples) that contain a non-empty public.json.
export async function listExamples(): Promise<{ name: string; title: string }[]> {
    const found: { name: string; title: string }[] = [];
    for (const base of ["", "examples"]) {
        const dir = path.join(/*turbopackIgnore: true*/ EXAMPLES_ROOT, base);
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const e of entries) {
            if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
            const name = base ? `${base}/${e.name}` : e.name;
            const pub = await readJson<ExamplePublic>(path.join(/*turbopackIgnore: true*/ EXAMPLES_ROOT, name, "public.json"));
            if (pub) found.push({ name, title: pub.title });
        }
    }
    return found.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadExample(name: string): Promise<LoadedExample | null> {
    const dir = resolveInside(EXAMPLES_ROOT, name);
    if (!dir) return null;
    const pub = await readJson<ExamplePublic>(path.join(dir, "public.json"));
    const key = await readJson<ExampleKey>(path.join(dir, "key.json"));
    if (!pub || !key) return null;
    const srcDir = path.join(dir, "src");
    const files = (await walk(srcDir)).map((abs) => ({ abs, rel: path.relative(srcDir, abs).split(path.sep).join("/") }));
    return {
        name,
        public: pub,
        key,
        files: await Promise.all(files.map(async ({ abs, rel }) => ({ path: rel, content: await readFile(abs, "utf8") }))),
    };
}

async function readJson<T>(file: string): Promise<T | null> {
    const raw = await readFile(file, "utf8").catch(() => "");
    if (raw.trim() === "") return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const out: string[] = [];
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...(await walk(p)));
        else if (e.isFile() && (await stat(p)).size < 1_000_000) out.push(p);
    }
    return out.sort();
}

// Resolve `name` under `root`, refusing anything that escapes it (e.g. "../..").
function resolveInside(root: string, name: string): string | null {
    const abs = path.resolve(/*turbopackIgnore: true*/ root, name);
    return abs.startsWith(root + path.sep) ? abs : null;
}
