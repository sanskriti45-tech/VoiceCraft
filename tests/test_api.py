"""API tests. Run from the project root:  pytest -q
Uses mock mode (no API key) plus a fake OpenAI client for the real code paths."""

import io
import os

os.environ["VOICECRAFT_MOCK"] = "1"

import pytest
from fastapi.testclient import TestClient

from app import llm
from app.main import app

client = TestClient(app)

TRANSCRIPT = (
    "I built a voice app for portfolios. It exists because writing case studies is slow. "
    "It uses FastAPI and OpenAI. People can present the result."
)
RESUME = (
    "Priya Sharma\nB.Tech CSE student and AI web developer.\n"
    "I interned at Acme Labs as an AI web developer, building chat features with Python and FastAPI. "
    "I built a voice notes app that transcribes meetings. Skills: Python, JavaScript, SQL."
)
PORTFOLIO = {
    "name": "Priya Sharma",
    "headline": "AI web developer",
    "projects": [{"name": "Voice Notes", "description": "Transcribes meetings", "technologies": ["Python"]}],
    "experience": [{"role": "Intern", "organization": "Acme Labs", "period": "2026", "highlights": []}],
    "narration": [{"heading": "Introduction", "text": "Hello."}],
}


@pytest.fixture
def real_mode(monkeypatch):
    """Switch to the real code path with a scripted fake OpenAI client."""
    monkeypatch.setenv("VOICECRAFT_MOCK", "0")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    def install(content: str):
        class Msg:
            def __init__(self, c):
                self.content = c

        class Choice:
            def __init__(self, c):
                self.message = Msg(c)

        class Resp:
            def __init__(self, c):
                self.choices = [Choice(c)]

        class FakeClient:
            class chat:
                class completions:
                    @staticmethod
                    def create(**kwargs):
                        return Resp(content)

        monkeypatch.setattr(llm, "_client", lambda: FakeClient)

    return install


# ---- Day 1 -----------------------------------------------------------------
def test_health_and_index():
    assert client.get("/api/health").json()["mock"] is True
    assert "VoiceCraft" in client.get("/").text


def test_casestudy_shape_and_validation():
    d = client.post("/api/casestudy", json={"transcript": TRANSCRIPT}).json()
    assert [s["key"] for s in d["sections"]] == ["problem", "idea", "approach", "technology", "result", "lessons"]
    assert client.post("/api/casestudy", json={"transcript": "hi"}).status_code == 422


def test_casestudy_missing_key(monkeypatch):
    monkeypatch.setenv("VOICECRAFT_MOCK", "0")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    r = client.post("/api/casestudy", json={"transcript": TRANSCRIPT})
    assert r.status_code == 500 and "OPENAI_API_KEY" in r.json()["detail"]


def test_casestudy_bad_and_partial_json(real_mode):
    real_mode("not json")
    assert client.post("/api/casestudy", json={"transcript": TRANSCRIPT}).status_code == 502
    real_mode('{"title": " Hi ", "problem": "p"}')
    d = client.post("/api/casestudy", json={"transcript": TRANSCRIPT}).json()
    assert d["title"] == "Hi" and d["sections"][5]["body"]


# ---- Day 2 -----------------------------------------------------------------
def test_remix_mock_and_validation():
    body = "I built a tool. It is fast. It uses FastAPI."
    r = client.post("/api/remix", json={"heading": "The Idea", "body": body, "instruction": "make it shorter"})
    assert r.json()["body"] == "I built a tool."
    assert client.post("/api/remix", json={"heading": "H", "body": body, "instruction": "x"}).status_code == 422


def test_remix_unchanged_when_model_returns_empty(real_mode):
    real_mode('{"body": "", "note": "Unclear"}')
    body = "Original text here."
    d = client.post("/api/remix", json={"heading": "H", "body": body, "instruction": "do something"}).json()
    assert d["body"] == body and d["note"] == "Unclear"


def _docx_bytes():
    from docx import Document

    doc = Document()
    for line in RESUME.split("\n"):
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _pdf_bytes():
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    y = 800
    for line in RESUME.split("\n"):
        c.drawString(40, y, line[:110])
        y -= 20
    c.save()
    return buf.getvalue()


@pytest.mark.parametrize("name,data", [("r.docx", _docx_bytes), ("r.pdf", _pdf_bytes), ("r.txt", lambda: RESUME.encode())])
def test_upload_supported_types(name, data):
    r = client.post("/api/upload", files={"file": (name, data())})
    assert r.status_code == 200 and r.json()["name"] == "Priya Sharma" and r.json()["narration"]


