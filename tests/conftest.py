"""Shared pytest fixtures for unit and integration tests."""
import json
import sys
import os
import pytest
import tempfile
from pathlib import Path

# ── Isolate the bank file so tests never touch the real TestBank/ directory ──
@pytest.fixture(autouse=True)
def isolated_bank(tmp_path, monkeypatch):
    """Redirect all bank I/O to a fresh temp directory for each test."""
    bank_dir = tmp_path / "TestBank"
    bank_dir.mkdir()
    banks_file = bank_dir / "banks.json"

    import app as app_module

    monkeypatch.setattr(app_module, "TESTBANK_DIR", bank_dir)
    monkeypatch.setattr(app_module, "BANKS_FILE", banks_file)
    monkeypatch.setattr(app_module, "BACKUP_DIR", tmp_path / "backups")
    monkeypatch.setattr(app_module, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(app_module, "EXPORT_DIR", tmp_path / "exports")
    (tmp_path / "backups").mkdir()
    (tmp_path / "uploads").mkdir()
    (tmp_path / "exports").mkdir()

    # Reset global bank state
    monkeypatch.setattr(app_module, "_active_bank_id", "default")
    monkeypatch.setattr(app_module, "_last_backup_times", {})

    yield tmp_path


@pytest.fixture()
def client(isolated_bank):
    """Flask test client with a clean isolated bank."""
    import app as app_module
    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as c:
        yield c


@pytest.fixture()
def sample_question():
    """Minimal valid question dict (no id — the API generates one)."""
    return {
        "type": "mc",
        "stem": "What is the stack pointer register in x86-64?",
        "choices": [
            {"letter": "A", "text": "RAX"},
            {"letter": "B", "text": "RSP"},
            {"letter": "C", "text": "RBP"},
            {"letter": "D", "text": "RIP"},
        ],
        "correct_answer": "B",
        "topic": "x86 Registers",
        "difficulty": "easy",
        "points": 2,
    }
