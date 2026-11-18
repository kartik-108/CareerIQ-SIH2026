const ROW_TOLERANCE = 12;
const COLUMN_GAP = 80;
const COLUMN_START_GAP = 180;

function normalizeLine(line) {
  const text = String(line?.text || '').replace(/\s+/g, ' ').trim();
  const box = line?.bbox || line;
  if (!text || !Number.isFinite(Number(box?.x0))) return null;
  return {
    text,
    raw: text,
    x0: Number(box.x0),
    y0: Number(box.y0),
    x1: Number(box.x1),
    y1: Number(box.y1),
    confidence: Number(line.confidence || 0),
  };
}

function linesFromWords(words) {
  const ordered = (words || [])
    .filter((word) => word?.bbox && String(word.text || '').trim())
    .map((word) => ({
      text: String(word.text).trim(),
      x0: Number(word.bbox.x0),
      y0: Number(word.bbox.y0),
      x1: Number(word.bbox.x1),
      y1: Number(word.bbox.y1),
      confidence: Number(word.confidence || 0),
    }))
    .sort((left, right) => left.y0 - right.y0 || left.x0 - right.x0);

  const rows = [];
  for (const word of ordered) {
    let row = rows.find((candidate) => (
      Math.abs(candidate.y0 - word.y0) <= ROW_TOLERANCE
      && word.x0 <= candidate.x1 + COLUMN_GAP
    ));
    if (!row) {
      row = { y0: word.y0, y1: word.y1, x1: word.x1, words: [] };
      rows.push(row);
    }
    row.words.push(word);
    row.y0 = Math.min(row.y0, word.y0);
    row.y1 = Math.max(row.y1, word.y1);
    row.x1 = Math.max(row.x1, word.x1);
  }

  return rows.map((row) => {
    const wordsInRow = row.words.sort((left, right) => left.x0 - right.x0);
    return {
      text: wordsInRow.map((word) => word.text).join(' '),
      raw: wordsInRow.map((word) => word.text).join(' '),
      x0: Math.min(...wordsInRow.map((word) => word.x0)),
      y0: row.y0,
      x1: Math.max(...wordsInRow.map((word) => word.x1)),
      y1: row.y1,
      confidence: wordsInRow.length
        ? Math.round(wordsInRow.reduce((sum, word) => sum + word.confidence, 0) / wordsInRow.length)
        : 0,
    };
  });
}

function linesFromBlocks(blocks) {
  return (blocks || []).flatMap((block) => (block.paragraphs || []).flatMap((paragraph) => (
    (paragraph.lines || []).map((line) => normalizeLine(line)).filter(Boolean)
  )));
}

function groupColumns(lines) {
  const sorted = [...lines].sort((left, right) => left.x0 - right.x0);
  const columns = [];
  for (const line of sorted) {
    const column = [...columns].reverse().find((candidate) => line.x0 - candidate.maxStartX <= COLUMN_START_GAP);
    if (column) {
      column.lines.push(line);
      column.maxX = Math.max(column.maxX, line.x1);
      column.maxStartX = Math.max(column.maxStartX, line.x0);
    } else {
      columns.push({ minX: line.x0, maxX: line.x1, maxStartX: line.x0, lines: [line] });
    }
  }
  return columns;
}

export function reconstructReadingOrder(input = []) {
  const source = Array.isArray(input) ? input : [];
  const lines = source.some((item) => item?.paragraphs)
    ? linesFromBlocks(source)
    : source.some((item) => item?.bbox) && source.some((item) => item?.text)
      ? linesFromWords(source)
      : source.some((item) => Number.isFinite(Number(item?.x0))) ? source.map(normalizeLine).filter(Boolean)
      : [];

  if (!lines.length) {
    return { text: '', lines: [], columnCount: 0, footerCount: 0, spanCount: 0, gutters: [] };
  }

  let columns = groupColumns(lines);
  const minimumColumnLines = Math.max(4, Math.ceil(lines.length * 0.15));
  if (lines.length > 8 && columns.length > 1 && columns.some((column) => column.lines.length < minimumColumnLines)) {
    columns = [{
      minX: Math.min(...lines.map((line) => line.x0)),
      maxX: Math.max(...lines.map((line) => line.x1)),
      maxStartX: Math.max(...lines.map((line) => line.x0)),
      lines: [...lines],
    }];
  }
  const ordered = columns
    .sort((left, right) => left.minX - right.minX)
    .flatMap((column, columnIndex) => column.lines
      .sort((left, right) => left.y0 - right.y0 || left.x0 - right.x0)
      .map((line, order) => ({ ...line, column: columnIndex, order })));

  const maxY = Math.max(...ordered.map((line) => line.y1));
  const footerThreshold = maxY - Math.max(80, maxY * 0.08);
  const footerCount = ordered.filter((line) => line.y0 >= footerThreshold).length;
  const gutters = columns.slice(1).map((column, index) => column.minX - columns[index].maxX);

  return {
    text: ordered.map((line) => line.text).join('\n'),
    lines: ordered,
    columnCount: columns.length,
    footerCount,
    spanCount: ordered.length,
    gutters,
  };
}
