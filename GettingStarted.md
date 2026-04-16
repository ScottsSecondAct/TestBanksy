# Getting Started — Test Bank Manager

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

If the backend isn't running, a yellow warning banner will appear at the top of the page with a reminder command.

---

## The Four Views

The navigation bar has four sections: **Question Bank**, **Import**, **Front Matter**, and **Generate Exam**. The typical workflow moves left to right.

---

## 1. Import — Adding Questions to the Bank

Use this view to pull questions out of an existing `.docx` exam file.

1. Click **Import** in the nav bar
2. Click the file picker and select a `.docx` file
3. Fill in **Source / Semester Label** — this tag stays attached to each imported question (e.g. `Fall 2024 Midterm 1`). It's how you filter by exam later.
4. Click **Import Questions**

The parser uses pandoc to convert the docx to markdown, then walks through it looking for numbered questions. It auto-detects question type based on content:

| Type | How it's detected |
|------|-------------------|
| Multiple Choice | Lines matching `A)`, `A.`, or `A:` patterns |
| True / False | "True / False" in the stem, or T/F choices |
| Fill in the Blank | `___` or `{{blank}}` in the stem |
| Essay | "explain / describe / discuss / compare" keywords in a long stem |
| Code Listing | Fenced code blocks (` ``` `) |
| Short Answer | Everything else |

Point values are extracted from patterns like `(5 pts)` or `[10 points]` in the stem. Starred choices like `*A)` or an `Answer: B` line set the correct answer.

After importing, a summary toast shows how many questions were added and what types were found. The bank summary below the form updates with totals.

---

## 2. Question Bank — Browsing and Editing

The **Question Bank** view is the main list. Every question in the bank is shown here.

### Filtering

The filter bar at the top lets you narrow by:
- **Search** — matches against the stem text, topic, and code block content
- **Type** — Multiple Choice, True/False, etc.
- **Topic** — populated from whatever topics exist in the bank
- **Difficulty** — easy / medium / hard
- **Source** — the semester label set at import time
- **Lecture #** — if you've tagged questions with a lecture number

Filters combine — e.g. Topic = "x86 Addressing" + Difficulty = "hard" shows only hard addressing questions.

### Editing a Question

Click **Edit** on any row to expand an inline editor. Fields save automatically when you tab or click away (on blur). The exception is MC choices, which have an explicit **Save** button.

Editable fields:
- **Type** — changing type immediately re-renders the appropriate sub-fields
- **Difficulty** — easy / medium / hard
- **Points** — used in the PDF score line and answer key
- **Topic** — free text; used for filtering
- **Lecture #** — free text; used for filtering
- **Source** — the semester/exam label
- **Stem** — full markdown, including inline code, bold, italic, and fenced code blocks
- **Choices** (MC) — click a letter badge to mark it as correct; click × to remove a choice
- **Correct Answer** (T/F) — click True or False
- **Blank Answers** (fill-in-the-blank) — one field per `___` in the stem
- **Blank lines on PDF** (essay) — how many ruled lines to leave for the answer
- **Code Block** — displayed in a monospace box on the PDF, separate from the stem

### Creating a Question Manually

Click **+ New Question** (top right of the filter bar). A composer form appears above the list. Fill in the fields and click **Create Question**. The new question lands at the top of the list and opens in edit mode automatically.

### Selecting Questions for an Exam

Check the box on the left of each question to select it. The header row shows a count and a **Generate Exam →** shortcut button. Selections persist as you filter — you can filter to Lecture 3 questions, select the ones you want, then filter to Lecture 7 and add more.

Click **Select all** to select everything currently visible through the active filters.

---

## 3. Front Matter — Reference Material

Front matter is markdown content that appears between the exam header and the first question. Use it for register tables, instruction reference sheets, figures, or anything else students need to refer to during the exam.

### Composer

The right panel is a free-form markdown editor. The following formatting is supported:

| Syntax | Result |
|--------|--------|
| `# Heading` / `## Heading` / `### Heading` | Headings |
| `**bold**`, `*italic*`, `` `code` `` | Inline formatting |
| ` ```asm ... ``` ` | Code block (monospace, gray background) |
| `\| col \| col \|` pipe tables | Table with optional header row |
| `![alt](filename.png)` | Image (uploaded via the panel) |
| `*Figure 1: caption*` on the line after an image | Centered caption |
| `---pagebreak---` | Explicit page break in the PDF |
| `---` | Horizontal rule |

Click **Preview** to see a rendered preview before generating the PDF.

The **"Front matter on its own page"** checkbox controls whether questions start on a fresh page after the reference material, or follow directly below it.

### Snippet Library

The left panel is a reusable snippet library — pre-written markdown chunks you can insert into any exam's front matter with one click.

**To save a new snippet:**
1. Fill in the Title, Category, and Markdown fields in the New Snippet panel
2. Click **Save Snippet**

**To insert a snippet** into the current front matter, click **Insert** on any saved snippet.

**Categories:** reference, register table, instruction table, figure, formula, code example, other.

### Uploading Images

Use the **Upload Image** panel to upload a `.png`, `.jpg`, `.jpeg`, `.gif`, or `.svg`. After uploading, the markdown reference (`![alt](filename.png)`) is automatically appended to the front matter composer. Images are stored in `uploads/`.

---

## 4. Generate Exam — Building the PDF

Once you've selected questions from the bank (the header shows the count), go to **Generate Exam**.

### Configuration

| Field | Description |
|-------|-------------|
| Exam Title | Large title at the top of the first page |
| Course / Subtitle | Smaller line below the title (e.g. "Midterm 1") |
| Date | Printed below the course line (e.g. "Spring 2026") |
| Instructions | Italic line printed before the questions |
| Filename | What the downloaded file will be named |

### Options

- **Show point values** — prints `(N pts)` next to each question number
- **Shuffle MC choices** — randomizes A/B/C/D order; the correct answer tracking updates automatically
- **Generate answer key** — appends a final page with correct answers for MC, T/F, and fill-in-the-blank questions
- **Front matter on own page** — questions start on a new page after the reference material

### Preview

A compact preview list below the form shows which questions are included, in order, with their type and point value. Click × next to any question to remove it from the selection without leaving the view.

### Downloading

Click **Download PDF**. The file is generated server-side and downloaded directly to your browser's download folder.

---

## Data & Backup

All questions and snippets are stored in `question_bank.json` in the project directory. This file is created automatically on first use.

**To back up:** copy `question_bank.json` somewhere safe.

**To export:** `GET /api/export-bank` downloads the full JSON file.

**To import a backup:** `POST /api/import-bank` with the JSON file — this replaces the current bank entirely.

---

## Requirements

- **pandoc** must be installed for `.docx` import to work. On most systems: `sudo apt install pandoc` or `brew install pandoc`. Without it, the upload endpoint will return an error, but manually-created questions and PDF generation work fine.
