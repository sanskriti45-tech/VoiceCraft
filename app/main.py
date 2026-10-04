"""VoiceCraft FastAPI app. Run: uvicorn app.main:app --reload"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, HTTPException, UploadFile  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402
from starlette.concurrency import run_in_threadpool  # noqa: E402

from . import llm, parser  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="VoiceCraft")


class CaseStudyRequest(BaseModel):
    transcript: str = Field(min_length=20, max_length=12000)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "mock": llm.is_mock(),
        "has_key": bool((os.getenv("OPENAI_API_KEY") or "").strip()),
    }


@app.post("/api/casestudy")
def casestudy(req: CaseStudyRequest):
    try:
        return llm.generate_case_study(req.transcript.strip())
    except llm.LLMConfigError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


class RemixRequest(BaseModel):
    title: str = Field(default="", max_length=200)
    heading: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=4000)
    instruction: str = Field(min_length=2, max_length=500)
    context: str = Field(default="", max_length=6000)


@app.post("/api/remix")
def remix(req: RemixRequest):
    try:
        return llm.remix_section(
            req.title, req.heading, req.body, req.instruction.strip(), req.context
        )
    except llm.LLMConfigError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    data = await file.read(parser.MAX_BYTES + 1)
    if len(data) > parser.MAX_BYTES:
        raise HTTPException(status_code=413, detail="File is too large. The limit is 5 MB.")
    try:
        text = parser.extract_text(file.filename or "", data)
        return await run_in_threadpool(llm.parse_portfolio, text)
    except parser.ParseError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except llm.LLMConfigError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


class QA(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(default="", max_length=3000)


class InterviewNextRequest(BaseModel):
    portfolio: dict
    history: list[QA] = Field(default_factory=list, max_length=10)
    total: int = Field(default=llm.DEFAULT_TOTAL_QUESTIONS, ge=3, le=8)


class InterviewFeedbackRequest(BaseModel):
    portfolio: dict
    history: list[QA] = Field(min_length=1, max_length=10)


def _check_portfolio(p: dict) -> dict:
    if len(json.dumps(p, default=str)) > 40000:
        raise HTTPException(status_code=413, detail="Portfolio data is too large.")
    if not llm.portfolio_context(p).strip():
        raise HTTPException(status_code=400, detail="Upload a portfolio first so the interviewer has something to ask about.")
    return p


@app.post("/api/interview/next")
def interview_next(req: InterviewNextRequest):
    _check_portfolio(req.portfolio)
    try:
        return llm.next_interview_question(req.portfolio, [qa.model_dump() for qa in req.history], req.total)
    except llm.LLMConfigError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/interview/feedback")
def interview_feedback(req: InterviewFeedbackRequest):
    _check_portfolio(req.portfolio)
    try:
        return llm.interview_feedback(req.portfolio, [qa.model_dump() for qa in req.history])
    except llm.LLMConfigError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")
