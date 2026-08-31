import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { Metadata } from "next";
import { renderMarkdown } from "@/lib/markdown";
import { version } from "../../package.json";

/**
 * The licence notices, reachable from the deployed app.
 *
 * SmartPress is GPL-3.0-or-later because it vendors libimagequant, and it
 * distributes that binary to every visitor's browser. The obligation is not
 * discharged by a file sitting in the repository -- an ordinary user of the
 * deployed site has to be able to reach the notices and the source. This route
 * is that.
 *
 * Both documents are read from disk at build time and rendered, rather than
 * restated here. A hand-copied licence notice drifts, and a drifted notice is
 * worse than none.
 *
 * Nothing on this page is dynamic and nothing runs on the client, so it
 * survives `output: 'export'` in Phase 3 unchanged.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
    title: "Licences & notices — SmartPress",
    description:
        "SmartPress is free software under the GNU GPL v3.0 or later. Third-party notices for the vendored WebAssembly codecs.",
};

const SOURCE_URL = "https://github.com/AliMora83/SmartPress";

function read(...segments: string[]): string {
    try {
        return fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");
    } catch {
        // A missing notice is a build-time mistake, not a runtime crash. Say so
        // on the page rather than failing the render.
        return `_\`${segments.join("/")}\` was not found in this build._`;
    }
}

export default function LicensesPage() {
    const notice = read("NOTICE");
    const provenance = read("public", "wasm", "PROVENANCE.md");

    return (
        <main className="min-h-screen bg-white px-6 py-12 md:px-12 md:py-16">
            <div className="mx-auto max-w-3xl">
                <Link
                    href="/"
                    className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                >
                    ← Back to SmartPress
                </Link>

                <h1 className="mt-8 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                    Licences &amp; notices
                </h1>

                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                    SmartPress {version} is free software: you can redistribute it and/or
                    modify it under the terms of the{" "}
                    <strong className="font-semibold text-slate-900">
                        GNU General Public License, version 3 or later
                    </strong>
                    , as published by the Free Software Foundation. It is distributed in the
                    hope that it will be useful, but{" "}
                    <strong className="font-semibold text-slate-900">without any warranty</strong>
                    ; without even the implied warranty of merchantability or fitness for a
                    particular purpose.
                </p>

                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 text-sm">
                    <a
                        className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                        href="https://www.gnu.org/licenses/gpl-3.0.html"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        Full GPL v3 text
                    </a>
                    <a
                        className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                        href={SOURCE_URL}
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        Source code
                    </a>
                    <a
                        className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                        href="#third-party"
                    >
                        Third-party notices
                    </a>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                    The GPL gives you the right to the complete corresponding source code for
                    this application, including the vendored WebAssembly codecs it serves to
                    your browser. It is published at the link above.
                </p>

                <section id="third-party" className="mt-4 scroll-mt-8">
                    {renderMarkdown(notice)}
                </section>

                <hr className="my-12 border-slate-200" />

                <section id="provenance" className="scroll-mt-8">
                    {renderMarkdown(provenance)}
                </section>

                <footer className="mt-16 border-t border-slate-200 pt-6 text-xs text-slate-400">
                    Generated from <code className="font-mono">NOTICE</code> and{" "}
                    <code className="font-mono">public/wasm/PROVENANCE.md</code> at build time.
                </footer>
            </div>
        </main>
    );
}
