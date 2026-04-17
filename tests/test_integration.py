"""Integration tests — Flask test client hitting live API routes."""
import json
import pytest


# ── /api/health ──────────────────────────────────────────────────────────────

class TestHealth:
    def test_returns_ok(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.get_json()["status"] == "ok"

    def test_returns_version(self, client):
        assert r.get_json()["version"] == 2 if (r := client.get("/api/health")) else True


# ── /api/questions (CRUD) ────────────────────────────────────────────────────

class TestQuestions:
    def test_empty_bank_returns_list(self, client):
        r = client.get("/api/questions")
        assert r.status_code == 200
        assert r.get_json() == []

    def test_add_question(self, client, sample_question):
        r = client.post("/api/questions",
                        data=json.dumps(sample_question),
                        content_type="application/json")
        assert r.status_code == 201
        q = r.get_json()
        assert "id" in q
        assert q["stem"] == sample_question["stem"]
        assert q["correct_answer"] == "B"

    def test_add_question_persists(self, client, sample_question):
        client.post("/api/questions",
                    data=json.dumps(sample_question),
                    content_type="application/json")
        qs = client.get("/api/questions").get_json()
        assert len(qs) == 1
        assert qs[0]["stem"] == sample_question["stem"]

    def test_add_sets_all_defaults(self, client, sample_question):
        q = client.post("/api/questions",
                        data=json.dumps(sample_question),
                        content_type="application/json").get_json()
        assert q["flagged"] is False
        assert q["bloom"] == ""
        assert q["objectives"] == []
        assert q["empirical_difficulty"] is None
        assert q["notes"] == ""

    def test_duplicate_rejected(self, client, sample_question):
        client.post("/api/questions",
                    data=json.dumps(sample_question),
                    content_type="application/json")
        r = client.post("/api/questions",
                        data=json.dumps(sample_question),
                        content_type="application/json")
        assert r.status_code == 409
        assert r.get_json()["error"] == "duplicate"

    def test_duplicate_force_allowed(self, client, sample_question):
        client.post("/api/questions",
                    data=json.dumps(sample_question),
                    content_type="application/json")
        forced = {**sample_question, "force": True}
        r = client.post("/api/questions",
                        data=json.dumps(forced),
                        content_type="application/json")
        assert r.status_code == 201

    def test_update_question(self, client, sample_question):
        qid = client.post("/api/questions",
                          data=json.dumps(sample_question),
                          content_type="application/json").get_json()["id"]
        r = client.put(f"/api/questions/{qid}",
                       data=json.dumps({"topic": "Updated Topic", "difficulty": "hard"}),
                       content_type="application/json")
        assert r.status_code == 200
        updated = r.get_json()
        assert updated["topic"] == "Updated Topic"
        assert updated["difficulty"] == "hard"

    def test_update_unknown_id_404(self, client):
        r = client.put("/api/questions/nonexistent-id",
                       data=json.dumps({"topic": "x"}),
                       content_type="application/json")
        assert r.status_code == 404

    def test_delete_question(self, client, sample_question):
        qid = client.post("/api/questions",
                          data=json.dumps(sample_question),
                          content_type="application/json").get_json()["id"]
        r = client.delete(f"/api/questions/{qid}")
        assert r.status_code == 200
        assert client.get("/api/questions").get_json() == []

    def test_delete_unknown_id_still_ok(self, client):
        r = client.delete("/api/questions/no-such-id")
        assert r.status_code == 200


# ── /api/questions/bulk-update ───────────────────────────────────────────────

class TestBulkUpdate:
    def _add(self, client, sample_question, **overrides):
        q = {**sample_question, **overrides, "force": True}
        return client.post("/api/questions",
                           data=json.dumps(q),
                           content_type="application/json").get_json()["id"]

    def test_bulk_update_multiple(self, client, sample_question):
        id1 = self._add(client, sample_question, stem="Q1 stem alpha")
        id2 = self._add(client, sample_question, stem="Q2 stem beta")
        r = client.post("/api/questions/bulk-update",
                        data=json.dumps({"ids": [id1, id2], "fields": {"topic": "Bulk Topic"}}),
                        content_type="application/json")
        assert r.status_code == 200
        assert r.get_json()["updated"] == 2
        qs = {q["id"]: q for q in client.get("/api/questions").get_json()}
        assert qs[id1]["topic"] == "Bulk Topic"
        assert qs[id2]["topic"] == "Bulk Topic"

    def test_bulk_update_partial_ids(self, client, sample_question):
        id1 = self._add(client, sample_question, stem="Stem one here")
        self._add(client, sample_question, stem="Stem two here different")
        r = client.post("/api/questions/bulk-update",
                        data=json.dumps({"ids": [id1], "fields": {"difficulty": "hard"}}),
                        content_type="application/json")
        assert r.get_json()["updated"] == 1
        qs = {q["id"]: q for q in client.get("/api/questions").get_json()}
        assert qs[id1]["difficulty"] == "hard"

    def test_bulk_update_missing_payload_400(self, client):
        r = client.post("/api/questions/bulk-update",
                        data=json.dumps({}),
                        content_type="application/json")
        assert r.status_code == 400


# ── /api/stats ────────────────────────────────────────────────────────────────

class TestStats:
    def test_empty_bank_stats(self, client):
        r = client.get("/api/stats")
        assert r.status_code == 200
        d = r.get_json()
        assert d["total"] == 0

    def test_counts_questions(self, client, sample_question):
        client.post("/api/questions",
                    data=json.dumps(sample_question),
                    content_type="application/json")
        d = client.get("/api/stats").get_json()
        assert d["total"] == 1

    def test_by_type_breakdown(self, client, sample_question):
        client.post("/api/questions",
                    data=json.dumps(sample_question),
                    content_type="application/json")
        d = client.get("/api/stats").get_json()
        assert "types" in d
        assert d["types"].get("mc", 0) == 1

    def test_by_difficulty_breakdown(self, client, sample_question):
        client.post("/api/questions",
                    data=json.dumps(sample_question),
                    content_type="application/json")
        d = client.get("/api/stats").get_json()
        assert "difficulties" in d
        assert d["difficulties"].get("easy", 0) == 1


# ── /api/banks ────────────────────────────────────────────────────────────────

class TestBanks:
    def test_get_banks_returns_list(self, client):
        r = client.get("/api/banks")
        assert r.status_code == 200
        d = r.get_json()
        assert "banks" in d
        assert isinstance(d["banks"], list)

    def test_create_bank(self, client):
        r = client.post("/api/banks",
                        data=json.dumps({"name": "Test Bank Alpha"}),
                        content_type="application/json")
        assert r.status_code == 201
        d = r.get_json()
        assert d["name"] == "Test Bank Alpha"
        assert "id" in d

    def test_new_bank_appears_in_list(self, client):
        client.post("/api/banks",
                    data=json.dumps({"name": "New Bank"}),
                    content_type="application/json")
        banks = client.get("/api/banks").get_json()["banks"]
        names = [b["name"] for b in banks]
        assert "New Bank" in names

    def test_create_bank_missing_name_400(self, client):
        r = client.post("/api/banks",
                        data=json.dumps({}),
                        content_type="application/json")
        assert r.status_code == 400


# ── /api/templates ────────────────────────────────────────────────────────────

class TestTemplates:
    def _sample_template(self):
        return {
            "name": "Midterm Template",
            "config": {"title": "CS 301 Midterm", "show_points": True},
            "front_matter": "Name: ___\nDate: ___",
        }

    def test_empty_templates(self, client):
        r = client.get("/api/templates")
        assert r.status_code == 200
        assert r.get_json() == []

    def test_create_template(self, client):
        r = client.post("/api/templates",
                        data=json.dumps(self._sample_template()),
                        content_type="application/json")
        assert r.status_code == 201
        d = r.get_json()
        assert d["name"] == "Midterm Template"
        assert "id" in d

    def test_template_persists(self, client):
        client.post("/api/templates",
                    data=json.dumps(self._sample_template()),
                    content_type="application/json")
        r = client.get("/api/templates")
        assert len(r.get_json()) == 1

    def test_delete_template(self, client):
        tid = client.post("/api/templates",
                          data=json.dumps(self._sample_template()),
                          content_type="application/json").get_json()["id"]
        r = client.delete(f"/api/templates/{tid}")
        assert r.status_code == 200
        assert client.get("/api/templates").get_json() == []


# ── /api/duplicates ───────────────────────────────────────────────────────────

class TestDuplicates:
    def test_empty_bank_no_duplicates(self, client):
        r = client.get("/api/duplicates")
        assert r.status_code == 200
        assert r.get_json()["pairs"] == []

    def test_detects_near_duplicate(self, client, sample_question):
        q1 = sample_question
        q2 = {**sample_question, "force": True,
              "stem": "What is the stack pointer register in x86-64 architecture?"}
        client.post("/api/questions",
                    data=json.dumps(q1), content_type="application/json")
        client.post("/api/questions",
                    data=json.dumps(q2), content_type="application/json")
        r = client.get("/api/duplicates")
        pairs = r.get_json()["pairs"]
        assert len(pairs) >= 1


# ── /api/export-csv ───────────────────────────────────────────────────────────

class TestExportCsv:
    def test_empty_bank_csv_headers(self, client):
        r = client.get("/api/export-csv")
        assert r.status_code == 200
        assert "text/csv" in r.content_type
        body = r.data.decode()
        assert "stem" in body.lower()
        assert "type" in body.lower()

    def test_csv_contains_question(self, client, sample_question):
        client.post("/api/questions",
                    data=json.dumps(sample_question), content_type="application/json")
        body = client.get("/api/export-csv").data.decode()
        assert "stack pointer" in body.lower()
