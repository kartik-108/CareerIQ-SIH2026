import { hasValidSignature } from '../src/middlewares/upload.middleware.js';

describe('upload content validation', () => {
  it('accepts a PDF whose signature matches its MIME type', () => {
    expect(hasValidSignature({
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n'),
    })).toBe(true);
  });

  it('rejects a file that only claims to be a PDF', () => {
    expect(hasValidSignature({
      mimetype: 'application/pdf',
      buffer: Buffer.from('not a PDF'),
    })).toBe(false);
  });

  it('accepts configured plain-text career documents', () => {
    expect(hasValidSignature({
      mimetype: 'text/plain',
      buffer: Buffer.from('career notes'),
    }, { allowText: true })).toBe(true);
  });
});
