/**
 * translationService.js — PFCHub (512MB RAM optimized)
 *
 * Chiến lược bộ nhớ:
 *   - KHÔNG dùng in-memory cache lớn
 *   - File cache = nguồn sự thật duy nhất (persist qua restart)
 *   - Session cache: tối đa 500 keys, xoá sạch sau mỗi job
 *   - Glossary index: chỉ lưu Map<string,string> nhỏ gọn
 *   - Gemini batch: 8 texts / 1 API call
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs   = require('fs');
const path = require('path');
const { logger }     = require('./logger');
const { readGlossary, hasChinese, hasEnglish } = require('./glossaryService');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const MAX_MEM_KEYS = 500;
const BATCH_SIZE   = 8;
const CACHE_DIR    = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CACHE_FILE   = path.join(CACHE_DIR, 'tr_cache.json');

// ── SESSION CACHE (LRU, tối đa 500 keys) ─────────────────────────────────────
let sessionCache = new Map();

const sessionGet = (key) => sessionCache.get(key);

const sessionSet = (key, value) => {
  if (sessionCache.size >= MAX_MEM_KEYS) {
    sessionCache.delete(sessionCache.keys().next().value);
  }
  sessionCache.set(key, value);
};

const releaseSessionCache = () => {
  const size = sessionCache.size;
  sessionCache.clear();
  sessionCache = new Map();
  if (global.gc) global.gc();
  logger.info(`Session cache released: ${size} entries freed`);
};

// ── FILE CACHE ────────────────────────────────────────────────────────────────
const fileCacheGet = (key) => {
  try {
    if (!fs.existsSync(CACHE_FILE)) return undefined;
    const content = fs.readFileSync(CACHE_FILE, 'utf8');
    if (content.length < 3) return undefined;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`"${escaped}":"((?:[^"\\\\]|\\\\.)*)"`);
    const match   = content.match(pattern);
    return match ? match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : undefined;
  } catch {
    return undefined;
  }
};

const fileCacheSetMany = (entries) => {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    let existing = {};
    if (fs.existsSync(CACHE_FILE)) {
      try { existing = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch {}
    }
    Object.assign(existing, entries);
    // Giới hạn 50,000 entries
    const keys = Object.keys(existing);
    if (keys.length > 50000) {
      keys.slice(0, keys.length - 40000).forEach(k => delete existing[k]);
      logger.info('File cache trimmed to 40,000 entries');
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(existing), 'utf8');
    logger.info(`File cache: ${Object.keys(existing).length} entries`);
  } catch (e) {
    logger.error('File cache write failed', { error: e.message });
  }
};

// ── GLOSSARY INDEX ────────────────────────────────────────────────────────────
let glossaryMap     = new Map();
let glossaryVersion = '';

const normalize = (t) =>
  t.toLowerCase().replace(/[\s\u00a0]+/g, ' ').replace(/[.,;:!?。，；：！？]/g, '').trim();

const buildGlossaryMap = (targetLang) => {
  const g      = readGlossary();
  const verKey = `${g.version}_${targetLang}`;
  if (verKey === glossaryVersion && glossaryMap.size > 0) return;

  glossaryMap.clear();
  g.entries.forEach(entry => {
    if (!entry[targetLang]) return;
    const val = entry[targetLang];
    if (entry.en) glossaryMap.set(normalize(entry.en), val);
    if (entry.zh) glossaryMap.set(normalize(entry.zh), val);
    if (entry.zh) glossaryMap.set(entry.zh.trim(), val);
  });
  glossaryVersion = verKey;
  logger.info(`Glossary map: ${glossaryMap.size} keys (lang=${targetLang})`);
};

const glossaryLookup = (text, targetLang) => {
  buildGlossaryMap(targetLang);
  const norm = normalize(text);

  if (glossaryMap.has(norm))        return { value: glossaryMap.get(norm), type: 'exact' };
  if (glossaryMap.has(text.trim())) return { value: glossaryMap.get(text.trim()), type: 'exact' };

  if (text.length <= 100) {
    for (const [key, val] of glossaryMap) {
      if (key.length >= 3 && norm.includes(key)) return { value: val, type: 'fuzzy' };
    }
  }
  return null;
};

// ── SKIP LOGIC ────────────────────────────────────────────────────────────────
const SKIP_RE = /^[\d\s\.\,\-\+\%\$€£¥\/\(\)\[\]\:\=\#\@\*\\|_~`'"<>{}]+$/;

const shouldTranslate = (text) => {
  if (!text || text.trim().length <= 1)       return false;
  if (SKIP_RE.test(text.trim()))              return false;
  if (/^https?:\/\//.test(text.trim()))       return false;
  if (!hasChinese(text) && !hasEnglish(text)) return false;
  return true;
};

// ── GEMINI CLIENT ─────────────────────────────────────────────────────────────
let genAIInstance = null;
const getGenAI = () => {
  if (!genAIInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY chưa được cấu hình');
    genAIInstance = new GoogleGenerativeAI(key);
  }
  return genAIInstance;
};

// Rate limiter 14 RPM
const rl = {
  max: 14, win: 60000, ts: [],
  async wait() {
    return new Promise(resolve => {
      const attempt = () => {
        const now = Date.now();
        this.ts = this.ts.filter(t => now - t < this.win);
        if (this.ts.length < this.max) { this.ts.push(now); resolve(); }
        else {
          const delay = this.win - (now - this.ts[0]) + 300;
          logger.warn(`Rate limit: waiting ${(delay/1000).toFixed(1)}s`);
          setTimeout(attempt, delay);
        }
      };
      attempt();
    });
  }
};

const LANG_MAP = {
  vi: 'Vietnamese', en: 'English', zh: 'Chinese (Simplified)',
  ja: 'Japanese', ko: 'Korean', fr: 'French', de: 'German'
};

const getGlossaryContext = (targetLang) => {
  const g = readGlossary();
  const items = g.entries.filter(e => e[targetLang]).slice(0, 40);
  if (!items.length) return '';
  return '\n\nGLOSSARY:\n' + items.map(e => {
    const p = [];
    if (e.en) p.push(`EN:"${e.en}"`);
    if (e.zh) p.push(`ZH:"${e.zh}"`);
    p.push(`→"${e[targetLang]}"`);
    return p.join(' ');
  }).join('\n');
};

const callGemini = async (texts, targetLang, glossaryCtx, jobId) => {
  await rl.wait();

  const lang   = LANG_MAP[targetLang] || targetLang;
  const prompt = texts.map((t, i) => `[${i+1}] ${t}`).join('\n---\n');
  const sys    =
    `Translate ALL numbered items to ${lang}.\n` +
    `Output ONLY a JSON array of strings, same count as input.\n` +
    `Keep codes/units/brands unchanged (PFC,SKU,ID,No.,mm,kg,pcs...).\n` +
    `If already ${lang}, keep as-is.${glossaryCtx}`;

  try {
    const model = getGenAI().getGenerativeModel({
      model:             'gemini-1.5-flash',
      systemInstruction: sys,
      generationConfig:  { responseMimeType: 'application/json', maxOutputTokens: 2048 }
    });
    const res  = await model.generateContent(`Translate ${texts.length} items:\n${prompt}`);
    const raw  = res.response.text().trim();

    let parsed;
    try   { parsed = JSON.parse(raw); }
    catch {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) parsed = JSON.parse(m[0]);
      else   throw new Error(`Bad JSON: ${raw.slice(0, 80)}`);
    }

    if (!Array.isArray(parsed) || parsed.length !== texts.length) {
      logger.warn(`Gemini returned ${parsed?.length}, expected ${texts.length}`);
      return texts.map((t, i) => (parsed?.[i] ? String(parsed[i]).trim() : t));
    }
    return parsed.map(t => String(t).trim());

  } catch (err) {
    const is429 = err.status === 429
      || String(err.message).includes('429')
      || String(err.message).includes('quota');
    if (is429) {
      logger.warn('429 quota — waiting 65s...', { jobId });
      await new Promise(r => setTimeout(r, 65000));
      return callGemini(texts, targetLang, glossaryCtx, jobId);
    }
    throw err;
  }
};

// ── PUBLIC: translateText (test đơn lẻ) ──────────────────────────────────────
const translateText = async (text, targetLang = 'vi', _src = 'auto', jobId = null) => {
  if (!text?.trim()) return { translated: text, skipped: true };
  const t = text.trim();
  if (!shouldTranslate(t)) return { translated: t, skipped: true };

  const g = glossaryLookup(t, targetLang);
  if (g) return { translated: g.value, fromGlossary: true, matchType: g.type };

  const cKey = `${targetLang}:${t}`;
  const sess = sessionGet(cKey);
  if (sess !== undefined) return { translated: sess, fromCache: true };

  const file = fileCacheGet(cKey);
  if (file !== undefined) { sessionSet(cKey, file); return { translated: file, fromCache: true }; }

  const ctx = getGlossaryContext(targetLang);
  const [result] = await callGemini([t], targetLang, ctx, jobId);
  sessionSet(cKey, result);
  fileCacheSetMany({ [cKey]: result });
  return { translated: result, fromCache: false, fromGlossary: false };
};

// ── PUBLIC: batchTranslate (dùng trong excelService) ─────────────────────────
const batchTranslate = async (items, targetLang = 'vi', onProgress = null, jobId = null) => {
  const results    = new Array(items.length);
  const needGemini = [];
  const toCache    = {};

  // Pass 1: Glossary + Session + File cache
  logger.info(`batchTranslate: ${items.length} items`, { jobId });

  for (let i = 0; i < items.length; i++) {
    const text = (items[i].text || '').trim();

    if (!shouldTranslate(text)) {
      results[i] = { index: items[i].index, translated: text, skipped: true };
      continue;
    }

    const g = glossaryLookup(text, targetLang);
    if (g) { results[i] = { index: items[i].index, translated: g.value, fromGlossary: true, matchType: g.type }; continue; }

    const cKey = `${targetLang}:${text}`;
    const sess = sessionGet(cKey);
    if (sess !== undefined) { results[i] = { index: items[i].index, translated: sess, fromCache: true }; continue; }

    const file = fileCacheGet(cKey);
    if (file !== undefined) { sessionSet(cKey, file); results[i] = { index: items[i].index, translated: file, fromCache: true }; continue; }

    needGemini.push({ i, index: items[i].index, text, cKey });
  }

  const resolved    = items.length - needGemini.length;
  const geminiCalls = Math.ceil(needGemini.length / BATCH_SIZE);
  const pct         = Math.round((resolved / Math.max(items.length, 1)) * 100);

  logger.info(
    `Pass1: ${resolved}/${items.length} (${pct}%) resolved — ` +
    `${needGemini.length} need Gemini → ${geminiCalls} calls`,
    { jobId }
  );
  if (onProgress) onProgress({ resolved, needGemini: needGemini.length, total: items.length, geminiCalls });

  // Pass 2: Gemini
  if (needGemini.length > 0) {
    const ctx          = getGlossaryContext(targetLang);
    const totalBatches = Math.ceil(needGemini.length / BATCH_SIZE);

    for (let b = 0; b < totalBatches; b++) {
      const chunk  = needGemini.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      const texts  = chunk.map(x => x.text);
      logger.info(`Gemini ${b+1}/${totalBatches}: ${texts.length} texts`, { jobId });

      try {
        const translations = await callGemini(texts, targetLang, ctx, jobId);
        translations.forEach((translated, idx) => {
          const { i, index, cKey } = chunk[idx];
          sessionSet(cKey, translated);
          toCache[cKey] = translated;
          results[i]    = { index, translated, fromCache: false, fromGlossary: false };
        });
      } catch (err) {
        logger.error(`Batch ${b+1} failed: ${err.message}`, { jobId });
        chunk.forEach(({ i, index, text }) => {
          results[i] = { index, translated: text, error: err.message };
        });
      }

      const doneNow = resolved + Math.min((b + 1) * BATCH_SIZE, needGemini.length);
      if (onProgress) onProgress({ resolved: doneNow, needGemini: needGemini.length, total: items.length, geminiCalls });
      if (b % 5 === 4 && global.gc) global.gc();
    }
  }

  // Flush cache 1 lần
  if (Object.keys(toCache).length > 0) fileCacheSetMany(toCache);

  // QUAN TRỌNG: Giải phóng RAM sau khi xong job
  releaseSessionCache();

  return results;
};

const getCacheStats = () => {
  let fileKeys = 0;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fileKeys = (fs.readFileSync(CACHE_FILE, 'utf8').match(/:/g) || []).length;
    }
  } catch {}
  return {
    session:  { keys: sessionCache.size, maxKeys: MAX_MEM_KEYS },
    file:     { keys: fileKeys },
    glossary: { keys: glossaryMap.size }
  };
};

const clearCache = () => {
  releaseSessionCache();
  try { if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE); } catch {}
  logger.info('All caches cleared');
};

module.exports = { translateText, batchTranslate, getCacheStats, clearCache, releaseSessionCache };
