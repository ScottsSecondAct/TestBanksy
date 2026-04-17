# Getting Started — TestBanksy

A tool for building and reusing exam questions semester over semester, and generating formatted PDF exams. All data stays on your machine.

---

## Starting the App

You need two terminals — one for the backend, one for the frontend.

**Terminal 1 — Backend:**
```bash
.venv/bin/python app.py
```

**Terminal 2 — Frontend:**
```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

If the backend isn't running, a red warning banner appears at the top of the page.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | Open the question composer |
| `A` | Select all visible questions |
| `Escape` | Cancel selection / close composer |
| `Ctrl+Z` | Undo last deletion |

---

## Bank Switcher

TestBanksy supports multiple isolated question banks — useful for keeping different courses separate. The active bank name appears as a button in the header. Click it to open the bank picker.

From the picker you can:
- **Switch** to any existing bank
- **Create** a new bank by typing a name and pressing Enter or clicking Create
- **Delete** any non-active bank

Switching banks resets filters and selection.

---

## The Five Views

The navigation bar has five sections: **Bank**, **Generate**, **Import**, **Stats**, and **Front Matter**. The typical workflow: Import → Bank → Generate.

---

## 1. Import — Adding Questions to the Bank

The Import view has four tabs.

### Upload .docx

1. Click **Import** in the nav bar and select the **Upload .docx** tab
2. Pick a `.docx` file
3. Fill in **Source / Semester Label** (e.g. `Fall 2024 Midterm 1`) — this tag stays attached to every question
4. Click **Import Questions**

The parser uses pandoc to convert the docx to markdown, then walks through it detecting numbered questions. Type detection:

| Type | How it's detected |
|------|-------------------|
| Multiple Choice | Lines matching `A)`, `A.`, or `A:` patterns |
| Select All | Multiple starred choices (`*A)`, `*C)`), stem phrases like "select all that apply" / "which of the following are true", or a comma-separated answer key entry |
| True / False | "True / False" in the stem, or T/F choices |
| Fill in the Blank | `___` or `{{blank}}` in the stem |
| Essay | "explain / describe / discuss / compare" keywords in a long stem |
| Code Listing | Fenced code blocks (` ``` `) |
| Short Answer | Everything else |

Point values are extracted from patterns like `(5 pts)` or `[10 points]`. Starred choices like `*A)` or an `Answer: B` line set the correct answer.

**After parsing, a staging area appears** showing every question found. Uncheck any you don't want and click **Import N Selected** to commit. Click **Cancel** to discard.

### Paste Markdown

Switch to the **Paste Markdown** tab to paste markdown directly or load a `.md` file. Format:

```
1. What does MOV do?
A) Copies a value
B) Adds two values
C) Jumps to a label
D) Pushes to the stack
Answer: A

2. The stack grows toward ___.

3. True / False: RAX is a 64-bit register.
Answer: True

4. Which registers are caller-saved? (Select all that apply.)
*A) RAX
B) RBX
*C) RCX
D) RBP
```

The same staging review applies before commit.

### Answer Key

Switch to the **Answer Key** tab to apply a standalone answer key to questions already in the bank.

**Exact matching (default):** Upload a `.docx` or `.md` key file with entries like `1. B` / `2. A, C`. Provide the **Source / Semester Label** that matches the original import — answers are matched by source + question number.

**Fuzzy stem matching:** Enable the **Fuzzy stem matching** toggle and upload the full exam document (same format as a regular import). Answers are applied to whichever bank question has the most similar stem, regardless of question number. Use this when question numbers shifted between exam versions.

### Calibrate

Switch to the **Calibrate** tab to import post-grading results. Upload a CSV with columns `question_number` and `pct_correct` (values 0–1 or 0–100). Each matching question gets an empirical difficulty stored alongside its manual tag. Mismatches appear in the Stats view.

---

## 2. Question Bank — Browsing and Editing

The **Bank** view is the main question list.

### Filtering

The filter bar narrows by:
- **Search** — matches stem text, topic, and code block content. Prefix with `/` for regex: `/mov\s+r[a-d]x/`
- **Type** — Multiple Choice, Select All, True/False, etc.
- **Topic** — populated from topics in the bank
- **Difficulty** — easy / medium / hard
- **Source** — the semester label set at import time
- **Lecture #** — if you've tagged questions with a lecture number
- **Bloom's Level** — filter by cognitive level
- **Flagged** — show only questions marked for review
- **Answers** — filter to questions with or without a correct answer

Filters combine. Selections persist across filter changes — filter to Lecture 3, select what you want, then filter to Lecture 7 and add more.

### Smart Collections

Click **Save Collection** to save the current filter combination as a named collection. Collections appear above the filter bar and update dynamically as the bank changes. Click a collection name to apply it instantly.

### Keyboard Selection

- Press `A` to select all currently visible questions
- Press `Escape` to deselect all
- Press `Ctrl+Z` or click **Undo** to restore questions deleted in the last action

### Bulk Field Edit

Select 2+ questions — a **Bulk Edit** panel appears below the toolbar. Choose a field and value to apply it across all selected questions at once. Useful after a bulk import where every question lands with blank metadata.

### Duplicate Detection

Click **Scan for Duplicates** to run a similarity check across all questions. Near-duplicate pairs appear above the list with their match score.

