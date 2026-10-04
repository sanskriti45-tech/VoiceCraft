"""All LLM calls and prompts for VoiceCraft live here."""

import json
import os
import re

SECTION_KEYS = ["problem", "idea", "approach", "technology", "result", "lessons"]
SECTION_HEADINGS = {
    "problem": "The Problem",
    "idea": "The Idea",
    "approach": "The Approach",
    "technology": "Technology",
    "result": "The Result",
    "lessons": "Lessons Learned",
}

CASESTUDY_SYSTEM = """You are an editor who turns a person's spoken, rambling description of a \
project into a polished portfolio case study.

Rules:
- Use ONLY facts present in the transcript. Never invent metrics, tools, users, or results.
- If the transcript does not cover a section, write one short, honest sentence based on what is \
known instead of making things up.
- Remove filler words and repetition. Fix grammar. Keep the person's voice: confident, clear, first person.
- Each section is 2-4 sentences. The technology section may be a short sentence listing the stack.
- The title is short and memorable (max 6 words). The tagline is one sentence (max 18 words).

Return ONLY a JSON object with exactly these string keys:
title, tagline, problem, idea, approach, technology, result, lessons"""


class LLMError(Exception):
    """The AI request failed."""


class LLMConfigError(LLMError):
    """The AI is not configured (e.g. missing API key)."""


def is_mock() -> bool:
    return os.getenv("VOICECRAFT_MOCK", "0").strip() == "1"


def _client():
    from openai import OpenAI

    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        raise LLMConfigError(
            "OPENAI_API_KEY is not set. Add it to your .env file (see .env.example)."
        )
    return OpenAI(api_key=key)


def _model() -> str:
    return os.getenv("OPENAI_MODEL", "gpt-4o-mini")


def _normalize(data: dict) -> dict:
    """Turn the model's JSON into the shape the frontend expects."""

    def clean(value, fallback=""):
        return value.strip() if isinstance(value, str) and value.strip() else fallback

    return {
        "title": clean(data.get("title"), "Untitled Project"),
        "tagline": clean(data.get("tagline")),
        "sections": [
            {
                "key": key,
                "heading": SECTION_HEADINGS[key],
                "body": clean(data.get(key), "Not covered in the original description."),
            }
            for key in SECTION_KEYS
        ],
    }


def _mock_case_study(transcript: str) -> dict:
    """Deterministic offline stand-in so the UI can be built without an API key."""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", transcript) if s.strip()]
    if not sentences:
        sentences = [transcript.strip()]
    data = {"title": "Mock Case Study", "tagline": sentences[0][:110]}
    for i, key in enumerate(SECTION_KEYS):
        data[key] = sentences[i % len(sentences)]
    return _normalize(data)


def generate_case_study(transcript: str) -> dict:
    if is_mock():
        return _mock_case_study(transcript)

    client = _client()
    try:
        resp = client.chat.completions.create(
            model=_model(),
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": CASESTUDY_SYSTEM},
                {"role": "user", "content": f"Transcript:\n\n{transcript}"},
            ],
            temperature=0.5,
        )
        data = json.loads(resp.choices[0].message.content)
    except json.JSONDecodeError as e:
        raise LLMError("The AI returned an unreadable response. Please try again.") from e
    except Exception as e:  # network, auth, rate limit, etc.
        raise LLMError(f"The AI request failed: {e}") from e

    return _normalize(data)


# ---------------------------------------------------------------------------
# Day 2: Voice Remix
# ---------------------------------------------------------------------------

REMIX_SYSTEM = """You rewrite ONE section of a portfolio case study according to a spoken \
instruction from its author.

Rules:
- Apply the instruction to this section only.
- The instruction was transcribed from speech and may contain recognition errors; infer the intent.
- Keep facts accurate. Do not invent metrics, numbers, versions, users, or results. Facts must come \
from the section itself or the rest of the case study provided as context.
- If the instruction asks for more technical detail, expand using only what is stated plus general, \
clearly true explanation of the technologies already named. Never fabricate specifics.
- Keep the author's first-person voice unless told otherwise. Plain prose only: no markdown, bullets or headings.
- If the instruction is unclear, unrelated to writing, or cannot be applied, return the original body \
unchanged and explain briefly in "note".

Return ONLY a JSON object: {"body": "<the rewritten section text>", "note": "<short message or empty string>"}"""


