# TestBanksy

A standalone full-stack application for building exam question banks from `.docx` files and generating formatted PDF exams. **No cloud dependency** — runs entirely on your machine.

## Quick Start

### 1. Backend (Python/Flask)

```bash
python3 -m venv .venv
.venv/bin/pip install flask flask-cors python-docx reportlab
.venv/bin/python app.py
```

Backend runs on http://localhost:5000.

### 2. Frontend (React/Vite)

```bash
npm install
npm run dev
```

Frontend runs on http://localhost:3000. The Vite dev server proxies `/api/*` requests to the Flask backend automatically.

### Production Build

```bash
npm run build
```

The built files land in `dist/` — serve them with any static file server or configure Flask to serve them directly.

## Project Structure

```
TestBanksy/
├── app.py                          # Flask backend — all API routes and PDF generation
├── TestBank/                       # Auto-created data directory
│   └── banks.json                  # Bank registry + all question data
├── uploads/                        # Uploaded .docx files and images
├── exports/                        # Generated PDFs and zip archives
├── backups/                        # Auto-timestamped bank backups
├── tests/                          # Python unit + integration tests (pytest)
│   ├── conftest.py
│   ├── test_unit.py
│   └── test_integration.py
├── e2e/                            # End-to-end browser tests (Playwright)
│   └── bank.spec.ts
├── src/
│   └── __tests__/                  # Frontend unit tests (Vitest + RTL)
│       ├── setup.ts
│       ├── ui.test.tsx
│       └── api.test.ts
├── package.json
├── vite.config.js                  # Dev server + API proxy + Vitest config
├── playwright.config.ts            # E2E test config
├── pytest.ini                      # Python test config
├── index.html                      # Vite entry point
├── main.tsx                        # React entry point
├── api.ts                          # fetch wrapper (apiFetch, apiBlob)
├── ui.tsx                          # Shared components + theme system
├── types.ts                        # TypeScript types
├── App.tsx                         # Main app — Bank, Generate, Import, Stats views
├── QuestionRow.tsx                 # Question display + inline editor
├── QuestionComposer.tsx            # New question form
└── SnippetEditor.tsx               # Front matter snippet editor
```

## Supported Question Types

