#!/usr/bin/env python3
"""
Test Bank Manager v2 — Flask Backend
=====================================
Parses .docx exams via pandoc (docx→markdown), stores questions as markdown-in-JSON,
generates formatted PDF exams with code syntax highlighting.

Question types: mc, true_false, fill_blank, short_answer, essay, code_listing
"""

import json
import os
import re
import uuid
import random
import copy
import shutil
import subprocess
import tempfile
import time
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    HRFlowable, KeepTogether, Preformatted, Flowable,
    Table, TableStyle, Image as RLImage
)
from reportlab.lib import colors
from reportlab.lib.colors import HexColor

app = Flask(__name__)
CORS(app)

BASE          = Path(__file__).parent
TESTBANK_DIR  = BASE / "TestBank"
BANKS_FILE    = TESTBANK_DIR / "banks.json"
UPLOAD_DIR    = BASE / "uploads"
EXPORT_DIR    = BASE / "exports"
BACKUP_DIR    = BASE / "backups"
LOG_FILE      = BASE / "testbank.log"
TESTBANK_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)
EXPORT_DIR.mkdir(exist_ok=True)
BACKUP_DIR.mkdir(exist_ok=True)

MAX_BACKUPS = 10
_last_backup_times: dict = {}   # bank_id → float


# ── Banks registry ───────────────────────────────────────────────────────────

def load_banks() -> dict:
    """Load banks registry, always ensuring at least one default bank exists."""
    if BANKS_FILE.exists():
        try:
            state = json.loads(BANKS_FILE.read_text())
            # Ensure active bank is always in the list
            if not any(b["id"] == state.get("active") for b in state.get("banks", [])):
                state.setdefault("banks", []).append({
                    "id": state.get("active", "question_bank"),
                    "name": "Question Bank",
                    "created": datetime.now().isoformat(),
                })
            return state
        except Exception:
            pass
    # Bootstrap: always create a default entry
    default = {"id": "question_bank", "name": "Question Bank", "created": datetime.now().isoformat()}
    state = {"banks": [default], "active": "question_bank"}
    save_banks(state)
    return state


def save_banks(state: dict) -> None:
    tmp = BANKS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(BANKS_FILE)


def _init_active_bank() -> str:
    return load_banks().get("active", "question_bank")


_active_bank_id: str = _init_active_bank()


def get_bank_file(bank_id: str | None = None) -> Path:
    return TESTBANK_DIR / f"{bank_id or _active_bank_id}.json"


# ════════════════════════════════════════════════════════════════════════════
# LOGGING
# ════════════════════════════════════════════════════════════════════════════