def _mock_remix(body: str, instruction: str) -> dict:
    low = instruction.lower()
    if "short" in low or "concise" in low or "trim" in low:
        first = re.split(r"(?<=[.!?])\s+", body.strip())[0]
        return {"body": first, "note": ""}
    return {"body": f"{body.strip()} (Remixed: {instruction.strip()})", "note": ""}


def remix_section(title: str, heading: str, body: str, instruction: str, context: str = "") -> dict:
    if is_mock():
        return _mock_remix(body, instruction)

    client = _client()
    user = (
        f"Case study title: {title}\n"
        f"Section to rewrite: {heading}\n\n"
        f"Current section text:\n{body}\n\n"
        f"Rest of the case study (context only, do not rewrite):\n{context or '(none)'}\n\n"
        f"Spoken instruction: {instruction}"
    )
    try:
        resp = client.chat.completions.create(
            model=_model(),
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": REMIX_SYSTEM}, {"role": "user", "content": user}],
            temperature=0.6,
        )
        data = json.loads(resp.choices[0].message.content)
    except json.JSONDecodeError as e:
        raise LLMError("The AI returned an unreadable response. Please try again.") from e
    except Exception as e:
        raise LLMError(f"The AI request failed: {e}") from e

    new_body = data.get("body")
    note = data.get("note")
    return {
        "body": new_body.strip() if isinstance(new_body, str) and new_body.strip() else body,
        "note": note.strip() if isinstance(note, str) else "",
    }


# ---------------------------------------------------------------------------
# Day 2: Portfolio parsing + narration
# ---------------------------------------------------------------------------

PORTFOLIO_SYSTEM = """You turn the raw text of a resume or portfolio into structured data and a \
spoken audio walkthrough.

Rules:
- Use ONLY facts present in the text. Never invent employers, dates, metrics, or skills.
- Leave a field empty ("" or []) when the text does not contain it.
- "narration" is the audio walkthrough: 3 to 7 segments in this order, skipping any with no \
content: Introduction, Experience, Projects, Skills, Education (plus Achievements if present).
- Write each narration segment as natural spoken first person, warm and confident, like presenting \
your own portfolio out loud. 40 to 120 words per segment. No bullet points, symbols, markdown, or \
URLs. Spell out abbreviations only when that helps spoken clarity.

Return ONLY a JSON object with these keys:
name (string), headline (string, one line),
summary (string),
experience (list of {role, organization, period, highlights: [string]}),
projects (list of {name, description, technologies: [string]}),
skills (list of string),
education (list of {degree, institution, period}),
narration (list of {heading, text})"""


def _str(v) -> str:
    return v.strip() if isinstance(v, str) else ""


def _str_list(v) -> list:
    return [x.strip() for x in v if isinstance(x, str) and x.strip()] if isinstance(v, list) else []


def _dict_list(v, keys, list_keys=()) -> list:
    out = []
    for item in v if isinstance(v, list) else []:
        if not isinstance(item, dict):
            continue
        row = {k: (_str_list(item.get(k)) if k in list_keys else _str(item.get(k))) for k in keys}
        if any(row.values()):
            out.append(row)
    return out


def _fallback_narration(p: dict) -> list:
    segs = []
    intro = " ".join(x for x in [p["name"] and f"Hi, I'm {p['name']}.", p["headline"], p["summary"]] if x)
    if intro:
        segs.append({"heading": "Introduction", "text": intro})
    if p["experience"]:
        parts = [f"{e['role']} at {e['organization']}".strip(" at") for e in p["experience"] if e["role"] or e["organization"]]
        segs.append({"heading": "Experience", "text": "My experience includes " + "; ".join(parts) + "."})
    if p["projects"]:
        segs.append({"heading": "Projects", "text": "Projects I've worked on include " + ", ".join(x["name"] for x in p["projects"] if x["name"]) + "."})
    if p["skills"]:
        segs.append({"heading": "Skills", "text": "My skills include " + ", ".join(p["skills"]) + "."})
    return segs


