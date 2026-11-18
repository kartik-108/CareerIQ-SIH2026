import { jest } from '@jest/globals';

const recognize = jest.fn();
jest.unstable_mockModule('tesseract.js', () => ({ default: { recognize } }));

const { extractTextWithOcr } = await import('../src/utils/ocr.js');

describe('layout-aware OCR', () => {
  it('preserves line breaks instead of replacing them with spaces', async () => {
    recognize.mockResolvedValueOnce({ data: { text: 'EDUCATION\nUniversity of Pennsylvania' } });
    const result = await extractTextWithOcr(Buffer.from('not-an-image'), { mimeType: 'text/plain' });
    expect(result.text).toContain('\n');
    expect(result.metadata.layoutAware).toBe(false);
  });

  it('reconstructs two columns from word bounding boxes', async () => {
    const words = [
      ['PROFESSIONAL', 20, 20, 130, 40], ['EXPERIENCE', 140, 20, 245, 40],
      ['SpaceX', 20, 70, 90, 90], ['2002', 20, 100, 65, 120],
      ['TECHNICAL', 400, 20, 490, 40], ['SKILLS', 500, 20, 560, 40],
      ['Robotics', 400, 70, 470, 90], ['Automation', 480, 70, 570, 90],
    ].map(([text, x0, y0, x1, y1]) => ({ text, bbox: { x0, y0, x1, y1 } }));
    recognize.mockResolvedValueOnce({ data: { text: 'flattened', words } });
    const result = await extractTextWithOcr(Buffer.from('not-an-image'), { mimeType: 'text/plain' });
    expect(result.metadata.layoutAware).toBe(true);
    expect(result.text.split('\n')).toEqual([
      'PROFESSIONAL EXPERIENCE',
      'SpaceX',
      '2002',
      'TECHNICAL SKILLS',
      'Robotics Automation',
    ]);
  });
});