| Type | Auto-Detection | PDF Rendering |
|------|---------------|---------------|
| **Multiple Choice** | `A)` / `A.` / `a)` choice patterns | Lettered choices, shuffleable |
| **Select All (multi_select)** | Multiple starred choices, stem phrases like "select all that apply", or comma-separated answer key entry | `[Circle all that apply]` header |
| **True / False** | "True / False" in stem, or T/F choices | `True   False` line |
| **Fill in the Blank** | `___` or `{{blank}}` in stem | Inline underlines |
| **Short Answer** | Default fallback | 3 blank lines |
| **Essay** | "explain/describe/discuss/compare" + long stem | Configurable N blank lines |
| **Code Listing** | Fenced code blocks (` ``` `) | Monospace box with background |

Multi-select is detected from any of: (1) multiple `*`-starred choices in the source doc, (2) a stem phrase like "select all that apply" / "which of the following are true", or (3) a comma-separated correct answer in the answer key (e.g. `A, C`).

## Question Fields

Every question carries the following metadata:

| Field | Description |
|-------|-------------|
| `type` | Question type (see table above) |
| `stem` | Question text (supports markdown) |
| `choices` | MC/multi_select answer options |
| `correct_answer` | Letter, T/F string, or comma-joined letters for multi_select |
| `points` | Point value — printed on PDF and used in balance report |
| `topic` | Free-text topic tag — used for filtering and balance report |
| `difficulty` | `easy` / `medium` / `hard` |
| `lecture` | Lecture number tag |
| `source` | Semester/exam label set at import time |
| `bloom` | Bloom's Taxonomy level (Remember → Create) |
| `objectives` | Course learning objective tags |
| `flagged` | Boolean — marks question for review |
| `notes` | Private instructor notes (not printed on exam) |
| `empirical_difficulty` | % correct from post-grading calibration CSV |
| `tags` | Free-form string tags |

## Multiple Banks

The bank switcher in the header lets you maintain separate question banks — one per course. Banks are fully isolated. Create a new bank from the header dropdown; delete any non-active bank from the same panel.

## Import System

Four import modes are available from the **Import** tab:

- **Upload .docx** — pandoc converts the file to markdown; the parser auto-detects question types, point values, choices, and correct answers. A staging area lets you review and selectively approve parsed questions before committing.
- **Paste Markdown** — paste or load a `.md` file directly. Same staging flow.
- **Answer Key** — upload a standalone answer key file (`.docx` or `.md`) matched to existing questions by source label + question number. Enable **Fuzzy stem matching** to apply the key by question-text similarity instead — useful when question numbers shifted between exam versions.
- **Calibrate** — upload a post-grading CSV (`question_number, pct_correct`) to store empirical difficulty alongside the manual tag.

## PDF Generation

- Clean layout with question numbers and point values
- MC/multi_select choices with optional **shuffling** (re-letters A/B/C/D, tracks correct answer)
- Answer key appended as a final page
- Essay questions get configurable blank line space
- Fill-in-the-blank with inline underlines
- Front matter with tables, code refs, and images
- `KeepTogether` prevents questions splitting across pages
- **Multiple Variants** — generate N independently shuffled variants (A/B/C…) plus a combined answer key, all packaged as a zip download
- **Exam Templates** — save a PDF config as a named template; apply it when starting a new exam
- **Exam Balance Report** — pre-download breakdown of topic coverage, difficulty distribution, Bloom's levels, total points, and imbalance warnings

## Duplicate Detection

**Scan for Duplicates** runs a similarity check across all questions. For each near-duplicate pair you can mark one for deletion; bulk-delete runs in one shot. Auto-select buttons pick the older or newer from each pair. Deleted questions are pushed onto the undo stack.

## Stats / Bank Health Dashboard

The **Stats** view shows:
- Summary cards (total questions, flagged, missing answers, types)
- Type, difficulty, and Bloom's level distribution charts
- Per-source and per-topic breakdowns
- Empirical vs. manual difficulty mismatch table (questions where grading results disagree with the manual tag)

## Smart Collections

Save any active filter combination as a named collection. Collections appear in the bank filter bar and update dynamically as the bank changes. Stored in `localStorage` — no backend needed.

## Bulk Field Edit

Select 2+ questions and the Bulk Edit panel appears. Set a shared field (topic, difficulty, lecture, points) across all selected questions in one click.

## Undo

Destructive operations (question deletion, bulk delete) push to an in-memory undo stack. **Ctrl+Z** or the Undo button in the toolbar restores the last action.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | Open the question composer |
| `A` | Select all visible questions |
| `Escape` | Cancel selection / close composer |
| `Ctrl+Z` | Undo last deletion |

## Export

| Format | How |
|--------|-----|
| **PDF** | Download PDF or Preview PDF buttons in the Generate view |
| **Multiple variant PDFs** | Multiple Variants section in Generate view → downloads a zip |
| **CSV** | Export CSV button in the bank toolbar |
| **QTI 2.1** | Export QTI button — Canvas/Blackboard compatible zip |
| **Bank JSON** | `GET /api/export-bank` — full raw data export |

## Running Tests

```bash
# Python unit + integration tests
python3 -m pytest

# Frontend unit tests (Vitest)
npm test

# E2E tests (Playwright — requires both servers running)
npm run test:e2e
```

The Python test suite (93 tests) covers all pure helpers and every major API route. The frontend suite (32 tests) covers UI components and the fetch wrapper. E2E tests start both servers automatically via `webServer` config in `playwright.config.ts`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server status |
| `GET` | `/api/questions` | List all questions in the active bank |
| `POST` | `/api/questions` | Add a question (409 if duplicate; pass `force:true` to override) |
| `PUT` | `/api/questions/<id>` | Update a question |
| `DELETE` | `/api/questions/<id>` | Delete a question |
| `POST` | `/api/questions/bulk-update` | Patch multiple questions (`{ids, fields}`) |
| `POST` | `/api/upload` | Upload & parse a `.docx` (dry run → staged) |
| `POST` | `/api/upload-markdown` | Parse raw markdown text (dry run → staged) |
| `POST` | `/api/commit-import` | Commit staged questions to the bank |
| `POST` | `/api/upload-answer-key` | Apply a standalone answer key (`fuzzy=true` for stem matching) |
| `POST` | `/api/calibrate` | Import grading CSV to set empirical difficulty |
| `POST` | `/api/generate-pdf` | Generate exam PDF |
| `POST` | `/api/generate-pdf-variants` | Generate N shuffled variant PDFs as a zip |
| `POST` | `/api/export-qti` | Export selected questions as IMS QTI 2.1 zip |
| `GET` | `/api/export-csv` | Export full bank as CSV |
| `GET` | `/api/stats` | Bank statistics |
| `GET` | `/api/duplicates` | Scan for near-duplicate questions |
| `POST` | `/api/check-duplicate` | Check a single stem against the bank |
| `GET` | `/api/snippets` | List all front matter snippets |
| `POST` | `/api/snippets` | Create a snippet |
| `PUT` | `/api/snippets/<id>` | Update a snippet |
| `DELETE` | `/api/snippets/<id>` | Delete a snippet |
| `POST` | `/api/upload-image` | Upload an image for front matter or question stems |
| `GET` | `/api/export-bank` | Download full bank JSON |
| `POST` | `/api/import-bank` | Replace active bank from a JSON file |
| `GET` | `/api/exams` | List archived exams |
| `POST` | `/api/exams` | Save an exam to the archive |
| `DELETE` | `/api/exams/<id>` | Delete an archived exam |
| `GET` | `/api/banks` | List all banks |
| `POST` | `/api/banks` | Create a new bank |
| `PUT` | `/api/banks/active` | Switch the active bank |
| `DELETE` | `/api/banks/<id>` | Delete a bank |
| `GET` | `/api/templates` | List exam templates |
| `POST` | `/api/templates` | Save an exam template |
| `DELETE` | `/api/templates/<id>` | Delete a template |

## Requirements

- **Python 3.9+** with a venv
- **Node.js 18+** with npm
- **pandoc** for `.docx` import (`sudo apt install pandoc` or `brew install pandoc`). Without it, docx upload fails but everything else works.
