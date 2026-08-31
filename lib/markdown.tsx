import type { ReactNode } from "react";

/**
 * A deliberately small Markdown subset renderer.
 *
 * It exists for one job: rendering `NOTICE` and `public/wasm/PROVENANCE.md` on
 * the /licenses route. Those two files are the GPL obligation, so they are read
 * from disk at build time and rendered as HTML rather than restated in JSX --
 * a copy would drift, and a drifted licence notice is worse than none.
 *
 * It handles headings, tables, fenced code, lists, rules, paragraphs, and the
 * inline forms those files actually use. It is not a general Markdown parser
 * and should not become one; if the notices ever need more, take a dependency.
 *
 * Runs at build time in a server component, so nothing here ships to the
 * browser and the route stays static under `output: 'export'`.
 */

/** Inline: `code`, **bold**, [text](url), <autolink>. */
function inline(text: string, keyPrefix: string): ReactNode[] {
    const out: ReactNode[] = [];
    const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))|(<https?:\/\/[^>]+>)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    let i = 0;

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) out.push(text.slice(last, match.index));
        const token = match[0];
        const key = `${keyPrefix}-i${i++}`;

        if (token.startsWith("`")) {
            out.push(
                <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">
                    {token.slice(1, -1)}
                </code>,
            );
        } else if (token.startsWith("**")) {
            out.push(<strong key={key} className="font-semibold text-slate-900">{token.slice(2, -2)}</strong>);
        } else if (token.startsWith("[")) {
            const split = token.indexOf("](");
            const label = token.slice(1, split);
            const href = token.slice(split + 2, -1);
            out.push(<Link key={key} href={href}>{label}</Link>);
        } else {
            const href = token.slice(1, -1);
            out.push(<Link key={key} href={href}>{href}</Link>);
        }
        last = match.index + token.length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

function Link({ href, children }: { href: string; children: ReactNode }) {
    const external = /^https?:/.test(href);
    return (
        <a
            href={href}
            className="text-blue-700 underline underline-offset-2 hover:text-blue-900 break-words"
            {...(external ? { rel: "noopener noreferrer", target: "_blank" } : {})}
        >
            {children}
        </a>
    );
}

const cells = (row: string) =>
    row.replace(/^\||\|$/g, "").split("|").map(c => c.trim());

const isTableRow = (line: string) => line.trimStart().startsWith("|");
const isSeparator = (line: string) => /^\|?[\s:-]+\|[\s|:-]*$/.test(line.trim());

export function renderMarkdown(src: string): ReactNode[] {
    const lines = src.replace(/\r\n/g, "\n").split("\n");
    const blocks: ReactNode[] = [];
    let i = 0;
    let key = 0;
    const k = () => `b${key++}`;

    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) { i++; continue; }

        // Fenced code.
        if (line.trimStart().startsWith("```")) {
            const body: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trimStart().startsWith("```")) body.push(lines[i++]);
            i++; // closing fence
            blocks.push(
                <pre key={k()} className="my-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
                    <code>{body.join("\n")}</code>
                </pre>,
            );
            continue;
        }

        // Horizontal rule.
        if (/^-{3,}$/.test(line.trim())) {
            blocks.push(<hr key={k()} className="my-8 border-slate-200" />);
            i++;
            continue;
        }

        // Heading.
        const heading = /^(#{1,4})\s+(.*)$/.exec(line);
        if (heading) {
            const depth = heading[1].length;
            const content = inline(heading[2], k());
            const cls = [
                "mt-10 mb-4 text-2xl font-bold text-slate-900",
                "mt-10 mb-3 text-xl font-bold text-slate-900",
                "mt-8 mb-2 text-base font-bold text-slate-800",
                "mt-6 mb-2 text-sm font-bold text-slate-800",
            ][depth - 1];
            const Tag = (["h2", "h3", "h4", "h5"] as const)[depth - 1];
            blocks.push(<Tag key={k()} className={cls}>{content}</Tag>);
            i++;
            continue;
        }

        // Table. A wide table scrolls inside its own box rather than pushing the
        // page sideways.
        if (isTableRow(line)) {
            const rows: string[] = [];
            while (i < lines.length && isTableRow(lines[i])) rows.push(lines[i++]);
            const header = cells(rows[0]);
            const body = rows.slice(1).filter(r => !isSeparator(r)).map(cells);
            blocks.push(
                <div key={k()} className="my-5 overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                {header.map((c, ci) => (
                                    <th key={ci} className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-700">
                                        {inline(c, `${k()}-h${ci}`)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {body.map((r, ri) => (
                                <tr key={ri} className="align-top even:bg-slate-50/50">
                                    {r.map((c, ci) => (
                                        <td key={ci} className="border-b border-slate-100 px-3 py-2 text-slate-600">
                                            {inline(c, `${k()}-r${ri}c${ci}`)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>,
            );
            continue;
        }

        // Unordered list.
        if (/^\s*[-*]\s+/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
                i++;
                // Continuation lines belong to the item above.
                while (i < lines.length && lines[i].trim() && !/^\s*[-*]\s+/.test(lines[i]) && !isTableRow(lines[i])) {
                    items[items.length - 1] += " " + lines[i].trim();
                    i++;
                }
            }
            blocks.push(
                <ul key={k()} className="my-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
                    {items.map((it, ii) => <li key={ii}>{inline(it, `${k()}-l${ii}`)}</li>)}
                </ul>,
            );
            continue;
        }

        // Blockquote -- rendered as a plain paragraph; the notices use it for asides.
        if (line.trimStart().startsWith(">")) {
            const body: string[] = [];
            while (i < lines.length && lines[i].trimStart().startsWith(">")) {
                body.push(lines[i].replace(/^\s*>\s?/, ""));
                i++;
            }
            blocks.push(
                <blockquote key={k()} className="my-4 border-l-4 border-slate-200 pl-4 text-sm italic leading-relaxed text-slate-500">
                    {inline(body.join(" "), k())}
                </blockquote>,
            );
            continue;
        }

        // Paragraph.
        const para: string[] = [];
        while (i < lines.length && lines[i].trim()
            && !isTableRow(lines[i])
            && !/^(#{1,4})\s/.test(lines[i])
            && !/^-{3,}$/.test(lines[i].trim())
            && !lines[i].trimStart().startsWith("```")) {
            para.push(lines[i].trim());
            i++;
        }
        blocks.push(
            <p key={k()} className="my-4 text-sm leading-relaxed text-slate-600">
                {inline(para.join(" "), k())}
            </p>,
        );
    }

    return blocks;
}