def log(level: str, message: str) -> None:
    """Prepend a timestamped entry to testbank.log (latest entry at top)."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"[{ts}] {level.upper()}: {message}\n"
    try:
        existing = LOG_FILE.read_text(encoding="utf-8") if LOG_FILE.exists() else ""
        LOG_FILE.write_text(entry + existing, encoding="utf-8")
    except Exception:
        pass  # Never let logging crash the app


def log_info(msg: str)    -> None: log("INFO",    msg)
def log_success(msg: str) -> None: log("SUCCESS", msg)
def log_error(msg: str)   -> None: log("ERROR",   msg)
def log_warn(msg: str)    -> None: log("WARN",    msg)


# ════════════════════════════════════════════════════════════════════════════
# DATA LAYER
# ════════════════════════════════════════════════════════════════════════════

def load_bank():
    bf = get_bank_file()
    if bf.exists():
        with open(bf) as f:
            bank = json.load(f)
        if "snippets" not in bank:
            bank["snippets"] = []
        if "exams" not in bank:
            bank["exams"] = []
        if "templates" not in bank:
            bank["templates"] = []
        return bank
    return {"questions": [], "snippets": [], "exams": [], "templates": [],
            "metadata": {"created": datetime.now().isoformat(), "version": 2}}


def save_bank(bank):
    bid = _active_bank_id
    bf  = get_bank_file(bid)
    try:
        if bf.exists():
            now = time.time()
            if now - _last_backup_times.get(bid, 0) >= 30:
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                shutil.copy2(str(bf), str(BACKUP_DIR / f"{bid}_{ts}.json"))
                _last_backup_times[bid] = now
                old = sorted(BACKUP_DIR.glob(f"{bid}_*.json"))
                for old_file in old[:-MAX_BACKUPS]:
                    old_file.unlink(missing_ok=True)
    except Exception:
        pass

    bank["metadata"]["last_modified"] = datetime.now().isoformat()
    bank["metadata"]["version"] = 2
    tmp = bf.with_suffix(".tmp")
    tmp.write_text(json.dumps(bank, indent=2))
    tmp.replace(bf)


def new_question(**kwargs):
    """Create a question dict with all required fields."""
    base = {
        "id": str(uuid.uuid4()),
        "type": "short_answer",        # mc|true_false|fill_blank|short_answer|essay|code_listing
        "stem": "",                     # markdown — the question text
        "choices": [],                  # for mc: [{letter, text}]
        "correct_answer": "",           # mc: "A", true_false: "True"/"False", fill_blank: comma-separated
        "blanks": [],                   # fill_blank: list of accepted answers per blank
        "code_block": "",               # code_listing: the code text
        "code_language": "asm",         # language hint for syntax highlighting
        "essay_lines": 10,              # essay: number of blank lines on PDF
        "points": 0,
        "topic": "",
        "difficulty": "medium",         # easy|medium|hard
        "lecture": "",
        "source": "",
        "semester": "",
        "number": 0,                    # original question number from source
        "tags": [],
        "added": datetime.now().isoformat(),
        "notes": "",                    # private notes, not printed
        "flagged": False,               # flagged for review
        "bloom": "",                    # Bloom's taxonomy level
        "objectives": [],               # learning objective tags
        "empirical_difficulty": None,   # pct_correct from calibration (0-1)
    }
    base.update(kwargs)
    return base


# ════════════════════════════════════════════════════════════════════════════
# DUPLICATE DETECTION
# ════════════════════════════════════════════════════════════════════════════

def _normalize_stem(stem: str) -> str:
    return re.sub(r'\s+', ' ', stem.strip().lower())


def stem_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalize_stem(a), _normalize_stem(b)).ratio()


def find_duplicates_for(stem: str, questions: list, threshold: float = 0.85) -> list:
    """Return questions similar to stem above threshold, sorted by score descending."""
    results = []
    for q in questions:
        score = stem_similarity(stem, q.get("stem", ""))
        if score >= threshold:
            results.append({"score": round(score, 3), "question": q})
    results.sort(key=lambda x: x["score"], reverse=True)
    return results


def find_all_duplicates(questions: list, threshold: float = 0.85) -> list:
    """Return all pairs of questions with similarity >= threshold."""
    pairs = []
    for i in range(len(questions)):
        for j in range(i + 1, len(questions)):
            score = stem_similarity(questions[i].get("stem", ""), questions[j].get("stem", ""))
            if score >= threshold:
                pairs.append({
                    "score": round(score, 3),
                    "a": questions[i],
                    "b": questions[j],
                })
    pairs.sort(key=lambda x: x["score"], reverse=True)
    return pairs


# ════════════════════════════════════════════════════════════════════════════
# DOCX → MARKDOWN PARSER
# ════════════════════════════════════════════════════════════════════════════

def docx_to_markdown(filepath):
    """Convert .docx to markdown using pandoc."""
    result = subprocess.run(
        ["pandoc", "--from=docx", "--to=markdown", "--wrap=none", str(filepath)],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        raise RuntimeError(f"pandoc failed: {result.stderr}")
    return result.stdout


# ── Choice detection ────────────────────────────────────────────────────────

CHOICE_RE = [
    re.compile(r'^-?\s*([A-Da-d])\)\s+(.+)'),
    re.compile(r'^-?\s*([A-Da-d])\.\s+(.+)'),
    re.compile(r'^-?\s*([A-Da-d]):\s+(.+)'),
]

# Numeric choices (1. / 1)) only match when prefixed with '-' to avoid
# colliding with numbered question starters like "1. What does..."
CHOICE_NUM_RE = [
    re.compile(r'^-\s*(\d)\)\s+(.+)'),
    re.compile(r'^-\s*(\d)\.\s+(.+)'),
]

TF_RE = [
    re.compile(r'^\*?\s*(?:True|False)\s*(?:/|or)\s*(?:True|False)', re.IGNORECASE),
    re.compile(r'^\(?(?:circle|select)\s+(?:one\s*:?\s*)?(?:True|False)', re.IGNORECASE),
]

ANSWER_RE = re.compile(r'^\s*\*?\s*(?:Answer|Correct|Key|Ans)[:\s]+(.+)', re.IGNORECASE)
BLANK_RE = re.compile(r'_{3,}|(?:\\_){3,}|\{\{blank\}\}')

# Answer key section detection — permissive: any line whose only content is
# some form of "answer(s)" / "answer key" / "answer sheet", with optional
# markdown heading markers, bold markers, and trailing punctuation.
ANSWER_KEY_HDR_RE = re.compile(
    r'^\s*#{0,4}\s*\*{0,2}\s*(?:answer\s+key|answer\s+sheet|answers?)\s*\*{0,2}\s*[:\-]?\s*$',
    re.IGNORECASE,
)
# Entry like "1. A", "1) B", "2. True", "3: C) some text", "31. A,B,C"
# Letters extended to A-Z to handle exams with more than 4 choices.
ANSWER_KEY_ENTRY_RE = re.compile(
    r'^\s*(\d+)[.):\s]\s*([A-Za-z](?:[,\s]+[A-Za-z])*|True|False|T|F)(?:[).\s]|$)',
    re.IGNORECASE,
)

# Section instruction: "Circle all answers that are correct" → multi_select
MULTI_SELECT_INSTR_RE = re.compile(
    r'^\*{0,2}\s*circle\s+\*{0,2}all\*{0,2}\s+(?:answers?\s+that\s+are\s+correct|correct\s+answers?)',
    re.IGNORECASE,
)


_TF_NORM = {'t': 'True', 'f': 'False', 'true': 'True', 'false': 'False'}

def _normalize_key_answer(raw):
    """Normalize a raw answer cell from any answer key format."""
    # Strip bold markers and parenthetical alternates like "(or 'two')"
    s = re.sub(r'\*+', '', raw).strip()
    s = re.sub(r'\s*\(.*', '', s).strip()
    # T/F
    if s.lower() in _TF_NORM:
        return _TF_NORM[s.lower()]
    # MC with explanation: "B) 74" → "B"
    mc = re.match(r'^([A-Za-z])\)\s*\S', s)
    if mc:
        return mc.group(1).upper()
    # Single letter or comma/space-separated letters: "A", "A, B, D", "A,B,D"
    if re.match(r'^[A-Za-z](?:[,\s]+[A-Za-z])*$', s):
        letters = re.findall(r'[A-Za-z]', s)
        return ','.join(sorted(set(l.upper() for l in letters)))
    # Free text (fill-in-blank)
    return s


def extract_answer_key(lines):
    """Scan for an answer key section. Returns (dict[int, str], key_start_idx).
    key_start_idx is the line index of the header, or -1 if none found.
    The dict maps question number → normalized answer ('A'..'D', 'True', 'False').
    Handles both plain format ("1. A") and markdown table format ("| 1 | **T** | ... |").
    """
    key = {}
    key_start = -1

    for i, line in enumerate(lines):
        if ANSWER_KEY_HDR_RE.match(line.strip()):
            key_start = i
            for entry in lines[i + 1:]:
                e = entry.strip()
                if not e:
                    continue

                # Markdown table row: | 1 | **T** | explanation |
                if e.startswith('|'):
                    parts = [p.strip() for p in e.split('|')]
                    # parts[0] == '', parts[1] == qnum, parts[2] == answer
                    if len(parts) >= 3:
                        qnum_raw = parts[1].strip('*').strip()
                        if qnum_raw.isdigit():
                            key[int(qnum_raw)] = _normalize_key_answer(parts[2])
                    continue

                # Plain format: "1. A", "1) B", "2. True"
                m = ANSWER_KEY_ENTRY_RE.match(e)
                if m:
                    key[int(m.group(1))] = _normalize_key_answer(m.group(2))
            break

    return key, key_start
PTS_RE = re.compile(r'[\(\[]\s*(\d+)\s*(?:pts?|points?)\s*[\)\]]', re.IGNORECASE)

# Lines that are exam scaffolding, not question content — flush current question and skip
SECTION_HDR_RE = re.compile(r'^#{1,4}\s+.+')                    # ## Section Title
SEPARATOR_RE   = re.compile(r'^[_\-=*]{3,}\s*$')               # ---, ___, ***, ======= dividers
EXAM_NOISE_RE  = re.compile(
    r'^(?:circle|write|select|choose|indicate|fill\s+in|answer\s+all|'
    r'show\s+all\s+work|please\s+write|name\s*:|student\s+name|date\s*:|'
    r'section\s*:|print\s+name|signature\s*:)',
    re.IGNORECASE,
)


def detect_choice(line):
    """Parse a line as MC choice. Returns {letter, text, is_correct} or None."""
    s = line.strip()
    if not s:
        return None
    is_correct = s.startswith("*")
    if is_correct:
        s = s[1:].strip()
    for pat in CHOICE_RE:
        m = pat.match(s)
        if m:
            return {"letter": m.group(1).upper(), "text": m.group(2).strip(), "is_correct": is_correct}
    for pat in CHOICE_NUM_RE:
        m = pat.match(s)
        if m:
            letter = chr(64 + int(m.group(1)))  # 1→A, 2→B, 3→C, 4→D
            return {"letter": letter, "text": m.group(2).strip(), "is_correct": is_correct}
    return None


def is_true_false_marker(line):
    """Check if a line is a True/False indicator."""
    s = line.strip()
    for pat in TF_RE:
        if pat.match(s):
            return True
    # Simple T/F on its own line
    if s.lower() in ("true / false", "true/false", "true or false", "t / f", "t/f"):
        return True
    return False


_MULTI_SELECT_STEM_RE = re.compile(
    r'\b(select\s+all|choose\s+all|check\s+all|mark\s+all|circle\s+all'
    r'|all\s+that\s+apply|all\s+of\s+the\s+above\s+that\s+apply'
    r'|which\s+(?:of\s+the\s+following\s+)?(?:statements?\s+)?are\s+(?:true|correct)'
    r'|may\s+have\s+more\s+than\s+one\s+(?:correct\s+)?answer'
    r'|more\s+than\s+one\s+(?:answer\s+)?(?:is\s+)?correct)\b',
    re.IGNORECASE,
)


def detect_question_type(stem, choices, code_block, tf_detected=False):
    """Infer question type from content."""
    # MC choices take priority even if there's also a code block
    # (common pattern: code block + "what does this output? A) ... B) ...")
    if choices:
        texts = {c["text"].strip().lower() for c in choices}
        if texts == {"true", "false"} or texts <= {"true", "false", "t", "f"}:
            return "true_false"
        if _MULTI_SELECT_STEM_RE.search(stem):
            return "multi_select"
        return "mc"
    # T/F detection from stem text
    if tf_detected:
        return "true_false"
    tf_stem = re.compile(
        r'(?:^|\b)(?:True\s*/\s*False|True\s+or\s+False|T\s*/\s*F)\b', re.IGNORECASE
    )
    if tf_stem.search(stem):
        return "true_false"
    if BLANK_RE.search(stem):
        return "fill_blank"
    if code_block:
        return "code_listing"
    return "short_answer"


# ── Main parser ─────────────────────────────────────────────────────────────

Q_START_RE = [
    re.compile(r'^(\d+)\.\s+(.+)', re.DOTALL),
    re.compile(r'^(\d+)\)\s+(.+)', re.DOTALL),
    re.compile(r'^[Qq](?:uestion)?\s*(\d+)[.:]\s*(.+)', re.DOTALL),
    re.compile(r'^\*\*(\d+)\.\*\*\s*(.+)', re.DOTALL),          # **1.** bold markdown
    re.compile(r'^\*\*(\d+)\)\*\*\s*(.+)', re.DOTALL),          # **1)** bold markdown
    re.compile(r'^#(\d+)[.:]\s*(.+)', re.DOTALL),
]


def parse_markdown_exam(md_text, source_name=""):
    """Parse pandoc markdown output into structured questions."""
    lines = md_text.split("\n")
    questions = []

    # Pre-scan for a standalone answer key section
    answer_key, key_start = extract_answer_key(lines)
    # Only parse up to the answer key header so its lines aren't treated as questions
    if key_start >= 0:
        lines = lines[:key_start]

    current_q = None
    stem_lines = []
    choices = []
    code_lines = []
    code_lang = "asm"
    in_code = False
    correct_answer = None
    tf_detected = False
    section_type = None   # type hint from last section header (e.g. 'true_false', 'mc')

    def flush():
        nonlocal current_q, stem_lines, choices, code_lines, in_code, correct_answer, tf_detected, code_lang, section_type
        if current_q is None:
            return

        stem = "\n".join(stem_lines).strip()
        code_block = "\n".join(code_lines).strip() if code_lines else ""

        # Collect all starred choices before stripping the flag
        starred_letters = [ch["letter"] for ch in choices if ch.get("is_correct")]

        # Clean up correct answer from starred choices
        if not correct_answer:
            for ch in choices:
                if ch.pop("is_correct", False):
                    correct_answer = ch["letter"]
        else:
            for ch in choices:
                ch.pop("is_correct", None)

        # Remove is_correct flag from all choices
        for ch in choices:
            ch.pop("is_correct", None)

        # Answer key overrides inline answers (or fills gaps where none was found)
        qnum = current_q.get("number")
        if qnum and qnum in answer_key:
            correct_answer = answer_key[qnum]

        # Detect type
        qtype = detect_question_type(stem, choices, code_block, tf_detected=tf_detected)

        # If content-detection gives short_answer, let the section header be the tiebreaker
        # multi_select requires choices, so don't apply it to choice-less questions
        if qtype == "short_answer" and section_type and section_type != "multi_select":
            qtype = section_type

        # If MC but section says "circle all", upgrade to multi_select
        if qtype == "mc" and section_type == "multi_select":
            qtype = "multi_select"

        # Multiple starred choices in the source doc → must be multi_select
        if qtype == "mc" and len(starred_letters) > 1:
            qtype = "multi_select"
            correct_answer = ",".join(sorted(set(starred_letters)))

        # Comma-separated answer (from key file) with choices → multi_select
        if qtype == "mc" and correct_answer and "," in str(correct_answer):
            qtype = "multi_select"

        # Check for essay hint: "explain", "describe", "discuss", "implement" + no choices
        essay_words = re.compile(
            r'\b(explain|describe|discuss|compare|contrast|analyze|evaluate|justify|implement)\b',
            re.IGNORECASE
        )
        if qtype == "short_answer" and essay_words.search(stem) and len(stem) > 60:
            qtype = "essay"

        # Extract blanks
        blanks = []
        if qtype == "fill_blank":
            blanks = ["" for _ in BLANK_RE.findall(stem)]

        # Auto-detect points
        pts = 0
        m = PTS_RE.search(stem)
        if m:
            pts = int(m.group(1))

        current_q.update({
            "stem": stem,
            "type": qtype,
            "choices": choices if qtype in ("mc", "multi_select") else [],
            "correct_answer": correct_answer or "",
            "blanks": blanks,
            "code_block": code_block,
            "code_language": code_lang if code_block else "asm",
            "points": pts,
        })

        # T/F: set correct_answer format
        if qtype == "true_false" and correct_answer:
            ca = correct_answer.strip().lower()
            if ca in ("t", "true"):
                current_q["correct_answer"] = "True"
            elif ca in ("f", "false"):
                current_q["correct_answer"] = "False"

        questions.append(current_q)

        # Reset
        current_q = None
        stem_lines = []
        choices = []
        code_lines = []
        code_lang = "asm"
        in_code = False
        correct_answer = None
        tf_detected = False

    for line in lines:
        # Code fence handling
        if in_code:
            if line.strip().startswith("```"):
                in_code = False
            else:
                code_lines.append(line)
            continue

        # Normalize pandoc artifacts: strip blockquote markers and unescape chars
        line = re.sub(r'^(?:> ?)+', '', line)
        line = re.sub(r'\\([)\[\]\'"\\*#\-_])', r'\1', line)

        if line.strip().startswith("```"):
            in_code = True
            # Extract language hint
            lang_match = re.match(r'^```\s*(\w+)', line.strip())
            if lang_match:
                lang = lang_match.group(1).lower()
                # Map common variants to our asm default
                if lang in ("asm", "nasm", "gas", "x86", "assembly", "s"):
                    code_lang = "asm"
                else:
                    code_lang = lang
            continue

        # Check for new question
        matched = False
        for pat in Q_START_RE:
            m = pat.match(line)
            if m:
                flush()
                current_q = new_question(
                    number=int(m.group(1)),
                    source=source_name,
                    semester=source_name,
                )
                first_text = m.group(2).strip()

                # Check if first text is a choice (rare)
                ch = detect_choice(first_text)
                if ch:
                    choices.append(ch)
                else:
                    stem_lines.append(first_text)
                matched = True
                break

        if matched:
            continue

        # Section scaffolding — handle before the current_q guard so section_type
        # is updated even when we're between questions (current_q is None).
        stripped = line.strip()
        if SECTION_HDR_RE.match(stripped):
            flush()
            hl = stripped.lower()
            if "true" in hl and "false" in hl:
                section_type = "true_false"
            elif "multiple choice" in hl or "multiple-choice" in hl:
                section_type = "mc"
            elif "fill" in hl and ("blank" in hl or "in" in hl):
                section_type = "fill_blank"
            elif "short answer" in hl or "short-answer" in hl:
                section_type = "short_answer"
            elif "essay" in hl:
                section_type = "essay"
            else:
                section_type = None
            continue
        # "Circle all answers that are correct" → multi_select section
        if MULTI_SELECT_INSTR_RE.match(stripped):
            flush()
            section_type = "multi_select"
            continue
        if SEPARATOR_RE.match(stripped):
            continue  # omit separator lines; don't end the current question
        if EXAM_NOISE_RE.match(stripped):
            flush()
            continue

        if current_q is None:
            continue

        # Check for answer line
        m = ANSWER_RE.match(line)
        if m:
            correct_answer = m.group(1).strip()
            continue

        # Check for T/F marker
        if is_true_false_marker(line):
            tf_detected = True
            continue

        # Check for choice
        ch = detect_choice(line)
        if ch:
            choices.append(ch)
            continue

        # Otherwise it's stem text
        stem_lines.append(line)

    flush()
    return questions


def parse_docx(filepath, source_name=""):
    """Full pipeline: docx → markdown → structured questions."""
    md = docx_to_markdown(filepath)
    return parse_markdown_exam(md, source_name=source_name)


# ════════════════════════════════════════════════════════════════════════════
# PDF GENERATION
# ════════════════════════════════════════════════════════════════════════════

class BlankLines(Flowable):
    """Draws N horizontal lines for essay/short answer space."""
    def __init__(self, count=5, width=468, line_height=24):
        super().__init__()
        self.count = count
        self._width = width
        self.line_height = line_height
        self.width = width
        self.height = count * line_height

    def draw(self):
        self.canv.setStrokeColor(HexColor("#CCCCCC"))
        self.canv.setLineWidth(0.5)
        for i in range(self.count):
            y = self.height - (i + 1) * self.line_height
            self.canv.line(0, y, self._width, y)


class CodeBlock(Flowable):
    """Renders a code block with monospace font and light background."""
    def __init__(self, code, width=468, font_size=9):
        super().__init__()
        self.code = code
        self._width = width
        self.font_size = font_size
        self.line_height = font_size * 1.5
        self.code_lines = code.split("\n")
        self.padding = 8
        self.width = width
        self.height = len(self.code_lines) * self.line_height + self.padding * 2

    def draw(self):
        # Background
        self.canv.setFillColor(HexColor("#F0F0F0"))
        self.canv.setStrokeColor(HexColor("#CCCCCC"))
        self.canv.setLineWidth(0.5)
        self.canv.roundRect(0, 0, self._width, self.height, 4, fill=1, stroke=1)

        # Code text
        self.canv.setFillColor(HexColor("#1a1a2e"))
        self.canv.setFont("Courier", self.font_size)
        y = self.height - self.padding - self.font_size
        for line in self.code_lines:
            self.canv.drawString(self.padding + 4, y, line)
            y -= self.line_height


def esc(text):
    """Escape XML special chars for reportlab Paragraph."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _inline_format(raw):
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', raw)
    t = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<i>\1</i>', t)
    t = re.sub(r'`(.+?)`', r'<font face="Courier" size="10">\1</font>', t)
    t = re.sub(r'(?:\\_){3,}', '_______________', t)
    t = re.sub(r'_{3,}', '_______________', t)
    return t