For each pair, click a card to mark it for deletion. **Check older from each pair** / **Check newer from each pair** auto-select based on age. Click **Delete Selected (N)** to bulk-remove. Deleted questions are pushed onto the undo stack.

### Editing a Question

Click **Edit** on any row to expand an inline editor. Fields save on blur.

Editable fields:
- **Type**, **Difficulty**, **Points**, **Topic**, **Lecture #**, **Source**, **Semester**
- **Bloom's Level** — Remember / Understand / Apply / Analyze / Evaluate / Create
- **Flag for Review** — marks the question with a ⚑ badge; filterable
- **Stem** — full markdown with inline code, bold, italic, fenced code blocks, and `___` blanks
- **Choices** (MC/multi_select) — click a letter badge to mark it correct; click × to remove
- **Correct Answer** (T/F) — click True or False
- **Blank Answers** (fill-in-the-blank) — one field per `___`
- **Code Block** — monospace box on the PDF, separate from the stem
- **Image** — upload an image and insert a markdown reference into the stem
- **Learning Objectives** — tag to one or more course objectives (pink tags)
- **Private Notes** — instructor notes not printed on the exam

### Creating a Question Manually

Press `N` or click **+ New Question**. A composer form appears. Fill in the fields and click **Create Question**.

### Export from the Bank

The bank toolbar includes:
- **Export CSV** — downloads the full bank as a spreadsheet
- **Export QTI** — exports selected questions as an IMS QTI 2.1 zip (Canvas / Blackboard compatible)

---

## 3. Generate Exam — Building the PDF

Once you've selected questions from the bank, go to **Generate**.

### Configuration

| Field | Description |
|-------|-------------|
| Exam Title | Large title at the top of the first page |
| Course / Subtitle | Smaller line below the title |
| Date | Printed below the course line |
| Instructions | Italic line before the questions |
| Filename | Name of the downloaded file |

### Options

- **Show point values** — prints `(N pts)` next to each question number
- **Shuffle MC choices** — randomizes A/B/C/D order; correct answer tracking updates automatically
- **Generate answer key** — appends a final page with correct answers
- **Front matter on own page** — questions start on a new page after the reference material

### Exam Templates

Click **Save as Template** (enter a name first) to save the current config for reuse. Saved templates appear above the config form — click one to apply it instantly. Delete templates with ×.

### Balance Report

Click **Show Balance Report** to see a breakdown of the selected questions before downloading: topic coverage, difficulty distribution, Bloom's levels, total points, and imbalance warnings (e.g. if 70% of points fall on one topic).

### Multiple Variants

Enable **Multiple Variants** and enter N (2–8) to generate N independently shuffled copies of the exam plus a combined answer key, all packaged as a single zip download. Each variant letter (A, B, C…) is printed on the exam.

### Exam Archive

Check **Save to archive after downloading** before clicking Download PDF. The exam is saved with a name and appears in the **Exam Archive** list. Click **Load** on any archived exam to restore its question selection and config. Each question row in the bank shows which exams it has appeared on.

### Preview and Download

- **Preview PDF** — opens the PDF in a new browser tab
- **Download PDF** — saves to your downloads folder
- **Download Variants** — generates the multi-variant zip

---

## 4. Stats — Bank Health Dashboard

The **Stats** view shows a summary of the entire active bank:

- **Summary cards** — total questions, flagged count, questions missing answers, count by type
- **Distribution charts** — type, difficulty, and Bloom's level breakdowns
- **Source breakdown** — question count per semester/source
- **Topics grid** — question count per topic
- **Difficulty mismatch table** — questions where empirical % correct (from calibration) disagrees significantly with the manual difficulty tag

---

## 5. Front Matter — Reference Material

Front matter is markdown content between the exam header and the first question. Use it for register tables, instruction references, figures, or anything students need during the exam.

### Composer

| Syntax | Result |
|--------|--------|
| `# Heading` / `## Heading` / `### Heading` | Section headings |
| `**bold**`, `*italic*`, `` `code` `` | Inline formatting |
| ` ```asm ... ``` ` | Code block (monospace, gray background) |
| `\| col \| col \|` pipe tables | Table with optional header row |
| `![alt](filename.png)` | Image |
| `*Figure 1: caption*` on the line after an image | Centered caption |
| `---pagebreak---` | Explicit page break in the PDF |
| `---` | Horizontal rule |

Click **Preview** to see a rendered preview. The **"Front matter on its own page"** checkbox controls whether questions start on a fresh page after the reference material.

### Snippet Library

The left panel holds reusable markdown chunks. Click **Insert** on any snippet to append it to the front matter composer. Click **Edit** to modify a snippet. Categories: reference, register table, instruction table, figure, formula, code example, other.

### Uploading Images

Use the **Upload Image** panel to upload a `.png`, `.jpg`, `.jpeg`, `.gif`, or `.svg`. The markdown reference is automatically appended to the front matter. Images are stored in `uploads/`.

---

## Data & Backup

All questions, snippets, banks, and exam records are stored in `TestBank/banks.json`. The backend writes a timestamped backup to `backups/` on every save (max 10 kept per bank).

**Export:** `GET /api/export-bank` downloads the full JSON.

**Import a backup:** `POST /api/import-bank` with the JSON file — replaces the active bank.

---

## Requirements

- **pandoc** for `.docx` import: `sudo apt install pandoc` or `brew install pandoc`. Without it, docx upload fails but markdown import, manual question creation, and PDF generation all work.
