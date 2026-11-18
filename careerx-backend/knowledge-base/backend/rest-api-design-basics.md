# REST API Design Fundamentals

## Core Principles
1. Use nouns, not verbs, in endpoint paths: `/users` not `/getUsers`.
2. Use HTTP methods semantically: GET (read), POST (create), PUT/PATCH (update), DELETE (remove).
3. Return appropriate status codes: 200 (success), 201 (created), 400 (bad request), 401 (unauthorized), 404 (not found), 500 (server error).
4. Version your API: `/api/v1/...` — this lets you evolve the API without breaking existing clients.

## Common Patterns
- Pagination: use `page` and `limit` query params, return total count in the response.
- Filtering: use query params like `?status=active&role=student`.
- Consistent response envelope: `{ success, message, data }` makes client-side error handling predictable.

## Security Basics
- Always validate and sanitize input (e.g. with Zod or Joi) before it touches your database or business logic.
- Use JWTs for stateless authentication; keep access tokens short-lived (15 min) and refresh tokens longer-lived but revocable.
- Rate-limit sensitive endpoints (login, registration, AI-backed endpoints) to prevent abuse.
