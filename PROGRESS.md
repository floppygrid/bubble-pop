# 🫧 Bubble Pop — Progress / Handoff

> **Last updated:** 2026-06-24
> Read this first when resuming in a new session. It captures what's built, how
> it's wired, the design source, and what to do next.

---

## 1. What this is

**Bubble Pop** is a browser-based **webcam hand-tracking** game with an
underwater theme. The player moves their hand (tracked via the webcam); a
glowing cursor follows the **index fingertip**. You **pop rising O₂ bubbles** to
refill a constantly draining oxygen meter, while **avoiding jellyfish**.

- Pure **HTML / CSS / JS** — no build step, no framework, no dependencies.
- Hand tracking via **MediaPipe Hands** (loaded from CDN).
- All sounds are **synthesized with WebAudio** (no audio files).
- The underwater **background is a single image** from the Figma design, shown
  on every screen (including during gameplay). The webcam runs **hidden**, used
  only for tracking — the player sees the aquarium, not themselves.

---

## 2. Current status

| Screen / piece | State |
|---|---|
| **Loading screen** (`index.html`) | ✅ Done & verified. Full-bleed aquarium bg; letters rise from below and gather into the word **"Bubble PoP"** (Rubik Scribble). "Click to dive in →" loads the game. |
| **Game** (`game.html` + `style.css` + `game.js`) | ✅ Works ("plays fine"). Underwater O₂-survival, reskinned with Figma fonts + aquarium bg. Still contains the *older combined* start / instructions / game-over overlays. |
| **Instructions screen** | ⛔ NOT yet rebuilt screen-by-screen to match Figma. **This is the next task.** |
| **In-game start / game-over screens** | ⛔ Still the older combined version inside `game.html`; to be refined to match Figma next. |

**Working approach (important):** We are rebuilding the UI **one screen at a
time**, each as a clean page/screen that **exactly matches the Figma design**.
The loading screen was the first. Do **not** rebuild everything at once.

---

## 3. Repo & git state

- **GitHub:** https://github.com/floppygrid/bubble-pop  (public)
- **Branch:** `main`  → tracks `origin/main`
- **Last pushed commit:** `c21de15` "Rebuild Bubble Pop as underwater O2 survival game"

### ⚠️ Uncommitted work (NOT yet committed or pushed)
The Figma reskin + the new loading screen are **only on disk**, not in git yet:
```
R  index.html -> game.html      (old game moved to game.html)
M  game.js                      (canvas now transparent over CSS bg; coords 1200x896)
M  style.css                    (Figma fonts/colors, aquarium bg on #stage)
?? index.html                   (NEW standalone loading screen)
?? assets/                      (background.jpg — the aquarium image)
```
**To resume safely, consider committing these first.** Suggested message:
`"Add Figma-based loading screen; reskin game with aquarium background"`.

---

## 4. File structure

```
BubblePop/
├── index.html          NEW loading screen (standalone, full-bleed). Entry point.
│                        → on click, navigates to game.html
├── game.html           The game (start / instructions / game-over overlays + HUD + canvas)
├── style.css           Game styling (Figma palette + Rubik/Rubik Scribble fonts)
├── game.js             Game engine (see §6)
├── assets/
│   └── background.jpg   Aquarium background from Figma (1200x896, ~330 KB)
├── README.md
├── PROGRESS.md         ← this file
└── .gitignore
```

---

## 5. How to run

Webcam needs a secure context, so serve over **localhost** (not `file://`):
```bash
cd "BubblePop"
python3 -m http.server 8000
```
Open **http://localhost:8000** → loading screen → "Click to dive in" → game.
Click **Start Game** → allow camera → **Let's go** → play.

(For quick visual checks of non-camera screens, the Claude preview MCP works too.)

---

## 6. Game engine (`game.js`) — how it works

Two **decoupled loops**:
1. **MediaPipe Hands** detects the hand each frame and writes the index-fingertip
   position into a shared `cursors[]` array (`onResults`). Mirrored on X.
2. **`requestAnimationFrame` game loop** (`loop`) drains O₂, spawns & moves
   entities, checks collisions, and renders.

The canvas is a **transparent overlay** (`ctx.clearRect` each frame) over the CSS
aquarium background — it only draws entities, effects, and the cursor.

**State machine:** `start → instruct → playing ⇄ paused → wave → gameover`.

**Entities:** `bubbles[]` (O₂ bubbles + jellyfish), `floats[]` (score popups),
`particles[]` (pop bursts), `ambient[]` (background bubbles).

