const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const { translateExcelFile, getJobProgress } = require('../services/excelService');
const { translateText, getCacheStats }       = require('../services/translationService');
const { addHistoryRecord }                   = require('../services/historyService');
const { logger }                             = require('../services/logger');

const upload = multer({
  dest:   path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 100 * 1024 * 1024 }
});

// SSE clients: Map<jobId, Response[]>
const sseClients = new Map();

const broadcast = (jobId, data) => {
  (sseClients.get(jobId) || []).forEach(client => {
    try { client.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  });
};

// POST /api/translate/start
router.post('/start', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { targetLang = 'vi' } = req.body;
    const jobId        = uuidv4();
    const originalName = req.file.originalname;

    logger.info(`Job started: ${jobId}`, { file: originalName, targetLang });
    res.json({ jobId, message: 'Translation job started' });

    // Chạy bất đồng bộ sau khi đã trả response
    setImmediate(async () => {
      try {
        const result = await translateExcelFile(req.file.path, targetLang, jobId, (progress) => {
          broadcast(jobId, { type: 'progress', ...progress });
        });

        addHistoryRecord({
          action:     'translate',
          fileName:   originalName,
          targetLang, jobId,
          details:    `${result.translated} cells, ${result.errors} errors`,
          outputFile: result.outputName
        });

        broadcast(jobId, {
          type:       'done',
          outputFile: result.outputName,
          translated: result.translated,
          errors:     result.errors
        });

        (sseClients.get(jobId) || []).forEach(c => { try { c.end(); } catch {} });
        sseClients.delete(jobId);
        try { fs.unlinkSync(req.file.path); } catch {}

      } catch (err) {
        logger.error(`Job failed: ${jobId}`, { error: err.message });
        broadcast(jobId, { type: 'error', error: err.message });
        (sseClients.get(jobId) || []).forEach(c => { try { c.end(); } catch {} });
        sseClients.delete(jobId);
      }
    });

  } catch (err) {
    logger.error('Start translate error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/translate/progress/:jobId  — SSE stream
router.get('/progress/:jobId', (req, res) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type',                'text/event-stream');
  res.setHeader('Cache-Control',               'no-cache');
  res.setHeader('Connection',                  'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  if (!sseClients.has(jobId)) sseClients.set(jobId, []);
  sseClients.get(jobId).push(res);

  // Gửi trạng thái hiện tại ngay khi kết nối
  const current = getJobProgress(jobId);
  if (current) {
    const type = current.phase === 'done' ? 'done' : 'progress';
    res.write(`data: ${JSON.stringify({ type, ...current })}\n\n`);
  }

  // Keep-alive ping mỗi 20s
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(ping); }
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    const clients = sseClients.get(jobId) || [];
    const idx     = clients.indexOf(res);
    if (idx !== -1) clients.splice(idx, 1);
  });
});

// GET /api/translate/status/:jobId
router.get('/status/:jobId', (req, res) => {
  const progress = getJobProgress(req.params.jobId);
  if (!progress) return res.status(404).json({ error: 'Job not found' });
  res.json(progress);
});

// GET /api/translate/download/:filename
router.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, '..', 'outputs', path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.download(filePath);
});

// POST /api/translate/text  — test dịch nhanh
router.post('/text', async (req, res) => {
  try {
    const { text, targetLang = 'vi' } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const result = await translateText(text, targetLang);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/translate/cache-stats
router.get('/cache-stats', (req, res) => {
  res.json(getCacheStats());
});

module.exports = router;
