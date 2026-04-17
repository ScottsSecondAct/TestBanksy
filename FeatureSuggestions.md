# CSc 35 Test Bank — Feature Suggestions

---

## 1. Exam Management

**Exam Archive**
Save generated exams (question list, config, PDF) as named records. Currently there's no way to recall what was on a previous exam without re-importing the .docx. An archive would let you open "Fall 2025 Midterm 1" and see exactly which questions were used, in what order, with what point values.

**Question Usage Tracking**
Track which exams each question has appeared on. Show a "Used on: Fall 2025 Midterm 1, Spring 2026 Final" badge on question rows. Add a "Not used since" filter so you can avoid recycling recent questions or deliberately pick ones students haven't seen.

**Multiple Exam Variants**
Extend the existing shuffle feature to generate N variants of the same exam in one click (e.g. Variant A/B/C/D), each with independently shuffled MC choices and question order. Produce one PDF per variant plus a combined answer key keyed to variant letter.

**Exam Templates**
Save a PDF config (title, instructions, point layout, front matter snippet) as a named template. Apply a template when starting a new exam instead of re-entering the same fields each time.

---

## 2. Question Authoring

**Bulk Field Edit**
Select multiple questions and set a shared field — topic, difficulty, lecture number, or point value — across all of them at once. Useful after a bulk import where every question lands with blank metadata.

**Question Preview (PDF-accurate)**
Render a single question exactly as it will appear in the PDF, inline in the browser, before adding it to an exam. The current markdown preview is approximate; a true PDF-accurate preview would catch formatting issues early.

**Internal Notes Field**
A private notes field on each question (not printed on the exam) for things like "this question was too easy Spring 2025" or "update this if we cover SIMD in lecture 9."

**Question Flag / Review Queue**
A one-click "flag for review" toggle. Add a filter for flagged questions so you can batch-review them before an exam. Useful after grading when you want to mark questions that performed poorly.

**Image Support in Question Stems**
Extend the existing image-upload infrastructure (currently front matter only) to individual question stems. Important for architecture diagrams, memory maps, register state snapshots, and circuit questions.

---

## 3. Organization & Search

**Bloom's Taxonomy Tag**
Add a Bloom's level field (Remember / Understand / Apply / Analyze / Evaluate / Create) alongside difficulty. Lets you verify an exam has the right cognitive mix, not just the right easy/medium/hard ratio.

**Learning Objective Mapping**
Tag each question to one or more course learning objectives. Show per-objective coverage in the stats panel and warn when a generated exam is missing an objective entirely.

**Saved Filters / Smart Collections**
Save a filter combination as a named collection — e.g. "Hard x86 questions not used this semester." Collections update dynamically as the bank changes.

**Full-Text Search Improvements**
Add regex search and search within code blocks. Currently the search only matches stem text, topic, and code block content but doesn't support pattern matching or field-scoped queries like `topic:addressing difficulty:hard`.

---

## 4. Import / Export

**Import Review Step**
After parsing a .docx, show a staging area where you can review, correct, and selectively approve each parsed question before it hits the bank. Currently all parsed questions are committed immediately, and bad parses require manual cleanup after the fact.

**CSV / Excel Export**
Export the question bank (or a filtered subset) to a spreadsheet for offline review, printing, or sharing with a colleague who doesn't run the app.

**QTI Export**
Export selected questions in IMS QTI format for import into Canvas, Blackboard, or other LMS platforms. Would allow using the bank as the source of truth for online quizzes too.

**Batch Answer Key Application**
Extend the existing answer key upload to match by stem similarity rather than only by source + question number. Useful when a key file was generated from a different version of the exam document.

---

## 5. Analytics

**Per-Question Difficulty Calibration**
After grading, import a CSV of per-question scores (question number → % correct). Store the empirical difficulty alongside the manual tag. Surface questions where the manual and empirical difficulty disagree significantly.

**Exam Balance Report**
Before downloading a PDF, show a breakdown of the selected questions: topic coverage, difficulty distribution, Bloom's levels, total points, and estimated time (based on type and point value). Flag imbalances — e.g. 70% of points on one topic.

**Bank Health Dashboard**
Expand the current stats panel with trends over time: questions added per semester, coverage gaps by lecture, stale questions (not used in N semesters), and questions with missing metadata.

---

## 6. Workflow & Reliability

**Auto-Backup**
Write a timestamped backup of `question_bank.json` to a `backups/` folder on every save (capped at the last N backups). A corrupted bank is currently unrecoverable without a manual backup.

**Undo / Change History**
Keep a short in-memory undo stack for destructive operations — question deletion, bulk delete from duplicate scan, bulk field edits. A single "Undo last action" button would cover the most painful accidental deletions.

**Keyboard Shortcuts**
Add shortcuts for common actions: open composer (`N`), confirm/save (`Ctrl+Enter`), cancel (`Escape`), toggle selection (`Space`). Useful when building exams from a large bank where mouse-heavy workflows slow things down.
