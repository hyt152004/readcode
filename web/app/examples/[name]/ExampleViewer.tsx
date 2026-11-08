"use client";

import Editor from "@monaco-editor/react";
import { useState } from "react";
import type { LoadedExample } from "@/lib/examples";

// NOTE: the answer key is sent to the browser. Fine for a prototype, not for real use.
export default function ExampleViewer({ example }: { example: LoadedExample }) {
    const [current, setCurrent] = useState(example.files[0]?.path ?? "");
    const [picked, setPicked] = useState<(number | null)[]>(example.public.questions.map(() => null));
    const [checked, setChecked] = useState(false);

    const file = example.files.find((f) => f.path === current);
    const score = picked.filter((p, i) => p === example.key.answers[i]).length;

    return (
        <div className="flex min-h-0 flex-1">
            {/* file explorer */}
            <nav className="w-60 shrink-0 overflow-auto border-r border-neutral-400 p-2">
                <div className="mb-1 text-neutral-500">explorer</div>
                <FileTree node={buildTree(example.files.map((f) => f.path))} current={current} onOpen={setCurrent} depth={0} />
            </nav>

            {/* code */}
            <section className="min-w-0 flex-1">
                <Editor
                    path={current}
                    value={file?.content ?? ""}
                    language={languageFor(current)}
                    theme="vs-dark"
                    options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                />
            </section>

            {/* questions */}
            <aside className="w-[28rem] shrink-0 overflow-auto border-l border-neutral-400 p-3">
                {example.public.questions.map((q, qi) => (
                    <fieldset key={qi} className="mb-4 border border-neutral-400 p-2">
                        <legend className="px-1 font-bold">Q{qi + 1}</legend>
                        <p className="mb-2 whitespace-pre-wrap">{q.prompt}</p>
                        {q.choices.map((c, ci) => {
                            const correct = checked && ci === example.key.answers[qi];
                            const wrong = checked && picked[qi] === ci && ci !== example.key.answers[qi];
                            return (
                                <label
                                    key={ci}
                                    className={`flex gap-2 px-1 py-0.5 ${correct ? "bg-green-200 text-black" : ""} ${wrong ? "bg-red-200 text-black" : ""}`}
                                >
                                    <input
                                        type="radio"
                                        name={`q${qi}`}
                                        checked={picked[qi] === ci}
                                        disabled={checked}
                                        onChange={() => setPicked((p) => p.map((v, i) => (i === qi ? ci : v)))}
                                    />
                                    <span>{String.fromCharCode(65 + ci)}. {c}</span>
                                </label>
                            );
                        })}
                    </fieldset>
                ))}
                <div className="flex items-center gap-3">
                    {!checked ? (
                        <button
                            className="border border-neutral-600 px-2 py-1 hover:bg-neutral-200 hover:text-black disabled:opacity-40"
                            disabled={picked.some((p) => p === null)}
                            onClick={() => setChecked(true)}
                        >
                            check answers
                        </button>
                    ) : (
                        <>
                            <span>score: {score}/{example.public.questions.length}</span>
                            <button
                                className="border border-neutral-600 px-2 py-1 hover:bg-neutral-200 hover:text-black"
                                onClick={() => {
                                    setChecked(false);
                                    setPicked(example.public.questions.map(() => null));
                                }}
                            >
                                reset
                            </button>
                        </>
                    )}
                </div>
            </aside>
        </div>
    );
}

// ---- file tree ----

type TreeNode = { name: string; path: string; children: TreeNode[]; isFile: boolean };

// Turn flat paths ("a/b/c.ts") into a folder tree. Folders first, then files, alphabetical.
function buildTree(paths: string[]): TreeNode {
    const root: TreeNode = { name: "", path: "", children: [], isFile: false };
    for (const p of paths) {
        let node = root;
        p.split("/").forEach((part, i, parts) => {
            const isFile = i === parts.length - 1;
            let child = node.children.find((c) => c.name === part && c.isFile === isFile);
            if (!child) {
                child = { name: part, path: parts.slice(0, i + 1).join("/"), children: [], isFile };
                node.children.push(child);
            }
            node = child;
        });
    }
    const sort = (n: TreeNode) => {
        n.children.sort((a, b) => Number(a.isFile) - Number(b.isFile) || a.name.localeCompare(b.name));
        n.children.forEach(sort);
    };
    sort(root);
    return root;
}

function FileTree({ node, current, onOpen, depth }: {
    node: TreeNode; current: string; onOpen: (path: string) => void; depth: number;
}) {
    return (
        <ul>
            {node.children.map((child) =>
                child.isFile ? (
                    <li key={child.path}>
                        <button
                            onClick={() => onOpen(child.path)}
                            title={child.path}
                            style={{ paddingLeft: depth * 12 + 16 }}
                            className={`block w-full truncate pr-1 text-left ${child.path === current ? "bg-yellow-200 text-black" : "hover:bg-neutral-200 hover:text-black"}`}
                        >
                            {child.name}
                        </button>
                    </li>
                ) : (
                    <Folder key={child.path} node={child} current={current} onOpen={onOpen} depth={depth} />
                ),
            )}
        </ul>
    );
}

function Folder({ node, current, onOpen, depth }: {
    node: TreeNode; current: string; onOpen: (path: string) => void; depth: number;
}) {
    const [open, setOpen] = useState(true);
    return (
        <li>
            <button
                onClick={() => setOpen((o) => !o)}
                style={{ paddingLeft: depth * 12 }}
                className="block w-full truncate pr-1 text-left hover:bg-neutral-200 hover:text-black"
            >
                {open ? "▾" : "▸"} {node.name}/
            </button>
            {open && <FileTree node={node} current={current} onOpen={onOpen} depth={depth + 1} />}
        </li>
    );
}

function languageFor(p: string): string {
    const ext = p.split(".").pop() ?? "";
    const map: Record<string, string> = {
        ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", py: "python", go: "go",
        java: "java", rs: "rust", rb: "ruby", cs: "csharp", kt: "kotlin", json: "json", sql: "sql",
        yml: "yaml", yaml: "yaml", md: "markdown", sh: "shell",
    };
    return map[ext] ?? "plaintext";
}
