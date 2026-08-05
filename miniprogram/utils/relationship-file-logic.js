// relationship-file-logic.js — 关系资料文件边界纯逻辑（无 wx 依赖，可被 vitest 测试）

function relationshipKnownFileSize(file) {
  const rawSize = file && file.size;
  if (rawSize === undefined || rawSize === null || rawSize === '') return null;
  const size = Number(rawSize);
  return Number.isFinite(size) && size >= 0 ? size : null;
}

function relationshipBase64ByteLength(value) {
  let encoded = String(value || '').trim();
  const commaIndex = encoded.indexOf(',');
  if (encoded.startsWith('data:') && commaIndex >= 0) encoded = encoded.slice(commaIndex + 1);
  encoded = encoded.replace(/\s/g, '');
  if (!encoded) return 0;
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(encoded.length * 3 / 4) - padding);
}

function relationshipFileByteSize(file, base64) {
  const knownSize = relationshipKnownFileSize(file);
  return knownSize === null ? relationshipBase64ByteLength(base64) : knownSize;
}

function relationshipFileTooLarge(file, base64, maxBytes) {
  return relationshipFileByteSize(file, base64) > maxBytes;
}

module.exports = {
  relationshipKnownFileSize,
  relationshipBase64ByteLength,
  relationshipFileByteSize,
  relationshipFileTooLarge,
};
