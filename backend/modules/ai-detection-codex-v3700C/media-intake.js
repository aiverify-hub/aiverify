'use strict';

const crypto = require('crypto');

const MODULE_VERSION = 'AI_DETECTION_MEDIA_INTAKE_V1';
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

const MIME_BY_KIND = Object.freeze({
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm'
});

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function startsWithBytes(buffer, bytes) {
  if (!Buffer.isBuffer(buffer) || buffer.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[i] !== bytes[i]) return false;
  }
  return true;
}

function asciiAt(buffer, start, length) {
  if (!Buffer.isBuffer(buffer) || buffer.length < start + length) return '';
  return buffer.subarray(start, start + length).toString('ascii');
}

function detectKind(buffer) {
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (asciiAt(buffer, 0, 6) === 'GIF87a' || asciiAt(buffer, 0, 6) === 'GIF89a') return 'gif';
  if (asciiAt(buffer, 0, 4) === 'RIFF' && asciiAt(buffer, 8, 4) === 'WEBP') return 'webp';
  if (asciiAt(buffer, 0, 3) === 'ID3' || (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return 'mp3';
  if (asciiAt(buffer, 0, 4) === 'RIFF' && asciiAt(buffer, 8, 4) === 'WAVE') return 'wav';
  if (startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm';
  if (asciiAt(buffer, 4, 4) === 'ftyp') {
    const brand = asciiAt(buffer, 8, 4).toLowerCase();
    if (brand === 'qt  ') return 'mov';
    return 'mp4';
  }
  return '';
}

function mediaTypeForKind(kind) {
  if (/^(?:jpeg|png|gif|webp)$/.test(kind)) return 'image';
  if (/^(?:mp3|wav)$/.test(kind)) return 'audio';
  if (/^(?:mp4|mov|webm)$/.test(kind)) return 'video';
  return '';
}

function decodeBase64(value) {
  let base64 = clean(value);
  const dataUrl = base64.match(/^data:[^;,]+;base64,(.+)$/i);
  if (dataUrl) base64 = dataUrl[1];
  base64 = base64.replace(/\s+/g, '');
  if (!base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw new Error('The uploaded file data is malformed.');
  }
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw new Error('The uploaded file is empty.');
  return buffer;
}

function safeFilename(value) {
  const name = clean(value).replace(/[\\/\0\r\n\t]+/g, '_').slice(0, 180);
  return name || 'uploaded-media';
}

function prepare(payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const buffer = decodeBase64(body.base64 || body.data || '');
  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new Error('This beta stage accepts files up to 8 MB.');
  }
  const kind = detectKind(buffer);
  if (!kind) {
    throw new Error('This file type is not supported yet. Use JPEG, PNG, GIF, WebP, MP3, WAV, MP4, MOV, or WebM.');
  }
  const mediaType = mediaTypeForKind(kind);
  const detectedMimeType = MIME_BY_KIND[kind] || 'application/octet-stream';
  const declaredMimeType = clean(body.mimeType).toLowerCase();
  const declaredTypeMatches = !declaredMimeType || declaredMimeType === detectedMimeType ||
    (mediaType === 'audio' && declaredMimeType === 'audio/mp3') ||
    (mediaType === 'video' && declaredMimeType === 'application/mp4');

  return Object.freeze({
    version: MODULE_VERSION,
    filename: safeFilename(body.filename),
    buffer: buffer,
    sizeBytes: buffer.length,
    kind: kind,
    mediaType: mediaType,
    detectedMimeType: detectedMimeType,
    declaredMimeType: declaredMimeType,
    declaredTypeMatches: declaredTypeMatches,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex')
  });
}

module.exports = Object.freeze({
  MODULE_VERSION: MODULE_VERSION,
  MAX_MEDIA_BYTES: MAX_MEDIA_BYTES,
  prepare: prepare
});
