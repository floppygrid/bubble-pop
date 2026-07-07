# Bubble PoP 🫧

**Pop the Oxygen bubbles to survive!**
xhttps://floppygrid.github.io/bubble-pop/

An underwater arcade game you play with your *hands* — your camera turns you into
the diver, and you pop bubbles by touching them with your fingertip (or by
tapping, on any device). Built with plain HTML, CSS and JavaScript — no build
step, no framework.

## How it plays

| Bubble | What it does |
| --- | --- |
| ⚪ **O₂ bubble** | +5 points — pop these to survive |
| 🪼 **Jellyfish** | Disguised as pretty pink/blue bubbles. Pop 3 → game over |
| 🎁 **Gift bubble** | Bonus points (+10 / +25) |
| 💖 **Life bubble** | Rare! Grants an extra life |

The game speeds up over time and the jellyfish population grows from 20% to
40% of all bubbles. Best score is saved locally.

## Screens

1. **Loading** — the letters of *Bubble PoP* float up from the seabed, scatter,
   then glide into place to form the title.
2. **Home** — tagline + Start Game (design from Figma).
3. **Instructions** — a retro Nintendo-style instruction booklet.
4. **Game** — your camera feed with an ocean filter, corals, passing fish, and
   bubbles rising from the deep.

Every screen change is washed away by a cluster of rising bubbles.

## Tech

- **Hand tracking:** [MediaPipe Hands](https://developers.google.com/mediapipe)
  (loaded from CDN, lite model). If the camera is blocked or the CDN is
  unreachable, the game falls back to touch/click controls automatically.
- **Sound:** all effects are synthesized live with the Web Audio API — zero
  audio assets.
- **Fonts:** Rubik Scribble, Alice, Alfa Slab One, Press Start 2P (Google Fonts).

## Run it

Camera access needs a secure context, so serve the folder instead of opening
the file directly:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Works on desktop and mobile browsers.

## File structure

```
BubblePop/
├── index.html   all screens: home, instructions, game, overlays
├── style.css    Figma-matched theme, retro manual, HUD, transitions
├── game.js      letter intro, bubble engine, hand tracking, sound, difficulty
└── assets/      aquarium background (from the Figma design)
```
