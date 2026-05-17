/**
 * Cross-tier comparison orchestrator for the on-device chat models.
 *
 * Reads `CHAT_VARIANT_IDS` from the registry and runs the full
 * `ai-tools.e2e.ts` smoke suite once per variant, capturing the
 * `E2E_SUMMARY` JSON line each run emits. Aggregates the results
 * into a comparison table so you can A/B latency + reply quality
 * across tiers from a single command.
 *
 * **Adding a new chat tier?** No edit here required — append the
 * variant to `CHAT_VARIANT_IDS` in `src/utils/ai-models.ts` and
 * `pnpm test:compare` will pick it up automatically on the next run.
 *
 * ## Requirements
 *
 *   - Same prereqs as `pnpm test:e2e`: dev server on
 *     `http://localhost:5173`, fixture at `tests/fixtures/sample.pdf`,
 *     Chrome at `CHROME_PATH`.
 *
 * ## Run it
 *
 *   pnpm test:compare              # all variants in CHAT_VARIANT_IDS
 *   COMPARE_VARIANTS=lfm2.5-1.2b,lfm2-2.6b pnpm test:compare
 *                                  # comma-separated subset
 *   COMPARE_FRESH=1 pnpm test:compare
 *                                  # wipe puppeteer profile before
 *                                  # the first run (cold-cache fairness)
 *
 * ## Output
 *
 * Per-variant pass/fail + a markdown-style comparison table with
 * timings and reply snippets. The raw JSON summaries are also
 * appended to stdout under an `=== JSON SUMMARIES ===` separator
 * so a wrapper script can scrape them.
 *
 * **Caveat:** the e2e's React-batching progress check is softened
 * to a warning when `CHAT_VARIANT` is set (see `ai-tools.e2e.ts`).
 * Cross-tier runs are about comparing inference, not validating
 * cold-load progress UX.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  AI_MODELS,
  CHAT_VARIANT_IDS,
  CHAT_VARIANT_TIER_LABEL,
  type ChatVariantId,
  formatApproxSize,
  getChatModelId,
} from "../../src/utils/ai-models.ts";

interface E2eSummary {
  kind: "e2e-summary";
  variant: string;
  timings: Array<{ label: string; ms: number }>;
  replies: Record<string, string>;
}

interface RunResult {
  variant: ChatVariantId;
  ok: boolean;
  summary?: E2eSummary;
  /** Process exit code (non-zero = at least one assertion bailed). */
  exitCode: number | null;
  /** Tail of the run's combined stderr — useful when ok is false. */
  errorTail?: string;
}

/**
 * Run the e2e suite for one variant and capture its `E2E_SUMMARY`
 * JSON line. Streams the child's stdout to the parent process in
 * real time so the user can watch progress; the captured copy is
 * scanned afterward for the summary marker.
 */
async function runVariant(variant: ChatVariantId, options: { fresh: boolean }): Promise<RunResult> {
  return new Promise<RunResult>((resolveRun) => {
    const env: NodeJS.ProcessEnv = { ...process.env, CHAT_VARIANT: variant };
    if (options.fresh) env.E2E_FRESH = "1";

    const child = spawn(
      "node",
      ["--experimental-strip-types", resolve(import.meta.dirname, "./ai-tools.e2e.ts")],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );

    let stdoutBuf = "";
    let stderrBuf = "";

    child.stdout.on("data", (chunk: Buffer) => {
      const s = chunk.toString();
      stdoutBuf += s;
      process.stdout.write(s);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const s = chunk.toString();
      stderrBuf += s;
      process.stderr.write(s);
    });

    child.on("close", (code) => {
      const match = stdoutBuf.match(/^E2E_SUMMARY (\{.*\})$/m);
      if (match) {
        try {
          const summary = JSON.parse(match[1]) as E2eSummary;
          resolveRun({ variant, ok: code === 0, exitCode: code, summary });
          return;
        } catch (e) {
          resolveRun({
            variant,
            ok: false,
            exitCode: code,
            errorTail: `Failed to parse E2E_SUMMARY: ${(e as Error).message}`,
          });
          return;
        }
      }
      // No summary line — pass back the stderr tail so the reporter
      // can show the user *why* the run didn't produce comparable data.
      resolveRun({
        variant,
        ok: false,
        exitCode: code,
        errorTail: stderrBuf.split("\n").slice(-20).join("\n"),
      });
    });
  });
}

/** Compose a markdown-style timings table — one column per variant. */
function renderTimingsTable(results: RunResult[]): string {
  const successful = results.filter((r) => r.summary !== undefined);
  if (successful.length === 0) return "(no successful runs to compare)";

  const labels = new Set<string>();
  for (const r of successful) {
    for (const t of r.summary?.timings ?? []) labels.add(t.label);
  }
  const labelList = [...labels];

  // Column widths fit either the longest variant name or the
  // widest cell ("999999 ms" = 10 chars). Header + each cell are
  // padded to that width for a clean grid in monospace fonts.
  const header = ["Question", ...successful.map((r) => r.variant)];
  const rows: string[][] = [header];
  for (const label of labelList) {
    const row = [label];
    for (const r of successful) {
      const t = r.summary?.timings.find((x) => x.label === label);
      row.push(t ? `${t.ms} ms` : "—");
    }
    rows.push(row);
  }

  // Add a total row across model-inference-only questions (cold
  // overview, phone, email are dominated by fast-paths and don't
  // exercise the chat model). We bucket by label substring rather
  // than a hard list so additions to the question set show up
  // automatically.
  const inferenceLabels = labelList.filter(
    (l) => l.includes("warm-overview") || l.includes("address"),
  );
  if (inferenceLabels.length > 0) {
    const totals = ["**model-inference total**"];
    for (const r of successful) {
      const ms = (r.summary?.timings ?? [])
        .filter((t) => inferenceLabels.includes(t.label))
        .reduce((sum, t) => sum + t.ms, 0);
      totals.push(`${ms} ms`);
    }
    rows.push(totals);
  }

  // Pretty-print as a markdown table (works in plain terminals too).
  const colWidths = header.map((_, col) => Math.max(...rows.map((r) => (r[col] ?? "").length)));
  const fmt = (cells: string[]) =>
    "| " + cells.map((c, i) => c.padEnd(colWidths[i])).join(" | ") + " |";
  const sep = "|-" + colWidths.map((w) => "-".repeat(w)).join("-|-") + "-|";
  return [fmt(rows[0]), sep, ...rows.slice(1).map(fmt)].join("\n");
}

