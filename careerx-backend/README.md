# CareerX Backend

AI-powered Skill Intelligence & Career Readiness Platform — backend service.

Built for **SIH26134** (Government of Maharashtra): *Challenges in aligning skill development
programs with industry requirements and emerging job market demands.*

> Frontend is a separate project. This repo is backend-only.

---

## 1. Architecture

```
careerx-backend/
  src/
    config/        env, logger, supabase client, redis client
    routes/        Express routers (one per module) + index.js mounting all
    controllers/   thin HTTP layer — parse req, call service, send ApiResponse
    services/      business logic — this is where features actually live
    repositories/  Supabase/Postgres data access (no business logic)
    middlewares/   auth, validation, rate limiting, uploads, error handling
    validators/    Zod schemas for request AND AI-output validation
    prompts/       versioned local AI prompt templates, one file per feature
    rag/           chunking, embedding, vector search, ingestion, RAG pipeline
    scripts/       knowledge-base CLI tools (import/embed/reindex/etc.)
    utils/         ApiError, ApiResponse, asyncHandler, jwt, hash, tokenizer
    db/
      migrations/  SQL schema + storage bucket setup
      seed/        demo data seeder
  knowledge-base/   source documents for the RAG system, one folder per category
  tests/            Jest unit tests
```

**Request flow:** `route → middleware (auth/validate/rateLimit) → controller → service →
repository/local AI → response`. Controllers never touch Supabase directly; services never
touch `req`/`res`. This is what lets the backend scale from SIH MVP to production without
rewriting existing modules — new features are new files in each layer, not edits to old ones.

---

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 22+ (native ESM, no TypeScript build step) |
| Framework | Express.js |
| Database | Supabase PostgreSQL |
| Vector store | Supabase pgvector |
| AI | Local Ollama (`llama3.1:8b`) |
| Storage | Supabase Storage (private buckets + signed URLs) |
| Auth | JWT (access + refresh) + bcrypt |
| Validation | Zod (both request bodies and AI JSON output) |
| Cache | Upstash Redis (REST-based, serverless-friendly) |
| Logging | Pino (structured, request-scoped) |
| Uploads | Multer (in-memory, streamed to Supabase Storage) |

---

## 3. Setup

### 3.1 Prerequisites
- Node.js 22+
- A Supabase project (free tier is enough to start)
- A local Ollama installation with the configured chat and embedding models
- (Optional but recommended) An Upstash Redis database

For local development, run Ollama with the configured chat model and embedding model. CareerIQ
uses Ollama only and does not fall back to a remote provider. Provider status is available at
`/health/ollama`.

### 3.2 Install
```bash
npm install
cp .env.example .env
# fill in .env with real Supabase / Ollama / Redis values
```

### 3.3 Database setup
Run the SQL files against your Supabase project — either paste them into the Supabase SQL
editor, or use the built-in runner:

```bash
npm run migrate       # applies src/db/migrations/*.sql in order
```

Then, in the Supabase SQL editor, run `src/rag/rpc/match_knowledge_chunks.sql` once — this
creates the vector-search Postgres function used by the RAG pipeline (not included in the
migration runner because it depends on the `vector` extension being fully initialized first).

> **Note:** `002_storage_buckets.sql` creates buckets and RLS policies for Supabase Storage.
> Since this backend uses the **service-role** key server-side, RLS policies mainly matter if
> you later expose direct client-side Storage access.

### 3.4 Seed demo data
```bash
npm run seed           # mock job listings; admin is created only when explicit seed credentials are set
```

Never run the seed command against production without reviewing the inserted demo jobs. If an
admin is needed for a non-production environment, set `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` explicitly; the password is never embedded in source or logs.

### 3.5 Ingest the knowledge base (RAG)
```bash
npm run knowledge:import    # chunk every file under knowledge-base/
npm run knowledge:embed     # generate + store Ollama embeddings
npm run knowledge:stats     # sanity check counts
npm run knowledge:verify    # confirm every chunk has an embedding
```

Add your own `.md` / `.txt` / `.json` / `.pdf` files under the relevant `knowledge-base/<category>/`
folder, then re-run `knowledge:import` + `knowledge:embed` — both are idempotent (content-hash
and chunk-id based), so re-running is always safe.

### 3.6 Run
```bash
npm run dev     # node --watch, auto-restarts on file changes
npm start       # production
```

Health check: `GET /health` · Readiness check: `GET /ready`

---

## 4. Environment Variables

See `.env.example` for the full list with inline comments. Boot-time validation
(`src/config/env.js`, via Zod) will fail loudly and immediately if anything required is
missing or malformed — you will never discover a missing secret mid-request in production.

