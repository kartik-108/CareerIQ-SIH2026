// Provides dummy-but-valid env vars so config/env.js's Zod validation
// passes during tests, without needing real Supabase or Ollama credentials.
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
process.env.OLLAMA_CHAT_MODEL = 'llama3.1:8b';
process.env.OLLAMA_EMBED_MODEL = 'nomic-embed-text';
