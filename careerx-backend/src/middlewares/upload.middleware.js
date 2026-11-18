import multer from 'multer';
import { env } from '../config/env.js';
import { ValidationError } from '../utils/ApiError.js';

const ALLOWED_RESUME_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const storage = multer.memoryStorage();

function startsWithBytes(buffer, bytes) {
  return buffer?.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);
}

export function hasValidSignature(file, { allowText = false, imagesOnly = false } = {}) {
  const mime = file.mimetype;
  const buffer = file.buffer;
  const isPdf = mime === 'application/pdf' && startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46]);
  const isDocx = mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    && startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]);
  const isPng = mime === 'image/png' && startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const isJpeg = (mime === 'image/jpeg' || mime === 'image/jpg')
    && startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
  const isWebp = mime === 'image/webp'
    && startsWithBytes(buffer, [0x52, 0x49, 0x46, 0x46])
    && buffer.length >= 12
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  const isText = allowText && (mime.startsWith('text/') || /\.(txt|md|markdown)$/i.test(file.originalname || ''));
  const valid = isPdf || isDocx || isPng || isJpeg || isWebp || isText;
  return imagesOnly ? (isPng || isJpeg || isWebp) : valid;
}

function secureUpload(parser, options = {}) {
  return (req, res, next) => parser(req, res, (error) => {
    if (error) return next(error);
    if (!req.file || hasValidSignature(req.file, options)) return next();
    return next(new ValidationError('The uploaded file content does not match its declared type.'));
  });
}

const resumeUpload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_RESUME_MIME_TYPES.has(file.mimetype)) {
      return cb(new ValidationError(`Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, PNG, JPG, JPEG, WEBP.`));
    }
    cb(null, true);
  },
}).single('resume');
export const uploadResume = secureUpload(resumeUpload);

const visionResumeUpload = multer({
  storage,
  limits: { fileSize: env.VISION_MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_RESUME_MIME_TYPES.has(file.mimetype)) {
      return cb(new ValidationError(`Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, PNG, JPG, JPEG, WEBP.`));
    }
    cb(null, true);
  },
}).single('resume');
export const uploadVisionResume = secureUpload(visionResumeUpload);

const visionArtifactUpload = multer({
  storage,
  limits: { fileSize: env.VISION_MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_RESUME_MIME_TYPES.has(file.mimetype)) {
      return cb(new ValidationError(`Unsupported file type: ${file.mimetype}. Allowed: PDF, PNG, JPG, JPEG, WEBP.`));
    }
    cb(null, true);
  },
}).single('file');
export const uploadVisionArtifact = secureUpload(visionArtifactUpload, { imagesOnly: false });

const avatarUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new ValidationError('Avatar must be an image file.'));
    }
    cb(null, true);
  },
}).single('avatar');
export const uploadAvatar = secureUpload(avatarUpload, { imagesOnly: true });

const CAREER_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);

const careerDocumentUpload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!CAREER_DOCUMENT_MIME_TYPES.has(file.mimetype) && !/\.(pdf|docx|txt|md|markdown)$/i.test(file.originalname)) {
      return cb(new ValidationError('Unsupported document type. Allowed: PDF, DOCX, TXT, Markdown.'));
    }
    cb(null, true);
  },
}).single('document');
export const uploadCareerDocument = secureUpload(careerDocumentUpload, { allowText: true });
