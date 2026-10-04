# VoiceCraft

**Speak an idea. Build the story.**
A voice-first portfolio storytelling studio. Speak about a project and get a polished case study you can present, remix it with your voice, listen to your own portfolio, and practice a mock interview based on it.

## Features

| # | Feature | What it does |
|---|---|---|
| 1 | **Voice → Case Study** | Speak about a project (live transcription + waveform); AI turns it into a structured case study |
| 2 | **Presentation Mode** | Cinematic full-screen slides with keyboard / swipe navigation, progress bar, fullscreen |
| 3 | **Voice Remix** | Select a section and say "make it shorter", "more technical", "rewrite for recruiters"; say "undo" to revert |
| 4 | **Portfolio Reader** | Upload a resume (PDF / DOCX / TXT / MD); hear a spoken first-person walkthrough with sentence highlighting |
| 5 | **Interview Mode** | 5 spoken questions generated from your portfolio, answered by voice, followed by scores, strengths, and what to rehearse |

## Run it

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env             # then put your OPENAI_API_KEY in .env
uvicorn app.main:app --reload
```

Open **http://127.0.0.1:8000** in **Chrome or Edge** (voice input uses the browser Web Speech API; typing works as a fallback everywhere).

No API key yet? Set `VOICECRAFT_MOCK=1` in `.env` to explore the UI with canned responses.

## Tests

```bash
pip install -r requirements-dev.txt
pytest -q
```

The suite runs in mock mode and uses a fake OpenAI client for the real code paths: validation, error handling, JSON normalization, file parsing.

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/casestudy` | transcript → case study JSON |
| `POST /api/remix` | rewrite one section from a spoken instruction |
| `POST /api/upload` | PDF / DOCX / TXT / MD → structured portfolio + narration |
| `POST /api/interview/next` | portfolio + history → next interview question |
| `POST /api/interview/feedback` | full Q&A → scores, strengths, improvements, rehearsal list |
| `GET /api/health` | status, mock mode, key present |

Every LLM call returns strict JSON that is normalized and validated server-side, so the UI never parses free text.

## Project structure

```
app/
  main.py      FastAPI routes + request validation
  llm.py       every prompt and LLM call (+ mock mode)
  parser.py    resume text extraction
static/
  index.html   screens: landing, builder, case study, presentation, upload, reader, interview, summary
  app.js       all client logic (speech, API calls, audio, UI state)
  style.css    dark editorial theme
tests/         pytest suite
docs/          voice prompts per build day + demo script
```

## Notes

- Voice input and audio playback use browser APIs (Web Speech API, `speechSynthesis`): no extra keys or cost.
- Uploads are limited to 5 MB; scanned (image-only) PDFs are rejected with a clear message.
- The API key is read from `.env` and never sent to the browser. `.env` is git-ignored.

## Built with Wispr Flow

_Add your own notes here about how you built this project by voice with Wispr Flow, and link your demo video._