def _normalize_portfolio(data: dict) -> dict:
    p = {
        "name": _str(data.get("name")),
        "headline": _str(data.get("headline")),
        "summary": _str(data.get("summary")),
        "experience": _dict_list(data.get("experience"), ["role", "organization", "period", "highlights"], ("highlights",)),
        "projects": _dict_list(data.get("projects"), ["name", "description", "technologies"], ("technologies",)),
        "skills": _str_list(data.get("skills")),
        "education": _dict_list(data.get("education"), ["degree", "institution", "period"]),
    }
    narration = [
        {"heading": _str(s.get("heading")) or "Section", "text": _str(s.get("text"))}
        for s in (data.get("narration") if isinstance(data.get("narration"), list) else [])
        if isinstance(s, dict) and _str(s.get("text"))
    ]
    p["narration"] = narration or _fallback_narration(p)
    if not p["narration"]:
        raise LLMError("Could not find enough portfolio content to narrate. Try a more detailed document.")
    return p


def _mock_portfolio(text: str) -> dict:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    name = lines[0][:60] if lines else "Your Name"
    body = " ".join(lines[1:])[:900] or text[:900]
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", body) if s.strip()] or [body]
    third = max(1, len(sentences) // 3)
    chunks = [" ".join(sentences[i:i + third]) for i in range(0, len(sentences), third)][:3]
    headings = ["Introduction", "Experience", "Projects"]
    return _normalize_portfolio({
        "name": name,
        "headline": "Mock portfolio walkthrough",
        "summary": chunks[0] if chunks else "",
        "skills": ["Python", "FastAPI"],
        "narration": [{"heading": headings[i], "text": c} for i, c in enumerate(chunks)],
    })


def parse_portfolio(text: str) -> dict:
    if is_mock():
        return _mock_portfolio(text)

    client = _client()
    try:
        resp = client.chat.completions.create(
            model=_model(),
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": PORTFOLIO_SYSTEM},
                {"role": "user", "content": f"Resume / portfolio text:\n\n{text}"},
            ],
            temperature=0.4,
        )
        data = json.loads(resp.choices[0].message.content)
    except json.JSONDecodeError as e:
        raise LLMError("The AI returned an unreadable response. Please try again.") from e
    except LLMError:
        raise
    except Exception as e:
        raise LLMError(f"The AI request failed: {e}") from e

    return _normalize_portfolio(data)


# ---------------------------------------------------------------------------
# Day 3: Interview Mode
# ---------------------------------------------------------------------------

DEFAULT_TOTAL_QUESTIONS = 5
SCORE_KEYS = ["clarity", "depth", "specificity", "structure"]

INTERVIEW_Q_SYSTEM = """You are a friendly but rigorous interviewer running a mock interview for \
the candidate whose portfolio is provided. Ask exactly ONE question per turn.

Rules:
- Ground every question in the candidate's ACTUAL portfolio: specific projects, roles, and \
technologies they list. Never invent facts about them.
- The question is spoken aloud: one sentence, 30 words maximum, no numbering, no praise or preamble.
- Question 1 is a warm opener tied to their most notable project or role.
- Middle questions dig into decisions, trade-offs, challenges, technical choices, and impact.
- If the previous answer was vague, very short, or raised something interesting, ask one pointed \
follow-up about it (never two follow-ups in a row).
- Do not repeat a topic that was already covered unless you are following up.
- If told this is the LAST question, make it forward-looking or reflective (what they would \
improve, or what they want to learn next).
- Answers were transcribed from speech and may contain recognition errors; interpret generously.
- If the portfolio is sparse, ask about whatever is there.

Return ONLY JSON: {"question": "<the question>", "kind": "opening|project|technical|behavioral|follow_up"}"""