def test_upload_errors():
    assert client.post("/api/upload", files={"file": ("a.exe", b"x" * 100)}).status_code == 400
    assert client.post("/api/upload", files={"file": ("a.txt", b"hi")}).status_code == 400
    assert client.post("/api/upload", files={"file": ("a.pdf", b"not a pdf")}).status_code == 400
    assert client.post("/api/upload", files={"file": ("a.txt", b"x" * (5 * 1024 * 1024 + 10))}).status_code == 413


def test_portfolio_normalization(real_mode):
    real_mode('{"name": "A", "narration": [{"heading": "Introduction", "text": "Hello."}], '
              '"projects": [{"name": "P", "technologies": ["x", 3]}]}')
    d = client.post("/api/upload", files={"file": ("a.txt", RESUME.encode())}).json()
    assert d["projects"][0]["technologies"] == ["x"] and d["skills"] == []
    real_mode('{"experience": "oops"}')
    assert client.post("/api/upload", files={"file": ("a.txt", RESUME.encode())}).status_code == 502


# ---- Day 3 -----------------------------------------------------------------
def test_interview_next_mock_is_personalised_and_ends_reflective():
    q1 = client.post("/api/interview/next", json={"portfolio": PORTFOLIO, "history": []}).json()
    assert q1["question"] and q1["kind"] == "opening"
    hist = [{"question": f"Q{i}", "answer": "an answer"} for i in range(4)]
    last = client.post("/api/interview/next", json={"portfolio": PORTFOLIO, "history": hist, "total": 5}).json()
    assert "improve or learn" in last["question"]
    mid = client.post("/api/interview/next", json={"portfolio": PORTFOLIO, "history": hist[:1]}).json()
    assert "Voice Notes" in mid["question"]


def test_interview_next_validation():
    assert client.post("/api/interview/next", json={"portfolio": {}, "history": []}).status_code == 400
    too_many = [{"question": "q", "answer": "a"}] * 11
    assert client.post("/api/interview/next", json={"portfolio": PORTFOLIO, "history": too_many}).status_code == 422
    assert client.post("/api/interview/next", json={"portfolio": PORTFOLIO, "total": 99}).status_code == 422


def test_interview_next_real_path(real_mode):
    real_mode('{"question": "  Why FastAPI for Voice Notes?  ", "kind": "weird"}')
    d = client.post("/api/interview/next", json={"portfolio": PORTFOLIO, "history": []}).json()
    assert d == {"question": "Why FastAPI for Voice Notes?", "kind": "project"}
    real_mode('{"question": ""}')
    assert client.post("/api/interview/next", json={"portfolio": PORTFOLIO, "history": []}).status_code == 502


def test_feedback_mock_shape():
    hist = [{"question": "Tell me about yourself", "answer": "I am a student who built a voice notes app " * 3}] * 3
    d = client.post("/api/interview/feedback", json={"portfolio": PORTFOLIO, "history": hist}).json()
    assert 1 <= d["overall"] <= 10 and set(d["scores"]) == {"clarity", "depth", "specificity", "structure"}
    assert len(d["per_question"]) == 3 and d["rehearse_next"]


def test_feedback_with_no_answers_skips_llm(real_mode):
    real_mode("this would fail if the model were called")
    hist = [{"question": "Q1", "answer": ""}, {"question": "Q2", "answer": "ok"}]
    d = client.post("/api/interview/feedback", json={"portfolio": PORTFOLIO, "history": hist}).json()
    assert d["overall"] == 1 and len(d["per_question"]) == 2


def test_feedback_clamps_and_aligns(real_mode):
    real_mode('{"overall": 99, "scores": {"clarity": "4", "depth": 0}, "summary": "ok", '
              '"strengths": ["a", 1, "b", "c", "d", "e"], "per_question": [{"feedback": "f1", "tip": "t1"}]}')
    hist = [{"question": "Q1", "answer": "a decent long answer here"}, {"question": "Q2", "answer": "another decent answer"}]
    d = client.post("/api/interview/feedback", json={"portfolio": PORTFOLIO, "history": hist}).json()
    assert d["overall"] == 10 and d["scores"]["clarity"] == 4 and d["scores"]["depth"] == 1 and d["scores"]["structure"] == 3
    assert d["strengths"] == ["a", "b", "c", "d"]
    assert len(d["per_question"]) == 2 and d["per_question"][1]["feedback"] == ""
