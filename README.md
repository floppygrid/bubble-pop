# 🫧 Bubble Pop — Underwater O₂ Survival

A webcam **hand-tracking** survival game. You're underwater: move your hand to
pop rising **O₂ bubbles** and keep breathing, while dodging **jellyfish**.

- 🫧 **O₂ bubbles** rise from below — pop them to refill your oxygen meter.
- 🌬️ Your **oxygen constantly drains**. Hit zero and it's game over.
- 🪼 **Jellyfish** drift up among the bubbles — pop **3** and you're done.
- ⚡ Bubbles rise **faster the longer you survive**.

Header shows your **O₂ level** and **jellyfish strikes (×/3)**.

## Run it

Webcam access requires `localhost` or HTTPS (it will **not** work via `file://`).
From this folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>:

1. **Start Game** → allow the camera.
2. Read the instructions → **Let's go**.
3. Survive!

(Any static server works — e.g. `npx serve`.)

## Game flow

```
Start screen (animated title) → Start Game
   → camera permission → Instructions → Let's go
      → PLAY  (O₂ drains; pop bubbles, dodge jellyfish)
         → Game over (rising bubble-wave) → Play again
```

## How it works

Hand tracking uses [MediaPipe Hands](https://developers.google.com/mediapipe)
(loaded from CDN, no install). Your **index fingertip** drives the on-screen
cursor; touch a bubble or jellyfish to pop it. Up to **two hands** supported.

Two decoupled loops run at once:

1. **MediaPipe loop** — detects the hand each frame and writes the fingertip
   into a shared `cursors` array.
2. **Game loop** (`requestAnimationFrame`) — drains O₂, spawns/moves bubbles &
   jellyfish, checks collisions, and renders the underwater scene to canvas.

All visuals (bubbles, jellyfish, coral, seaweed, light rays) are drawn
procedurally on `<canvas>`; all sounds are synthesized with WebAudio. The
underwater colour palette comes from the project's Figma design.

## File structure

```
BubblePop/
├── index.html   screens (start / instructions / game-over), HUD, canvas, video
├── style.css    underwater theme, animated title, buttons, HUD
├── game.js      state machine, spawning, physics, collision, render, sound, hand tracking
└── README.md    this file
```

## Tech

Plain HTML / CSS / JS + MediaPipe Hands (CDN). No build step, no dependencies.