INTERVIEW_FEEDBACK_SYSTEM = """You are an interview coach giving honest, constructive practice \
feedback after a mock interview. The candidate answered by voice; answers are speech transcripts, \
so do NOT penalize spelling, punctuation, or minor recognition errors.

Rules:
- Evaluate ONLY what the candidate actually said. Do not invent details.
- Do not inflate. Very short, vague, or skipped answers score low and you say so plainly.
- Scores: clarity, depth, specificity, structure are integers 1-5. overall is an integer 1-10.
- strengths: 2-4 specific items. improvements: 2-4 specific, actionable items.
- per_question: one entry per question, in order, each {"question", "feedback" (1-2 sentences), \
"tip" (one sentence on how to answer better)}.
- rehearse_next: 3-5 concrete things to practice (e.g. "Explain the trade-off you made in project X in 60 seconds").
- summary: 2-3 encouraging but honest sentences.

Return ONLY JSON with keys: overall, scores {clarity, depth, specificity, structure}, summary, \
strengths, improvements, per_question, rehearse_next"""


def portfolio_context(p: dict, limit: int = 6000) -> str:
    """Compact, LLM-friendly text version of the parsed portfolio."""
    lines = []

    def add(label, value):
        if isinstance(value, str) and value.strip():
            lines.append(f"{label}: {value.strip()}")

    add("Name", p.get("name"))
    add("Headline", p.get("headline"))
    add("Summary", p.get("summary"))
    for e in p.get("experience") or []:
        if isinstance(e, dict):
            hl = "; ".join(x for x in (e.get("highlights") or []) if isinstance(x, str))
            lines.append(f"Experience: {e.get('role', '')} at {e.get('organization', '')} ({e.get('period', '')}). {hl}".strip())
    for pr in p.get("projects") or []:
        if isinstance(pr, dict):
            tech = ", ".join(x for x in (pr.get("technologies") or []) if isinstance(x, str))
            lines.append(f"Project: {pr.get('name', '')}. {pr.get('description', '')} Tech: {tech}".strip())
    skills = [x for x in (p.get("skills") or []) if isinstance(x, str)]
    if skills:
        lines.append("Skills: " + ", ".join(skills))
    for ed in p.get("education") or []:
        if isinstance(ed, dict):
            lines.append(f"Education: {ed.get('degree', '')}, {ed.get('institution', '')} ({ed.get('period', '')})")
    if not lines:  # fall back to the narration text
        for seg in p.get("narration") or []:
            if isinstance(seg, dict):
                lines.append(f"{seg.get('heading', '')}: {seg.get('text', '')}")
    return "\n".join(lines)[:limit]


def _history_text(history: list) -> str:
    if not history:
        return "(no questions asked yet)"
    out = []
    for i, qa in enumerate(history, 1):
        ans = (qa.get("answer") or "").strip() or "(skipped / no answer)"
        out.append(f"Q{i}: {qa.get('question', '')}\nA{i}: {ans[:1500]}")
    return "\n\n".join(out)


def _mock_question(p: dict, history: list, total: int) -> dict:
    projects = [x.get("name") for x in (p.get("projects") or []) if isinstance(x, dict) and x.get("name")]
    orgs = [x.get("organization") for x in (p.get("experience") or []) if isinstance(x, dict) and x.get("organization")]
    proj = projects[0] if projects else "your main project"
    org = orgs[0] if orgs else "your most recent role"
    bank = [
        ("opening", "Tell me about yourself and the work you're most proud of."),
        ("project", f"Walk me through {proj}. What problem did it solve?"),
        ("technical", f"What was the hardest technical challenge in {proj}, and how did you handle it?"),
        ("behavioral", f"Tell me about your experience at {org}. What did you own?"),
        ("behavioral", "If you had another month, what would you improve or learn next?"),
    ]
    i = min(len(history), len(bank) - 1)
    if len(history) + 1 >= total:
        i = len(bank) - 1
    kind, q = bank[i]
    return {"question": q, "kind": kind}


def next_interview_question(portfolio: dict, history: list, total: int = DEFAULT_TOTAL_QUESTIONS) -> dict:
    if is_mock():
        return _mock_question(portfolio, history, total)

    n = len(history) + 1
    last = " This is the LAST question." if n >= total else ""
    user = (
        f"Candidate portfolio:\n{portfolio_context(portfolio)}\n\n"
        f"Interview so far:\n{_history_text(history)}\n\n"
        f"Ask question {n} of {total}.{last}"
    )
    client = _client()
    try:
        resp = client.chat.completions.create(
            model=_model(),
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": INTERVIEW_Q_SYSTEM}, {"role": "user", "content": user}],
            temperature=0.7,
        )
        data = json.loads(resp.choices[0].message.content)
    except json.JSONDecodeError as e:
        raise LLMError("The AI returned an unreadable response. Please try again.") from e
    except Exception as e:
        raise LLMError(f"The AI request failed: {e}") from e

    q = _str(data.get("question"))
    if not q:
        raise LLMError("The interviewer did not come up with a question. Please try again.")
    kinds = {"opening", "project", "technical", "behavioral", "follow_up"}
    kind = _str(data.get("kind")).lower()
    return {"question": q, "kind": kind if kind in kinds else "project"}


