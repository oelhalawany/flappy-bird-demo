# 🐦 Flappy Bird — HTML5 Demo

A pure HTML5/CSS/JavaScript Flappy Bird clone. No frameworks, no assets, no build step — just three files.

**Play it:** https://oelhalawany.github.io/flappy-bird-demo/

## Features

- 📱 **Mobile-friendly** — tap to flap, scales to any screen, no zoom/scroll interference
- 🖥️ **Desktop-friendly** — Space / ↑ to flap
- 🎨 Everything drawn with Canvas (no image files)
- 🔊 Sound effects generated with WebAudio (no audio files)
- 🏆 Score + persistent best score (localStorage) + medals (bronze → platinum)

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Deploy to GitHub Pages

1. Push this repo to GitHub (branch `main`).
2. Repo → **Settings** → **Pages**.
3. Under **Source**, pick **Deploy from a branch** → branch `main`, folder `/ (root)` → **Save**.
4. Wait ~1 minute, then open `https://<username>.github.io/flappy-bird-demo/`.

## Files

| File        | Purpose                          |
| ----------- | -------------------------------- |
| `index.html`| Page shell + canvas element      |
| `style.css` | Fullscreen, mobile-safe styling  |
| `game.js`   | All game logic and rendering     |
