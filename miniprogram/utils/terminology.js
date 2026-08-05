// terminology.js — 统一术语映射
// API 字段统一为英文：leverage / nurture / dual
// 显示标签统一为中文：经营型 / 陪伴型 / 双重

const NATURE_API = {
  leverage: 'leverage',
  nurture: 'nurture',
  dual: 'dual',
  // 兼容历史中文数据
  '撬动': 'leverage',
  '维系': 'nurture',
  '经营': 'leverage',
  '陪伴': 'nurture',
  '经营型': 'leverage',
  '陪伴型': 'nurture',
  '双重': 'dual',
  '双重关系': 'dual',
};

const NATURE_LABEL = {
  leverage: '经营型',
  nurture: '陪伴型',
  dual: '双重',
};

const NATURE_TAG_CLASS = {
  leverage: 'tag-leverage',
  nurture: 'tag-nurture',
  dual: 'tag-dual',
};

// 将任意 nature 值标准化为英文 API 值
function normalizeNature(nature) {
  if (!nature) return 'leverage';
  const key = String(nature).trim().toLowerCase();
  return NATURE_API[key] || NATURE_API[nature] || 'leverage';
}

// 获取显示标签
function natureLabel(nature) {
  return NATURE_LABEL[normalizeNature(nature)];
}

// 获取 tag CSS class
function natureTagClass(nature) {
  return NATURE_TAG_CLASS[normalizeNature(nature)];
}

module.exports = {
  normalizeNature,
  natureLabel,
  natureTagClass,
  NATURE_LABEL,
  NATURE_TAG_CLASS,
};
