# VoiceCraft

> **Speak an idea. Build the story. Create, present, listen, remix, and practice your portfolio with voice.**

VoiceCraft is a **voice-first portfolio storytelling studio** that transforms the way developers communicate their work.

Instead of starting with a blank document, you simply **talk about your project**. VoiceCraft turns your spoken explanation into a structured case study, lets you refine it using natural voice commands, presents it as a cinematic portfolio, reads your work back to you, and helps you practice for interviews.

The goal is simple:

**Your voice → Your story → Your portfolio → Your interview practice.**

---

## ✨ What VoiceCraft Does

VoiceCraft combines AI, voice interaction, and portfolio storytelling into one workflow.

| Feature                    | Description                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 🎙️ **Voice → Case Study** | Speak naturally about a project and transform your explanation into a structured case study.                                 |
| 🎬 **Presentation Mode**   | Turn your case study into cinematic, full-screen presentation slides with keyboard/swipe navigation and progress tracking.   |
| 🔄 **Voice Remix**         | Select a section and verbally request changes such as making it shorter, more technical, or recruiter-friendly.              |
| 🔊 **Portfolio Reader**    | Upload a resume or portfolio document and listen to a first-person spoken walkthrough with sentence highlighting.            |
| 🎤 **Interview Mode**      | Generate portfolio-based interview questions, answer them by voice, and receive feedback on strengths and areas to rehearse. |

---

## 🧠 The Core Idea

Traditional portfolio building usually looks like this:

```text
Blank page
    ↓
Write everything manually
    ↓
Rewrite
    ↓
Format
    ↓
Create presentation
    ↓
Practice interview
```

VoiceCraft turns it into:

```text
Speak about your project
        ↓
AI structures your story
        ↓
Review & remix with your voice
        ↓
Generate a presentation
        ↓
Listen to your portfolio
        ↓
Practice a mock interview
        ↓
Get feedback
```

The interface is designed around **speaking first and editing second**.

---

## 🎙️ Voice-First Workflow

VoiceCraft uses browser-based speech capabilities to make voice the primary interaction method.

### 1. Speak

Describe your project naturally:

> “I built a race prediction system that uses historical Formula 1 data to estimate race outcomes…”

The browser captures the speech and converts it into text.

### 2. Structure

The transcript is sent to the backend, where the AI transforms the raw explanation into a structured case study.

### 3. Remix

Instead of manually rewriting paragraphs, you can give natural instructions such as:

```text
Make this shorter.
```

```text
Make this more technical.
```

```text
Rewrite this for recruiters.
```

```text
Undo.
```

### 4. Present

The resulting case study can be converted into a presentation designed for portfolio demonstrations.

### 5. Listen

VoiceCraft can read the portfolio back as a first-person walkthrough, allowing you to hear how your story actually sounds.

### 6. Practice

Interview Mode generates questions based on the portfolio and evaluates your spoken responses.

---

## 🗣️ Built with Wispr Flow

**Wispr Flow was an important part of the development workflow behind VoiceCraft.**

Instead of relying entirely on traditional keyboard-based development, I used **Wispr Flow's voice-to-text workflow to communicate implementation ideas, write development instructions, iterate on features, and work through the project conversationally.**

This was especially useful for a project whose central idea is **voice-first interaction**.

The development process followed the same philosophy as the product:

```text
Think
  ↓
Speak
  ↓
Describe the change
  ↓
Implement
  ↓
Test
  ↓
Iterate
```

Using Wispr Flow helped make development more natural for tasks such as:

* Describing UI and interaction requirements
* Explaining feature behavior
* Writing implementation instructions
* Iterating on prompts and content
* Refining documentation
* Communicating changes without constantly switching between typing and thinking

### Why Wispr Flow?

VoiceCraft explores the idea that **voice should not only be an input method for the final product — it can also become part of the development process itself.**

That makes Wispr Flow a natural fit for the project's development philosophy.

> **Built with voice. Designed around voice. Experienced through voice.**

---

## 🏗️ Architecture

VoiceCraft uses a lightweight client/server architecture.

```text
┌───────────────────────────────────────────┐
│                Browser                    │
│                                           │
│  Voice Input ──→ Web Speech API           │
│  Presentation ──→ Client UI               │
│  Audio Playback ──→ speechSynthesis       │
│  File Upload ──→ API                      │
└─────────────────────┬─────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────┐
│              FastAPI Backend              │
│                                           │
│  Request validation                       │
│  File parsing                             │
│  LLM orchestration                        │
│  JSON normalization                       │
│  Error handling                           │
└─────────────────────┬─────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────┐
│                  LLM                      │
│                                           │
│  Case-study generation                    │
│  Voice remixing                           │
│  Interview questions                      │
│  Interview feedback                       │
└───────────────────────────────────────────┘
```