def _clamp(v, lo, hi, default):
    try:
        return max(lo, min(hi, int(round(float(v)))))
    except (TypeError, ValueError):
        return default


def _has_real_answer(qa: dict) -> bool:
    return len((qa.get("answer") or "").split()) >= 3


def _no_answers_feedback(history: list) -> dict:
    return {
        "overall": 1,
        "scores": {k: 1 for k in SCORE_KEYS},
        "summary": "No answers were recorded, so there is nothing to score yet. Try again and answer out loud, even briefly.",
        "strengths": [],
        "improvements": ["Answer each question, even with a short first attempt, so you can get useful feedback."],
        "per_question": [
            {"question": qa.get("question", ""), "feedback": "No answer recorded.", "tip": "Try answering in 30 to 60 seconds."}
            for qa in history
        ],
        "rehearse_next": ["Practice a 60-second introduction about your best project."],
    }


def _normalize_feedback(data: dict, history: list) -> dict:
    scores_in = data.get("scores") if isinstance(data.get("scores"), dict) else {}
    pq_in = data.get("per_question") if isinstance(data.get("per_question"), list) else []
    per_question = []
    for i, qa in enumerate(history):
        item = pq_in[i] if i < len(pq_in) and isinstance(pq_in[i], dict) else {}
        per_question.append({
            "question": qa.get("question", ""),
            "feedback": _str(item.get("feedback")),
            "tip": _str(item.get("tip")),
        })
    return {
        "overall": _clamp(data.get("overall"), 1, 10, 5),
        "scores": {k: _clamp(scores_in.get(k), 1, 5, 3) for k in SCORE_KEYS},
        "summary": _str(data.get("summary")) or "Here is how your practice interview went.",
        "strengths": _str_list(data.get("strengths"))[:4],
        "improvements": _str_list(data.get("improvements"))[:4],
        "per_question": per_question,
        "rehearse_next": _str_list(data.get("rehearse_next"))[:5],
    }


def _mock_feedback(history: list) -> dict:
    words = [len((qa.get("answer") or "").split()) for qa in history]
    avg = sum(words) / max(1, len(words))
    s = _clamp(1 + avg / 20, 1, 5, 3)
    return _normalize_feedback({
        "overall": _clamp(s * 2, 1, 10, 5),
        "scores": {k: s for k in SCORE_KEYS},
        "summary": f"Mock feedback: you averaged {avg:.0f} words per answer.",
        "strengths": ["You answered by voice and kept going."],
        "improvements": ["Add a concrete example to each answer."],
        "per_question": [{"feedback": "Mock feedback for this answer.", "tip": "Lead with the outcome, then explain how."} for _ in history],
        "rehearse_next": ["Explain your main project in 60 seconds."],
    }, history)


def interview_feedback(portfolio: dict, history: list) -> dict:
    if not any(_has_real_answer(qa) for qa in history):
        return _no_answers_feedback(history)
    if is_mock():
        return _mock_feedback(history)

    user = f"Candidate portfolio:\n{portfolio_context(portfolio)}\n\nInterview transcript:\n{_history_text(history)}"
    client = _client()
    try:
        resp = client.chat.completions.create(
            model=_model(),
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": INTERVIEW_FEEDBACK_SYSTEM}, {"role": "user", "content": user}],
            temperature=0.4,
        )
        data = json.loads(resp.choices[0].message.content)
    except json.JSONDecodeError as e:
        raise LLMError("The AI returned an unreadable response. Please try again.") from e
    except Exception as e:
        raise LLMError(f"The AI request failed: {e}") from e

    return _normalize_feedback(data, history)
