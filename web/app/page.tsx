import Link from "next/link";
import { Suspense } from "react";
import { EXAMPLES_ROOT, listExamples } from "@/lib/examples";

export default function Home() {
    return (
        <main className="p-6 font-mono text-sm">
            <h1 className="text-base font-bold">readcode / examples</h1>
            <p className="text-neutral-500">reading from {EXAMPLES_ROOT}</p>
            <hr className="my-3 border-neutral-400" />
            <Suspense fallback={<p>loading…</p>}>
                <ExampleList />
            </Suspense>
        </main>
    );
}

async function ExampleList() {
    const examples = await listExamples();
    if (examples.length === 0) return <p>no examples found (folders with a public.json)</p>;
    return (
        <ul className="list-disc pl-5">
            {examples.map((e) => (
                <li key={e.name}>
                    <Link className="underline" href={`/examples/${encodeURIComponent(e.name)}`}>
                        {e.name}
                    </Link>{" "}
                    — {e.title}
                </li>
            ))}
        </ul>
    );
}
