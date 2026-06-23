# 💰 Money Bubble

A webcam **hand-tracking** game. Move your hand to pop falling bubbles:

- 🟢 **Green** — money (`+$10 / $20 / $100`, rare `+$500` gold jackpot)
- 🔴 **Red** — penalty (`-$20 / $50 / $100`) — avoid these!
- 🔵 **Blue** — surprise gifts 🎁 💎 ⭐ 🍀

Bubbles fall slowly at first and **speed up the longer you play**.

## Run it

Webcam access requires `localhost` or HTTPS (it will **not** work via `file://`).
From this folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> and click **Start Game**. Allow the camera when prompted.

(Any static server works — e.g. `npx serve`.)

## How it works

Hand tracking uses [MediaPipe Hands](https://developers.google.com/mediapipe),
loaded from a CDN (no install). Your **index fingertip** drives the on-screen
cursor; touch a bubble to pop it. Up to **two hands** are supported.

Two decoupled loops run at once:

1. **MediaPipe loop** — reads each webcam frame, detects the hand, and writes
   the fingertip position into a shared `cursors` array.
2. **Game loop** (`requestAnimationFrame`) — moves bubbles, spawns new ones,
   checks collisions against `cursors`, and renders everything to the canvas.

## File structure

```
BubblePop/
├── index.html   page skeleton: HUD, hidden <video>, <canvas>, start overlay
├── style.css    all visual styling
├── game.js      hand tracking + game engine (state, spawning, physics, render)
└── README.md    this file
```

## Tech

Plain HTML / CSS / JS + MediaPipe Hands (CDN). No build step, no dependencies.
