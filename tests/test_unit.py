"""Unit tests for pure helper functions in app.py."""
import pytest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import app as m   # import module under test


# ── _normalize_stem ──────────────────────────────────────────────────────────

class TestNormalizeStem:
    def test_lowercases(self):
        assert m._normalize_stem("Hello World") == "hello world"

    def test_collapses_whitespace(self):
        assert m._normalize_stem("a  b\tc\n\nd") == "a b c d"

    def test_strips_edges(self):
        assert m._normalize_stem("  hello  ") == "hello"

    def test_empty(self):
        assert m._normalize_stem("") == ""


# ── stem_similarity ──────────────────────────────────────────────────────────

class TestStemSimilarity:
    def test_identical(self):
        assert m.stem_similarity("hello world", "hello world") == 1.0

    def test_completely_different(self):
        score = m.stem_similarity("aaa bbb ccc", "xyz xyz xyz")
        assert score < 0.3

    def test_case_insensitive(self):
        assert m.stem_similarity("Hello World", "hello world") == 1.0

    def test_near_duplicate(self):
        a = "What is the value of the stack pointer after a PUSH instruction?"
        b = "What is the value of the stack pointer after a PUSH instruction in x86?"
        score = m.stem_similarity(a, b)
        assert score > 0.85

    def test_symmetry(self):
        a = "What register holds the return address?"
        b = "Which register stores the return value?"
        assert m.stem_similarity(a, b) == m.stem_similarity(b, a)

    def test_returns_float(self):
        result = m.stem_similarity("abc", "abd")
        assert isinstance(result, float)
        assert 0.0 <= result <= 1.0


# ── find_duplicates_for ──────────────────────────────────────────────────────

