import Link from "next/link";
import { notFound } from "next/navigation";
import { loadExample } from "@/lib/examples";
import ExampleViewer from "./ExampleViewer";

export default async function ExamplePage({ params }: PageProps<"/examples/[name]">) {
    const { name } = await params;
    const example = await loadExample(decodeURIComponent(name));
    if (!example) notFound();

    return (
        <div className="flex h-screen flex-col font-mono text-sm">
            <header className="flex items-baseline gap-3 border-b border-neutral-400 px-3 py-2">
                <Link href="/" className="underline">← examples</Link>
                <span className="font-bold">{example.public.title}</span>
                <span className="text-neutral-500">
                    {example.public.language} · ~{example.public.durationMinutes} min · {example.public.concepts.join(", ")}
                </span>
            </header>
            <ExampleViewer example={example} />
        </div>
    );
}
