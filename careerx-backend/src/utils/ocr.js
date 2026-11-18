import sharp from 'sharp';
import { logger } from '../config/logger.js';
import { reconstructReadingOrder } from './resumeLayout.js';

const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 45000);
const OCR_LANGUAGE = process.env.OCR_LANGUAGE || 'eng';
// 3 = fully automatic page segmentation (Tesseract's own column/block analysis).
const OCR_PAGE_SEG_MODE = process.env.OCR_PAGE_SEG_MODE || '3';
const MIN_OCR_WIDTH = 1800;
const MAX_OCR_DIMENSION = 2400;

/**
 * Normalize OCR text WITHOUT destroying line structure.
 * Only non-whitespace control characters are removed; newlines and internal spacing are kept.
 */
export function cleanOcrText(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Single lossless pass before OCR: orientation fix, grayscale, contrast normalization,
 * and upscaling of small scans so glyphs reach a usable resolution.
 */
async function prepareImageForOcr(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    const rendered = await sharp(buffer, { density: 220 })
      .rotate()
      .resize({ width: MAX_OCR_DIMENSION, height: MAX_OCR_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 8 })
      .toBuffer();
    return { buffer: rendered, mimeType: 'image/png' };
  }

  if (mimeType?.startsWith('image/')) {
    const metadata = await sharp(buffer).rotate().metadata();
    const width = metadata.width || MIN_OCR_WIDTH;
    const targetWidth = Math.min(MAX_OCR_DIMENSION, Math.max(MIN_OCR_WIDTH, width));
    const image = await sharp(buffer)
      .rotate()
      .grayscale()
      .normalise()
      .resize({ width: targetWidth, height: MAX_OCR_DIMENSION, fit: 'inside', withoutEnlargement: false })
      .png({ compressionLevel: 6 })
      .toBuffer();
    return { buffer: image, mimeType: 'image/png' };
  }

  return { buffer, mimeType };
}

// Flatten Tesseract blocks -> paragraphs -> lines into geometric line records.
function linesFromTesseract(blocks) {
  const lines = [];
  (blocks || []).forEach((block, blockIndex) => {
    (block.paragraphs || []).forEach((paragraph) => {
      (paragraph.lines || []).forEach((line) => {
        const text = String(line.text || '').replace(/^\s+/, '').replace(/\s+$/, '');
        if (!text.trim() || !line.bbox) return;
        lines.push({
          text,
          x0: line.bbox.x0,
          y0: line.bbox.y0,
          x1: line.bbox.x1,
          y1: line.bbox.y1,
          confidence: Math.round(Number(line.confidence || 0)),
          block: blockIndex,
        });
      });
    });
  });
  return lines;
}

export async function extractTextWithOcr(buffer, options = {}) {
  const mimeType = options.mimeType || 'image/png';
  const language = options.language || OCR_LANGUAGE;
  const timeoutMs = Number(options.timeoutMs || OCR_TIMEOUT_MS);
  const startedAt = Date.now();
  let worker = null;

  try {
    const prepared = await prepareImageForOcr(buffer, mimeType);
    const tesseract = await import('tesseract.js');
    const createWorker = tesseract.createWorker || tesseract.default?.createWorker;
    const recognize = tesseract.recognize || tesseract.default?.recognize;
    let recognition;

    if (createWorker) {
      worker = await createWorker(language, 1, {
        logger: (message) => {
          if (message?.status === 'recognizing text') {
            logger.debug({ progress: message.progress }, 'resume OCR in progress');
          }
        },
      });
      await worker.setParameters({ tessedit_pageseg_mode: OCR_PAGE_SEG_MODE, preserve_interword_spaces: '1' });
      recognition = worker.recognize(prepared.buffer, {}, { blocks: true, text: true });
    } else if (recognize) {
      recognition = recognize(prepared.buffer, language, { logger: () => {} });
    } else {
      throw new Error('Tesseract.js does not expose a recognize API');
    }

    const result = await Promise.race([
      recognition,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`OCR timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);

    const rawText = cleanOcrText(result?.data?.text || '');
    const blockLines = linesFromTesseract(result?.data?.blocks);
    const layout = blockLines.length
      ? reconstructReadingOrder(blockLines)
      : reconstructReadingOrder(result?.data?.words || []);
    const layoutAware = layout.lines.length > 0;
    logger.info({
      durationMs: Date.now() - startedAt,
      textLength: rawText.length,
      lineCount: layout.lines.length,
      columnCount: layout.columnCount,
      footerLines: layout.footerCount,
      method: 'ocr',
      mimeType,
    }, 'resume OCR extraction completed');

    return {
      text: layout.text || rawText,
      layoutText: layout.text || rawText,
      layout: {
        columnCount: layout.columnCount,
        footerCount: layout.footerCount,
        spanCount: layout.spanCount,
        gutters: layout.gutters,
        lines: layout.lines.map((line) => ({
          text: line.text,
          x0: line.x0,
          y0: line.y0,
          x1: line.x1,
          y1: line.y1,
          confidence: line.confidence,
          raw: line.raw,
          region: line.region,
          column: line.column,
          order: line.order,
        })),
      },
      method: 'ocr',
      status: rawText ? 'success' : 'empty',
      textLength: rawText.length,
      confidence: Number(result?.data?.confidence || 0),
      metadata: { engine: 'tesseract.js', language, mimeType, pageSegMode: OCR_PAGE_SEG_MODE, preprocessing: 'grayscale+normalise+lossless-png', layoutAware },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ durationMs: Date.now() - startedAt, mimeType, err: message }, 'resume OCR extraction failed');
    return {
      text: '',
      layoutText: '',
      layout: { columnCount: 0, footerCount: 0, spanCount: 0, gutters: [], lines: [] },
      method: 'ocr',
      status: 'failed',
      textLength: 0,
      confidence: 0,
      error: message,
      metadata: { engine: 'tesseract.js', language, mimeType },
    };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
}