/**
 * For each variant, show the reply that exercises the chat model
 * most (warm overview) — that's where capacity + grounding
 * differences actually show. Phone/email are fast-paths and
 * always identical across variants.
 */
function renderReplies(results: RunResult[]): string {
  const sections: string[] = [];
  for (const r of results) {
    if (!r.summary) continue;
    const warm = r.summary.replies.warmOverview ?? "(no reply)";
    const addr = r.summary.replies.address ?? "(no reply)";
    sections.push(
      `\n### ${r.variant} (${CHAT_VARIANT_TIER_LABEL[r.variant as ChatVariantId] ?? "?"})`,
      `**Warm-overview reply:**\n> ${warm.replace(/\n/g, "\n> ")}`,
      `\n**Address reply:**\n> ${addr.replace(/\n/g, "\n> ")}`,
    );
  }
  return sections.join("\n");
}

/** Registry-derived footprint info per variant (constant across runs). */
function renderFootprintTable(variants: ChatVariantId[]): string {
  const rows: string[][] = [["Variant", "Tier", "Download", "Peak RAM", "Repo"]];
  for (const v of variants) {
    const info = AI_MODELS[getChatModelId(v)];
    rows.push([
      v,
      CHAT_VARIANT_TIER_LABEL[v],
      formatApproxSize(info.approxSizeBytes),
      formatApproxSize(info.approxPeakRamBytes),
      info.repo,
    ]);
  }
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => (r[col] ?? "").length)));
  const fmt = (cells: string[]) =>
    "| " + cells.map((c, i) => c.padEnd(widths[i])).join(" | ") + " |";
  const sep = "|-" + widths.map((w) => "-".repeat(w)).join("-|-") + "-|";
  return [fmt(rows[0]), sep, ...rows.slice(1).map(fmt)].join("\n");
}

async function main() {
  // Variant filter — comma-separated, validates against the
  // registry so a typo bails loudly rather than silently skipping.
  const filterRaw = process.env.COMPARE_VARIANTS?.trim();
  let variants: ChatVariantId[];
  if (filterRaw && filterRaw.length > 0) {
    const requested = filterRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const invalid = requested.filter((r) => !(CHAT_VARIANT_IDS as readonly string[]).includes(r));
    if (invalid.length > 0) {
      console.error(
        `✗ Invalid COMPARE_VARIANTS entries: ${invalid.join(", ")}. Pick from: ${CHAT_VARIANT_IDS.join(", ")}.`,
      );
      process.exit(1);
    }
    variants = requested as ChatVariantId[];
  } else {
    variants = [...CHAT_VARIANT_IDS];
  }

  console.log(`\n═══ Comparing ${variants.length} chat tier(s) ═══`);
  console.log(`Tiers: ${variants.map((v) => `${v} (${CHAT_VARIANT_TIER_LABEL[v]})`).join(", ")}`);
  console.log("\nFootprint (from registry):\n");
  console.log(renderFootprintTable(variants));

  const wantFresh = process.env.COMPARE_FRESH === "1";
  const results: RunResult[] = [];
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const fresh = wantFresh && i === 0; // wipe profile only before run #1
    console.log(
      `\n${"═".repeat(74)}\n  Run ${i + 1}/${variants.length}: ${variant} (${CHAT_VARIANT_TIER_LABEL[variant]})${fresh ? "  · E2E_FRESH=1" : ""}\n${"═".repeat(74)}\n`,
    );
    const result = await runVariant(variant, { fresh });
    results.push(result);
    console.log(
      `\n  → ${variant} result: ${result.ok ? "PASS" : "FAIL"} (exit ${result.exitCode ?? "?"})`,
    );
    if (!result.ok && result.errorTail) {
      console.log(
        "  stderr tail:\n" +
          result.errorTail
            .split("\n")
            .map((l) => `    ${l}`)
            .join("\n"),
      );
    }
  }

  // ── Final report ────────────────────────────────────────────────
  console.log(`\n${"═".repeat(74)}\n  COMPARISON REPORT\n${"═".repeat(74)}\n`);
  console.log("### Per-variant result\n");
  for (const r of results) {
    console.log(
      `- **${r.variant}** (${CHAT_VARIANT_TIER_LABEL[r.variant as ChatVariantId]}): ${r.ok ? "✓ passed" : `✗ failed (exit ${r.exitCode})`}`,
    );
  }
  console.log("\n### Timings (lower = faster)\n");
  console.log(renderTimingsTable(results));
  console.log("\n### Sample replies\n");
  console.log(renderReplies(results));

  console.log("\n=== JSON SUMMARIES ===");
  for (const r of results) {
    if (r.summary) console.log(JSON.stringify(r.summary));
  }

  // Exit non-zero if any run failed — useful when the orchestrator
  // is wired into CI / a comparison gate.
  if (results.some((r) => !r.ok)) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