---

## 5. API Overview

All routes are mounted under `API_BASE_PATH` (default `/api`).

| Module | Base path | Notes |
|---|---|---|
| Auth | `/auth` | register, login, refresh, logout, profile CRUD |
| Resumes | `/resumes` | upload, AI analysis, download URL |
| Skill Gap | `/skill-gap` | resume + target role → gap analysis |
| Roadmaps | `/roadmaps` | AI-generated career roadmap, progress tracking |
| Interviews | `/interviews` | adaptive mock interview engine (HR/technical/behavioral) |
| Career DNA | `/career-dna` | personality/skills profile synthesis |
| Job Match | `/job-match` | resume vs. job description scoring |
| Jobs | `/jobs` | job hub search, recommendations, bookmarks |
| Dashboard | `/dashboard` | aggregated XP/progress/analytics payload |
| RAG | `/rag/ask` | grounded Q&A over the knowledge base |
| Feedback | `/feedback` | user feedback submission |
| Notifications | `/notifications` | list + mark-read |

Every protected route requires `Authorization: Bearer <access_token>`.

---

## 6. RAG System

```
knowledge-base/*.md,.txt,.json,.pdf
        │  (knowledge:import)
        ▼
knowledge_documents + knowledge_chunks   (chunked, 700 tokens / 100 overlap)
        │  (knowledge:embed)
        ▼
knowledge_embeddings  (pgvector, cosine similarity, ivfflat index)
        │
        ▼
POST /rag/ask  →  vectorSearch()  →  top-K chunks  →  Ollama (grounded)  →  { answer, sources, confidence }
```

The RAG answer pipeline (`src/rag/ragPipeline.js`) is fully grounded: if no chunks clear the
similarity threshold, it returns an honest "not enough information" response instead of letting
the model hallucinate. Answers are cached in Redis (keyed by a hash of the question, filters, and authenticated user) to
control cost and latency on repeat queries.

---

## 7. Deployment

### Railway / Render
1. Push this repo to GitHub.
2. Create a new Web Service, connect the repo.
3. Set the start command to `npm start`, build command to `npm install`.
4. Add every variable from `.env.example` in the platform's environment settings.
5. Point the platform's health check at `GET /health` and (if supported) readiness at `GET /ready`.
6. After first deploy, run `npm run migrate` and `npm run seed` once (via a one-off shell/job on
   the platform, or locally against the same `SUPABASE_DB_CONNECTION_STRING`).

### Supabase
- Enable the `vector` extension (done automatically by `001_init.sql`).
- Create storage buckets via `002_storage_buckets.sql`, or manually in the dashboard.
- Run `src/rag/rpc/match_knowledge_chunks.sql` once in the SQL editor.

---

## 8. Testing
```bash
npm test
```
Tests mock Supabase and local AI at the module boundary (see `tests/auth.service.test.js` for the
pattern) — no real network calls are made during `npm test`.

---

## 9. Extending the Backend

Adding a new AI-powered feature follows the same five-file pattern every existing feature uses:
1. `prompts/<feature>.prompt.js` — the local AI prompt template.
2. `services/<feature>.service.js` — calls `generateJSON()`, persists via a repository.
3. `repositories/<feature>.repository.js` — Supabase queries (if new tables are needed, add a
   new migration file, e.g. `003_<feature>.sql`).
4. `controllers/<feature>.controller.js` — thin wiring to `req`/`res`.
5. `routes/<feature>.routes.js` — mount in `routes/index.js`.

This is what makes the backend "scale from SIH MVP to production" without rewriting existing
modules — every module is additive and isolated.

---

## 10. Known Extension Points (not yet implemented)
- **Image resume OCR**: `resume.service.js` currently only extracts text from PDF resumes.
  PNG/JPEG resumes upload successfully but need a local OCR step wired
  into `extractText()`.
- **Live job market data**: `jobs_cache` and the skill-gap market-skills table are currently
  seeded/heuristic. The schema and service layer are structured so a LinkedIn/Indeed/Naukri
  integration can populate `jobs_cache` on a schedule without touching downstream code.
- **Multilingual prompts**: `profiles.language` and `knowledge_documents.language` are
  already modeled; prompts currently default to English — pass `language` through to prompt
  builders to localize.
- **PDF export**: `career_roadmaps`, `resume_analysis`, and `interview_reports` are stored as
  structured JSON, ready to be rendered into downloadable PDFs (e.g. via a `pdf` generation
  service writing to the `exports` bucket) — not yet wired to an endpoint.