class TestFindDuplicatesFor:
    def _make_q(self, stem, id_="q1"):
        return {"id": id_, "stem": stem}

    def test_finds_exact_match(self):
        qs = [self._make_q("What is RSP?")]
        results = m.find_duplicates_for("What is RSP?", qs)
        assert len(results) == 1
        assert results[0]["score"] == 1.0

    def test_excludes_below_threshold(self):
        qs = [self._make_q("Completely unrelated question about dolphins")]
        results = m.find_duplicates_for("x86 assembly registers", qs)
        assert results == []

    def test_sorted_descending(self):
        qs = [
            self._make_q("What is the stack pointer?", "q1"),
            self._make_q("What is the stack pointer register RSP?", "q2"),
        ]
        results = m.find_duplicates_for("What is the stack pointer register?", qs, threshold=0.5)
        scores = [r["score"] for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_custom_threshold(self):
        qs = [self._make_q("slightly different stem here")]
        high = m.find_duplicates_for("slightly different stem", qs, threshold=0.99)
        low  = m.find_duplicates_for("slightly different stem", qs, threshold=0.5)
        assert len(high) <= len(low)


# ── _normalize_key_answer ────────────────────────────────────────────────────

class TestNormalizeKeyAnswer:
    def test_true_variants(self):
        for raw in ("T", "t", "True", "true", "TRUE"):
            assert m._normalize_key_answer(raw) == "True", f"failed for {raw!r}"

    def test_false_variants(self):
        for raw in ("F", "f", "False", "false", "FALSE"):
            assert m._normalize_key_answer(raw) == "False", f"failed for {raw!r}"

    def test_single_letter(self):
        assert m._normalize_key_answer("A") == "A"
        assert m._normalize_key_answer("c") == "C"

    def test_strips_bold_markers(self):
        assert m._normalize_key_answer("**B**") == "B"

    def test_mc_with_explanation(self):
        assert m._normalize_key_answer("B) 74") == "B"

    def test_multi_select_sorted(self):
        result = m._normalize_key_answer("B, A, D")
        assert result == "A,B,D"

    def test_multi_select_deduped(self):
        result = m._normalize_key_answer("A, A, B")
        assert result == "A,B"

    def test_free_text_passthrough(self):
        assert m._normalize_key_answer("push rbp") == "push rbp"

    def test_strips_parenthetical(self):
        assert m._normalize_key_answer("A (or B)") == "A"


# ── extract_answer_key ───────────────────────────────────────────────────────

class TestExtractAnswerKey:
    def test_plain_format(self):
        lines = [
            "## Answer Key",
            "1. A",
            "2. B",
            "3. True",
        ]
        key, start = m.extract_answer_key(lines)
        assert start == 0
        assert key == {1: "A", 2: "B", 3: "True"}

    def test_paren_format(self):
        lines = ["## Answer Key", "1) C", "2) D"]
        key, _ = m.extract_answer_key(lines)
        assert key == {1: "C", 2: "D"}

    def test_markdown_table_format(self):
        lines = [
            "## Answer Key",
            "| # | Answer | Notes |",
            "| 1 | **A** | |",
            "| 2 | **True** | |",
        ]
        key, _ = m.extract_answer_key(lines)
        assert key[1] == "A"
        assert key[2] == "True"

    def test_no_header_returns_empty(self):
        lines = ["Some random text", "No key here"]
        key, start = m.extract_answer_key(lines)
        assert key == {}
        assert start == -1

    def test_returns_key_start_index(self):
        lines = ["Question 1. ...", "## Answer Key", "1. A"]
        _, start = m.extract_answer_key(lines)
        assert start == 1


# ── detect_choice ────────────────────────────────────────────────────────────

class TestDetectChoice:
    def test_dot_format(self):
        result = m.detect_choice("A. Some choice text")
        assert result == {"letter": "A", "text": "Some choice text", "is_correct": False}

    def test_paren_format(self):
        # Parser expects "B) text" not "(B) text"
        result = m.detect_choice("B) Another choice")
        assert result is not None
        assert result["letter"] == "B"

    def test_lowercase_letter_uppercased(self):
        result = m.detect_choice("a. lowercase choice")
        assert result["letter"] == "A"

    def test_starred_is_correct(self):
        result = m.detect_choice("*C. The correct answer")
        assert result["is_correct"] is True
        assert result["letter"] == "C"

    def test_numeric_choice(self):
        # Numeric choices require a leading '-' to avoid collision with question numbers
        result = m.detect_choice("- 1. First option")
        assert result is not None
        assert result["letter"] == "A"

    def test_non_choice_line(self):
        assert m.detect_choice("This is a question stem.") is None

    def test_empty_line(self):
        assert m.detect_choice("") is None


# ── detect_question_type ─────────────────────────────────────────────────────

class TestDetectQuestionType:
    def _choices(self, texts):
        return [{"letter": chr(65+i), "text": t} for i, t in enumerate(texts)]

    def test_mc_with_choices(self):
        choices = self._choices(["option a", "option b", "option c", "option d"])
        assert m.detect_question_type("Which is correct?", choices, "", False) == "mc"

    def test_multi_select_from_stem_select_all(self):
        choices = self._choices(["opt a", "opt b", "opt c", "opt d"])
        assert m.detect_question_type("Select all that apply.", choices, "", False) == "multi_select"

    def test_multi_select_from_stem_which_are_true(self):
        choices = self._choices(["opt a", "opt b", "opt c", "opt d"])
        assert m.detect_question_type("Which of the following are true?", choices, "", False) == "multi_select"

    def test_multi_select_from_stem_choose_all(self):
        choices = self._choices(["opt a", "opt b"])
        assert m.detect_question_type("Choose all correct answers.", choices, "", False) == "multi_select"

    def test_true_false_choices(self):
        choices = self._choices(["True", "False"])
        assert m.detect_question_type("Is this true?", choices, "", False) == "true_false"

    def test_true_false_from_stem(self):
        assert m.detect_question_type("True / False: RSP is a register.", [], "", False) == "true_false"

    def test_fill_blank_from_underscores(self):
        assert m.detect_question_type("The register ___ holds the stack pointer.", [], "", False) == "fill_blank"

    def test_code_listing(self):
        assert m.detect_question_type("Analyze this code.", [], "mov rax, 1", False) == "code_listing"

    def test_short_answer_default(self):
        assert m.detect_question_type("Explain pipelining.", [], "", False) == "short_answer"

    def test_tf_detected_flag(self):
        assert m.detect_question_type("Circle one.", [], "", tf_detected=True) == "true_false"


# ── new_question ─────────────────────────────────────────────────────────────

class TestNewQuestion:
    def test_has_id(self):
        q = m.new_question()
        assert "id" in q
        assert len(q["id"]) == 36  # UUID4

    def test_default_type(self):
        assert m.new_question()["type"] == "short_answer"

    def test_kwargs_override(self):
        q = m.new_question(type="mc", stem="test stem", points=5)
        assert q["type"] == "mc"
        assert q["stem"] == "test stem"
        assert q["points"] == 5

    def test_all_required_fields_present(self):
        q = m.new_question()
        for field in ("id", "type", "stem", "choices", "correct_answer", "blanks",
                      "code_block", "points", "topic", "difficulty", "lecture",
                      "source", "semester", "number", "tags", "added",
                      "notes", "flagged", "bloom", "objectives", "empirical_difficulty"):
            assert field in q, f"missing field: {field}"

    def test_ids_are_unique(self):
        ids = {m.new_question()["id"] for _ in range(100)}
        assert len(ids) == 100

    def test_flagged_defaults_false(self):
        assert m.new_question()["flagged"] is False

    def test_empirical_difficulty_defaults_none(self):
        assert m.new_question()["empirical_difficulty"] is None


# ── parse_markdown_exam ──────────────────────────────────────────────────────

class TestParseMarkdownExam:
    def test_mc_question(self):
        md = """1. What register is the stack pointer?
A. RAX
B. RSP
C. RBP
D. RIP
"""
        qs = m.parse_markdown_exam(md)
        assert len(qs) == 1
        q = qs[0]
        assert q["number"] == 1
        assert q["type"] == "mc"
        assert len(q["choices"]) == 4

    def test_true_false_question(self):
        md = "1. True / False: The stack grows upward in x86-64.\n"
        qs = m.parse_markdown_exam(md)
        assert len(qs) == 1
        assert qs[0]["type"] == "true_false"

    def test_answer_key_applied(self):
        md = """1. What is 2 + 2?
A. 3
B. 4
C. 5
D. 6

## Answer Key
1. B
"""
        qs = m.parse_markdown_exam(md)
        assert len(qs) == 1
        assert qs[0]["correct_answer"] == "B"

    def test_source_name_stored(self):
        md = "1. Any question stem here.\n"
        qs = m.parse_markdown_exam(md, source_name="Fall2024")
        assert qs[0]["source"] == "Fall2024"

    def test_multiple_questions(self):
        md = """1. First question stem.
A. A
B. B

2. Second question stem.
A. A
B. B
"""
        qs = m.parse_markdown_exam(md)
        assert len(qs) == 2
        assert qs[0]["number"] == 1
        assert qs[1]["number"] == 2

    def test_fill_blank(self):
        md = "1. The instruction ___ decrements the stack pointer.\n"
        qs = m.parse_markdown_exam(md)
        assert qs[0]["type"] == "fill_blank"

    def test_empty_input(self):
        assert m.parse_markdown_exam("") == []

    def test_multi_select_from_starred_choices(self):
        md = """1. Which registers are caller-saved?
*A. RAX
B. RBX
*C. RCX
D. RBP
"""
        qs = m.parse_markdown_exam(md)
        assert qs[0]["type"] == "multi_select"
        assert qs[0]["correct_answer"] == "A,C"

    def test_multi_select_from_stem_phrase(self):
        md = """1. Select all that apply: which are valid x86-64 registers?
A. RAX
B. ZZX
C. RBX
D. QQQ
"""
        qs = m.parse_markdown_exam(md)
        assert qs[0]["type"] == "multi_select"

    def test_multi_select_from_comma_answer_key(self):
        md = """1. Which of the following are volatile registers?
A. RAX
B. RBX
C. RCX
D. RBP

## Answer Key
1. A, C
"""
        qs = m.parse_markdown_exam(md)
        assert qs[0]["type"] == "multi_select"
        assert "A" in qs[0]["correct_answer"]
        assert "C" in qs[0]["correct_answer"]
