# Debate Coach

A small, pedagogically-aligned web app for upper-primary (P5–P6) students preparing for a debate.

**Live site:** https://yinkangquek.github.io/debate-coach/

**Current topic:** *Should we kill crows in Singapore?* — arguing FOR the motion (proposition).

## What it does

Walks the student through six steps:

1. **The Motion** — what is being debated and which side they are on.
2. **Understand the Issue** — Singapore-specific facts on house crows (NEA culling, attack hotspots, invasive-species context), revealed by tapping cards.
3. **Brainstorm Your Angles** — four stakeholder lenses (safety, health, ecology, quality of life), each with starter ideas and a free-text box that auto-saves.
4. **Build a PEEL Argument** — Point / Evidence / Explanation / Link, with a built-in heuristic linter that runs five pedagogical checks (does the evidence include a number or place? does the link refer back to the motion? are there over-strong words like "always"?). Arguments can be saved, edited, and deleted.
5. **Anticipate the Opposition** — likely counter-arguments with a "reveal hint" coaching nudge.
6. **Practice Your Speech** — auto-assembles saved arguments + rebuttals into a speech outline, with text-to-speech read-aloud and 60s/90s/120s practice timers.

Includes a glossary drawer (motion, proposition, rebuttal, evidence, weighing, etc.).

## How it's built

- Pure HTML + CSS + vanilla JS. No build step, no framework, no npm install.
- All work persists in `localStorage` — nothing leaves the browser.
- Topic content lives in `topics/crows.json`; future topics are content edits, not code changes.
- Uses the browser's `speechSynthesis` API for read-aloud — no API keys, no backend.

## Running locally

Any static server works. From this directory:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` directly — though `fetch()` for the topic JSON needs a server, so prefer the command above.
