import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';

const extractRawText = jest.fn();
jest.unstable_mockModule('mammoth', () => ({ extractRawText }));

const { extractTextFromFile } = await import('../src/rag/ingest.js');

describe('rag ingestion', () => {
  it('extracts raw text from DOCX files', async () => {
    const filePath = path.join(os.tmpdir(), `careeriq-${Date.now()}.docx`);
    fs.writeFileSync(filePath, Buffer.from('docx bytes'));
    extractRawText.mockResolvedValue({ value: 'DOCX interview knowledge' });

    await expect(extractTextFromFile(filePath)).resolves.toBe('DOCX interview knowledge');
    expect(extractRawText).toHaveBeenCalledWith({ buffer: expect.any(Buffer) });
    fs.unlinkSync(filePath);
  });
});