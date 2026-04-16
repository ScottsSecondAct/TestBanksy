# Test Bank Manager v2

A standalone full-stack application for building exam question banks from `.docx` files and generating formatted PDF exams. **No Claude dependency** — runs entirely on your machine.

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

The built files land in `dist/` — serve them with any static file server or configure Flask to serve them.

## Project Structure

```
CSc35TestBank/
├── app.py                          # Flask backend
├── question_bank.json              # Auto-created data store
├── uploads/                        # Uploaded .docx files and images
├── exports/                        # Generated PDFs
├── package.json
├── vite.config.js                  # Dev server + API proxy config
├── index.html                      # Vite entry point
├── main.jsx                        # React entry point
├── api.js                          # fetch wrapper (apiFetch, apiBlob)
├── ui.jsx                          # Shared components (Badge, Btn, Inp, etc.)
├── App.jsx                         # Main app — 4 views
├── QuestionRow.jsx                 # Question display + inline editor
├── QuestionComposer.jsx            # New question form
└── SnippetEditor.jsx               # Front matter snippet editor
```

## Supported Question Types

| Type | Auto-Detection | PDF Rendering |
|------|---------------|---------------|
| **Multiple Choice** | `A)` / `A.` / `a)` patterns | Lettered choices, shuffleable |
| **True / False** | "True / False" in stem | `True   False` line |
| **Fill in the Blank** | `___` or `{{blank}}` in stem | Inline underlines |
| **Short Answer** | Default fallback | 3 blank lines |
| **Essay** | "explain/describe/discuss" keywords | Configurable N blank lines |
| **Code Listing** | Fenced code blocks (` ``` `) | Monospace box with background |

## Front Matter System

Add reference material (register tables, instruction refs, figures) between the exam header and questions.

**Snippet Library** — reusable markdown snippets categorized by type (register table, instruction table, figure, code example, etc.). Insert any snippet into the current exam's front matter with one click.

**Composer** — free-form markdown editor with live preview. Supports:
- Pipe-delimited tables with header detection
- Fenced code blocks
- `![alt](filename.png)` images (upload via UI)
- `*Figure 1: caption*` figure captions
- `#`, `##`, `###` headings
- `---pagebreak---` explicit page breaks
- `---` horizontal rules
- `**bold**`, `*italic*`, `` `code` `` inline formatting

## How Parsing Works

1. Upload a `.docx` exam
2. **pandoc** converts it to markdown (preserving code blocks and formatting)
3. Parser detects numbered questions (`1.`, `1)`, `Q1:`, `**1.**`)
4. Each question is auto-classified by type based on content
5. MC choices, correct answers (`Answer: X` or `*A)` starred), point values, and blanks are extracted

## PDF Generation Features

- Clean layout with question numbers and point values
- Code blocks in monospace with gray background
- MC choices with optional **shuffling** (re-letters A/B/C/D, tracks correct answer)
- **Answer key** appended as final page
- Essay questions get configurable blank line space
- Fill-in-the-blank with inline underlines
- Front matter with tables, code refs, and images
- `KeepTogether` prevents questions splitting across pages

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/questions` | List all questions |
| `POST` | `/api/questions` | Add a question manually |
| `PUT` | `/api/questions/<id>` | Update a question |
| `DELETE` | `/api/questions/<id>` | Delete a question |
| `POST` | `/api/upload` | Upload & parse a `.docx` |
| `POST` | `/api/upload-markdown` | Parse raw markdown text |
| `POST` | `/api/generate-pdf` | Generate exam PDF |
| `GET` | `/api/stats` | Bank statistics |
| `GET` | `/api/snippets` | List all snippets |
| `POST` | `/api/snippets` | Create a snippet |
| `PUT` | `/api/snippets/<id>` | Update a snippet |
| `DELETE` | `/api/snippets/<id>` | Delete a snippet |
| `POST` | `/api/upload-image` | Upload image for front matter |
| `GET` | `/api/export-bank` | Download question_bank.json |
| `POST` | `/api/import-bank` | Import a bank file |

## Requirements

- **Python 3.9+** — use a venv (system Python on modern distros is externally managed)
- **Node.js 18+** with npm
- **pandoc** (for .docx → markdown conversion)
