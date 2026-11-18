import "dotenv/config";
import { z } from "zod";

const envBoolean = z.preprocess(
  (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1") return true;
      if (normalized === "false" || normalized === "0") return false;
    }
    return value;
  },
  z.boolean(),
);

const envSchema = z.object({
  // =====================================
  // Server
  // =====================================
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5000),
  API_BASE_PATH: z.string().default("/api"),
  CORS_ALLOWED_ORIGINS: z.string().default(""),

  // =====================================
  // Supabase
  // =====================================
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  SUPABASE_DB_CONNECTION_STRING: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),

  SUPABASE_BUCKET_RESUMES: z.string().default("resumes"),
  SUPABASE_BUCKET_REPORTS: z.string().default("reports"),
  SUPABASE_BUCKET_AVATARS: z.string().default("avatars"),
  SUPABASE_BUCKET_EXPORTS: z.string().default("exports"),

  // =====================================
  // AI PROVIDER
  // =====================================
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_CHAT_MODEL: z.string().default("llama3.1:8b"),
  OLLAMA_VISION_MODEL: z.string().optional(),
  OLLAMA_EMBED_MODEL: z.string().default("nomic-embed-text"),
  OLLAMA_EMBED_DIM: z.coerce.number().default(768),
  OLLAMA_TIMEOUT_MS: z.coerce.number().positive().default(30000),
  OLLAMA_TIMEOUT: z.coerce.number().positive().optional(),
  OLLAMA_KEEP_ALIVE: z.string().default("10m"),
  OLLAMA_MAX_TOKENS: z.coerce.number().default(2048),
  OLLAMA_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  AI_TIMEOUT_MS: z.coerce.number().positive().default(120000),
  SSE_HEARTBEAT_MS: z.coerce.number().default(12000),
  DEV_RAG_INSPECTOR: envBoolean.default(false),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

  // =====================================
  // Redis Cache
  // =====================================
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  CACHE_TTL_RESUME_ANALYSIS: z.coerce.number().default(86400),
  CACHE_TTL_VISION_REPORT: z.coerce.number().default(86400),
  CACHE_TTL_RAG_ANSWER: z.coerce.number().default(3600),
  CACHE_TTL_JOB_RECOMMENDATIONS: z.coerce.number().default(1800),
  CACHE_TTL_ROADMAP: z.coerce.number().default(86400),

  // =====================================
  // Uploads
  // =====================================
  MAX_UPLOAD_MB: z.coerce.number().default(25),
  VISION_MAX_UPLOAD_MB: z.coerce.number().default(25),

  // =====================================
  // Rate Limiter
  // =====================================
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),

  // =====================================
  // RAG
  // =====================================
  RAG_CHUNK_SIZE_TOKENS: z.coerce.number().default(500),
  RAG_CHUNK_OVERLAP_TOKENS: z.coerce.number().default(100),
  RAG_TOP_K: z.coerce.number().default(5),
  RAG_SIMILARITY_THRESHOLD: z.coerce.number().default(0.55),

  RAG_USER_ID: z.string().optional(),
  DEV_USER_ID: z.string().optional(),
  ALLOW_DEV_AUTH_BYPASS: envBoolean.default(false),

  // =====================================
  LOG_LEVEL: z.string().default("info"),
  SEED_ADMIN_EMAIL: z.preprocess((value) => value === '' ? undefined : value, z.string().email().optional()),
  SEED_ADMIN_PASSWORD: z.preprocess((value) => value === '' ? undefined : value, z.string().min(12).optional()),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

if (isProd && !env.CORS_ALLOWED_ORIGINS.trim()) {
  console.error("❌ CORS_ALLOWED_ORIGINS is required in production");
  process.exit(1);
}

if (isProd && env.ALLOW_DEV_AUTH_BYPASS) {
  console.error("❌ ALLOW_DEV_AUTH_BYPASS must be false in production");
  process.exit(1);
}

if (isProd && env.DEV_RAG_INSPECTOR) {
  console.error("❌ DEV_RAG_INSPECTOR must be false in production");
  process.exit(1);
}