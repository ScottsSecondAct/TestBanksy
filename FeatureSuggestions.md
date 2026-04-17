# TestBanksy — Feature Suggestions

---

## Already Implemented

The following were previously listed as suggestions and have since shipped:

- **Exam Archive** — generated exams are saved with title, question list, and config; loadable from the Generate view
- **Question Usage Tracking** — each question row shows which archived exams it has appeared on
- **Import Review Step** — parsed questions are staged for selective approval before committing to the bank
- **Answer Key Upload** — standalone answer key files (`.docx` or `.md`) can be applied to existing questions
- **Duplicate Detection** — similarity scan with bulk-delete and age-based auto-selection
- **Multiple Banks** — create and switch between isolated banks from the header
- **Auto-Backup** — timestamped backups written to `backups/` on every save
- **Fuzzy Answer Key Matching** — "Fuzzy stem matching" toggle on the Answer Key upload tab; upload a full exam document and answers are applied to whichever bank question has the most similar stem, regardless of question number
- **Multiple Exam Variants** — generate N independently shuffled variants (A/B/C/D…) plus a combined answer key, all packaged as a zip
- **Exam Templates** — save a PDF config (title, instructions, point layout, front matter) as a named template and apply it when building a new exam
- **Bulk Field Edit** — select 2+ questions and set a shared field (topic, difficulty, lecture, points) across all of them at once
- **Question Preview (PDF-accurate)** — "Preview PDF" button generates and opens the real PDF in a new tab before downloading
- **Internal Notes Field** — private per-question notes field (not printed on the exam) for instructor commentary
- **Question Flag / Review Queue** — one-click ⚑ flag toggle on each question; filterable in the bank view
- **Image Support in Question Stems** — image upload button in the question editor inserts a markdown image reference into the stem
- **Bloom's Taxonomy Tag** — Bloom's level field (Remember → Create) on each question; filterable in the bank and shown in the Stats view
- **Learning Objective Mapping** — tag each question to one or more course learning objectives; shown as badges on each row
- **Saved Filters / Smart Collections** — save a filter combination as a named collection; collections update dynamically as the bank changes
- **Full-Text Search Improvements** — regex search (`/pattern/flags` syntax) and field-scoped filters for type, difficulty, bloom, and flagged status
- **CSV Export** — export the full bank to a spreadsheet via the Export CSV button in the bank toolbar
- **QTI Export** — export selected questions as an IMS QTI 2.1 zip (Canvas / Blackboard compatible) via Export QTI in the bank toolbar
- **Per-Question Difficulty Calibration** — import a post-grading CSV (question number → % correct); empirical difficulty stored and surfaced as a badge; mismatches highlighted in Stats view
- **Exam Balance Report** — before downloading, toggle a breakdown panel showing topic coverage, difficulty distribution, Bloom's levels, total points, and imbalance warnings
- **Bank Health Dashboard** — Stats view with summary cards, type/difficulty/bloom bar charts, source breakdown, topics grid, and empirical-vs-manual difficulty mismatch table
- **Undo / Change History** — in-memory undo stack covering question deletion and bulk delete; Ctrl+Z or the Undo button restores the last destructive action
- **Keyboard Shortcuts** — `N` opens the composer, `A` selects all visible questions, `Escape` cancels selection, `Ctrl+Z` undoes the last deletion
