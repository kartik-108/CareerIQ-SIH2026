# CareerIQ staging deployment

## Selected architecture

- **Frontend:** static hosting (Azure Static Web Apps, Cloudflare Pages, or an equivalent HTTPS static host). The frontend has no compile step. Configure `careeriq-frontend/runtime-config.js` during deployment so `API_BASE_URL` points to the HTTPS backend; never use localhost in staging.
- **Backend:** the included Node 22 container on Azure Container Apps, Azure App Service for Containers, or another Node-compatible container host. The container exposes `/health`, `/ready`, and `/health/ollama`.
- **Database and storage:** the existing Supabase project. The server uses the service-role key only; it is never placed in frontend configuration.
- **AI:** a reachable Ollama service. For a small staging environment, run the included compose stack on a GPU-capable VM. For production scale, place Ollama on a separately managed GPU service/private endpoint and set `OLLAMA_BASE_URL` to that private HTTPS endpoint.

The backend cannot use a developer's `localhost` Ollama after remote deployment. The compose file is a local/staging option because it gives the backend a reachable service name (`ollama`); it is not a production capacity recommendation.

## Prepared files

- `careerx-backend/Dockerfile` and `.dockerignore`
- `careerx-backend/docker-compose.staging.yml`
- `careerx-backend/.env.staging.example`
- `careerx-backend/scripts/migration-preflight.mjs`
- `careerx-backend/scripts/staging-smoke.mjs`
- `careeriq-frontend/staticwebapp.config.json`
- `careeriq-frontend/pages/mentor-jobs.html` demo-mode warning
- `careeriq-frontend/scripts/mentor-jobs.js` non-misleading demo application message

## Integration verification

The following were verified against the currently running local backend, not mocks:

- `/health`: returned `success: true`, `db: connected`, and `ai: connected`.
- `/health/ollama`: returned `server: online`, `llama3.1:8b`, `nomic-embed-text`, and an installed vision model (`qwen2.5vl:3b`).
- Frontend landing page: loaded from the local static server in a browser.
- Backend unit/service suite: 15 suites and 44 tests passed.
- Backend open-handle check: passed with no remaining timeout handles.
- Frontend JavaScript syntax: 27 files passed `node --check`.

These are not yet real authenticated user journeys:

- Supabase sign-up/login, token refresh, RLS behavior, storage upload, and storage cleanup require staging credentials and a disposable test account.
- Resume parsing, ATS, OCR/vision, RAG ingestion/retrieval, mentor chat, and interview flows require an authenticated account and uploaded fixtures. Existing automated tests mock external services.
- No live job provider credentials were found. Job Hub is explicitly demo mode and seeded rows must not be presented as live vacancies.

## Environment variables

Required server values:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `CORS_ORIGINS`
- `OLLAMA_BASE_URL`
- `OLLAMA_CHAT_MODEL`
- `OLLAMA_EMBEDDING_MODEL`
- `OLLAMA_VISION_MODEL`
- `OLLAMA_EMBEDDING_DIMENSIONS`
- `NODE_ENV=production`
- `ALLOW_DEV_AUTH_BYPASS=false`
- `ENABLE_RAG_INSPECTOR=false`

Copy `.env.staging.example` to `.env.staging` only on the staging host or in its secret manager. Do not commit the copy.

Frontend values:

- `API_BASE_URL`: the public HTTPS backend URL plus `/api`, unless the frontend is served behind a reverse proxy that forwards `/api`.
- `SUPABASE_URL` and the public anon key may be embedded in the frontend runtime configuration if the current Supabase browser auth flow requires them. Never embed the service-role key.
- `DEV_MODE=false`.

## Database migration safety

The authoritative migration source is `careerx-backend/src/db/migrations`. Do not execute `careerx-backend/supabase-schema.sql` as a second schema source; it describes an older, conflicting RAG model.

1. Back up or confirm the Supabase project's recovery/PITR posture.
2. Run `npm run migration:preflight` from `careerx-backend`.
3. Stop if duplicate prefixes or destructive SQL are reported. The suffixed migration names (`002b`, `006b`, and `013b`) make the intended lexical order explicit.
4. Review the ordered SQL against the staging project's current schema and Supabase Storage policies.
5. Apply only reviewed, idempotent migrations using a controlled Supabase migration workflow.
6. Verify tables, RLS policies, storage buckets, storage policies, vector dimension, and the canonical `match_knowledge_chunks` RPC.
7. Record the applied migration names externally. The current runner does not maintain a migration history table.
8. Never run reset, drop, truncate, or seed commands against production.

The preflight command opens no database connection and executes no SQL.

## AI setup

For the included compose stack:

1. Copy `.env.staging.example` to `.env.staging` and fill Supabase/CORS values.
2. Start services with `docker compose -f docker-compose.staging.yml up -d --build`.
3. Pull models on the Ollama host:
   `docker compose -f docker-compose.staging.yml exec ollama ollama pull llama3.1:8b`
   `docker compose -f docker-compose.staging.yml exec ollama ollama pull nomic-embed-text`
   `docker compose -f docker-compose.staging.yml exec ollama ollama pull qwen2.5vl:3b`
4. Run `npm run staging:smoke -- http://localhost:5000`.

An 8B chat model plus a vision model requires substantial RAM and benefits from a GPU. CPU-only staging may be functional but will have high latency and low concurrency. Set application request timeouts and concurrency conservatively; do not expose Ollama directly to the public internet. If the host cannot meet memory/latency requirements, deploy Ollama on a dedicated GPU VM and keep only the backend public.

## Deployment sequence

1. Create a disposable staging Supabase project or confirm an isolated staging schema.
2. Configure Supabase Auth redirect URLs for the exact frontend HTTPS origin.
3. Complete the migration safety checklist above; do not run the alternate schema file.
4. Provision a private/restricted Ollama host and pull the three required models.
5. Build and publish the backend image from `careerx-backend`.
6. Configure backend secrets and `CORS_ORIGINS` in the hosting platform's secret manager.
7. Deploy the backend and verify `/health`, `/ready`, and `/health/ollama`.
8. Configure frontend runtime values with the backend HTTPS URL and `DEV_MODE=false`.
9. Publish the static frontend and verify HTTPS routing and browser requests to `/api`.
10. Create a disposable test user and execute the authenticated smoke journeys: register, login, dashboard, resume upload/parsing, ATS, recommendations, skill gap, interview create/evaluate, mentor chat, document upload/RAG retrieval, vision/OCR, and logout.
11. Review logs, CORS, storage object cleanup, RLS behavior, and model latency before inviting staging users.

## Troubleshooting

- **`/ready` fails:** verify Supabase URL/key and network access; do not bypass readiness.
- **`/health/ollama` fails:** verify the private Ollama URL, model names, host firewall, and that all required models were pulled.
- **Browser CORS errors:** set `CORS_ORIGINS` to the exact frontend origin, including scheme and port.
- **Frontend calls localhost:** replace the deployed `runtime-config.js`; production runtime defaults must be an HTTPS API URL or `/api`.
- **RAG embedding errors:** confirm `OLLAMA_EMBEDDING_DIMENSIONS` matches the database vector column and canonical migration.
- **Uploads fail:** verify Supabase Storage buckets/policies and backend service-role configuration; do not make private resume/report buckets public.
- **Jobs look real:** the Job Hub is demo mode until a legitimate provider is integrated; seeded jobs are not application destinations.
