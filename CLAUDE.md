# wahzammo.com — Legacy Tools Shrine

## Architecture: Static Shell + React Islands

The site is a collection of privacy-first, browser-based web utilities hosted on **GitHub Pages**.

- **Static shell**: `index.html` + `style.css` at the root, plus vanilla HTML/JS tools in their own folders
- **React islands**: Vite-built SPAs (currently only `wipeout/`) that output static files into their subfolder
- **GitHub Actions** builds React islands and assembles the full site on push to `main`

### Directory Structure

```
wahzammo.com/
├── index.html              ← static landing page
├── style.css               ← shared design tokens & glassmorphic theme
├── wallbreaker/            ← vanilla HTML/JS (Excel unlocker via Pyodide)
├── warpspeed/              ← vanilla HTML/JS (YouTube MP3 → Cloud Run backend)
├── wavelength/             ← vanilla HTML/JS (audio visualizer + tone generator)
├── wordsmith/              ← vanilla HTML/JS (PDF/DOCX converter)
├── wipeout/                ← React 19 + Vite (AI background removal)
│   ├── package.json
│   ├── vite.config.ts      ← MUST have base: '/wipeout/'
│   ├── src/
│   └── dist/               ← build output (git-ignored)
├── services/
│   └── warpspeed/          ← GCP Cloud Run (yt-dlp MP3 backend)
│       ├── Dockerfile
│       ├── requirements.txt
│       └── app.py
└── .github/workflows/
    └── deploy.yml          ← builds islands → assembles site → deploys to GH Pages
```

### Adding a New React Island

1. Create a new directory at the repo root (e.g., `newtool/`)
2. Scaffold a Vite + React app (from AI Studio export or `npm create vite@latest`)
3. **Critical**: Set `base: '/newtool/'` in `vite.config.ts`
4. Strip server-side deps (express, dotenv, etc.) — keep it fully static
5. Add a "Back to Shrine" link pointing to `/`
6. Import the Outfit font in your CSS for consistency
7. Update `.github/workflows/deploy.yml`:
   - Add `npm ci` + `npm run build` steps for the new tool
   - Add `cp -r newtool/dist _site/newtool` in the assembly step
8. Add a card to the root `index.html`
9. Commit the `package-lock.json`

### Design Conventions

- **Font**: Outfit (Google Fonts) — weights 300, 400, 600, 800
- **Background**: Deep dark (#0a0a0a to #0b0f19)
- **Style**: Glassmorphic cards, glow effects, rounded corners
- **Each tool has a signature color** defined in `style.css`

### Hosting

- **GitHub Pages** via `actions/deploy-pages` (free, no gh-pages branch)
- **GCP Cloud Run** for the Warpspeed backend (free tier: 2M req/month, $5 budget cap)
- Everything that can run client-side MUST run client-side

### Backend Services

#### Warpspeed — GCP Cloud Run
- Docker container with Python + yt-dlp + ffmpeg
- Extracts YouTube audio → streams MP3 back to browser
- Abuse prevention: 20 min max duration, 50MB file limit, 10 req/IP per 15 min
- Deploy: `gcloud run deploy warpspeed --source services/warpspeed --region us-central1 --allow-unauthenticated --memory 512Mi --cpu 1 --concurrency 1 --max-instances 2 --min-instances 0 --timeout 300`
- After deploy, update the production URL in `warpspeed/script.js`

### Commands

```bash
# Local dev for Wipeout (React island)
cd wipeout && npm run dev

# Build Wipeout only
cd wipeout && npm run build

# Local dev for Warpspeed (Docker)
cd services/warpspeed && docker build -t warpspeed . && docker run -p 8080:8080 warpspeed

# Local dev for Warpspeed (Python directly — needs ffmpeg installed)
cd services/warpspeed && pip install -r requirements.txt && python app.py

# The full site assembly happens in CI (see .github/workflows/deploy.yml)
# Backend services deploy separately — they are NOT part of the GH Pages build.
```
