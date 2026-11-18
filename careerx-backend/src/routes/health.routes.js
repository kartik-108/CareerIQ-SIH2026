import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { healthCheck } from '../services/ai/provider.js';

const router = Router();

// Liveness — process is up.
router.get('/health', async (req, res) => {
  let ai = 'offline';
  let db = 'connected';
  try { ai = (await healthCheck()).running ? 'connected' : 'offline'; } catch { ai = 'offline'; }
  try { const { error } = await supabase.from('profiles').select('user_id').limit(1); if (error) db = 'offline'; } catch { db = 'offline'; }
  res.status(200).json({ success: true, ai, db, uptime: process.uptime(), status: 'alive', timestamp: new Date().toISOString() });
});

router.get('/health/ollama', async (req, res) => {
  const health = await healthCheck();
  res.status(health.running ? 200 : 503).json({
    success: health.running,
    server: health.running ? 'online' : 'offline',
    chatModel: health.chatModel,
    embeddingModel: health.embeddingModel,
    availableModels: health.models.map((model) => model.name).filter(Boolean),
    message: health.running ? 'Ollama is available' : 'Ollama is unavailable',
    timestamp: new Date().toISOString(),
    requestId: req.id || null,
  });
});

// Readiness — process is up AND its dependencies (DB) are reachable.
router.get('/ready', async (req, res) => {
  try {
    const { error } = await supabase.from('profiles').select('user_id').limit(1);
    if (error) throw error;
    res.status(200).json({ success: true, status: 'ready' });
  } catch {
    res.status(503).json({ success: false, status: 'not_ready', error: 'Database is unavailable' });
  }
});

export default router;
