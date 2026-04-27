# Workflows

Reusable, ordered chains of CloakPDF tools that run on a single PDF.
A workflow is just a list of tool ids; each step inflates the existing
tool component as-is at run time, with the previous step's output piped
in as the new input. No per-step config is captured at design time.

This document covers the user-facing flow, the architecture, and the
recipe for migrating an additional tool into the workflow system.

---

## 1. User flow

### Discovering & launching

1. The home screen shows a **Workflow hero card** between the search bar
   and the categorised tool grid (`HomeScreen` in [src/App.tsx](../src/App.tsx)).
   The card spans `max-w-3xl` so it reads as a feature panel beneath the
   search and above the tools.
2. Clicking the card navigates to the **Workflows landing page**
   ([WorkflowsHome](../src/workflow/WorkflowsHome.tsx)) — list of saved
   workflows or empty state, plus a "Create workflow" CTA.

### Building a workflow

1. The builder ([WorkflowBuilder](../src/workflow/WorkflowBuilder.tsx)) is
   intentionally dumb: a name field plus an ordered list of tool ids.
   No per-step configuration. (See [§5 Why no design-time config](#5-why-no-design-time-config).)
2. **Add step** opens a modal tool picker (`ToolPicker`) that lists every
   workflow-eligible tool (see [registry](../src/workflow/registry.ts)).
3. Up / down arrows reorder; trash removes. Save persists to
   `localStorage`.

### Running a workflow

1. The runner ([WorkflowRunner](../src/workflow/WorkflowRunner.tsx)) is
   the heart of the feature. Stage 1 is a file-drop zone for the PDF the
   workflow operates on.
2. Stage 2 mounts each step in turn:
   - The runner provides a `WorkflowContext` slot for the current step.
   - The slot's `injectedFile` is the prior step's output (or the
     user's upload for step 1).
   - The slot's `onComplete(bytes, suffix)` advances the runner.
   - The slot's `onSkip(reason)` advances without producing new bytes —
     used for "no-op" steps (e.g. blank-page detection finding nothing).
3. A horizontal stepper above the tool view shows progress. Completed
   steps render emerald with a checkmark; the current step is primary
   blue; future steps are slate.
4. **Final step**: the runner downloads the result as
   `<originalName><chained suffixes>.pdf` so the filename describes
   what happened (e.g. `report_cleaned_compressed.pdf`).

---

## 2. Architecture

### 2.1 Data model

```ts
// src/workflow/types.ts
interface WorkflowStep {
  tool: ToolId;
}
interface Workflow {
  id: string;
  name: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  steps: WorkflowStep[];
}
```

Steps are _just_ `{ tool }`. There is no `config` field — tool
configuration happens interactively at run time inside the inflated
tool component. If/when we add design-time config, do it as an optional
field so existing workflows in localStorage stay valid.

### 2.2 Storage

[src/workflow/storage.ts](../src/workflow/storage.ts) wraps `localStorage`
under a single key (`cloakpdf.workflows.v1`) with a versioned envelope:

```ts
{ "version": 1, "workflows": [...] }
```

The version field exists so the schema can evolve without breaking
existing user data. `safeParse` returns an empty store on missing/
corrupted/unknown-version data — never throws.

### 2.3 The seam: `WorkflowContext` + two hooks

The whole point of the design is that **existing tool components run
unchanged in workflows**. There is no separate "workflow tool"
component, no `configOnly` prop, no extracted options panel. Three
files do all the work:

| File                                                                    | Role                                                                                                                                                                          |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/workflow/WorkflowContext.tsx](../src/workflow/WorkflowContext.tsx) | A React context. When non-null, the surrounding tool is being run as a workflow step. Carries `injectedFile`, `onComplete`, `onSkip`, `isLastStep`.                           |
| [src/hooks/usePdfFile.ts](../src/hooks/usePdfFile.ts)                   | Reads the context. If `injectedFile` is set, drives the same `onFiles` lifecycle internally — the tool's "file loaded" UI mounts immediately, and the dropzone never appears. |
| [src/hooks/useToolOutput.ts](../src/hooks/useToolOutput.ts)             | The single seam for delivering a result. Standalone → `downloadPdf(...)`. Workflow → `slot.onComplete(...)`. Tools call `output.deliver(bytes, suffix, sourceFile)`.          |

### 2.4 What the runner does

```
WorkflowRunner
  ├─ stage 1: FileDropZone → originalFile + currentFile
  └─ stage 2: for each step
       ├─ build a WorkflowSlot { injectedFile: currentFile, onComplete, onSkip, isLastStep }
       ├─ mount the tool component inside <WorkflowContext.Provider>
       ├─ on onComplete(bytes, suffix):
       │     ├─ if last step → downloadPdf with chained suffix
       │     └─ else → wrap bytes as File, advance stepIndex, push suffix
       └─ on onSkip(reason): pass currentFile through, advance, show notice
```

The slot is rebuilt on every `stepIndex` change, which is enough for
the lazy-loaded tool component to re-mount cleanly between steps and
discard internal state.

### 2.5 Tool registry

[src/config/tool-registry.ts](../src/config/tool-registry.ts) is the
source of truth for tool metadata + lazy components, used by both
`App.tsx` (home grid) and the workflow code (running steps, picker).
This file was extracted from `App.tsx` so workflow modules don't pull
in the entire app shell.

[src/workflow/registry.ts](../src/workflow/registry.ts) holds the
`ELIGIBLE_TOOL_IDS` array — the _workflow_ gate, distinct from the
master tool list. A tool is eligible when:

1. It accepts a single PDF as input and produces a single PDF as output.
2. Its component has been migrated to use `useToolOutput.deliver`.
3. It has been added to `ELIGIBLE_TOOL_IDS`.

---

## 3. Migrating a tool into workflows

The change is mechanical. Each tool needs three small edits:

### Step 1 — replace `downloadPdf` with `output.deliver`

Find the line in the tool that downloads the result:

```ts
// before
import { downloadPdf, formatFileSize, pdfFilename } from "../utils/file-helpers.ts";
// ...
downloadPdf(bytes, pdfFilename(file, "_suffix"));
```

Replace with:

```ts
import { useToolOutput } from "../hooks/useToolOutput.ts";
import { formatFileSize } from "../utils/file-helpers.ts";
// ...
const output = useToolOutput();
// ...
output.deliver(bytes, "_suffix", file);
```

`output.deliver` is the seam: standalone behaviour is identical to the
prior `downloadPdf` call; workflow behaviour forwards bytes to the
runner.

### Step 2 — handle two-stage tools (Pattern A)

Tools that show a result panel between processing and download (e.g.
[CompressPdf](../src/tools/CompressPdf.tsx),
[FlattenPdf](../src/tools/FlattenPdf.tsx),
[GrayscalePdf](../src/tools/GrayscalePdf.tsx)) should auto-deliver in
workflow mode so the runner can advance:

```ts
const data = await operation(file);
if (output.inWorkflow) {
  output.deliver(data, "_suffix", file);
} else {
  setResult(/* show stats panel for the standalone case */);
}
```

Single-stage tools (Pattern B — e.g.
[ReversePages](../src/tools/ReversePages.tsx)) just call
`output.deliver` directly; no branch needed.

### Step 3 — register the tool

Add the tool's id to `ELIGIBLE_TOOL_IDS` in
[src/workflow/registry.ts](../src/workflow/registry.ts).

### Optional — relabel the action button

For tools where the standalone label says "X & Download", consider a
workflow-aware label so the user understands the button advances them
rather than downloading. See
[ReversePages](../src/tools/ReversePages.tsx) for the pattern:

```tsx
<ActionButton
  label={
    output.inWorkflow
      ? output.isLastStep
        ? "Reverse Pages & Download"
        : "Reverse & Continue"
      : "Reverse Pages & Download"
  }
  // …
/>
```

### Optional — exit early when the step is a no-op

For tools that can detect "nothing to do" (e.g. blank-page detection
finding zero matches), call `output.skip("reason")` instead of waiting
for the user to click. The runner advances and shows the reason as a
brief notice. See
[RemoveBlankPages](../src/tools/RemoveBlankPages.tsx).

---

## 4. Current state

### Eligible tools (Phase 1)

- `compress`
- `reverse-pages`
- `flatten`
- `grayscale`
- `remove-blank-pages` (also exercises the `onSkip` path)

### Excluded by design

- `merge`, `images-to-pdf` — multi-file or non-PDF input shape
- `compare-pdf` — needs a second PDF; not a chain step
- `pdf-inspector` — read-only; produces no PDF
- `pdf-to-image`, `extract-images`, `contact-sheet` — terminal /
  non-PDF output (image / ZIP)
- `digital-signature`, `pdf-password` — would require persisting a
  certificate or password in `localStorage`; deferred for security

### Not yet migrated (eligible candidates)

PDF-in / PDF-out tools that just need the three-step migration above:
`rotate`, `delete`, `reorder`, `extract-pages`, `add-blank-page`,
`duplicate-page`, `add-bookmarks`, `file-attachment`, `crop-pages`,
`ocr`, `nup-pages`, `repair-pdf`, `signature`, `fill-pdf-form`,
`stamp-pdf`, `add-page-numbers`, `header-footer`, `bates-numbering`,
`redact-pdf`, `metadata`, `split-pdf`.

(Note: `split-pdf` produces multiple PDFs — would need a "first match"
or "concatenate splits" decision before it can chain. Probably exclude.)

---

## 5. Why no design-time config

Earlier drafts of this feature included a config panel inside the
builder so users could pre-set things like compression level or page-
number style. We dropped it for three reasons:

1. **Reuses existing UI as-is.** The tool's own UI is already the best
   place to configure it. Inflating the same component at run time
   means there is exactly one place to edit and one place to read.
2. **No `configOnly` prop refactor.** Extracting options into reusable
   sub-components would touch every tool and add maintenance debt.
3. **Dumb beats clever.** A workflow is "this list of tools, in this
   order." The user configures each step the same way they'd configure
   it standalone — they just click "Continue" instead of "Download" at
   the end of each step.

A possible v2 enhancement: capture the configs from each successful
run as defaults for the _next_ run of the same workflow. Implement by
having each tool report its current config back through `WorkflowContext`
and persisting the last-seen config in the workflow JSON. Until then,
every run = fresh config.

---

## 6. Known limitations & deferred items

- **Memory**: a large PDF passing through N steps holds N intermediate
  `Uint8Array`s. Currently we do not eagerly free intermediates as the
  runner advances. For typical CloakPDF workloads (≤ tens of MB) this
  is fine; if we add tools that explode memory, free `currentFile` once
  the slot rebuilds.
- **No undo / back during a run**: clicking "Change file" resets the
  runner to stage 1. Stepping back inside a run is not supported in v1.
- **No reordering during a run**: the saved sequence is what runs.
- **No per-step config persistence**: see §5.
- **No multi-file starter step**: workflows always begin with a single
  PDF. Allowing `merge` / `images-to-pdf` as a starter would need a
  variant of stage 1 that accepts a different input shape — defer.
- **Filenames**: chained suffixes can grow long. We could compress
  consecutive auto-suffixes (e.g. `_compressed_grayscale` → `_processed`
  beyond N steps), but this is purely cosmetic.

---

## 7. Design language (reference for workflow UI & future tool additions)

This section captures the visual conventions the workflow UI uses so a
new tool added to a workflow page reads as part of the same family.
Stick to these tokens and patterns; reach for a custom design only when
something genuinely doesn't fit.

### 7.1 Surfaces & cards

- **Card surface**: `bg-white dark:bg-dark-surface` with
  `border border-slate-200 dark:border-dark-border`, `rounded-2xl`.
- **Translucent surface (modals, hero bands)**: same colour family but
  with alpha + blur — `bg-white/85 dark:bg-dark-surface/85 backdrop-blur-xl`.
  See [ToolPickerModal](../src/workflow/ToolPickerModal.tsx).
- **Soft surface (empty states, info bands)**:
  `bg-white/70 dark:bg-dark-surface/70 backdrop-blur-sm`.
- **Hover lift**: every interactive card uses
  `hover:-translate-y-0.5 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md`
  with `transition-[border-color,box-shadow,transform] duration-200`.
- **Padding**: `p-5` or `px-5 py-5` for cards in a grid, `p-6`+ for
  isolated panels, `px-5 sm:px-6` for modal headers/bodies.

### 7.2 Typography

- **Page title (h1)**: `text-2xl font-semibold tracking-[-0.015em] text-slate-800 dark:text-dark-text`.
  Pair with a 12 px `WorkflowIcon` tile to its left (see below).
- **Section heading (h2)**: `text-[22px] sm:text-[26px] font-semibold tracking-[-0.02em] leading-[1.2]`.
- **Card title (h3)**: `text-[15px] font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text`.
- **Eyebrow / category label**: `text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-600 dark:text-primary-400`.
- **Body / description**: `text-[13px]–[13.5px] text-slate-500 dark:text-dark-text-muted leading-snug`.
- **Helper / metadata**: `text-[12.5px] text-slate-500 dark:text-dark-text-muted`.

### 7.3 Icon tiles

Used for page headers and step rows. The "size + radius + tint" shape
is reused everywhere for consistency.

| Context                    | Class                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Page header (alongside h1) | `w-12 h-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400` |
| Card icon                  | `w-11 h-11 rounded-xl bg-slate-100 dark:bg-dark-surface-alt text-slate-700 dark:text-dark-text`    |
| Inline / row icon          | `w-9 h-9 rounded-lg bg-slate-100 dark:bg-dark-surface-alt`                                         |
| Active / accent badge      | swap `bg-slate-100` for `bg-primary-100 dark:bg-primary-900/40`, `text-*` for primary tones        |

Inner icon size is `w-4 h-4` for `w-9` tiles, `w-5 h-5` for `w-11`,
`w-6 h-6` for `w-12`. Always render via `lucide-react` icons.

### 7.4 Buttons

| Role                             | Class                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary action (large)           | `px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-medium text-[14px] transition-colors`                                                              |
| Primary action (compact, inline) | `px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-[13px] font-medium transition-colors`                                                              |
| Secondary action                 | swap primary bg for `bg-slate-100 dark:bg-dark-surface-alt hover:bg-slate-200 dark:hover:bg-dark-border text-slate-700 dark:text-dark-text`                                    |
| Destructive icon-only            | `p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 dark:text-dark-text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors`              |
| Neutral icon-only                | `p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-400 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text transition-colors` |
| Disabled                         | append `disabled:opacity-50 disabled:cursor-not-allowed`                                                                                                                       |

Always set `type="button"` on non-submit buttons (the lint rule enforces
it). Compose with `inline-flex items-center gap-1.5 sm:gap-2` plus a
leading icon for consistency. For a global "process this PDF" CTA,
prefer the existing [ActionButton](../src/components/ActionButton.tsx)
component.

### 7.5 Inputs

- **Text input**: `px-4 py-2.5 rounded-xl bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-slate-800 dark:text-dark-text placeholder-slate-400 dark:placeholder-dark-text-muted shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-300 dark:focus:border-primary-600 transition-[border-color,box-shadow] duration-200 text-[15px]`.
- **Search input** (inside modals/headers): `h-10 pl-9 pr-9 rounded-lg` with a leading 4×4 `Search` icon and a clearable trailing `X` button. See [ToolPickerModal](../src/workflow/ToolPickerModal.tsx).
- **Slider**: use [LabeledSlider](../src/components/LabeledSlider.tsx).
- **Checkbox**: use [CheckboxField](../src/components/CheckboxField.tsx).
- **Color**: use [ColorPicker](../src/components/ColorPicker.tsx).
- **Field label**: render the label as a small uppercase eyebrow, then
  the control beneath: `<span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-dark-text-muted">…</span>`.

### 7.6 Modals

The cloakresume-derived pattern for all picker / chooser modals:

- **Outer wrapper**: `fixed inset-0 z-200 flex items-end sm:items-start justify-center sm:pt-8 md:pt-12 sm:px-3 md:px-6 animate-fade-in`.
  Bottom-sheet on mobile (`items-end`), top-docked on tablet+ (`sm:items-start`).
- **Backdrop**: a separate `<button>` so it's keyboardable; class
  `absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm`.
- **Surface**: `bg-white/85 dark:bg-dark-surface/85 backdrop-blur-xl border border-slate-200/80 dark:border-dark-border rounded-t-2xl sm:rounded-2xl shadow-2xl animate-scale-in`.
- **Mobile drag handle**: 11×1 pill, `bg-slate-300 dark:bg-dark-border`,
  with touch handlers that translate the sheet and dismiss on >120 px drag.
- **Header**: title (`text-[15px] sm:text-base font-semibold tracking-[-0.01em]`) + subtitle on the left, a `w-9 h-9` neutral icon-only close button on the right; bottom border `border-slate-200/70 dark:border-dark-border/70`.
- **Body**: scrollable, `overflow-y-auto px-5 sm:px-6 py-4 sm:py-5`.
- **Effects on open**: focus the search field, lock body scroll, listen for Escape to close.

### 7.7 Layout containers

- **Page section spacing**: `space-y-6` between major page blocks
  (header → toolbar → grid).
- **Page header pattern** (used across `WorkflowsHome`, `WorkflowBuilder`,
  `WorkflowRunner`):

  ```tsx
  <div className="flex items-start gap-4">
    <div className="w-12 h-12 bg-primary-50 dark:bg-primary-900/30 rounded-xl flex items-center justify-center shrink-0">
      <Icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
    </div>
    <div className="flex-1 min-w-0">
      <h1 className="text-2xl font-semibold tracking-[-0.015em] text-slate-800 dark:text-dark-text">
        …
      </h1>
      <p className="text-slate-500 dark:text-dark-text-muted mt-0.5">…</p>
    </div>
  </div>
  ```

- **Grid**: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4` for
  cards. Use 2-column inside narrower modals (`grid-cols-1 sm:grid-cols-2 gap-2`).

### 7.8 Status & feedback

- **Inline notice** (transient, top-right of toolbar): green for success
  (`text-emerald-600 dark:text-emerald-400`), red for error
  (`text-red-600 dark:text-red-400`), `text-[12.5px] font-medium`.
  Auto-dismiss after ~4 seconds.
- **Stepper chips** (workflow runner): three states — current
  (`primary-50 / primary-300 / primary-700`), complete
  (`emerald-50 / emerald-200 / emerald-700`), pending
  (`white / slate-200 / slate-500`).
- **Empty state**: round 14×14 tinted icon tile, h2 title, body copy,
  primary + secondary CTAs centered. See `EmptyState` in
  [WorkflowsHome](../src/workflow/WorkflowsHome.tsx).

### 7.9 Animations

Defined in [`src/index.css`](../src/index.css):

- `animate-fade-in-up` — page sections; pair with staggered
  `animationDelay: "${i * 80}ms"`.
- `animate-fade-in` — modal backdrops.
- `animate-scale-in` — modal surfaces.
- `animate-popover-in` — small floating popovers.
- All animations respect `prefers-reduced-motion` automatically.

### 7.10 Tokens & theme references

- **Primary**: blue scale `primary-{50,100,…,900}` — defined in
  [src/config/theme.ts](../src/config/theme.ts).
- **Neutrals**: `slate-{50,…,800}`.
- **Dark surfaces**: `dark-surface`, `dark-surface-alt`, `dark-border`,
  `dark-text`, `dark-text-muted` — registered as Tailwind tokens in
  `index.css`.
- **Category accents** are unified to primary via `categoryAccent` /
  `categoryGlow` (see `theme.ts`); don't introduce per-category colours
  in new workflow UI — keep it primary-blue across the board.

### 7.11 Checklist when adding controls to a workflow page

- [ ] Header uses the [§7.7 page header pattern](#77-layout-containers).
- [ ] All buttons use one of the [§7.4 button roles](#74-buttons).
- [ ] Card surface uses `rounded-2xl` + slate border + hover lift.
- [ ] Icon tiles match the [§7.3 sizes](#73-icon-tiles).
- [ ] Text colours use the [§7.2 hierarchy](#72-typography) — no
      ad-hoc grey/black values.
- [ ] Modals use the [§7.6 pattern](#76-modals): translucent surface,
      separate backdrop button, scroll lock, Escape closes.
- [ ] No emojis; icons come from `lucide-react`.
- [ ] Light + dark variants exist for every coloured class.

---

## 8. File map (quick reference)

```
src/
├─ App.tsx                          ── home + view state + hero card
├─ config/
│  └─ tool-registry.ts              ── tool metadata + lazy components
├─ hooks/
│  ├─ usePdfFile.ts                 ── reads WorkflowContext.injectedFile
│  └─ useToolOutput.ts              ── deliver(bytes, suffix, file)
├─ workflow/
│  ├─ types.ts                      ── Workflow / WorkflowStep / store
│  ├─ storage.ts                    ── localStorage I/O + import/export
│  ├─ registry.ts                   ── ELIGIBLE_TOOL_IDS gate
│  ├─ WorkflowContext.tsx           ── slot + useWorkflowSlot hook
│  ├─ WorkflowsHome.tsx             ── list view + import/export toolbar
│  ├─ WorkflowBuilder.tsx           ── name + ordered list editor
│  ├─ WorkflowRunner.tsx            ── file drop → stepper → tools
│  └─ ToolPickerModal.tsx           ── translucent search modal (§7.6)
└─ tools/
   ├─ CompressPdf.tsx               ── migrated (Pattern A)
   ├─ FlattenPdf.tsx                ── migrated (Pattern A)
   ├─ GrayscalePdf.tsx              ── migrated (Pattern A)
   ├─ ReversePages.tsx              ── migrated (Pattern B)
   └─ RemoveBlankPages.tsx          ── migrated (Pattern B + skip path)
```

---

## 9. Where to pick up

If you're continuing this work, the obvious next moves are:

1. **Migrate more tools.** Pick from §4's "Not yet migrated" list. Each
   one is the §3 three-step recipe. Start with the simplest:
   `repair-pdf`, `ocr`, `metadata`, `add-page-numbers`,
   `header-footer`, `bates-numbering`, `nup-pages`, `stamp-pdf`.
   When migrating, follow the [§7.11 design checklist](#711-checklist-when-adding-controls-to-a-workflow-page)
   for any new controls you introduce.
2. **Per-step config persistence.** See §5 for the approach. Capture the
   tool's settings on `output.deliver` and persist them as defaults on
   the workflow JSON so the next run pre-populates them.
3. **Run history.** Optional: log the last-run timestamp per workflow
   so the list can sort by recency.
4. **Drag-and-drop step reordering.** Currently up/down arrows; the
   project already has [`SortableGrid`](../src/components/SortableGrid.tsx)
   which could replace the arrows with drag handles for consistency
   with the page-reordering tools.
