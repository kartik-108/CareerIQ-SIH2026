import sharp from 'sharp';

const MAX_IMAGE_DIMENSION = 2400;

export async function preprocessResumeFile(file) {
  if (file.mimetype === 'application/pdf') {
    return {
      buffer: file.buffer,
      mimeType: file.mimetype,
      parts: [{ inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype } }],
    };
  }

  const buffer = await sharp(file.buffer)
    .rotate()
    .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();

  return {
    buffer,
    mimeType: 'image/jpeg',
    parts: [{ inlineData: { data: buffer.toString('base64'), mimeType: 'image/jpeg' } }],
  };
}
