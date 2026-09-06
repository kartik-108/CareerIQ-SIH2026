# CareerIQ Frontend

An AI-powered Career Operating System — frontend only, built for Smart India Hackathon 2026
(SIH26134, Team CareerX). Pure HTML5, CSS3, and vanilla ES6-module JavaScript. No frameworks,
no build step.

## Running it

Because the frontend calls its configured API, opening `index.html` directly
from disk (`file://`) will fail in most browsers due to CORS restrictions on local file access.
Serve the folder instead — any static server works:

```bash
# Python
python3 -m http.server 8080

# Node (if you have it)
npx serve .

# VS Code
Right-click index.html → "Open with Live Server"
```

Then visit `http://localhost:8080`.

## Structure

```
careeriq-frontend/
  index.html                 Landing page
  pages/                     The other 7 pages (all require mock login)
    login.html
    dashboard.html
    resume-studio.html
    career-lab.html           (tabs: Skill Gap · Roadmap · Career DNA)
    interview-studio.html     (flagship 3-panel Vision AI page)
    mentor-jobs.html          (tabs: AI Mentor · Job Hub)
    profile-settings.html
  components/                Static reference copies of generated markup
                              (see "Why components/ isn't fetched" below)
  styles/
    variables.css             Design tokens: color, type, spacing, radius, motion
    reset.css                 Minimal CSS reset
    global.css                Base typography and body styles
    layout.css                App shell, sidebar, topbar, grids, studio layout
    components.css            Buttons, cards, gauges, forms, modals, toasts, tabs
    animations.css             Keyframes + scroll-reveal system
    themes.css                Theme-conditional rules (most theming is variables)
    responsive.css            Tablet/mobile breakpoints + bottom nav
  scripts/
    app.js                    Global bootstrap: theme, reveal, route guard
    navigation.js              Builds sidebar/topbar/bottom-nav markup + behavior
    navigation-init.js         Calls initNavigation() on every authenticated page
    theme.js                  Dark/light theme, persisted
    toast.js                   Global toast notifications
    storage.js                 localStorage wrapper + mock auth helpers
    api/client.js               Shared backend API client and auth handling
    charts.js                  Hand-rolled SVG ring/line/radar/bar charts
    vision-ai.js                Simulated live metrics for the Interview Studio
    animations.js               Scroll reveal, counters, magnetic buttons
    auth-page.js, dashboard.js, resume-studio.js, career-lab.js,
    interview-studio.js, mentor-jobs.js, profile-settings.js
                                Page-specific logic, one file per page
  assets/                      images/icons/illustrations/animations/fonts (empty,
                                ready for real assets — icons currently come from
                                the Lucide CDN, see below)
```

## Why `components/*.html` isn't fetched at runtime

The brief asks for separate `navbar.html`, `sidebar.html`, etc. Fetching HTML partials with
API requests require the frontend to be served by a web server; opening `index.html` directly
from disk can be blocked by browser security rules.
`index.html` from Explorer/Finder (`file://` blocks `fetch` of local files in most browsers).
Since this is meant to be judge- and reviewer-friendly, `scripts/navigation.js` generates the
sidebar/topbar/bottom-nav markup directly in JS — it behaves identically either way. The
`components/` folder still contains static, exact copies of that markup so designers or a
future backend developer can read the shell's structure without digging through JS template
strings.

## Design system

- **Color**: deep navy dark mode (`#0B0E17`) / cool-white light mode (`#F6F7FB`), with a
  blue → purple → cyan gradient as the signature "AI" accent — used for CTAs, active nav state,
  and chart highlights, not as a full-page wash.
- **Type**: Space Grotesk for headlines (`h1–h5`), Inter for body and UI text.
- **Icons**: [Lucide](https://lucide.dev) via the CDN script (`unpkg.com/lucide`) — loaded on
  every page, `lucide.createIcons()` is called after any dynamic content is injected.
- All tokens live in `styles/variables.css`; both themes are two blocks of CSS custom properties,
  so most components never need theme-specific rules.

## Global systems

- **Theme**: `data-theme="dark"|"light"` on `<html>`, toggled via `scripts/theme.js`, persisted
  to `localStorage`, defaults to the OS preference on first visit.
- **Language**: CareerIQ v1 uses English-only interface text.
- **Auth**: `scripts/storage.js` persists the backend access and refresh tokens. The route guard
  redirects unauthenticated users to `login.html`.
- **API**: page modules call backend endpoints through `scripts/api/client.js`; loading states
  remain in the page markup until API responses arrive.

## Vision AI — what's real vs. placeholder

`scripts/vision-ai.js` is explicitly a **frontend placeholder**. It simulates the metrics a real
MediaPipe FaceMesh + Pose pipeline would produce (eye contact, smile, blink rate, posture, head
stability, speaking pace) with a random-walk generator, and exposes:

- `startSimulatedTracking(onUpdate)` — emits a metrics object roughly once a second
- `bindMeterElements(container)` / `updateMeters(elements, metrics)` — wires values into the
  `.meter` DOM elements already built into `interview-studio.html`

To connect a real Vision AI backend later: replace the body of `startSimulatedTracking` with
code that reads actual MediaPipe landmark results and calls the same `onUpdate(metrics)`
callback with the same shape. Nothing in the HTML/CSS needs to change.

## Charts — no external chart library

`scripts/charts.js` hand-rolls ring, line, radar, and bar charts as raw SVG (`renderRing`,
`renderLineChart`, `renderRadarChart`, `renderBarChart`). This keeps the "no frameworks"
constraint honest — there's no Chart.js/D3 dependency to swap out later, but the functions are
small enough to replace individually if a real charting library becomes appropriate.

## Connecting a real backend later

Every module was built with a specific seam in mind:

| Frontend piece | Swap point for a real backend |
|---|---|
| `scripts/vision-ai.js` simulated tracking | Real MediaPipe inference feeding the same `onUpdate` shape |
| Resume upload dropzone (`resume-studio.js`) | `handleFile()` currently fakes a 2-step "uploading → analyzing" toast sequence — replace with a real `multipart/form-data` POST |
| Mentor chat (`mentor-jobs.js`) `getMockReply()` | Replace with a real RAG endpoint call; the message/][sources UI already expects `{ text, sources }` |
| "Download report" buttons | Currently show an info toast; wire to a real PDF-export endpoint |

## Accessibility

- Skip-to-content link on every page
- Visible focus rings (`:focus-visible`) throughout
- `aria-live` toast region, `aria-pressed`/`aria-expanded`/`aria-selected` on interactive toggles
- `prefers-reduced-motion` respected — all scroll-reveal and decorative animation is disabled
- Color choices meet WCAG AA contrast in both themes for body text

## Known placeholders (by design, not oversight)

- Google login button signs in with a demo account — it's a UI placeholder, not real OAuth.
- "Download report" actions show a toast rather than generating a real file.
- `assets/` subfolders are empty and ready for real illustrations/icons/fonts if you want to
  self-host instead of using Google Fonts + the Lucide CDN.