_INDENT_CACHE: dict = {}

def _indented_style(base_style, extra_pts):
    key = (id(base_style), extra_pts)
    if key not in _INDENT_CACHE:
        _INDENT_CACHE[key] = ParagraphStyle(
            f"_ind_{id(base_style)}_{extra_pts}",
            parent=base_style,
            leftIndent=base_style.leftIndent + extra_pts,
        )
    return _INDENT_CACHE[key]


_LIST_MARKER_RE = re.compile(r'^[-*•]|\d+[.)]')

def _group_looks_like_code(lines):
    """Return True if a group of lines should be rendered as a code block.

    Criteria: more than one line, at least one has leading whitespace, and the
    indented lines don't all look like markdown list items.
    """
    non_empty = [l for l in lines if l.strip()]
    if len(non_empty) < 2:
        return False
    indented = [l for l in non_empty if l != l.lstrip()]
    if not indented:
        return False
    # If every indented line starts with a list marker it's a bullet list, not code
    if all(_LIST_MARKER_RE.match(l.lstrip()) for l in indented):
        return False
    return True


def stem_to_paragraphs(stem, style, code_style_width=468, prefix=""):
    """Convert markdown stem to reportlab flowables.

    Fenced code blocks (```...```) → CodeBlock.
    Groups of lines that look like code (indented, non-list) → CodeBlock.
    Bullet-list indented lines → Paragraphs with leftIndent.
    Everything else → Paragraph per logical paragraph.

    prefix: if provided, prepended to the first Paragraph with a hanging indent
    so wrapped lines align under the text rather than the number.
    """
    elements = []
    _pending_prefix = [prefix]  # consumed on the first Paragraph produced

    def _make_para(text, s):
        if _pending_prefix[0]:
            p = _pending_prefix[0]
            _pending_prefix[0] = ""
            indent = getattr(s, 'leftIndent', 20) or 20
            hung = ParagraphStyle(
                f"_Hang_{id(s)}", parent=s,
                firstLineIndent=-indent,
            )
            return Paragraph(p + text, hung)
        return Paragraph(text, s)

    blocks = re.split(r'(```[\s\S]*?```)', stem)

    for block in blocks:
        if not block.strip():
            continue

        if block.startswith("```") and block.endswith("```"):
            inner = block[3:]
            if inner.endswith("```"):
                inner = inner[:-3]
            lines = inner.split("\n")
            if lines and re.match(r'^\w+$', lines[0].strip()):
                lines = lines[1:]
            code_text = "\n".join(lines).strip()
            if code_text:
                elements.append(Spacer(1, 4))
                elements.append(CodeBlock(code_text, width=code_style_width))
                elements.append(Spacer(1, 4))
        else:
            raw_lines = block.split("\n")
            group: list[str] = []

            def flush_group():
                if not group:
                    return
                if _group_looks_like_code(group):
                    elements.append(Spacer(1, 4))
                    elements.append(CodeBlock("\n".join(group), width=code_style_width))
                    elements.append(Spacer(1, 4))
                else:
                    for line in group:
                        expanded = line.expandtabs(4)
                        leading = len(expanded) - len(expanded.lstrip())
                        indent_pts = (leading // 4) * 14
                        formatted = _inline_format(esc(expanded.lstrip()))
                        s = _indented_style(style, indent_pts) if indent_pts else style
                        elements.append(_make_para(formatted, s))

            for line in raw_lines:
                if line.strip():
                    group.append(line)
                else:
                    flush_group()
                    group = []
                    elements.append(Spacer(1, 4))

            flush_group()

    return elements


def frontmatter_to_flowables(markdown_text, content_width, styles):
    """Convert front matter markdown to reportlab flowables.

    Supports:
    - Markdown tables (pipe-delimited)
    - Code blocks (``` fenced)
    - Headings (# ## ###)
    - Bold, italic, inline code
    - Images: ![alt](path) — local file paths or base64
    - Page breaks: ---pagebreak--- on its own line
    - Horizontal rules: --- on its own line
    - Figure captions: *Figure N: caption* after images
    """
    if not markdown_text or not markdown_text.strip():
        return []

    elements = []
    lines = markdown_text.split("\n")
    i = 0

    s_h1 = ParagraphStyle("FMH1", parent=styles["Heading1"], fontSize=16, spaceBefore=12, spaceAfter=6)
    s_h2 = ParagraphStyle("FMH2", parent=styles["Heading2"], fontSize=14, spaceBefore=10, spaceAfter=5)
    s_h3 = ParagraphStyle("FMH3", parent=styles["Heading3"], fontSize=12, spaceBefore=8, spaceAfter=4)
    s_body = ParagraphStyle("FMBody", parent=styles["Normal"], fontSize=11, spaceAfter=4, leading=14)
    s_caption = ParagraphStyle("FMCaption", parent=styles["Normal"], fontSize=10, spaceAfter=8,
                               alignment=TA_CENTER, italic=True, textColor=HexColor("#555555"))
    s_tbl_header = ParagraphStyle("FMTblH", parent=styles["Normal"], fontSize=10, leading=12,
                                  fontName="Helvetica-Bold")
    s_tbl_cell = ParagraphStyle("FMTblC", parent=styles["Normal"], fontSize=10, leading=12)

    def inline_format(text):
        """Apply inline markdown formatting."""
        t = esc(text)
        t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
        t = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<i>\1</i>', t)
        t = re.sub(r'`(.+?)`', r'<font face="Courier" size="9">\1</font>', t)
        return t

    def parse_table(start_idx):
        """Parse a markdown pipe table starting at start_idx. Returns (flowable, end_idx)."""
        rows = []
        idx = start_idx
        has_separator = False

        while idx < len(lines):
            line = lines[idx].strip()
            if not line.startswith("|"):
                break
            # Check for separator row (|---|---|)
            if re.match(r'^\|[\s\-:]+\|', line):
                has_separator = True
                idx += 1
                continue
            cells = [c.strip() for c in line.split("|")[1:-1]]  # strip outer pipes
            rows.append(cells)
            idx += 1

        if not rows:
            return None, start_idx

        # Build table
        max_cols = max(len(r) for r in rows)
        # Pad rows to same length
        for r in rows:
            while len(r) < max_cols:
                r.append("")

        # First row is header if separator follows
        table_data = []
        for ri, row in enumerate(rows):
            style = s_tbl_header if ri == 0 and has_separator else s_tbl_cell
            table_data.append([Paragraph(inline_format(cell), style) for cell in row])

        col_width = content_width / max_cols
        col_widths = [col_width] * max_cols

        tbl = Table(table_data, colWidths=col_widths)
        tbl_style = [
            ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#CCCCCC")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]
        if has_separator and len(table_data) > 0:
            tbl_style.append(("BACKGROUND", (0, 0), (-1, 0), HexColor("#E8E8E8")))
            tbl_style.append(("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"))

        tbl.setStyle(TableStyle(tbl_style))
        return tbl, idx

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Page break
        if stripped.lower() in ("---pagebreak---", "---page break---", "<!-- pagebreak -->"):
            elements.append(PageBreak())
            i += 1
            continue

        # Horizontal rule
        if re.match(r'^-{3,}$', stripped) or re.match(r'^\*{3,}$', stripped):
            elements.append(Spacer(1, 6))
            elements.append(HRFlowable(width="100%", thickness=1, color=HexColor("#999999")))
            elements.append(Spacer(1, 6))
            i += 1
            continue

        # Code block
        if stripped.startswith("```"):
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # skip closing ```
            if code_lines:
                elements.append(Spacer(1, 4))
                elements.append(CodeBlock("\n".join(code_lines), width=int(content_width)))
                elements.append(Spacer(1, 4))
            continue

        # Table
        if stripped.startswith("|") and "|" in stripped[1:]:
            tbl, new_i = parse_table(i)
            if tbl:
                elements.append(Spacer(1, 6))
                elements.append(tbl)
                elements.append(Spacer(1, 6))
                i = new_i
                continue

        # Image: ![alt](path)
        img_match = re.match(r'^!\[([^\]]*)\]\(([^)]+)\)', stripped)
        if img_match:
            alt_text = img_match.group(1)
            img_path = img_match.group(2)
            try:
                # Support both absolute paths and paths relative to uploads
                if not os.path.isabs(img_path):
                    img_path = str(UPLOAD_DIR / img_path)
                if os.path.exists(img_path):
                    img = RLImage(img_path)
                    # Scale to fit content width while preserving aspect ratio
                    iw, ih = img.drawWidth, img.drawHeight
                    if iw > content_width:
                        scale = content_width / iw
                        img.drawWidth = content_width
                        img.drawHeight = ih * scale
                    elements.append(Spacer(1, 6))
                    elements.append(img)
                    # Check next line for caption (*Figure N: ...*)
                    if i + 1 < len(lines):
                        cap = lines[i + 1].strip()
                        if cap.startswith("*") and cap.endswith("*"):
                            elements.append(Paragraph(inline_format(cap[1:-1]), s_caption))
                            i += 1
                    elements.append(Spacer(1, 6))
                else:
                    elements.append(Paragraph(f"<i>[Image not found: {esc(img_path)}]</i>", s_body))
            except Exception as e:
                elements.append(Paragraph(f"<i>[Image error: {esc(str(e))}]</i>", s_body))
            i += 1
            continue

        # Headings
        if stripped.startswith("### "):
            elements.append(Paragraph(inline_format(stripped[4:]), s_h3))
            i += 1
            continue
        if stripped.startswith("## "):
            elements.append(Paragraph(inline_format(stripped[3:]), s_h2))
            i += 1
            continue
        if stripped.startswith("# "):
            elements.append(Paragraph(inline_format(stripped[2:]), s_h1))
            i += 1
            continue

        # Empty line
        if not stripped:
            elements.append(Spacer(1, 4))
            i += 1
            continue

        # Regular paragraph
        elements.append(Paragraph(inline_format(stripped), s_body))
        i += 1

    return elements


def generate_exam_pdf(questions, config):
    """Generate formatted PDF exam from selected questions."""
    filename = config.get("filename", "exam.pdf")
    title = config.get("title", "Exam")
    course = config.get("course", "")
    date_str = config.get("date", "")
    instructions = config.get("instructions", "")
    show_points = config.get("show_points", True)
    shuffle_choices = config.get("shuffle_choices", False)
    generate_key = config.get("generate_key", False)
    front_matter = config.get("front_matter", "")
    front_matter_own_page = config.get("front_matter_own_page", True)
    total_points = sum(q.get("points", 0) for q in questions)

    exam_qs = copy.deepcopy(questions)
    answer_key = []

    # Shuffle MC / multi_select choices
    if shuffle_choices:
        for q in exam_qs:
            if q["type"] in ("mc", "multi_select") and q.get("choices"):
                if q["type"] == "multi_select":
                    # Track multiple correct letters by text
                    correct_letters = set(q.get("correct_answer", "").replace(" ", "").split(","))
                    correct_texts = {ch["text"] for ch in q["choices"] if ch["letter"] in correct_letters}
                    random.shuffle(q["choices"])
                    for i, ch in enumerate(q["choices"]):
                        ch["letter"] = chr(65 + i)
                    q["correct_answer"] = ",".join(sorted(
                        ch["letter"] for ch in q["choices"] if ch["text"] in correct_texts
                    ))
                else:
                    correct_letter = q.get("correct_answer", "")
                    correct_text = next(
                        (ch["text"] for ch in q["choices"] if ch["letter"] == correct_letter), None
                    )
                    random.shuffle(q["choices"])
                    for i, ch in enumerate(q["choices"]):
                        ch["letter"] = chr(65 + i)
                    if correct_text:
                        for ch in q["choices"]:
                            if ch["text"] == correct_text:
                                q["correct_answer"] = ch["letter"]
                                break

    # Build answer key
    for i, q in enumerate(exam_qs, 1):
        ca = q.get("correct_answer", "")
        if ca:
            if q["type"] in ("mc", "multi_select"):
                answer_key.append({"num": i, "answer": ca, "type": "mc"})
            elif q["type"] == "true_false":
                answer_key.append({"num": i, "answer": ca, "type": "tf"})
            elif q["type"] == "fill_blank" and q.get("blanks"):
                answer_key.append({"num": i, "answer": ", ".join(q["blanks"]) if any(q["blanks"]) else ca, "type": "fill"})

    filepath = EXPORT_DIR / filename
    content_width = 6.5 * inch  # 8.5 - 2 margins

    doc = SimpleDocTemplate(
        str(filepath), pagesize=letter,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
        leftMargin=1 * inch, rightMargin=1 * inch
    )

    styles = getSampleStyleSheet()
    s_title = ParagraphStyle("T", parent=styles["Title"], fontSize=18, spaceAfter=6, alignment=TA_CENTER)
    s_sub = ParagraphStyle("Sub", parent=styles["Normal"], fontSize=12, spaceAfter=4, alignment=TA_CENTER)
    s_info = ParagraphStyle("Info", parent=styles["Normal"], fontSize=11, spaceAfter=2)
    s_instr = ParagraphStyle("Instr", parent=styles["Normal"], fontSize=10, spaceAfter=12, spaceBefore=8,
                             leftIndent=12, rightIndent=12, italic=True)
    s_qnum = ParagraphStyle("QNum", parent=styles["Normal"], fontSize=11, spaceBefore=14, spaceAfter=4)
    s_stem = ParagraphStyle("Stem", parent=styles["Normal"], fontSize=11, spaceAfter=3, leftIndent=20)
    s_choice = ParagraphStyle("Ch", parent=styles["Normal"], fontSize=11, spaceAfter=2, leftIndent=36)
    s_tf = ParagraphStyle("TF", parent=styles["Normal"], fontSize=11, spaceAfter=2, leftIndent=36)
    s_key_title = ParagraphStyle("KT", parent=styles["Heading2"], fontSize=14, spaceAfter=10, alignment=TA_CENTER)
    s_key = ParagraphStyle("KE", parent=styles["Normal"], fontSize=11, spaceAfter=2, leftIndent=36, fontName="Courier")

    story = []

    # ── Header ──────────────────────────────────────────────────
    story.append(Paragraph(esc(title), s_title))
    if course:
        story.append(Paragraph(esc(course), s_sub))
    if date_str:
        story.append(Paragraph(esc(date_str), s_sub))
    story.append(Spacer(1, 8))

    name_line = "Name: ________________________________________"
    if show_points and total_points > 0:
        name_line += f"&nbsp;&nbsp;&nbsp;&nbsp;Score: ______ / {total_points}"
    story.append(Paragraph(name_line, s_info))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
    story.append(Spacer(1, 6))

    if instructions:
        story.append(Paragraph(f"<i>{esc(instructions)}</i>", s_instr))
        story.append(Spacer(1, 4))

    # ── Front Matter ────────────────────────────────────────────
    if front_matter and front_matter.strip():
        fm_elems = frontmatter_to_flowables(front_matter, content_width, styles)
        if fm_elems:
            story.extend(fm_elems)
            if front_matter_own_page:
                story.append(PageBreak())
            else:
                story.append(Spacer(1, 12))
                story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
                story.append(Spacer(1, 8))

    # ── Questions ───────────────────────────────────────────────
    for i, q in enumerate(exam_qs, 1):
        elems = []
        pts = ""
        if show_points and q.get("points", 0) > 0:
            pts = f" <i>({q['points']} pts)</i>"

        qtype = q.get("type", "short_answer")
        type_label = {
            "mc": "", "multi_select": "[Circle all that apply]",
            "true_false": "[T/F]", "fill_blank": "[Fill in the Blank]",
            "short_answer": "", "essay": "[Essay]", "code_listing": "",
        }.get(qtype, "")

        if type_label:
            type_label = f' <font size="9" color="#666666">{type_label}</font>'

        # Question number + stem on the same line; wrapped lines indent under text
        num_prefix = f"<b>{i}.</b>{pts}{type_label} "
        elems.append(Spacer(1, 14))  # spacing that was on s_qnum spaceBefore
        stem_elems = stem_to_paragraphs(
            q["stem"], s_stem,
            code_style_width=int(content_width - 20),
            prefix=num_prefix,
        )
        elems.extend(stem_elems)

        # Code block (dedicated field, separate from stem)
        if q.get("code_block"):
            elems.append(Spacer(1, 4))
            elems.append(CodeBlock(q["code_block"], width=int(content_width - 20)))
            elems.append(Spacer(1, 4))

        # Type-specific rendering
        if qtype in ("mc", "multi_select") and q.get("choices"):
            elems.append(Spacer(1, 4))
            for ch in q["choices"]:
                elems.append(Paragraph(
                    f"<b>{ch['letter']}.</b>&nbsp;&nbsp;{esc(ch['text'])}", s_choice
                ))

        elif qtype == "true_false":
            elems.append(Spacer(1, 4))
            elems.append(Paragraph("<b>True</b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>False</b>", s_tf))

        elif qtype == "fill_blank":
            pass  # blanks are rendered inline via underlines in the stem

        # For answer-space types, keep the question itself together then add
        # BlankLines outside KeepTogether so a large blank area can start on
        # the next page without crashing if it exceeds the frame height.
        blank_lines = None
        if qtype == "essay":
            blank_lines = min(q.get("essay_lines", 10), 25)
        elif qtype == "short_answer":
            blank_lines = min(q.get("essay_lines", 3), 25)

        elems.append(Spacer(1, 10))
        story.append(KeepTogether(elems))

        if blank_lines:
            story.append(Spacer(1, 6))
            story.append(BlankLines(count=blank_lines, width=int(content_width)))
            story.append(Spacer(1, 10))

    # ── Answer Key ──────────────────────────────────────────────
    if generate_key and answer_key:
        story.append(PageBreak())
        story.append(Paragraph("Answer Key", s_key_title))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
        story.append(Spacer(1, 10))
        for entry in answer_key:
            story.append(Paragraph(
                f"<b>{entry['num']}.</b>&nbsp;&nbsp;{esc(entry['answer'])}", s_key
            ))

    doc.build(story)
    return filepath


# ════════════════════════════════════════════════════════════════════════════
# API ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "version": 2})


@app.route("/api/questions")
def get_questions():
    return jsonify(load_bank()["questions"])


@app.route("/api/questions/<qid>", methods=["PUT"])
def update_question(qid):
    bank = load_bank()
    data = request.json
    for i, q in enumerate(bank["questions"]):
        if q["id"] == qid:
            bank["questions"][i].update(data)
            save_bank(bank)
            fields = ", ".join(data.keys())
            log_info(f"Question {qid[:8]}… updated fields: {fields}")
            return jsonify(bank["questions"][i])
    log_warn(f"Question update failed — ID not found: {qid}")
    return jsonify({"error": "Not found"}), 404


@app.route("/api/questions/<qid>", methods=["DELETE"])
def delete_question(qid):
    bank = load_bank()
    bank["questions"] = [q for q in bank["questions"] if q["id"] != qid]
    save_bank(bank)
    log_info(f"Question deleted: {qid[:8]}…")
    return jsonify({"status": "deleted"})


@app.route("/api/questions", methods=["POST"])
def add_question():
    """Manually add a new question."""
    data = request.json
    force = data.pop("force", False)
    q = new_question(**data)
    bank = load_bank()

    if not force and q.get("stem", "").strip():
        matches = find_duplicates_for(q["stem"], bank["questions"])
        if matches:
            return jsonify({
                "error": "duplicate",
                "message": "A similar question already exists. Pass force=true to add anyway.",
                "matches": matches,
            }), 409

    bank["questions"].append(q)
    save_bank(bank)
    log_success(f"Question created manually: type={q['type']}, topic='{q.get('topic', '')}', id={q['id'][:8]}…")
    return jsonify(q), 201


@app.route("/api/upload", methods=["POST"])
def upload_docx():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["file"]
    source = request.form.get("source", file.filename)
    dry_run = request.form.get("dry_run", "false").lower() == "true"

    if not file.filename.lower().endswith(".docx"):
        return jsonify({"error": "Only .docx files supported"}), 400

    filepath = UPLOAD_DIR / file.filename
    file.save(str(filepath))

    try:
        new_qs = parse_docx(str(filepath), source_name=source)
    except Exception as e:
        log_error(f"Docx parse failed for '{file.filename}': {e}")
        return jsonify({"error": f"Parse failed: {e}"}), 500

    if dry_run:
        log_info(f"Docx parsed (dry run): {len(new_qs)} questions from '{source}'")
        return jsonify({"status": "parsed", "questions": new_qs, "questions_parsed": len(new_qs)})

    bank = load_bank()

    duplicate_warnings = []
    for q in new_qs:
        if q.get("stem", "").strip():
            matches = find_duplicates_for(q["stem"], bank["questions"])
            if matches:
                duplicate_warnings.append({"imported_stem": q["stem"][:80], "matches": matches})

    bank["questions"].extend(new_qs)
    save_bank(bank)

    type_counts = {}
    for q in new_qs:
        t = q["type"]
        type_counts[t] = type_counts.get(t, 0) + 1

    summary = ", ".join(f"{v} {k}" for k, v in type_counts.items())
    log_success(f"Imported {len(new_qs)} questions from docx '{source}' ({summary}){f', {len(duplicate_warnings)} duplicate warnings' if duplicate_warnings else ''}")
    return jsonify({
        "status": "success",
        "questions_added": len(new_qs),
        "type_counts": type_counts,
        "total_questions": len(bank["questions"]),
        "questions": new_qs,
        "duplicate_warnings": duplicate_warnings,
    })


@app.route("/api/upload-markdown", methods=["POST"])
def upload_markdown():
    """Upload raw markdown text for parsing."""
    data = request.json
    md_text = data.get("markdown", "")
    source = data.get("source", "Manual Import")
    dry_run = data.get("dry_run", False)

    if not md_text.strip():
        log_warn("Markdown import attempted with empty content")
        return jsonify({"error": "Empty markdown"}), 400

    try:
        new_qs = parse_markdown_exam(md_text, source_name=source)
    except Exception as e:
        log_error(f"Markdown parse failed for source '{source}': {e}")
        return jsonify({"error": f"Parse failed: {e}"}), 500

    if dry_run:
        log_info(f"Markdown parsed (dry run): {len(new_qs)} questions from '{source}'")
        return jsonify({"status": "parsed", "questions": new_qs, "questions_parsed": len(new_qs)})

    bank = load_bank()

    duplicate_warnings = []
    for q in new_qs:
        if q.get("stem", "").strip():
            matches = find_duplicates_for(q["stem"], bank["questions"])
            if matches:
                duplicate_warnings.append({"imported_stem": q["stem"][:80], "matches": matches})

    bank["questions"].extend(new_qs)
    save_bank(bank)

    log_success(f"Imported {len(new_qs)} questions from markdown source '{source}'{f', {len(duplicate_warnings)} duplicate warnings' if duplicate_warnings else ''}")
    return jsonify({
        "status": "success",
        "questions_added": len(new_qs),
        "questions": new_qs,
        "duplicate_warnings": duplicate_warnings,
    })


@app.route("/api/commit-import", methods=["POST"])
def commit_import():
    """Commit a staged import — saves pre-parsed questions to the bank."""
    data = request.json
    new_qs = data.get("questions", [])
    if not new_qs:
        return jsonify({"error": "No questions provided"}), 400

    bank = load_bank()

    duplicate_warnings = []
    for q in new_qs:
        if q.get("stem", "").strip():
            matches = find_duplicates_for(q["stem"], bank["questions"])
            if matches:
                duplicate_warnings.append({"imported_stem": q["stem"][:80], "matches": matches})

    bank["questions"].extend(new_qs)
    save_bank(bank)

    source = new_qs[0].get("source", "unknown") if new_qs else "unknown"
    log_success(f"Committed import: {len(new_qs)} questions from '{source}'")
    return jsonify({
        "status": "success",
        "questions_added": len(new_qs),
        "duplicate_warnings": duplicate_warnings,
    })


@app.route("/api/upload-answer-key", methods=["POST"])
def upload_answer_key():
    """Apply a separate answer key file (.docx or .md) to questions already in the bank.

    Matches by source name (form field 'source') + question number.
    Returns the count of questions updated.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    source = request.form.get("source", "").strip()
    fname = file.filename.lower()

    # Parse the key file into markdown text
    if fname.endswith(".docx"):
        tmp = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
        file.save(tmp.name)
        try:
            md_text = docx_to_markdown(tmp.name)
        except Exception as e:
            return jsonify({"error": f"pandoc failed: {e}"}), 500
        finally:
            os.unlink(tmp.name)
    elif fname.endswith((".md", ".markdown", ".txt")):
        md_text = file.read().decode("utf-8", errors="replace")
    else:
        return jsonify({"error": "Unsupported file type. Use .docx or .md"}), 400

    lines = md_text.split("\n")
    key, _ = extract_answer_key(lines)

    # If no key section header found, try parsing the whole file as key entries
    if not key:
        for line in lines:
            m = ANSWER_KEY_ENTRY_RE.match(line.strip())
            if m:
                qnum = int(m.group(1))
                ans = m.group(2).strip()
                norm = {'t': 'True', 'f': 'False', 'true': 'True', 'false': 'False'}
                key[qnum] = norm.get(ans.lower(), ans.upper())

    if not key:
        log_warn(f"Answer key file '{file.filename}' contained no recognizable entries")
        return jsonify({"error": "No answer key entries found in file"}), 400

    fuzzy = request.form.get("fuzzy", "false").lower() in ("1", "true", "yes")
    fuzzy_threshold = float(request.form.get("fuzzy_threshold", "0.72"))

    bank = load_bank()
    updated = 0
    unmatched: list = []

    fuzzy_key_count = 0
    if fuzzy:
        # Fuzzy mode: re-parse the uploaded document as a full exam (stems + answers),
        # then for each parsed question find the closest bank question by stem similarity.
        # This handles version drift where question numbers changed but text is still similar.
        parsed = parse_markdown_exam(md_text, source_name=source or file.filename)
        key_questions = [q for q in parsed if q.get("correct_answer")]
        fuzzy_key_count = len(key_questions)

        pool = [
            q for q in bank["questions"]
            if not source or q.get("source", "").strip().lower() == source.lower()
        ]
        matched_ids: set = set()

        for kq in key_questions:
            kq_stem = kq.get("stem", "")
            if not kq_stem:
                continue
            best_score = 0.0
            best_q = None
            for candidate in pool:
                if candidate["id"] in matched_ids:
                    continue
                score = stem_similarity(kq_stem, candidate.get("stem", ""))
                if score > best_score:
                    best_score = score
                    best_q = candidate
            if best_q and best_score >= fuzzy_threshold:
                best_q["correct_answer"] = kq["correct_answer"]
                matched_ids.add(best_q["id"])
                updated += 1
            else:
                unmatched.append(kq.get("number") or kq_stem[:60])
    else:
        for q in bank["questions"]:
            if source and q.get("source", "").strip().lower() != source.lower():
                continue
            qnum = q.get("number")
            if qnum and qnum in key:
                q["correct_answer"] = key[qnum]
                updated += 1

    if updated:
        save_bank(bank)

    scope = f"source '{source}'" if source else "all sources"
    mode = f"fuzzy (threshold={fuzzy_threshold})" if fuzzy else "exact"
    log_success(f"Answer key '{file.filename}' applied [{mode}]: {updated} questions updated ({len(key)} key entries, {scope})")
    return jsonify({
        "status": "success",
        "key_entries": fuzzy_key_count if fuzzy else len(key),
        "questions_updated": updated,
        "unmatched_count": len(unmatched),
        "mode": mode,
    })


@app.route("/api/generate-pdf", methods=["POST"])
def generate_pdf():
    data = request.json
    qids = data.get("question_ids", [])
    config = data.get("config", {})

    bank = load_bank()
    id_map = {q["id"]: q for q in bank["questions"]}
    selected = [id_map[qid] for qid in qids if qid in id_map]

    if not selected:
        log_warn(f"PDF generation attempted with no valid question IDs ({len(qids)} requested)")
        return jsonify({"error": "No valid questions selected"}), 400

    try:
        fp = generate_exam_pdf(selected, config)
        log_success(f"PDF generated: '{config.get('filename', 'exam.pdf')}' ({len(selected)} questions)")
        return send_file(str(fp), as_attachment=True, download_name=config.get("filename", "exam.pdf"))
    except Exception as e:
        log_error(f"PDF generation failed for '{config.get('filename', 'exam.pdf')}': {e}")
        return jsonify({"error": f"PDF failed: {e}"}), 500


@app.route("/api/stats")
def get_stats():
    bank = load_bank()
    qs = bank["questions"]
    types = {}
    diffs = {}
    for q in qs:
        t = q.get("type", "short_answer")
        types[t] = types.get(t, 0) + 1
        d = q.get("difficulty", "medium")
        diffs[d] = diffs.get(d, 0) + 1

    return jsonify({
        "total": len(qs),
        "types": types,
        "difficulties": diffs,
        "topics": sorted(set(q.get("topic", "") for q in qs if q.get("topic"))),
        "sources": sorted(set(q.get("source", "") for q in qs if q.get("source"))),
        "lectures": sorted(set(q.get("lecture", "") for q in qs if q.get("lecture"))),
    })


@app.route("/api/duplicates")
def get_duplicates():
    threshold = float(request.args.get("threshold", 0.85))
    bank = load_bank()
    pairs = find_all_duplicates(bank["questions"], threshold)
    return jsonify({"threshold": threshold, "pairs": pairs, "count": len(pairs)})


@app.route("/api/check-duplicate", methods=["POST"])
def check_duplicate():
    data = request.json
    stem = data.get("stem", "").strip()
    threshold = float(data.get("threshold", 0.85))
    exclude_id = data.get("exclude_id")  # skip a question's own entry when editing

    if not stem:
        return jsonify({"error": "stem is required"}), 400

    bank = load_bank()
    candidates = [q for q in bank["questions"] if q["id"] != exclude_id]
    matches = find_duplicates_for(stem, candidates, threshold)
    return jsonify({"matches": matches, "count": len(matches)})


@app.route("/api/banks")
def get_banks_route():
    state = load_banks()
    enriched = []
    for b in state["banks"]:
        bf = get_bank_file(b["id"])
        count = 0
        if bf.exists():
            try:
                count = len(json.loads(bf.read_text()).get("questions", []))
            except Exception:
                pass
        enriched.append({**b, "question_count": count})
    return jsonify({"banks": enriched, "active": state.get("active", _active_bank_id)})


@app.route("/api/banks", methods=["POST"])
def create_bank_route():
    data = request.json
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    bank_id = re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_') or "bank"
    state = load_banks()
    existing = {b["id"] for b in state["banks"]}
    base_id, n = bank_id, 2
    while bank_id in existing:
        bank_id = f"{base_id}_{n}"; n += 1

    new_b = {"id": bank_id, "name": name, "created": datetime.now().isoformat()}
    state["banks"].append(new_b)
    save_banks(state)

    empty = {"questions": [], "snippets": [], "exams": [],
             "metadata": {"created": datetime.now().isoformat(), "version": 2}}
    with open(get_bank_file(bank_id), "w") as f:
        json.dump(empty, f, indent=2)

    log_success(f"Bank created: '{name}' ({bank_id})")
    return jsonify({**new_b, "question_count": 0}), 201


@app.route("/api/banks/active", methods=["PUT"])
def set_active_bank():
    global _active_bank_id
    data = request.json
    bank_id = (data.get("id") or "").strip()
    if not bank_id:
        return jsonify({"error": "id is required"}), 400
    state = load_banks()
    if not any(b["id"] == bank_id for b in state["banks"]):
        return jsonify({"error": "Bank not found"}), 404
    _active_bank_id = bank_id
    state["active"] = bank_id
    save_banks(state)
    log_info(f"Active bank → {bank_id}")
    return jsonify({"active": bank_id})


@app.route("/api/banks/<bank_id>", methods=["DELETE"])
def delete_bank_route(bank_id):
    if bank_id == _active_bank_id:
        return jsonify({"error": "Cannot delete the active bank. Switch to another bank first."}), 400
    state = load_banks()
    state["banks"] = [b for b in state["banks"] if b["id"] != bank_id]
    save_banks(state)
    bf = get_bank_file(bank_id)
    if bf.exists():
        bf.unlink()
    log_info(f"Bank deleted: {bank_id}")
    return jsonify({"status": "deleted"})


@app.route("/api/exams")
def get_exams():
    bank = load_bank()
    return jsonify(bank.get("exams", []))


@app.route("/api/exams", methods=["POST"])
def save_exam():
    data = request.json
    exam = {
        "id": str(uuid.uuid4()),
        "title": data.get("title", "Untitled Exam"),
        "question_ids": data.get("question_ids", []),
        "config": data.get("config", {}),
        "created": datetime.now().isoformat(),
    }
    bank = load_bank()
    bank["exams"].append(exam)
    save_bank(bank)
    log_success(f"Exam archived: '{exam['title']}' ({len(exam['question_ids'])} questions)")
    return jsonify(exam), 201


@app.route("/api/exams/<eid>", methods=["DELETE"])
def delete_exam(eid):
    bank = load_bank()
    bank["exams"] = [e for e in bank.get("exams", []) if e["id"] != eid]
    save_bank(bank)
    return jsonify({"status": "deleted"})


@app.route("/api/export-bank")
def export_bank():
    bf = get_bank_file()
    return send_file(str(bf), as_attachment=True, download_name=f"{_active_bank_id}.json")


@app.route("/api/import-bank", methods=["POST"])
def import_bank():
    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400
    data = json.load(request.files["file"])
    if "questions" not in data:
        return jsonify({"error": "Invalid format"}), 400
    save_bank(data)
    return jsonify({"status": "imported", "count": len(data["questions"])})


# ════════════════════════════════════════════════════════════════════════════
# SNIPPET ROUTES (Front Matter Library)
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/snippets")
def get_snippets():
    bank = load_bank()
    return jsonify(bank.get("snippets", []))


@app.route("/api/snippets", methods=["POST"])
def create_snippet():
    data = request.json
    snippet = {
        "id": str(uuid.uuid4()),
        "title": data.get("title", "Untitled"),
        "category": data.get("category", "general"),
        "markdown": data.get("markdown", ""),
        "created": datetime.now().isoformat(),
    }
    bank = load_bank()
    bank["snippets"].append(snippet)
    save_bank(bank)
    return jsonify(snippet), 201


@app.route("/api/snippets/<sid>", methods=["PUT"])
def update_snippet(sid):
    bank = load_bank()
    data = request.json
    for i, s in enumerate(bank["snippets"]):
        if s["id"] == sid:
            bank["snippets"][i].update(data)
            save_bank(bank)
            return jsonify(bank["snippets"][i])
    return jsonify({"error": "Not found"}), 404


@app.route("/api/snippets/<sid>", methods=["DELETE"])
def delete_snippet(sid):
    bank = load_bank()
    bank["snippets"] = [s for s in bank["snippets"] if s["id"] != sid]
    save_bank(bank)
    return jsonify({"status": "deleted"})


@app.route("/api/upload-image", methods=["POST"])
def upload_image():
    """Upload an image file for use in front matter."""
    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400
    file = request.files["file"]
    ext = Path(file.filename).suffix.lower()
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".svg"):
        return jsonify({"error": "Unsupported image format"}), 400
    safe_name = re.sub(r'[^\w\-.]', '_', file.filename)
    filepath = UPLOAD_DIR / safe_name
    file.save(str(filepath))
    log_info(f"Image uploaded: {safe_name}")
    return jsonify({
        "status": "uploaded",
        "filename": safe_name,
        "path": str(filepath),
        "markdown_ref": f"![{Path(safe_name).stem}]({safe_name})",
    })


# ════════════════════════════════════════════════════════════════════════════
# BULK UPDATE
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/questions/bulk-delete", methods=["POST"])
def bulk_delete_questions():
    data = request.json
    ids = set(data.get("ids", []))
    if not ids:
        return jsonify({"error": "ids required"}), 400
    bank = load_bank()
    before = len(bank["questions"])
    bank["questions"] = [q for q in bank["questions"] if q["id"] not in ids]
    deleted = before - len(bank["questions"])
    save_bank(bank)
    log_info(f"Bulk deleted {deleted} questions")
    return jsonify({"deleted": deleted})


@app.route("/api/questions/bulk-update", methods=["POST"])
def bulk_update_questions():
    data = request.json
    ids = set(data.get("ids", []))
    fields = data.get("fields", {})
    if not ids or not fields:
        return jsonify({"error": "ids and fields required"}), 400
    bank = load_bank()
    updated = 0
    for q in bank["questions"]:
        if q["id"] in ids:
            q.update(fields)
            updated += 1
    save_bank(bank)
    log_info(f"Bulk updated {updated} questions: {', '.join(fields.keys())}")
    return jsonify({"updated": updated})


# ════════════════════════════════════════════════════════════════════════════
# TEMPLATES
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/templates")
def get_templates():
    return jsonify(load_bank().get("templates", []))


@app.route("/api/templates", methods=["POST"])
def create_template():
    data = request.json
    bank = load_bank()
    tmpl = {
        "id": str(uuid.uuid4()),
        "name": (data.get("name") or "Untitled Template").strip(),
        "config": data.get("config", {}),
        "front_matter": data.get("front_matter", ""),
        "created": datetime.now().isoformat(),
    }
    bank.setdefault("templates", []).append(tmpl)
    save_bank(bank)
    log_success(f"Template saved: '{tmpl['name']}'")
    return jsonify(tmpl), 201


@app.route("/api/templates/<tid>", methods=["DELETE"])
def delete_template(tid):
    bank = load_bank()
    bank["templates"] = [t for t in bank.get("templates", []) if t["id"] != tid]
    save_bank(bank)
    return jsonify({"status": "deleted"})


# ════════════════════════════════════════════════════════════════════════════
# CSV EXPORT
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/export-csv")
def export_csv():
    import csv, io
    from flask import Response
    bank = load_bank()
    qs = bank["questions"]
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow([
        "id", "type", "stem", "correct_answer", "points",
        "topic", "difficulty", "lecture", "source", "bloom",
        "flagged", "tags", "objectives", "notes",
    ])
    for q in qs:
        writer.writerow([
            q.get("id", ""),
            q.get("type", ""),
            q.get("stem", ""),
            q.get("correct_answer", ""),
            q.get("points", 0),
            q.get("topic", ""),
            q.get("difficulty", ""),
            q.get("lecture", ""),
            q.get("source", ""),
            q.get("bloom", ""),
            "yes" if q.get("flagged") else "no",
            ", ".join(q.get("tags", [])),
            ", ".join(q.get("objectives", [])),
            q.get("notes", ""),
        ])
    out.seek(0)
    return Response(
        out.getvalue(), mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={_active_bank_id}.csv"},
    )


# ════════════════════════════════════════════════════════════════════════════
# QTI EXPORT (IMS QTI 2.1)
# ════════════════════════════════════════════════════════════════════════════

def _question_to_qti_xml(q: dict, idx: int) -> str:
    qid = f"item_{q.get('id', str(idx))[:12]}"
    title_raw = q.get("stem", "")[:60].replace('"', "'")
    stem_text = (q.get("stem") or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    qtype = q.get("type", "short_answer")
    pts = q.get("points") or 1

    if qtype in ("mc", "multi_select"):
        cardinality = "multiple" if qtype == "multi_select" else "single"
        correct_raw = q.get("correct_answer", "") or ""
        correct_letters = [l.strip() for l in correct_raw.split(",") if l.strip()]
        resp = f'<responseDeclaration identifier="RESPONSE" cardinality="{cardinality}" baseType="identifier">\n'
        if correct_letters:
            resp += '  <correctResponse>\n'
            for l in correct_letters:
                resp += f'    <value>choice_{l}</value>\n'
            resp += '  </correctResponse>\n'
        resp += '</responseDeclaration>'
        max_c = 1 if qtype == "mc" else len(q.get("choices") or [])
        choices_xml = "".join(
            f'  <simpleChoice identifier="choice_{ch["letter"]}">{ch["text"].replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")}</simpleChoice>\n'
            for ch in (q.get("choices") or [])
        )
        interaction = (
            f'<choiceInteraction responseIdentifier="RESPONSE" shuffle="false" maxChoices="{max_c}">\n'
            f'  <prompt>{stem_text}</prompt>\n'
            f'{choices_xml}</choiceInteraction>'
        )
    elif qtype == "true_false":
        correct = (q.get("correct_answer") or "").strip().lower()
        correct_id = "choice_true" if correct in ("true", "t") else "choice_false"
        resp = (
            f'<responseDeclaration identifier="RESPONSE" cardinality="single" baseType="identifier">\n'
            f'  <correctResponse><value>{correct_id}</value></correctResponse>\n'
            f'</responseDeclaration>'
        )
        interaction = (
            f'<choiceInteraction responseIdentifier="RESPONSE" shuffle="false" maxChoices="1">\n'
            f'  <prompt>{stem_text}</prompt>\n'
            f'  <simpleChoice identifier="choice_true">True</simpleChoice>\n'
            f'  <simpleChoice identifier="choice_false">False</simpleChoice>\n'
            f'</choiceInteraction>'
        )
    elif qtype == "fill_blank":
        blanks = q.get("blanks") or []
        correct_val = (blanks[0] if blanks else q.get("correct_answer", "")).replace("&","&amp;").replace("<","&lt;")
        resp = (
            f'<responseDeclaration identifier="RESPONSE" cardinality="single" baseType="string">\n'
            + (f'  <correctResponse><value>{correct_val}</value></correctResponse>\n' if correct_val else '')
            + '</responseDeclaration>'
        )
        interaction = f'<p>{stem_text}</p>\n<textEntryInteraction responseIdentifier="RESPONSE" expectedLength="50"/>'
    else:
        resp = '<responseDeclaration identifier="RESPONSE" cardinality="single" baseType="string"/>'
        expected = q.get("essay_lines") or 5
        interaction = (
            f'<extendedTextInteraction responseIdentifier="RESPONSE" expectedLines="{expected}">\n'
            f'  <prompt>{stem_text}</prompt>\n'
            f'</extendedTextInteraction>'
        )

    return f'''<?xml version="1.0" encoding="UTF-8"?>
<assessmentItem xmlns="http://www.imsglobal.org/xsd/imsqti_v2p1"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xsi:schemaLocation="http://www.imsglobal.org/xsd/imsqti_v2p1 http://www.imsglobal.org/xsd/qti/qtiv2p1/imsqti_v2p1.xsd"
                identifier="{qid}"
                title="{title_raw.replace("&","&amp;").replace("<","&lt;")}"
                adaptive="false"
                timeDependent="false">
  {resp}
  <outcomeDeclaration identifier="SCORE" cardinality="single" baseType="float">
    <defaultValue><value>0</value></defaultValue>
  </outcomeDeclaration>
  <itemBody>
    {interaction}
  </itemBody>
</assessmentItem>'''


def _qti_manifest(questions: list) -> str:
    items = "\n".join(
        f'    <resource identifier="item_{q.get("id","")[:12]}" type="imsqti_item_xmlv2p1" href="item_{q.get("id","")[:12]}.xml"/>'
        for q in questions
    )
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          identifier="MANIFEST-QTI-EXPORT">
  <resources>
{items}
  </resources>
</manifest>'''


@app.route("/api/export-qti", methods=["POST"])
def export_qti():
    import zipfile, io as _io
    data = request.json
    qids = data.get("question_ids", [])
    bank = load_bank()
    id_map = {q["id"]: q for q in bank["questions"]}
    selected = [id_map[qid] for qid in qids if qid in id_map]
    if not selected:
        return jsonify({"error": "No valid questions"}), 400

    buf = _io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, q in enumerate(selected, 1):
            xml = _question_to_qti_xml(q, i)
            zf.writestr(f"item_{q.get('id','')[:12]}.xml", xml)
        zf.writestr("imsmanifest.xml", _qti_manifest(selected))
    buf.seek(0)
    log_success(f"QTI export: {len(selected)} items")
    return send_file(buf, as_attachment=True,
                     download_name=f"{_active_bank_id}_qti.zip",
                     mimetype="application/zip")


# ════════════════════════════════════════════════════════════════════════════
# MULTIPLE EXAM VARIANTS
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/generate-pdf-variants", methods=["POST"])
def generate_pdf_variants():
    import zipfile, io as _io
    data = request.json
    qids = data.get("question_ids", [])
    config = data.get("config", {})
    n_variants = min(max(int(data.get("variants", 2)), 2), 8)
    shuffle_questions = bool(data.get("shuffle_questions", True))

    bank = load_bank()
    id_map = {q["id"]: q for q in bank["questions"]}
    selected = [id_map[qid] for qid in qids if qid in id_map]
    if not selected:
        return jsonify({"error": "No valid questions selected"}), 400

    letters = list("ABCDEFGH")[:n_variants]
    base_title = config.get("title", "Exam")

    buf = _io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for letter in letters:
            vc = {**config}
            vc["filename"] = f"exam_variant_{letter}.pdf"
            vc["title"] = f"{base_title} — Variant {letter}"
            vc["shuffle_choices"] = True
            qs = list(selected)
            if shuffle_questions:
                random.shuffle(qs)
            fp = generate_exam_pdf(qs, vc)
            zf.write(str(fp), f"Variant_{letter}.pdf")

        # Combined answer key (no shuffling so letters are stable)
        kc = {**config}
        kc["filename"] = "answer_key.pdf"
        kc["title"] = f"{base_title} — Answer Key"
        kc["generate_key"] = True
        kc["shuffle_choices"] = False
        fp = generate_exam_pdf(selected, kc)
        zf.write(str(fp), "Answer_Key.pdf")

    buf.seek(0)
    log_success(f"PDF variants generated: {n_variants} variants of '{base_title}'")
    return send_file(buf, as_attachment=True,
                     download_name="exam_variants.zip",
                     mimetype="application/zip")


# ════════════════════════════════════════════════════════════════════════════
# DIFFICULTY CALIBRATION
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/calibrate", methods=["POST"])
def calibrate_questions():
    """
    Accepts CSV with columns: question_number, source (optional), pct_correct
    Updates empirical_difficulty on matching questions.
    """
    import csv, io as _io
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    content = request.files["file"].read().decode("utf-8", errors="replace")
    reader = csv.DictReader(_io.StringIO(content))
    entries = []
    for row in reader:
        try:
            qnum = int(row.get("question_number") or row.get("q") or 0)
            raw = str(row.get("pct_correct") or row.get("pct") or row.get("score") or 0)
            pct = float(raw.strip("%")) / (100 if "%" in raw else 1)
            src = (row.get("source") or "").strip()
            if qnum > 0:
                entries.append({"number": qnum, "source": src, "pct": max(0.0, min(1.0, pct))})
        except (ValueError, KeyError):
            continue
    if not entries:
        return jsonify({"error": "No valid entries. Expected columns: question_number, pct_correct (optionally source)."}), 400

    bank = load_bank()
    updated = 0
    for entry in entries:
        for q in bank["questions"]:
            if q.get("number") != entry["number"]:
                continue
            if entry["source"] and q.get("source", "").strip().lower() != entry["source"].lower():
                continue
            q["empirical_difficulty"] = round(entry["pct"], 3)
            updated += 1
            break

    if updated:
        save_bank(bank)
    log_info(f"Calibration: {updated} questions updated from {len(entries)} entries")
    return jsonify({"updated": updated, "entries": len(entries)})


if __name__ == "__main__":
    print("Test Bank Manager v2")
    print(f"Active bank: {_active_bank_id} → {get_bank_file()}")
    print(f"Uploads: {UPLOAD_DIR}")
    print(f"Exports: {EXPORT_DIR}")
    log_info(f"Server started — active bank: {_active_bank_id}")
    app.run(debug=True, port=5000)
