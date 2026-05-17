# Test fixtures

Drop sample PDFs here. Files in this directory are picked up by the
fixture-aware tests in `tests/unit/` (currently the optional
`pdf-text.fixture.test.ts`, skipped when this folder is empty) and by
the e2e flow in `tests/e2e/ai-tools.e2e.ts`.

## Recommended fixtures

Each tests something different — drop in whatever you have, but the
suite gets the most coverage when at least one of each is present:

| Filename        | What it should be                           | What it tests                                                       |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| `sample.pdf`    | Any short, text-based PDF (≤ 5 pages)       | The default fixture for e2e Ask PDF / Summarize / Detect PII flows. |
| `scanned.pdf`   | A scanned/image-only PDF with no text layer | The "looks like a scanned PDF" detection path. Optional.            |
| `multipage.pdf` | A text PDF with 20+ pages                   | Chunking and page-citation behavior at scale. Optional.             |

## Privacy

PDFs in this folder are **not** committed (see `tests/fixtures/.gitignore`).
Use throwaway documents — do not put anything you'd be unhappy losing or
having a future contributor read. The e2e tests don't upload anything,
but they do open files locally in a headed Chrome instance.