### Tunables (top of `game.js`)
| Const / fn | Value | Meaning |
|---|---|---|
| `O2_MAX` | 100 | full oxygen |
| `O2_REFILL` | 14 | O₂ gained per bubble |
| `O2_PENALTY` | 12 | O₂ lost per jellyfish sting |
| `MAX_STRIKES` | 3 | jellyfish pops before game over |
| `O2_R_MIN/VAR` | 46 / 18 | bubble radius 46–64 (20% bigger than first build) |
| `BASE_SPEED` | 108 | px/s rise speed at difficulty 1.0 (+20% vs first build) |
| `difficulty()` | 1 → ~4.5 over ~90s | ramps speed, spawn rate, O₂ drain |
| `o2Drain()` | 5.5 + diff×2 /s | oxygen drain rate |
| `jellyChance()` | 0.18 → 0.35 | chance a spawn is a jellyfish |
| collision tolerance | `b.r + 16` | fingertip pop radius |

### Sounds (WebAudio, synthesized)
`playClick` (buttons), `playPop` (O₂ bubble), `playCry` (jellyfish — wavering
descending wail), `playWarn` (low-O₂ beep), `playGameOverSound`.

---

## 7. Figma design reference

- **File:** https://www.figma.com/design/gplkt1YQqnQg4CbjVPI7NZ/Bubble-Pop
- **File key:** `gplkt1YQqnQg4CbjVPI7NZ`
- **Figma MCP is connected** — use `get_metadata`, `get_design_context`,
  `get_screenshot` to read nodes. (No extra permission needed.)

### Key nodes
| Node | What |
|---|---|
| `1:19` | **Loading Animation** frame (1200×896). Aquarium bg + scattered "Bubble PoP" letters. |
| `1:20` | The aquarium background image (downloaded → `assets/background.jpg`). |
| `3:71` | Earlier gradient bg rectangle: `#B8F6FE → #476987`, 5px white border, 30px radius. |

### Design tokens
- **Title font:** **Rubik Scribble** (Google Font). Letters 120px, white,
  `text-shadow: 2px 10px 6px rgba(0,0,0,0.89)`.
- **UI/body font:** **Rubik** (companion family).
- **Palette:** light cyan `#B8F6FE` → slate blue `#476987`; accents
  `#39c4ff` / `#3affc1`; danger `#ff5a6e`. (No Figma color variables defined.)
- Figma asset URLs **expire after ~7 days** — re-download via `get_design_context`
  if you need them again (the bg is already saved locally).

> Note: the Figma file currently only has the **loading screen** designed as a
> frame (plus the background image and "Nintendo Game Inspiration" mood images).
> Other screens are not yet in Figma — ask the user for node IDs, or design them
> to match the loading screen's style.

---

## 8. Key decisions made

- **Aquarium background on every screen**, including gameplay (per user). Webcam
  is **hidden** and used only for hand tracking; the glowing cursor shows the hand.
- Removed the old procedurally-drawn coral/seaweed/light-rays — the background
  image already has them. Kept subtle rising **ambient bubbles** for motion.
- **O₂ = draining meter** (refill by popping bubbles; empty = game over). Game
  over also at **3 jellyfish** stings. HUD shows **O₂ bar + 3 jellyfish strikes**.
- Loading screen is a **separate page** (`index.html`) that loads `game.html`.
- Bubbles **20% bigger**, initial rise speed **+20%**, difficulty ramps over time.

---

## 9. TODO / next steps

1. **(NEXT) Instructions screen** — rebuild to match Figma, in the loading
   screen's style. Ask the user for the Figma node ID; if none, design to match.
2. **Game screen polish** — confirm HUD (O₂ + strikes) placement matches design;
   keep the aquarium background; verify cursor/feel.
3. **Game-over screen** — match Figma; keep the rising bubble-wave closing
   animation already implemented in `game.js`.
4. Decide final flow wiring between the standalone pages vs the in-`game.html`
   overlays (currently the game still has its own start/instructions/gameover
   overlays — these may be replaced by dedicated pages).
5. **Commit & push** the uncommitted work (see §3).

### Open questions for the user
- Do you have the **instructions / game / game-over** screens designed in Figma?
  If so, share node IDs for exact matching.
- Want a **faint translucent webcam** blended over the aquarium so you can see
  your hand for easier aiming? (Currently camera is fully hidden.)

---

## 10. Caveats

- Gameplay *feel* (drain rate, jelly frequency, cursor sensitivity) was tuned by
  eye, not playtested in this environment — adjust the §6 tunables to taste.
- MediaPipe model downloads on first "Start Game" (brief "Loading…").
- Use **Chrome** for best webcam/tracking behavior; needs good lighting.
