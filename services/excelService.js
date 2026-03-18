/**
 * excelService.js — PFCHub (512MB RAM optimized)
 *
 * 2-pass approach để tiết kiệm RAM:
 *   Pass 1: Đọc file → thu thập texts → GIẢI PHÓNG workbook khỏi RAM
 *   Pass 2: Dịch tất cả texts (batchTranslate tự quản lý RAM)
 *   Pass 3: Đọc lại file → ghi bản dịch → xuất output → cleanup
 */

const ExcelJS = require('exceljs');
const path    = require('path');
const fs      = require('fs');
const { logger }                              = require('./logger');
const { batchTranslate, releaseSessionCache } = require('./translationService');
const { extractTermsFromCell, hasChinese, hasEnglish } = require('./glossaryService');

const OUTPUT_DIR = path.join(__dirname, '..', 'outputs');

const jobProgress    = new Map();
const getJobProgress = (jobId) => jobProgress.get(jobId) || null;

// ── Quét file lấy thuật ngữ ───────────────────────────────────────────────────
const scanExcelForGlossary = async (filePath) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const terms = [];
  const seen  = new Set();
  workbook.eachSheet(sheet => {
    sheet.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        const val = getCellText(cell);
        if (!val) return;
        extractTermsFromCell(val).forEach(term => {
          const key = `${term.en}|${term.zh}`;
          if (!seen.has(key)) { seen.add(key); terms.push(term); }
        });
      });
    });
  });
  logger.info(`Scan: ${terms.length} pairs`);
  return terms;
};

// ── Dịch file (2-pass để tiết kiệm RAM) ──────────────────────────────────────
const translateExcelFile = async (filePath, targetLang = 'vi', jobId, onProgress) => {
  jobProgress.set(jobId, { phase: 'reading', percent: 0, translated: 0, total: 0, errors: 0, geminiCalls: 0 });
  logger.info(`Reading: ${path.basename(filePath)}`, { jobId });

  // ── PASS 1: Thu thập texts (workbook bị GC sau block) ────────────────────
  const cellMap = new Map(); // "sheetIdx!addr" → text

  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    wb.worksheets.forEach((sheet, si) => {
      sheet.eachRow({ includeEmpty: true }, row => {
        row.eachCell({ includeEmpty: false }, cell => {
          const text = getCellText(cell);
          if (shouldTranslate(text)) cellMap.set(`${si}!${cell.address}`, text);
        });
      });
    });
    // wb ra khỏi scope → GC
  }
  if (global.gc) global.gc();

  const totalCells = cellMap.size;
  logger.info(`Cells: ${totalCells}`, { jobId });
  jobProgress.set(jobId, { phase: 'translating', percent: 0, translated: 0, total: totalCells, errors: 0, geminiCalls: 0 });
  if (onProgress) onProgress({ percent: 0, translated: 0, total: totalCells, geminiCalls: 0 });

  if (totalCells === 0) {
    const outputName = await copyOutput(filePath, targetLang);
    cleanupUpload(filePath);
    jobProgress.set(jobId, { phase: 'done', percent: 100, translated: 0, total: 0, errors: 0, geminiCalls: 0, outputFile: outputName, _ts: Date.now() });
    return { outputName, translated: 0, errors: 0, geminiCalls: 0 };
  }

  // ── PASS 2: Dịch ─────────────────────────────────────────────────────────
  const addrList = [...cellMap.keys()];
  const items    = addrList.map((addr, i) => ({ index: i, text: cellMap.get(addr) }));
  let geminiCalls = 0;

  const results = await batchTranslate(
    items, targetLang,
    (stats) => {
      geminiCalls = stats.geminiCalls || 0;
      const pct   = Math.round((stats.resolved / Math.max(stats.total, 1)) * 100);
      jobProgress.set(jobId, { phase: 'translating', percent: pct, translated: stats.resolved, total: stats.total, errors: 0, geminiCalls });
      if (onProgress) onProgress({ percent: pct, translated: stats.resolved, total: stats.total, geminiCalls });
    },
    jobId
  );

  // Build translation map
  const transMap = new Map();
  results.forEach((r, i) => {
    if (r && !r.skipped && !r.error && r.translated) transMap.set(addrList[i], r.translated);
  });

  // Giải phóng arrays lớn
  items.length   = 0;
  results.length = 0;
  addrList.length = 0;
  if (global.gc) global.gc();

  // ── PASS 3: Ghi output ───────────────────────────────────────────────────
  logger.info('Writing output...', { jobId });
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(filePath);

  let translated = 0, errors = 0;

  wb2.worksheets.forEach((sheet, si) => {
    sheet.eachRow({ includeEmpty: true }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        const key  = `${si}!${cell.address}`;
        const tran = transMap.get(key);
        if (!tran) return;
        try { applyTranslation(cell, tran); translated++; }
        catch (e) { errors++; logger.error(`Write [${cell.address}]: ${e.message}`); }
      });
    });
    autoFitColumns(sheet);
  });

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const baseName   = path.basename(filePath, path.extname(filePath));
  const outputName = `${baseName}_${targetLang}_${Date.now()}.xlsx`;
  await wb2.xlsx.writeFile(path.join(OUTPUT_DIR, outputName));

  // Dọn dẹp
  cleanupUpload(filePath);
  transMap.clear();
  cellMap.clear();
  if (global.gc) global.gc();

  jobProgress.set(jobId, { phase: 'done', percent: 100, translated, total: totalCells, errors, geminiCalls, outputFile: outputName, _ts: Date.now() });
  logger.info(`Done: ${translated} cells, ${errors} errors, ${geminiCalls} Gemini calls → ${outputName}`, { jobId });
  return { outputName, translated, errors, geminiCalls };
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const getCellText = (cell) => {
  if (!cell.value && cell.value !== 0) return '';
  if (typeof cell.value === 'string')  return cell.value;
  if (typeof cell.value === 'number')  return String(cell.value);
  if (cell.value?.richText) return cell.value.richText.map(r => r.text || '').join('');
  if (cell.value?.text)     return String(cell.value.text);
  if (cell.value instanceof Date) return '';
  return String(cell.value);
};

