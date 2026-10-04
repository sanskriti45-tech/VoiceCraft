(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const STORAGE_KEY = "voicecraft:casestudy";

  const state = {
    caseStudy: null,
    listening: false,
    baseText: "", // text already committed to the transcript
    slides: [],
    slideIndex: 0,
    selectedKey: null,
    history: [],
    remixBusy: false,
    portfolio: null,
    visuals: {}, // frontend-only presentation images, keyed by "cover" or a section key
    abstract: true, // show abstract graphics on slides without an image
  };

  /* ------------------------------------------------------------------ */
  /* Screen routing                                                      */
  /* ------------------------------------------------------------------ */
  function show(name) {
    if (name !== "reader") stopReader();
    if (name !== "interview") stopInterviewAudio();
    if (name !== "summary") smSession += 1;
    if (name === "landing") refreshResumeButtons();
    document.querySelectorAll(".screen").forEach((el) => {
      el.classList.toggle("active", el.id === `screen-${name}`);
    });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.listening) stopListening();
      show(btn.dataset.goto);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Landing                                                             */
  /* ------------------------------------------------------------------ */
  /* Landing visuals: hairline mesh waves + ring (pure SVG), scroll reveal, capability selector.
     Purely decorative; nothing here touches app state or the backend. */
  (function landingVisuals() {
    const NS = "http://www.w3.org/2000/svg";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const landing = $("#screen-landing");

    function makePaths(svg, count, stroke, opacity, width) {
      const paths = [];
      for (let i = 0; i < count; i++) {
        const p = document.createElementNS(NS, "path");
        p.setAttribute("stroke", typeof stroke === "function" ? stroke(i / count) : stroke);
        p.setAttribute("stroke-opacity", opacity);
        p.setAttribute("stroke-width", width);
        svg.appendChild(p);
        paths.push(p);
      }
      return paths;
    }
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

    // Horizontal ribbon of many thin sine lines (hero card + footer). Each line gets its own
    // phase and vertical offset so the hairlines fan out into a mesh with visible volume.
    function ribbon(svg, w, h, lines, amp, c1, c2, speed) {
      svg.textContent = "";
      const paths = makePaths(svg, lines, (t) => rgb(mix(c1, c2, t)), 0.75, 0.6);
      return (t) => {
        const ph = t * speed;
        paths.forEach((p, i) => {
          const k = i / (lines - 1);
          let d = "";
          for (let x = 0; x <= 90; x++) {
            const u = x / 90;
            const env = Math.pow(Math.sin(u * Math.PI), 0.7);
            const wave = Math.sin(u * 5.2 + ph + k * 3.6) * 0.55 + Math.sin(u * 9.5 - ph * 1.25 + k * 5.2) * 0.28 + Math.sin(u * 2.4 + ph * 0.6 - k * 2) * 0.4;
            const y = h / 2 + env * amp * (wave + (k - 0.5) * 0.9);
            d += (x ? "L" : "M") + (u * w).toFixed(1) + " " + y.toFixed(1);
          }
          p.setAttribute("d", d);
        });
      };
    }

    // Closed ring of many thin perturbed circles; tone is "lilac" or "coral".
    const TONES = { lilac: [[170, 140, 235], [205, 188, 245]], coral: [[238, 98, 100], [248, 168, 160]] };
    let ringTone = "lilac";
    function ring(svg, lines) {
      svg.textContent = "";
      let tones = TONES.lilac;
      const paths = makePaths(svg, lines, "#a58de8", 0.5, 0.8);
      return (t) => {
        const ph = t * 0.0009;
        tones = TONES[ringTone];
        paths.forEach((p, i) => {
          const k = i / lines;
          p.setAttribute("stroke", rgb(mix(tones[0], tones[1], k)));
          let d = "";
          for (let s = 0; s <= 96; s++) {
            const th = (s / 96) * Math.PI * 2;
            const r = 92 + k * 14 + Math.sin(th * 5 + ph + k * 2.2) * (14 + k * 8) + Math.sin(th * 3 - ph * 1.4) * 8;
            d += (s ? "L" : "M") + (150 + Math.cos(th) * r).toFixed(1) + " " + (150 + Math.sin(th) * r).toFixed(1);
          }
          p.setAttribute("d", d + "Z");
        });
      };
    }

    const BLUE = [126, 163, 230], LILAC = [185, 154, 240];
    const draws = [
      ribbon($("#wave-deco"), 400, 110, 38, 44, BLUE, LILAC, 0.0012),
      ribbon($("#footer-wave"), 1200, 220, 48, 92, [140, 170, 236], [196, 160, 242], 0.0007),
      ring($("#ring-deco"), 30),
    ];
    const targets = [$("#wave-deco"), $("#footer-wave"), $("#ring-deco")];
    draws.forEach((d) => d(0));

    if (!reduce) {
      let last = 0;
      const frame = (t) => {
        // Only animate while the landing screen is visible, at ~30fps.
        if (landing.classList.contains("active") && t - last > 33) {
          last = t;
          targets.forEach((svg, i) => {
            const r = svg.getBoundingClientRect();
            if (r.bottom > 0 && r.top < window.innerHeight) draws[i](t);
          });
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }

    // Scroll reveal (content stays visible if IntersectionObserver is missing).
    const reveals = landing.querySelectorAll(".reveal");
    if ("IntersectionObserver" in window && !reduce) {
      const io = new IntersectionObserver(
        (entries) => entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.remove("pre"); io.unobserve(e.target); }
        }),
        { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
      );
      reveals.forEach((n) => { n.classList.add("pre"); io.observe(n); });
    }

    // Capability selector (click / hover / arrow keys; auto-cycles until the user interacts).
    const items = [...$("#cap-list").children];
    const left = $("#cap-title").parentElement;
    let cur = 0, timer = null, touched = false;
    function pick(i) {
      cur = i;
      left.classList.add("swap");
      setTimeout(() => {
        items.forEach((li, n) => {
          li.classList.toggle("on", n === i);
          li.setAttribute("aria-selected", String(n === i));
        });
        $("#cap-title").textContent = items[i].textContent.replace(/^\s*\d+\s*/, "").trim();
        $("#cap-desc").textContent = items[i].dataset.desc;
        $("#cap-go").dataset.goto = items[i].dataset.gotoTarget;
        ringTone = i % 2 === 0 ? "lilac" : "coral";
        left.classList.remove("swap");
      }, reduce ? 0 : 180);
    }
    function schedule() {
      clearInterval(timer);
      if (!reduce && !touched) timer = setInterval(() => pick((cur + 1) % items.length), 5200);
    }
    items.forEach((li, i) => {
      const activate = () => { touched = true; clearInterval(timer); if (i !== cur) pick(i); };
      li.addEventListener("click", activate);
      li.addEventListener("mouseenter", activate);
      li.addEventListener("focus", activate);
      li.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const n = (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
          items[n].focus();
        }
      });
    });
    schedule();
  })();

  $("#btn-start").addEventListener("click", () => show("builder"));
  $("#btn-upload").addEventListener("click", () => {
    showUploadError("");
    show("upload");
  });

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function saveCaseStudy(cs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cs));
    } catch {
      /* storage can be unavailable; the app still works */
    }
  }

  $("#btn-resume").addEventListener("click", () => {
    const saved = loadSaved();
    if (!saved || !Array.isArray(saved.sections)) return;
    state.caseStudy = saved;
    loadVisuals(saved);
    renderCaseStudy();
    show("casestudy");
  });

  /** Show "open last ..." buttons whenever something is saved (also after uploading/generating). */
  function refreshResumeButtons() {
    const cs = loadSaved();
    $("#btn-resume").classList.toggle("hidden", !(cs && Array.isArray(cs.sections)));
    $("#btn-resume-portfolio").classList.toggle("hidden", !loadPortfolio());
  }

  /* ------------------------------------------------------------------ */
  /* Voice Builder: speech recognition                                   */
  /* ------------------------------------------------------------------ */
  const transcriptEl = $("#transcript");
  const micBtn = $("#btn-mic");
  const micStatus = $("#mic-status");
  const genBtn = $("#btn-generate");
  const errorEl = $("#builder-error");

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  if (!SpeechRecognition) {
    $("#unsupported").classList.remove("hidden");
  }

  function wordCount(text) {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function refreshBuilderUI() {
    const text = transcriptEl.value;
    const words = wordCount(text);
    $("#word-count").textContent = `${words} word${words === 1 ? "" : "s"}`;
    genBtn.disabled = text.trim().length < 30 || state.listening;
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.toggle("hidden", !msg);
  }

  function createRecognition() {
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          state.baseText += result[0].transcript.trim() + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      transcriptEl.value = state.baseText + interim;
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
      refreshBuilderUI();
    };

    rec.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      const messages = {
        "not-allowed": "Microphone access was blocked. Allow the mic in your browser's address bar and try again.",
        "service-not-allowed": "Speech recognition is blocked in this browser. Try Chrome or Edge.",
        "audio-capture": "No microphone was found. Plug one in or check your system settings.",
        network: "Speech recognition needs an internet connection.",
      };
      showError(messages[event.error] || `Speech recognition error: ${event.error}`);
      stopListening();
    };

    // Chrome ends the session after a pause; keep going until the user presses stop.
    rec.onend = () => {
      if (state.listening) {
        try {
          rec.start();
        } catch {
          /* already starting */
        }
      }
    };
    return rec;
  }

  async function startListening() {
    showError("");
    if (!SpeechRecognition) {
      showError("Live voice input is not supported in this browser. Type your description instead.");
      return;
    }
    state.baseText = transcriptEl.value.trim() ? transcriptEl.value.trim() + " " : "";
    recognition = createRecognition();
    try {
      recognition.start();
    } catch (e) {
      showError("Could not start the microphone. Please try again.");
      return;
    }
    state.listening = true;
    transcriptEl.readOnly = true;
    micBtn.classList.add("live");
    micBtn.setAttribute("aria-pressed", "true");
    micStatus.textContent = "Listening… tap again when you're done";
    startMeter();
    refreshBuilderUI();
  }

  function stopListening() {
    state.listening = false;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
      recognition = null;
    }
    transcriptEl.readOnly = false;
    micBtn.classList.remove("live");
    micBtn.setAttribute("aria-pressed", "false");
    micStatus.textContent = transcriptEl.value.trim()
      ? "Paused. Tap the mic to keep talking, or edit the text."
      : "Tap the mic and start talking";
    stopMeter();
    refreshBuilderUI();
  }

  micBtn.addEventListener("click", () => {
    state.listening ? stopListening() : startListening();
  });

  transcriptEl.addEventListener("input", refreshBuilderUI);

  $("#btn-clear").addEventListener("click", () => {
    if (state.listening) stopListening();
    transcriptEl.value = "";
    state.baseText = "";
    showError("");
    micStatus.textContent = "Tap the mic and start talking";
    refreshBuilderUI();
  });

  /* ------------------------------------------------------------------ */
  /* Waveform meter (real mic level when available, gentle idle otherwise)*/
  /* ------------------------------------------------------------------ */
  function createMeter(el) {
    const BARS = 32;
    const bars = [];
    for (let i = 0; i < BARS; i++) {
      const b = document.createElement("span");
      el.appendChild(b);
      bars.push(b);
    }
    let audioCtx = null;
    let analyser = null;
    let micStream = null;
    let raf = null;
    let freqData = null;
    let gen = 0; // invalidates start() calls that were superseded by stop()

    function cleanup() {
      el.classList.remove("live");
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      if (micStream) micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
      if (audioCtx) audioCtx.close().catch(() => {});
      audioCtx = null;
      analyser = null;
      bars.forEach((bar) => (bar.style.height = "6px"));
    }

    async function start() {
      cleanup();
      const myGen = ++gen;
      el.classList.add("live");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (myGen !== gen) {
          stream.getTracks().forEach((t) => t.stop()); // stopped while permission was pending
          return;
        }
        micStream = stream;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(micStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        freqData = new Uint8Array(analyser.frequencyBinCount);
        source.connect(analyser);
      } catch {
        analyser = null; // fall back to the idle animation
      }
      if (myGen !== gen) return;
      const tick = (t) => {
        if (analyser) analyser.getByteFrequencyData(freqData);
        bars.forEach((bar, i) => {
          // Mirrored around the centre so the waveform reads as a symmetric voice shape.
          const m = Math.floor(Math.abs(i - (BARS - 1) / 2) * 1.6);
          const h = analyser
            ? 6 + (freqData[m % freqData.length] / 255) * 48
            : 8 + (Math.sin(t / 220 + m * 0.5) + 1) * 14;
          bar.style.height = `${h}px`;
        });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    function stop() {
      gen += 1;
      cleanup();
    }
    return { start, stop };
  }

  const builderMeter = createMeter($("#meter"));
  const startMeter = () => builderMeter.start();
  const stopMeter = () => builderMeter.stop();

  /* ------------------------------------------------------------------ */
  /* Generate case study                                                 */
  /* ------------------------------------------------------------------ */
  genBtn.addEventListener("click", async () => {
    const transcript = transcriptEl.value.trim();
    if (transcript.length < 30) return;
    showError("");
    const original = genBtn.textContent;
    genBtn.disabled = true;
    genBtn.textContent = "Crafting your story…";
    try {
      const res = await fetch("/api/casestudy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = typeof err.detail === "string" ? err.detail : `Server error (${res.status})`;
        throw new Error(detail);
      }
      state.caseStudy = await res.json();
      saveCaseStudy(state.caseStudy);
      resetVisuals(); // images belong to one case study
      renderCaseStudy();
      show("casestudy");
    } catch (e) {
      showError(e.message || "Something went wrong. Please try again.");
    } finally {
      genBtn.textContent = original;
      refreshBuilderUI();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Case study view                                                     */
  /* ------------------------------------------------------------------ */
  function renderCaseStudy() {
    const cs = state.caseStudy;
    $("#cs-title").textContent = cs.title;
    $("#cs-tagline").textContent = cs.tagline;
    const wrap = $("#cs-sections");
    wrap.textContent = "";
    state.selectedKey = null;
    state.history = [];
    cs.sections.forEach((s, i) => {
      const card = document.createElement("article");
      card.className = "cs-card";
      card.dataset.key = s.key;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-pressed", "false");
      card.addEventListener("click", () => selectSection(s.key));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectSection(s.key);
        }
      });

      const num = document.createElement("div");
      num.className = "cs-num";
      num.textContent = String(i + 1).padStart(2, "0");

      const body = document.createElement("div");
      const h = document.createElement("h3");
      h.textContent = s.heading;
      const p = document.createElement("p");
      p.textContent = s.body;
      body.append(h, p);

      card.append(num, body);
      wrap.appendChild(card);
    });
    updateRemixUI();
    renderVisuals();
  }

  $("#btn-present").addEventListener("click", startPresentation);
  $("#btn-new").addEventListener("click", () => {
    transcriptEl.value = "";
    state.baseText = "";
    refreshBuilderUI();
    show("builder");
  });

  /* ------------------------------------------------------------------ */
  /* Presentation visuals (frontend-only; never sent to the backend)      */
  /* ------------------------------------------------------------------ */
  const VISUALS_KEY = "voicecraft:visuals";
  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  const NS = "http://www.w3.org/2000/svg";
  const visFile = $("#vis-file");
  const visMsg = $("#vis-msg");
  let visPickKey = null;
  let visPersisted = true;

  function persistVisuals() {
    visPersisted = true;
    try {
      if (!Object.keys(state.visuals).length && state.abstract) {
        localStorage.removeItem(VISUALS_KEY);
      } else {
        localStorage.setItem(
          VISUALS_KEY,
          JSON.stringify({ title: state.caseStudy && state.caseStudy.title, abstract: state.abstract, items: state.visuals })
        );
      }
    } catch {
      visPersisted = false; // quota or private mode: images stay for this session only
    }
    return visPersisted;
  }
  function resetVisuals() {
    state.visuals = {};
    state.abstract = true;
    try { localStorage.removeItem(VISUALS_KEY); } catch { /* ignore */ }
  }
  function loadVisuals(cs) {
    state.visuals = {};
    state.abstract = true;
    try {
      const raw = JSON.parse(localStorage.getItem(VISUALS_KEY) || "null");
      if (raw && raw.title === cs.title && raw.items && typeof raw.items === "object") {
        state.visuals = raw.items;
        state.abstract = raw.abstract !== false;
      }
    } catch { /* ignore */ }
  }

  function setVisMsg(msg, isErr) {
    visMsg.textContent = msg || "";
    visMsg.classList.toggle("hidden", !msg);
    visMsg.classList.toggle("banner-error", !!isErr);
  }

  /** Resize in the browser (long edge 1600px) so slides stay light; also make a small thumbnail. */
  async function processImage(file) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Please choose a PNG, JPG, WebP or GIF image.");
    if (file.size > MAX_FILE_BYTES) throw new Error("That image is over 15 MB. Please choose a smaller one.");
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("That file could not be read as an image."));
        i.src = url;
      });
      const draw = (max, q) => {
        const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * s));
        c.height = Math.max(1, Math.round(img.naturalHeight * s));
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; // flatten transparency
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        let out = c.toDataURL("image/webp", q);
        if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", q);
        return { src: out, w: c.width, h: c.height };
      };
      const full = draw(1600, 0.86);
      return { src: full.src, w: full.w, h: full.h, thumb: draw(360, 0.7).src, alt: "", caption: "" };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function attachImage(key, file) {
    if (!file) return;
    setVisMsg("");
    try {
      const prev = state.visuals[key];
      const rec = await processImage(file);
      if (prev) { rec.alt = prev.alt; rec.caption = prev.caption; }
      state.visuals[key] = rec;
      renderVisuals();
      setVisMsg(persistVisuals() ? "" : "Image added for this session. It is too large to remember after you close the tab.", !visPersisted);
    } catch (e) {
      setVisMsg(e.message || "Could not add that image.", true);
    }
  }

  function removeImage(key) {
    delete state.visuals[key];
    persistVisuals();
    renderVisuals();
    setVisMsg("");
  }

  visFile.addEventListener("change", () => {
    const f = visFile.files && visFile.files[0];
    const key = visPickKey;
    visFile.value = "";
    if (key) attachImage(key, f);
  });
  $("#vis-abstract").addEventListener("change", (e) => {
    state.abstract = e.target.checked;
    persistVisuals();
  });

  /* ---- Abstract motifs: hairline SVG in the reference's language. Decorative only. ---- */
  const PAL = { lilac: [170, 140, 235], coral: [238, 98, 100], blue: [126, 163, 230], peach: [248, 168, 160] };
  const mixc = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

  function motifSVG(kind) {
    const svg = document.createElementNS(NS, "svg");
    // tight viewBoxes for motifs whose frames are very wide or small, so they fill the frame
    svg.setAttribute("viewBox", { approach: "0 92 600 256", lessons: "170 120 260 200" }[kind] || "0 0 600 440");
    // mesh-like motifs fill the frame; motifs with discrete shapes are fitted so nothing is cropped
    svg.setAttribute("preserveAspectRatio", ["problem", "result", "cover"].includes(kind) ? "xMidYMid slice" : "xMidYMid meet");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.classList.add("motif", `motif-${kind}`);
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "drift");
    g.setAttribute("fill", "none");
    g.setAttribute("stroke-linecap", "round");
    svg.appendChild(g);
    const P = (d, color, op = 0.6, w = 0.8) => {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("stroke", color);
      p.setAttribute("stroke-opacity", op);
      p.setAttribute("stroke-width", w);
      g.appendChild(p);
    };
    const C = (cx, cy, r, color, op, w) =>
      P(`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`, color, op, w);
    const R = (x, y, w, h, color, op, sw = 0.9, rx = 3) => {
      const r = document.createElementNS(NS, "rect");
      r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", w); r.setAttribute("height", h);
      r.setAttribute("rx", rx); r.setAttribute("stroke", color); r.setAttribute("stroke-opacity", op); r.setAttribute("stroke-width", sw);
      g.appendChild(r);
    };
    const poly = (n, f) => { let d = ""; for (let i = 0; i <= n; i++) { const [x, y] = f(i / n); d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); } return d; };
    const L = PAL.lilac, Co = PAL.coral, B = PAL.blue, Pe = PAL.peach;

    if (kind === "problem") {
      // tangled, noisy lines on the left that settle toward calm on the right
      for (let i = 0; i < 44; i++) {
        const k = i / 43, p1 = i * 1.7, p2 = i * 0.63;
        P(poly(120, (u) => {
          const calm = Math.pow(1 - u, 1.4);
          const y = 220 + (k - 0.5) * 120 * (0.25 + u * 0.75) + calm * (Math.sin(u * 17 + p1) * 70 + Math.sin(u * 31 + p2) * 32);
          return [30 + u * 540, y];
        }), mixc(Co, L, k), 0.55, 0.7);
      }
    } else if (kind === "idea") {
      for (let r = 14; r <= 206; r += 12) C(300, 220, r, mixc(L, Co, r / 206), 0.75 - r / 340, 0.8);
      for (let a = 0; a < 28; a++) {
        const t = (a / 28) * Math.PI * 2;
        P(`M${300 + Math.cos(t) * 26} ${220 + Math.sin(t) * 26}L${300 + Math.cos(t) * 62} ${220 + Math.sin(t) * 62}`, mixc(Co, L, a / 28), 0.6, 0.8);
      }
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("cx", 300); dot.setAttribute("cy", 220); dot.setAttribute("r", 5);
      dot.setAttribute("fill", "rgb(238,98,100)"); dot.setAttribute("stroke", "none");
      g.appendChild(dot);
    } else if (kind === "approach") {
      const xs = [90, 230, 370, 510], ys = [300, 150, 290, 140];
      for (let i = 0; i < 3; i++) {
        const [x1, y1, x2, y2] = [xs[i] + 28, ys[i], xs[i + 1] - 28, ys[i + 1]];
        for (let k = 0; k < 7; k++) {
          const o = (k - 3) * 2.4;
          P(`M${x1} ${y1}C${x1 + 60} ${y1 + o},${x2 - 60} ${y2 + o},${x2} ${y2}`, mixc(B, L, i / 3 + k / 40), 0.6, 0.7);
        }
        P(`M${x2 - 8} ${y2 - 6}L${x2} ${y2}L${x2 - 8} ${y2 + 6}`, "rgb(90,80,120)", 0.7, 1);
      }
      xs.forEach((x, i) => { C(x, ys[i], 28, mixc(L, Co, i / 3), 0.9, 1); C(x, ys[i], 20, mixc(L, Co, i / 3), 0.4, 0.7); C(x, ys[i], 4, mixc(L, Co, i / 3), 0.9, 1.4); });
    } else if (kind === "technology") {
      R(70, 60, 460, 320, "rgb(60,52,50)", 0.5, 1, 14);
      P("M70 100H530", "rgb(60,52,50)", 0.35, 0.8);
      [92, 108, 124].forEach((x) => C(x, 80, 4, "rgb(60,52,50)", 0.5, 0.9));
      const rows = [[0, 150], [1, 220], [1, 120], [2, 180], [2, 90], [1, 200], [0, 70], [1, 160], [2, 130], [1, 100]];
      rows.forEach(([ind, w], i) => R(104 + ind * 26, 126 + i * 22, w, 7, mixc(L, Co, i / 10), 0.7, 0.9, 3.5));
      R(380, 126, 120, 230, "rgb(60,52,50)", 0.25, 0.8, 8);
      for (let i = 0; i < 6; i++) P(`M394 ${150 + i * 32}H${394 + 40 + (i % 3) * 22}`, mixc(B, L, i / 6), 0.6, 1);
    } else if (kind === "result") {
      P("M60 390V60M60 390H550", "rgb(60,52,50)", 0.28, 0.8);
      for (let i = 0; i < 34; i++) {
        const k = i / 33;
        P(poly(100, (u) => [70 + u * 470, 390 - u * 250 - Math.sin(u * 6 + k * 3) * 22 * u - k * 34 * (0.4 + u) + Math.sin(u * 11 - k * 4) * 8]), mixc(B, Co, k), 0.6, 0.7);
      }
      C(540, 140, 7, "rgb(238,98,100)", 0.9, 1.2);
      C(540, 140, 15, "rgb(238,98,100)", 0.4, 0.8);
    } else if (kind === "lessons") {
      for (let i = 0; i < 9; i++) {
        C(255, 220, 40 + i * 7, mixc(L, B, i / 9), 0.85, 0.9);
        C(345, 220, 40 + i * 7, mixc(Co, L, i / 9), 0.85, 0.9);
      }
    } else {
      // cover / default: ring of many thin perturbed circles
      for (let i = 0; i < 34; i++) {
        const k = i / 33;
        P(poly(120, (u) => {
          const th = u * Math.PI * 2;
          const r = 100 + k * 22 + Math.sin(th * 5 + k * 2.2) * (14 + k * 9) + Math.sin(th * 3 - k) * 9;
          return [300 + Math.cos(th) * r, 220 + Math.sin(th) * r];
        }) + "Z", mixc(L, Pe, k), 0.55, 0.8);
      }
    }
    return svg;
  }

  const MOTIF_FOR = { cover: "cover", problem: "problem", idea: "idea", approach: "approach", technology: "technology", result: "result", lessons: "lessons" };

  /* ---- Panel on the case-study screen ---- */
  function visualSlots() {
    const cs = state.caseStudy;
    if (!cs) return [];
    return [{ key: "cover", num: "00", label: "Cover" }].concat(
      cs.sections.map((s, i) => ({ key: s.key, num: String(i + 1).padStart(2, "0"), label: s.heading }))
    );
  }

  function renderVisuals() {
    const grid = $("#vis-grid");
    grid.textContent = "";
    const slots = visualSlots();
    $("#vis-abstract").checked = state.abstract;
    slots.forEach((slot) => {
      const rec = state.visuals[slot.key];
      const tile = el("div", "vis-tile" + (rec ? " has-img" : ""));
      const thumb = el("div", "vis-thumb");
      if (rec) {
        const img = el("img");
        img.src = rec.thumb || rec.src;
        img.alt = "";
        img.decoding = "async";
        thumb.appendChild(img);
      } else {
        thumb.appendChild(motifSVG(MOTIF_FOR[slot.key] || "cover"));
        thumb.classList.add("is-ph");
      }
      const label = el("div", "vis-label");
      label.append(el("span", "vis-num", slot.num), document.createTextNode(` ${slot.label}`));

      const actions = el("div", "vis-actions");
      const add = el("button", "vis-add", rec ? "Replace" : "+ Add project image");
      add.type = "button";
      add.addEventListener("click", () => { visPickKey = slot.key; visFile.click(); });
      actions.appendChild(add);
      if (rec) {
        const rm = el("button", "vis-rm", "Remove");
        rm.type = "button";
        rm.addEventListener("click", () => removeImage(slot.key));
        actions.appendChild(rm);
      }
      tile.append(thumb, label, actions);
      if (rec) {
        const cap = el("input", "vis-caption");
        cap.type = "text";
        cap.maxLength = 120;
        cap.value = rec.caption || "";
        cap.placeholder = "Caption and alt text (optional)";
        cap.setAttribute("aria-label", `Caption for ${slot.label} image`);
        cap.addEventListener("change", () => {
          rec.caption = cap.value.trim();
          rec.alt = rec.caption;
          persistVisuals();
        });
        tile.appendChild(cap);
      }
      if (rec && slot.key === "cover") {
        const wrap = el("label", "vis-bleed");
        const cb = el("input");
        cb.type = "checkbox";
        cb.checked = !!rec.bleed;
        cb.addEventListener("change", () => { rec.bleed = cb.checked; persistVisuals(); });
        wrap.append(cb, document.createTextNode(" Full-bleed background (best for wide photos)"));
        tile.appendChild(wrap);
      }
      // drag & drop onto a tile
      ["dragenter", "dragover"].forEach((ev) => tile.addEventListener(ev, (e) => { e.preventDefault(); tile.classList.add("drag"); }));
      ["dragleave", "drop"].forEach((ev) => tile.addEventListener(ev, () => tile.classList.remove("drag")));
      tile.addEventListener("drop", (e) => {
        e.preventDefault();
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) attachImage(slot.key, f);
      });
      grid.appendChild(tile);
    });
    if (Object.keys(state.visuals).length) $("#visuals").open = true;
  }

  /* ------------------------------------------------------------------ */
  /* Presentation mode                                                   */
  /* ------------------------------------------------------------------ */
  const stage = $("#slide-stage");

  function buildSlides(cs) {
    const slides = [{ kind: "title", vkey: "cover", title: cs.title, tagline: cs.tagline }];
    cs.sections.forEach((s, i) =>
      slides.push({ kind: "section", vkey: s.key, index: i + 1, heading: s.heading, body: s.body, caseTitle: cs.title })
    );
    slides.push({ kind: "end", title: cs.title });
    return slides;
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // One composition per story beat, so the deck has rhythm but a single design system.
  const LAYOUT_FOR = { problem: "split-right", idea: "split-left", approach: "wide", technology: "offset", result: "frame", lessons: "quiet" };
  const LAYOUT_CYCLE = ["split-right", "split-left", "wide", "offset", "frame", "quiet"];

  /** Builds the figure for a slide, or null when it should stay typography-only. */
  function visualBlock(slide) {
    if (!slide.vkey) return null;
    const rec = state.visuals[slide.vkey];
    if (!rec && !state.abstract) return null;
    const fig = el("figure", "slide-visual");
    const frame = el("div", "visual-frame " + (rec ? "has-img" : "is-ph"));
    if (rec) {
      const img = el("img");
      img.src = rec.src;
      img.alt = rec.alt || (slide.kind === "title" ? `Project image for ${slide.title}` : `Project image for ${slide.heading}`);
      img.width = rec.w;
      img.height = rec.h;
      img.decoding = "async";
      img.draggable = false;
      frame.appendChild(img);
      if (slide.kind === "section") {
        const cap = el("figcaption", "visual-cap");
        cap.append(el("span", "", `${String(slide.index).padStart(2, "0")} / ${slide.heading}`));
        if (rec.caption) cap.append(el("span", "", rec.caption));
        fig.append(frame, cap);
        return fig;
      }
    } else {
      fig.setAttribute("aria-hidden", "true");
      frame.appendChild(motifSVG(MOTIF_FOR[slide.vkey] || "cover"));
    }
    fig.appendChild(frame);
    return fig;
  }

  function slideNode(slide) {
    const node = el("div", "slide");
    const text = el("div", "slide-text");
    if (slide.kind === "title") {
      text.append(el("div", "slide-kicker", "Case study"), el("h1", "", slide.title));
      if (slide.tagline) text.append(el("p", "slide-tagline", slide.tagline));
    } else if (slide.kind === "section") {
      text.append(el("div", "slide-num", String(slide.index).padStart(2, "0")), el("h2", "", slide.heading));
      slide.body
        .split(/\n+/)
        .filter(Boolean)
        .forEach((para) => text.append(el("p", "slide-body", para)));
    } else {
      text.append(el("div", "slide-kicker", "Thank you"), el("h1", "", slide.title));
      text.append(el("p", "slide-tagline", "Built by voice with VoiceCraft."));
    }

    const vis = visualBlock(slide);
    let layout = "text";
    if (vis) {
      if (slide.kind === "title") {
        const rec = state.visuals.cover;
        // framed beside the title by default; full-bleed only when the user opts in (and the image is wide)
        layout = rec && rec.bleed && rec.w / rec.h >= 1.15 ? "bleed" : "split-right";
      } else {
        layout = LAYOUT_FOR[slide.vkey] || LAYOUT_CYCLE[(slide.index - 1) % LAYOUT_CYCLE.length];
      }
    }
    node.classList.add(`layout-${layout}`);
    node.append(text);
    if (vis) node.append(vis);
    return node;
  }

  /** Warm the next slide's image so the transition never waits on decoding. */
  function preloadSlide(i) {
    const s = state.slides[i];
    const rec = s && s.vkey && state.visuals[s.vkey];
    if (rec) {
      const img = new Image();
      img.src = rec.src;
      if (img.decode) img.decode().catch(() => {});
    }
  }

  function renderSlide() {
    const slide = state.slides[state.slideIndex];
    stage.querySelectorAll(".slide").forEach((old) => {
      old.classList.remove("in");
      old.classList.add("out");
      setTimeout(() => old.remove(), 600);
    });
    const node = slideNode(slide);
    stage.appendChild(node);
    requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add("in")));
    preloadSlide(state.slideIndex + 1);

    const last = state.slides.length - 1;
    $("#slide-counter").textContent = `${state.slideIndex + 1} / ${state.slides.length}`;
    $("#progress-bar").style.width = `${(state.slideIndex / last) * 100}%`;
    $("#btn-prev").disabled = state.slideIndex === 0;
    $("#btn-next").disabled = state.slideIndex === last;
  }

  function go(delta) {
    const next = state.slideIndex + delta;
    if (next < 0 || next >= state.slides.length) return;
    state.slideIndex = next;
    renderSlide();
  }

  function startPresentation() {
    if (!state.caseStudy) return;
    state.slides = buildSlides(state.caseStudy);
    state.slideIndex = 0;
    stage.textContent = "";
    show("present");
    renderSlide();
  }

  function exitPresentation() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    show("casestudy");
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  $("#btn-next").addEventListener("click", () => go(1));
  $("#btn-prev").addEventListener("click", () => go(-1));
  $("#btn-exit").addEventListener("click", exitPresentation);
  $("#btn-fullscreen").addEventListener("click", toggleFullscreen);

  document.addEventListener("keydown", (e) => {
    if (!$("#screen-present").classList.contains("active")) return;
    if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
      e.preventDefault();
      go(1);
    } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
      e.preventDefault();
      go(-1);
    } else if (e.key === "Escape") {
      exitPresentation();
    } else if (e.key === "f" || e.key === "F") {
      toggleFullscreen();
    }
  });

  // Swipe navigation for touch screens
  let touchX = null;
  stage.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    touchX = null;
  });


  /* ================================================================== */
  /* DAY 2 — Voice Remix                                                 */
  /* ================================================================== */
  const remixInput = $("#remix-input");
  const remixStatus = $("#remix-status");
  const remixMic = $("#btn-remix-mic");
  let remixRec = null;

  const SECTION_NAMES = {
    problem: ["problem"],
    idea: ["idea"],
    approach: ["approach"],
    technology: ["technology", "tech stack"],
    result: ["result", "results", "outcome"],
    lessons: ["lessons learned", "lessons", "learnings"],
  };

  function sectionByKey(key) {
    return state.caseStudy && state.caseStudy.sections.find((s) => s.key === key);
  }

  function setRemixStatus(msg, isErr = false) {
    remixStatus.textContent = msg;
    remixStatus.classList.toggle("err", isErr);
  }

  function updateRemixUI() {
    const sec = sectionByKey(state.selectedKey);
    $("#remix-target").textContent = sec ? `Editing: ${sec.heading}` : "Select a section to edit";
    document.querySelectorAll(".cs-card").forEach((card) => {
      const on = card.dataset.key === state.selectedKey;
      card.classList.toggle("selected", on);
      card.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const busy = state.remixBusy;
    $("#remix-dock").classList.toggle("busy", busy);
    $("#btn-undo").disabled = busy || state.history.length === 0;
    $("#btn-remix-apply").disabled = busy;
    remixInput.disabled = busy;
    document.querySelectorAll("#remix-chips .chip").forEach((c) => (c.disabled = busy));
    if (!SpeechRecognition) {
      remixMic.disabled = true;
      remixMic.title = "Voice input needs Chrome or Edge. Type an instruction instead.";
    }
  }

  function selectSection(key) {
    state.selectedKey = key;
    updateRemixUI();
  }

  /** Decide which section an instruction applies to. */
  function resolveTarget(instruction) {
    const low = instruction.toLowerCase();
    // "problem section" always wins, even over a selected card
    for (const [key, words] of Object.entries(SECTION_NAMES)) {
      for (const w of words) {
        if (new RegExp(`\\b${w}\\s+(section|part|paragraph)\\b`).test(low)) return key;
      }
    }
    if (state.selectedKey) return state.selectedKey;
    // no selection: accept "the problem", "the idea", ...
    for (const [key, words] of Object.entries(SECTION_NAMES)) {
      for (const w of words) {
        if (new RegExp(`\\bthe\\s+${w}\\b`).test(low)) return key;
      }
    }
    return null;
  }

  function otherSectionsContext(excludeKey) {
    return state.caseStudy.sections
      .filter((s) => s.key !== excludeKey)
      .map((s) => `${s.heading}: ${s.body}`)
      .join("\n")
      .slice(0, 5500);
  }

  function refreshCard(key) {
    const sec = sectionByKey(key);
    const card = $(`.cs-card[data-key="${key}"]`);
    if (!sec || !card) return;
    card.querySelector("p").textContent = sec.body;
    card.classList.remove("flash");
    void card.offsetWidth; // restart the animation
    card.classList.add("flash");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function persistCaseStudy() {
    saveCaseStudy(state.caseStudy);
  }

  function undoRemix() {
    const last = state.history.pop();
    if (!last) {
      setRemixStatus("Nothing to undo yet.");
      return;
    }
    const sec = sectionByKey(last.key);
    if (sec) sec.body = last.body;
    persistCaseStudy();
    selectSection(last.key);
    refreshCard(last.key);
    setRemixStatus(`Undone. ${sec ? sec.heading : "Section"} restored.`);
  }

  async function applyRemix(rawInstruction) {
    const instruction = (rawInstruction || "").trim();
    if (!instruction || state.remixBusy || !state.caseStudy) return;

    if (/^(undo|revert|go back)\b/i.test(instruction)) {
      undoRemix();
      return;
    }

    const key = resolveTarget(instruction);
    if (!key) {
      setRemixStatus("Tap a section first, or say its name, e.g. “make the problem section shorter”.", true);
      return;
    }
    selectSection(key);
    const sec = sectionByKey(key);

    state.remixBusy = true;
    updateRemixUI();
    setRemixStatus(`“${instruction}”`);
    try {
      const res = await fetch("/api/remix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: state.caseStudy.title,
          heading: sec.heading,
          body: sec.body,
          instruction,
          context: otherSectionsContext(key),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.detail === "string" ? err.detail : `Server error (${res.status})`);
      }
      const data = await res.json();
      if (!data.body || data.body === sec.body) {
        setRemixStatus(data.note || "That didn't change anything. Try rephrasing.", true);
      } else {
        state.history.push({ key, body: sec.body });
        if (state.history.length > 25) state.history.shift();
        sec.body = data.body;
        persistCaseStudy();
        refreshCard(key);
        setRemixStatus(data.note ? `Updated. ${data.note}` : `Updated ${sec.heading}. Say “undo” to revert.`);
        remixInput.value = "";
      }
    } catch (e) {
      setRemixStatus(e.message || "Remix failed. Please try again.", true);
    } finally {
      state.remixBusy = false;
      updateRemixUI();
    }
  }

  function remixMicError(code) {
    const m = {
      "no-speech": "Didn't catch that. Tap the mic and try again.",
      "not-allowed": "Microphone access was blocked. Allow the mic in your browser's address bar.",
      "service-not-allowed": "Speech recognition is blocked in this browser. Try Chrome or Edge.",
      "audio-capture": "No microphone was found.",
      network: "Speech recognition needs an internet connection.",
    };
    return m[code] || `Speech recognition error: ${code}`;
  }

  function stopRemixListening() {
    if (remixRec) {
      try {
        remixRec.stop();
      } catch {
        /* ignore */
      }
    }
  }

  function startRemixListening() {
    if (!SpeechRecognition || state.remixBusy) return;
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    let finalText = "";
    let failed = false;

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setRemixStatus(`Hearing: “${(finalText + interim).trim()}”`);
    };
    rec.onerror = (e) => {
      failed = true;
      if (e.error !== "aborted") setRemixStatus(remixMicError(e.error), true);
    };
    rec.onend = () => {
      remixRec = null;
      remixMic.classList.remove("live");
      remixMic.setAttribute("aria-pressed", "false");
      const text = finalText.trim();
      if (text) applyRemix(text);
      else if (!failed) setRemixStatus("Didn't catch that. Tap the mic and try again.", true);
    };

    try {
      rec.start();
    } catch {
      setRemixStatus("Could not start the microphone. Please try again.", true);
      return;
    }
    remixRec = rec;
    remixMic.classList.add("live");
    remixMic.setAttribute("aria-pressed", "true");
    const sec = sectionByKey(state.selectedKey);
    setRemixStatus(sec ? `Listening… tell me how to change “${sec.heading}”` : "Listening… name a section or tap one first");
  }

  remixMic.addEventListener("click", () => (remixRec ? stopRemixListening() : startRemixListening()));
  $("#btn-undo").addEventListener("click", undoRemix);
  $("#btn-remix-apply").addEventListener("click", () => applyRemix(remixInput.value));
  remixInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyRemix(remixInput.value);
  });
  $("#remix-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) applyRemix(chip.dataset.cmd);
  });

  /* ================================================================== */
  /* DAY 2 — Upload                                                      */
  /* ================================================================== */
  const PORTFOLIO_KEY = "voicecraft:portfolio";
  const MAX_UPLOAD = 5 * 1024 * 1024;
  const dropzone = $("#dropzone");
  const fileInput = $("#file-input");

  function showUploadError(msg) {
    const el = $("#upload-error");
    el.textContent = msg;
    el.classList.toggle("hidden", !msg);
  }

  function savePortfolio(p) {
    try {
      localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }
  function loadPortfolio() {
    try {
      const raw = localStorage.getItem(PORTFOLIO_KEY);
      const p = raw ? JSON.parse(raw) : null;
      return p && Array.isArray(p.narration) && p.narration.length ? p : null;
    } catch {
      return null;
    }
  }

  $("#btn-resume-portfolio").addEventListener("click", () => {
    const p = loadPortfolio();
    if (!p) return;
    state.portfolio = p;
    renderReader();
    show("reader");
  });

  async function uploadFile(file) {
    showUploadError("");
    if (!file) return;
    if (file.size > MAX_UPLOAD) {
      showUploadError("File is too large. The limit is 5 MB.");
      return;
    }
    dropzone.classList.add("busy");
    $("#drop-title").textContent = "Reading your portfolio…";
    $("#drop-sub").textContent = file.name;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.detail === "string" ? err.detail : `Server error (${res.status})`);
      }
      state.portfolio = await res.json();
      savePortfolio(state.portfolio);
      renderReader();
      show("reader");
    } catch (e) {
      showUploadError(e.message || "Upload failed. Please try again.");
    } finally {
      dropzone.classList.remove("busy");
      $("#drop-title").textContent = "Drop your file here, or click to browse";
      $("#drop-sub").textContent = "Text-based PDFs work best. Scanned images are not supported.";
      fileInput.value = "";
    }
  }

  fileInput.addEventListener("change", () => uploadFile(fileInput.files[0]));
  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag");
    })
  );
  dropzone.addEventListener("drop", (e) => uploadFile(e.dataTransfer.files[0]));

  /* ================================================================== */
  /* DAY 2 — Portfolio Reader (audio walkthrough)                        */
  /* ================================================================== */
  const synth = window.speechSynthesis || null;
  const reader = { index: 0, chunks: [], chunkIdx: 0, playing: false, finished: false, token: 0, rate: 1, voiceName: "" };
  const playBtn = $("#rd-play");

  /** Split text into short utterances (Chrome cuts off long ones). Deterministic, so UI and audio match. */
  function chunkText(text) {
    const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
    const chunks = [];
    let cur = "";
    for (const s of sentences) {
      if (cur && (cur + s).length > 190) {
        chunks.push(cur.trim());
        cur = "";
      }
      cur += s;
    }
    if (cur.trim()) chunks.push(cur.trim());
    return chunks;
  }

  function narration() {
    return (state.portfolio && state.portfolio.narration) || [];
  }

  function englishVoices() {
    return synth ? synth.getVoices().filter((v) => /^en/i.test(v.lang)) : [];
  }

  function voiceScore(v) {
    let sc = 0;
    if (/natural|neural|online/i.test(v.name)) sc += 3;
    if (/google/i.test(v.name)) sc += 2;
    if (/^en-(us|gb|in)/i.test(v.lang)) sc += 1;
    return sc;
  }

  function populateVoices() {
    const sel = $("#rd-voice");
    const voices = englishVoices().sort((a, b) => voiceScore(b) - voiceScore(a));
    sel.textContent = "";
    voices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.name;
      opt.textContent = v.name.replace(/^Microsoft |^Google /, "");
      sel.appendChild(opt);
    });
    if (voices.length) {
      if (!reader.voiceName || !voices.some((v) => v.name === reader.voiceName)) reader.voiceName = voices[0].name;
      sel.value = reader.voiceName;
    }
    sel.classList.toggle("hidden", voices.length === 0);
  }

  if (synth) {
    populateVoices();
    synth.addEventListener("voiceschanged", populateVoices);
  } else {
    $("#rd-unsupported").classList.remove("hidden");
  }

  function renderReader() {
    const p = state.portfolio;
    stopReader();
    $("#rd-name").textContent = p.name || "Your portfolio";
    $("#rd-headline").textContent = p.headline || "";
    $("#rd-error").classList.add("hidden");
    const wrap = $("#rd-chapters");
    wrap.textContent = "";
    narration().forEach((seg, i) => {
      const card = document.createElement("article");
      card.className = "rd-card";
      card.dataset.index = String(i);
      const h = document.createElement("h3");
      h.textContent = seg.heading;
      const para = document.createElement("p");
      chunkText(seg.text).forEach((c, ci) => {
        const span = document.createElement("span");
        span.className = "chunk";
        span.dataset.ci = String(ci);
        span.textContent = c + " ";
        para.appendChild(span);
      });
      card.append(h, para);
      card.addEventListener("click", () => playFrom(i, 0));
      wrap.appendChild(card);
    });
    reader.index = 0;
    reader.chunkIdx = 0;
    reader.finished = false;
    updateReaderUI();
  }

  function updateReaderUI() {
    const segs = narration();
    const n = segs.length;
    document.querySelectorAll(".rd-card").forEach((card) => {
      const active = reader.playing && Number(card.dataset.index) === reader.index;
      card.classList.toggle("active", active);
      card.querySelectorAll(".chunk").forEach((c) => {
        c.classList.toggle("now", active && Number(c.dataset.ci) === reader.chunkIdx);
      });
    });
    playBtn.textContent = reader.playing ? "⏸ Pause" : reader.finished ? "↻ Replay" : "▶ Play";
    $("#rd-counter").textContent = n ? `${reader.index + 1} / ${n}` : "";
    $("#rd-prev").disabled = reader.index === 0;
    $("#rd-next").disabled = reader.index >= n - 1;
    const within = reader.chunks.length ? reader.chunkIdx / reader.chunks.length : 0;
    const pct = reader.finished ? 100 : n ? ((reader.index + within) / n) * 100 : 0;
    $("#player-bar").style.width = `${pct}%`;
  }

  function readerError(msg) {
    const el = $("#rd-error");
    el.textContent = msg;
    el.classList.toggle("hidden", !msg);
  }

  function speakChunk(token) {
    if (token !== reader.token || !reader.playing) return;
    if (reader.chunkIdx >= reader.chunks.length) {
      if (reader.index + 1 < narration().length) {
        playFrom(reader.index + 1, 0);
      } else {
        reader.playing = false;
        reader.finished = true;
        updateReaderUI();
      }
      return;
    }
    const u = new SpeechSynthesisUtterance(reader.chunks[reader.chunkIdx]);
    u.rate = reader.rate;
    const voice = englishVoices().find((v) => v.name === reader.voiceName);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.onend = () => {
      if (token !== reader.token) return;
      reader.chunkIdx += 1;
      updateReaderUI();
      speakChunk(token);
    };
    u.onerror = (e) => {
      if (token !== reader.token) return;
      if (e.error === "interrupted" || e.error === "canceled") return;
      reader.playing = false;
      readerError("Audio playback failed. Try another voice or reload the page.");
      updateReaderUI();
    };
    synth.speak(u);
    updateReaderUI();
  }

  function playFrom(idx, chunkIdx = 0) {
    if (!synth) return;
    const segs = narration();
    if (idx < 0 || idx >= segs.length) return;
    readerError("");
    reader.token += 1;
    const token = reader.token;
    synth.cancel();
    reader.index = idx;
    reader.chunks = chunkText(segs[idx].text);
    reader.chunkIdx = chunkIdx;
    reader.playing = true;
    reader.finished = false;
    updateReaderUI();
    const card = $(`.rd-card[data-index="${idx}"]`);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => speakChunk(token), 60); // avoids Chrome's silent-after-cancel quirk
  }

  function pauseReader() {
    reader.token += 1;
    reader.playing = false;
    if (synth) synth.cancel();
    updateReaderUI();
  }

  function stopReader() {
    reader.token += 1;
    reader.playing = false;
    if (synth) synth.cancel();
    if (document.querySelector(".rd-card")) updateReaderUI();
  }

  playBtn.addEventListener("click", () => {
    if (reader.playing) pauseReader();
    else if (reader.finished) playFrom(0, 0);
    else playFrom(reader.index, reader.chunkIdx);
  });
  $("#rd-prev").addEventListener("click", () => playFrom(reader.index - 1, 0));
  $("#rd-next").addEventListener("click", () => playFrom(reader.index + 1, 0));
  $("#rd-rate").addEventListener("change", (e) => {
    reader.rate = Number(e.target.value) || 1;
    if (reader.playing) playFrom(reader.index, reader.chunkIdx);
  });
  $("#rd-voice").addEventListener("change", (e) => {
    reader.voiceName = e.target.value;
    if (reader.playing) playFrom(reader.index, reader.chunkIdx);
  });
  window.addEventListener("beforeunload", () => {
    if (synth) synth.cancel();
  });


  /* ================================================================== */
  /* DAY 3 — shared speech helpers                                       */
  /* ================================================================== */
  let speakToken = 0;

  /** Speak text aloud in short chunks. onDone fires when finished (not when cancelled). */
  function speakText(text, onDone) {
    if (!synth) {
      if (onDone) onDone();
      return;
    }
    const token = ++speakToken;
    synth.cancel();
    const chunks = chunkText(text);
    let i = 0;
    const next = () => {
      if (token !== speakToken) return;
      if (i >= chunks.length) {
        if (onDone) onDone();
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      u.rate = reader.rate;
      const voice = englishVoices().find((v) => v.name === reader.voiceName);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      u.onend = next;
      u.onerror = (e) => {
        if (token !== speakToken) return;
        if (e.error === "interrupted" || e.error === "canceled") return;
        if (onDone) onDone();
      };
      synth.speak(u);
    };
    setTimeout(next, 60);
  }

  function stopSpeaking() {
    speakToken += 1;
    if (synth) synth.cancel();
  }

  /** Continuous dictation that survives Chrome's auto-stop on silence. */
  function makeDictation({ base, onText, onError }) {
    let rec = null;
    let active = false;
    let text = base;

    function build() {
      const r = new SpeechRecognition();
      r.continuous = true;
      r.interimResults = true;
      r.lang = "en-US";
      r.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) text += res[0].transcript.trim() + " ";
          else interim += res[0].transcript;
        }
        onText(text + interim);
      };
      r.onerror = (e) => {
        if (e.error === "no-speech" || e.error === "aborted") return;
        onError(e.error);
      };
      r.onend = () => {
        if (active) {
          try {
            r.start();
          } catch {
            /* already starting */
          }
        }
      };
      return r;
    }

    return {
      start() {
        rec = build();
        try {
          rec.start();
        } catch {
          return false;
        }
        active = true;
        return true;
      },
      stop() {
        active = false;
        try {
          if (rec) rec.stop();
        } catch {
          /* ignore */
        }
        rec = null;
      },
      active: () => active,
    };
  }

  /* ================================================================== */
  /* DAY 3 — Interview Mode                                              */
  /* ================================================================== */
  const TOTAL_QUESTIONS = 5;
  const iv = { history: [], question: "", phase: "intro", session: 0, dictation: null, retryFn: null };
  const ivMeter = createMeter($("#iv-meter"));
  const ivAnswer = $("#iv-answer");
  const ivMic = $("#iv-mic");
  const ivSubmit = $("#iv-submit");
  const ivSkip = $("#iv-skip");
  const ivReplay = $("#iv-replay");

  function ivStatus(msg) {
    $("#iv-status").textContent = msg;
  }

  function ivError(msg, retryFn) {
    iv.retryFn = retryFn || null;
    $("#iv-error-text").textContent = msg || "";
    $("#iv-retry").classList.toggle("hidden", !retryFn);
    $("#iv-error").classList.toggle("hidden", !msg);
  }

  function ivRenderDots() {
    const dots = $("#iv-dots");
    dots.textContent = "";
    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
      const d = document.createElement("span");
      if (i < iv.history.length) d.className = "done";
      else if (i === iv.history.length) d.className = "now";
      dots.appendChild(d);
    }
    const n = Math.min(iv.history.length + 1, TOTAL_QUESTIONS);
    $("#iv-count").textContent = `Question ${n} of ${TOTAL_QUESTIONS}`;
  }

  function ivRenderControls() {
    const live = iv.phase === "live" && !!iv.question;
    const listening = !!iv.dictation && iv.dictation.active();
    ivMic.disabled = !live || !SpeechRecognition;
    ivSkip.disabled = !live;
    ivReplay.disabled = !live;
    ivAnswer.disabled = !live;
    ivAnswer.readOnly = listening;
    ivSubmit.disabled = !live || ivAnswer.value.trim().length < 5;
    const words = wordCount(ivAnswer.value);
    $("#iv-words").textContent = `${words} word${words === 1 ? "" : "s"}`;
    if (!SpeechRecognition) ivMic.title = "Voice answers need Chrome or Edge. Type your answer instead.";
  }

  function ivSetScreenPhase(intro) {
    $("#iv-intro").classList.toggle("hidden", !intro);
    $("#iv-live").classList.toggle("hidden", intro);
  }

  /** Stop anything that uses the mic or speakers and invalidate in-flight requests. */
  function silenceInterviewMic() {
    if (iv.dictation) {
      iv.dictation.stop();
      iv.dictation = null;
    }
    ivMic.classList.remove("live");
    ivMic.setAttribute("aria-pressed", "false");
    ivMeter.stop();
  }

  function stopInterviewAudio() {
    iv.session += 1;
    stopSpeaking();
    silenceInterviewMic();
    smSpeaking = false;
    $("#sm-hear").textContent = "Hear summary";
  }

  function resetInterview() {
    stopInterviewAudio();
    iv.history = [];
    iv.question = "";
    iv.phase = "intro";
    ivAnswer.value = "";
    ivError("");
    $("#iv-question").textContent = "";
    ivSetScreenPhase(true);
  }

  function micErrorText(code) {
    return remixMicError(code);
  }

  async function fetchQuestion() {
    const session = iv.session;
    iv.phase = "loading";
    iv.question = "";
    ivError("");
    ivRenderDots();
    $("#iv-question").textContent = "…";
    ivStatus(iv.history.length ? "Thinking of your next question…" : "Preparing your first question…");
    ivRenderControls();
    try {
      const res = await fetch("/api/interview/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio: state.portfolio, history: iv.history, total: TOTAL_QUESTIONS }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.detail === "string" ? err.detail : `Server error (${res.status})`);
      }
      const data = await res.json();
      if (session !== iv.session) return; // user left or restarted
      iv.question = data.question;
      iv.phase = "live";
      renderQuestion(session);
    } catch (e) {
      if (session !== iv.session) return;
      iv.phase = "error";
      $("#iv-question").textContent = "Something went wrong.";
      ivStatus("");
      ivError(e.message || "Could not get the next question.", fetchQuestion);
      ivRenderControls();
    }
  }

  function renderQuestion(session) {
    $("#iv-question").textContent = iv.question;
    ivAnswer.value = "";
    ivRenderDots();
    ivRenderControls();
    ivStatus("Listen to the question…");
    speakText(iv.question, () => {
      if (session === iv.session && iv.phase === "live" && !(iv.dictation && iv.dictation.active())) {
        ivStatus("Your turn. Tap the mic and answer out loud.");
      }
    });
  }

  function startAnswerDictation() {
    ivError("");
    if (!SpeechRecognition) {
      $("#iv-unsupported").classList.remove("hidden");
      ivStatus("Type your answer below.");
      ivAnswer.focus();
      return;
    }
    stopSpeaking();
    const session = iv.session;
    const question = iv.question;
    const base = ivAnswer.value.trim() ? ivAnswer.value.trim() + " " : "";
    iv.dictation = makeDictation({
      base,
      onText: (t) => {
        if (session !== iv.session || question !== iv.question) return; // stale result from a previous question
        ivAnswer.value = t;
        ivAnswer.scrollTop = ivAnswer.scrollHeight;
        ivRenderControls();
      },
      onError: (code) => {
        ivError(micErrorText(code));
        stopAnswerDictation();
      },
    });
    if (!iv.dictation.start()) {
      iv.dictation = null;
      ivError("Could not start the microphone. Please try again.");
      return;
    }
    ivMic.classList.add("live");
    ivMic.setAttribute("aria-pressed", "true");
    ivMeter.start();
    ivStatus("Listening… tap the mic when you're done");
    ivRenderControls();
  }

  function stopAnswerDictation() {
    silenceInterviewMic();
    if (iv.phase === "live") {
      ivStatus(ivAnswer.value.trim() ? "Review your answer, then submit. Tap the mic to add more." : "Tap the mic and answer out loud.");
    }
    ivRenderControls();
  }

  function submitAnswer(skipped) {
    if (iv.phase !== "live" || !iv.question) return;
    const answer = skipped ? "" : ivAnswer.value.trim();
    silenceInterviewMic();
    stopSpeaking();
    iv.history.push({ question: iv.question, answer });
    iv.question = "";
    if (iv.history.length >= TOTAL_QUESTIONS) {
      finishInterview();
    } else {
      fetchQuestion();
    }
  }

  function finishInterview() {
    show("summary");
    loadFeedback();
  }

  $("#btn-interview").addEventListener("click", () => {
    if (!state.portfolio) return;
    resetInterview();
    show("interview");
  });

  $("#iv-start").addEventListener("click", () => {
    ivSetScreenPhase(false);
    if (!SpeechRecognition) $("#iv-unsupported").classList.remove("hidden");
    fetchQuestion();
  });

  ivMic.addEventListener("click", () => {
    if (iv.dictation && iv.dictation.active()) stopAnswerDictation();
    else startAnswerDictation();
  });
  ivReplay.addEventListener("click", () => {
    if (iv.dictation && iv.dictation.active()) stopAnswerDictation(); // avoid the mic hearing the question
    const session = iv.session;
    ivStatus("Listen to the question…");
    speakText(iv.question, () => {
      if (session === iv.session && iv.phase === "live") ivStatus("Your turn. Tap the mic and answer out loud.");
    });
  });
  ivSubmit.addEventListener("click", () => submitAnswer(false));
  ivSkip.addEventListener("click", () => submitAnswer(true));
  ivAnswer.addEventListener("input", ivRenderControls);
  ivAnswer.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !ivSubmit.disabled) submitAnswer(false);
  });
  $("#iv-retry").addEventListener("click", () => {
    const fn = iv.retryFn;
    ivError("");
    if (fn) fn();
  });

  /* ================================================================== */
  /* DAY 3 — Summary / feedback                                          */
  /* ================================================================== */
  let smSession = 0;
  let smSpeaking = false;
  let smSpeech = "";
  const SCORE_LABELS = { clarity: "Clarity", depth: "Depth", specificity: "Specificity", structure: "Structure" };

  function smShow(which) {
    $("#sm-loading").classList.toggle("hidden", which !== "loading");
    $("#sm-content").classList.toggle("hidden", which !== "content");
    $("#sm-error").classList.toggle("hidden", which !== "error");
  }

  async function loadFeedback() {
    const session = ++smSession;
    smShow("loading");
    $("#sm-hear").disabled = true;
    try {
      const res = await fetch("/api/interview/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio: state.portfolio, history: iv.history }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.detail === "string" ? err.detail : `Server error (${res.status})`);
      }
      const data = await res.json();
      if (session !== smSession) return;
      renderSummary(data);
      smShow("content");
    } catch (e) {
      if (session !== smSession) return;
      $("#sm-error-text").textContent = e.message || "Could not generate feedback.";
      smShow("error");
    }
  }

  function fillList(listEl, items, tag = "li") {
    listEl.textContent = "";
    items.forEach((t) => listEl.appendChild(el(tag, "", t)));
  }

  function renderSummary(d) {
    $("#sm-overall").textContent = String(d.overall);
    $("#sm-ring").className = "score-ring" + (d.overall <= 3 ? " low" : d.overall <= 6 ? " mid" : "");
    $("#sm-summary").textContent = d.summary;

    const bars = $("#sm-bars");
    bars.textContent = "";
    Object.entries(SCORE_LABELS).forEach(([key, label]) => {
      const score = d.scores[key];
      const row = el("div", "bar-row");
      const track = el("div", "bar-track");
      const fill = el("div", "bar-fill");
      track.appendChild(fill);
      row.append(el("span", "", label), track, el("span", "", `${score}/5`));
      bars.appendChild(row);
      requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${(score / 5) * 100}%`)));
    });

    fillList($("#sm-strengths"), d.strengths);
    fillList($("#sm-improve"), d.improvements);
    fillList($("#sm-rehearse"), d.rehearse_next);

    const qWrap = $("#sm-questions");
    qWrap.textContent = "";
    d.per_question.forEach((q, i) => {
      const det = el("details", "sm-q");
      det.appendChild(el("summary", "", `Q${i + 1}. ${q.question}`));
      const body = el("div", "sm-q-body");
      const answer = (iv.history[i] && iv.history[i].answer) || "";
      const mk = (label, text, cls) => {
        const box = el("div");
        box.append(el("span", "lbl", label), el("span", cls || "", text));
        return box;
      };
      body.appendChild(mk("Your answer", answer || "(skipped)", "ans"));
      if (q.feedback) body.appendChild(mk("Feedback", q.feedback));
      if (q.tip) body.appendChild(mk("Next time", q.tip));
      det.appendChild(body);
      qWrap.appendChild(det);
    });

    smSpeech = [d.summary, d.rehearse_next.length ? "Here is what to rehearse next. " + d.rehearse_next.join(". ") + "." : ""]
      .filter(Boolean)
      .join(" ");
    $("#sm-hear").disabled = !synth;
  }

  $("#sm-hear").addEventListener("click", () => {
    if (smSpeaking) {
      stopSpeaking();
      smSpeaking = false;
      $("#sm-hear").textContent = "Hear summary";
      return;
    }
    smSpeaking = true;
    $("#sm-hear").textContent = "Stop";
    speakText(smSpeech, () => {
      smSpeaking = false;
      $("#sm-hear").textContent = "Hear summary";
    });
  });
  $("#sm-retry").addEventListener("click", loadFeedback);
  $("#sm-again").addEventListener("click", () => {
    resetInterview();
    show("interview");
  });

  refreshResumeButtons();
  refreshBuilderUI();
})();