Every LLM response is normalized and validated server-side before reaching the frontend. This keeps the frontend working with predictable structured data rather than parsing arbitrary model-generated text.

---

## 🛠️ Tech Stack

### Frontend

* HTML
* CSS
* JavaScript
* Web Speech API
* Browser `speechSynthesis`
* Responsive presentation interface

### Backend

* Python
* FastAPI
* Pydantic/request validation
* LLM integration
* PDF/DOCX/TXT/MD parsing

### Development & Testing

* Pytest
* Mock LLM client
* Environment-based configuration
* Git/GitHub
* Wispr Flow

---

## 📁 Project Structure

```text
VoiceCraft/
│
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI routes and request validation
│   ├── llm.py           # Prompts, LLM calls and mock mode
│   └── parser.py        # Resume/portfolio text extraction
│
├── static/
│   ├── index.html       # Application screens
│   ├── app.js           # Client logic, speech, API calls and UI state
│   ├── style.css        # Visual design system
│   └── fonts/           # Local typography
│
├── docs/
│   ├── DAY1_VOICE_PROMPTS.md
│   ├── DAY2_VOICE_PROMPTS.md
│   ├── DAY3_VOICE_PROMPTS.md
│   └── DEMO_SCRIPT.md
│
├── tests/
│   ├── __init__.py
│   └── test_api.py
│
├── .env.example
├── .gitignore
├── requirements.txt
├── requirements-dev.txt
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

* Python 3.10+
* A modern browser such as Chrome or Edge
* An OpenAI API key for live AI functionality

### 1. Clone the repository

```bash
git clone https://github.com/sanskriti45-tech/VoiceCraft.git
cd VoiceCraft
```

### 2. Create a virtual environment

#### Windows

```bash
python -m venv .venv
.venv\Scripts\activate
```

#### macOS / Linux

```bash
python -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Add your API key to `.env`:

```env
OPENAI_API_KEY=your_api_key_here
```

### 5. Start the application

```bash
uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

For the best voice experience, use **Chrome or Edge**.

---

## 🧪 Mock Mode

You can explore the application without an API key.

Add this to `.env`:

```env
VOICECRAFT_MOCK=1
```

Then start the server normally:

```bash
uvicorn app.main:app --reload
```

Mock mode uses predefined responses so the interface and application flow can be tested without making live LLM requests.

---

## 🔌 API

VoiceCraft exposes a small set of focused API endpoints.

| Endpoint                       | Purpose                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| `POST /api/casestudy`          | Convert a transcript into a structured case study           |
| `POST /api/remix`              | Rewrite a selected section using a spoken instruction       |
| `POST /api/upload`             | Convert PDF/DOCX/TXT/MD content into a structured portfolio |
| `POST /api/interview/next`     | Generate the next portfolio-based interview question        |
| `POST /api/interview/feedback` | Evaluate interview responses and generate feedback          |
| `GET /api/health`              | Check application/API status                                |

---

## 🔐 Security & Privacy

* API credentials are stored server-side in `.env`.
* `.env` is excluded from Git using `.gitignore`.
* API keys are never sent directly to the browser.
* Uploaded files are subject to application size and format restrictions.
* Scanned image-only PDFs are not processed as text documents.

**Never commit your real `.env` file or API keys to GitHub.**

---

## 🧪 Running Tests

Install development dependencies:

```bash
pip install -r requirements-dev.txt
```

Run the test suite:

```bash
pytest -q
```

The tests use mock LLM behavior to exercise validation, error handling, JSON normalization, and file-processing paths without requiring live model requests.

---

## 🎯 Design Philosophy

VoiceCraft is built around three principles:

### 1. Voice-first

Speaking should be a first-class interaction, not simply an alternative to typing.

### 2. Structured storytelling

AI should help transform an unstructured explanation into a story that is easier to understand and present.

### 3. Practice through repetition

A portfolio isn't only something you show.

You should be able to **listen to it, remix it, explain it, and practice defending it.**

---

## 🔮 Future Ideas

Potential directions for future versions include:

* More natural conversational editing
* Multi-language voice support
* Persistent portfolio profiles
* Portfolio version history
* Richer presentation customization
* Advanced interview analytics
* Personalized rehearsal plans
* Additional voice-driven development workflows

---

## 📜 License

This project is currently provided for educational, experimental, and portfolio purposes.

---

## 👩‍💻 Author

**Sanskriti Maheshwari**

Built with curiosity, AI, and voice.

### Links

* **GitHub:** https://github.com/sanskriti45-tech/VoiceCraft

---

## ⭐ If You Like VoiceCraft

If you find the idea interesting, consider giving the repository a ⭐ on GitHub and exploring the project.

> **Don't just write your story. Speak it.**