const SKIP_RE = /^[\d\s\.\,\-\+\%\$€£¥\/\(\)\[\]\:\=\#\@\*\\|_~`'"<>{}]+$/;

const shouldTranslate = (text) => {
  if (!text || text.trim().length <= 1) return false;
  if (SKIP_RE.test(text.trim()))        return false;
  if (/^https?:\/\//.test(text.trim())) return false;
  return hasChinese(text) || hasEnglish(text);
};

const applyTranslation = (cell, translated) => {
  cell.value = translated;
  if (!cell.style)           cell.style           = {};
  if (!cell.style.alignment) cell.style.alignment = {};
  cell.style.alignment.wrapText = true;
  cell.style.alignment.vertical = cell.style.alignment.vertical || 'top';
};

const autoFitColumns = (sheet) => {
  sheet.columns.forEach(col => {
    if (!col?.eachCell) return;
    let maxLen = 10;
    col.eachCell({ includeEmpty: false }, cell => {
      const text = getCellText(cell);
      if (!text) return;
      text.split('\n').forEach(line => {
        const w = [...line].reduce((a, c) =>
          a + (/[\u4e00-\u9fff\u3040-\u30ff\uff00-\uffef]/.test(c) ? 2 : 1), 0);
        maxLen = Math.max(maxLen, Math.min(w + 4, 60));
      });
    });
    col.width = maxLen;
  });
};

const copyOutput = async (filePath, targetLang) => {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const baseName   = path.basename(filePath, path.extname(filePath));
  const outputName = `${baseName}_${targetLang}_${Date.now()}.xlsx`;
  fs.copyFileSync(filePath, path.join(OUTPUT_DIR, outputName));
  return outputName;
};

const cleanupUpload = (filePath) => {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
};

setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  jobProgress.forEach((v, k) => {
    if (v.phase === 'done' && v._ts && v._ts < cutoff) jobProgress.delete(k);
  });
}, 5 * 60 * 1000);

module.exports = { scanExcelForGlossary, translateExcelFile, getJobProgress, jobProgress };
