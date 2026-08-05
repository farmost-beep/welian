// pages/sync/sync.js — 通用页面渲染器
const api = require('../../utils/api.js');
const app = getApp();
const {
  relationshipKnownFileSize,
  relationshipFileTooLarge,
} = require('../../utils/relationship-file-logic.js');

const RELATIONSHIP_MAX_FILE_BYTES = 8 * 1024 * 1024;
const RELATIONSHIP_IMAGE_CONFIDENCE_THRESHOLD = 0.75;
const RELATIONSHIP_FILE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'vcf', 'vcard', 'txt'];
const RELATIONSHIP_MEDIA_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  vcf: 'text/vcard',
  vcard: 'text/vcard',
  txt: 'text/plain',
};
const RELATIONSHIP_COUNT_LABELS = [
  { key: 'contacts', label: '联系人' },
  { key: 'interactions', label: '互动' },
  { key: 'memories', label: '记忆' },
  { key: 'important_dates', label: '重要日期' },
  { key: 'todos', label: '待办' },
  { key: 'goals', label: '目标' },
  { key: 'meetings', label: '会议' },
  { key: 'action_candidates', label: '下一步行动' },
  { key: 'warnings', label: 'warnings' },
];

function relationshipText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (Array.isArray(value)) return value.map(relationshipText).filter(Boolean).join('、');
  return '';
}

function relationshipClip(value, maxLength = 180) {
  const text = relationshipText(value);
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
}

function relationshipWarningText(value) {
  if (!value || typeof value !== 'object') return relationshipClip(value, 240);
  return relationshipClip(value.warning || value.message || value.reason || value.evidence, 240);
}

function relationshipExtension(filename) {
  const match = /\.([^.]+)$/.exec(String(filename || '').toLowerCase());
  return match ? match[1] : '';
}

function relationshipFileName(filePath) {
  const path = String(filePath || '').split('?')[0];
  const name = path.split('/').pop();
  return name || `relationship-${Date.now()}.jpg`;
}

function relationshipImageDimension(value) {
  const dimension = Number(value);
  return Number.isFinite(dimension) && dimension > 0 ? Math.round(dimension) : null;
}

function relationshipImageLayoutValue(value) {
  const layout = String(value || '').toLowerCase();
  return ['landscape', 'portrait', 'square'].includes(layout) ? layout : '';
}

function relationshipImageLayout(width, height) {
  if (!width || !height) return '';
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

function relationshipFileImageMetadata(file) {
  const width = relationshipImageDimension(file && (file.width || file.image_width || file.imageWidth));
  const height = relationshipImageDimension(file && (file.height || file.image_height || file.imageHeight));
  return {
    width,
    height,
    layout: relationshipImageLayoutValue(file && (file.layout || file.image_layout)) || relationshipImageLayout(width, height),
  };
}

function relationshipFileDescriptor(file, isImage) {
  const filePath = file && (file.path || file.tempFilePath || '');
  const filename = (file && file.name) || relationshipFileName(filePath);
  const extension = relationshipExtension(filename);
  const mediaType = RELATIONSHIP_MEDIA_TYPES[extension] || (isImage ? 'image/jpeg' : '');
  const image = isImage === true || mediaType.startsWith('image/');
  return {
    path: filePath,
    filename,
    media_type: mediaType,
    is_image: image,
    size: relationshipKnownFileSize(file),
    ...relationshipFileImageMetadata(file),
  };
}

function relationshipRetryDescriptor(file) {
  const metadata = relationshipFileImageMetadata(file);
  return {
    path: String(file && file.path || ''),
    filename: String(file && file.filename || ''),
    media_type: String(file && file.media_type || ''),
    is_image: file ? file.is_image === true : false,
    size: relationshipKnownFileSize(file),
    width: metadata.width,
    height: metadata.height,
    layout: metadata.layout,
  };
}

function relationshipMeta(parts) {
  return parts.map(relationshipText).filter(Boolean).join(' · ');
}

function relationshipEvidence(item) {
  return relationshipClip(item && item.evidence, 180);
}

function relationshipList(value) {
  return Array.isArray(value) ? value : [];
}

function relationshipCount(counts, key, fallback) {
  const value = counts && Number(counts[key]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function relationshipConfidenceLabel(value) {
  const confidence = Number(value);
  const normalized = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  return `${Math.round(normalized * 100)}%`;
}

function relationshipPreviewQuality(item, source) {
  const confidence = Number(item && item.confidence);
  const normalized = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  const isImage = source && source.kind === 'image';
  const needsReview = isImage && (
    normalized < RELATIONSHIP_IMAGE_CONFIDENCE_THRESHOLD
    || !relationshipEvidence(item)
    || item.operation === 'skip'
    || item.visual_quality === 'skip'
  );
  return {
    confidence: relationshipConfidenceLabel(normalized),
    qualityLabel: needsReview ? '需核对/不会自动写入' : '',
  };
}

function relationshipPreviewSource(value) {
  if (!value || typeof value !== 'object') return null;
  const kind = relationshipText(value.kind);
  if (!['image', 'excel', 'text', 'document'].includes(kind)) return null;
  return {
    kind,
    filename: relationshipClip(value.filename, 180),
    image_layout: kind === 'image' ? relationshipImageLayoutValue(value.image_layout) : '',
    image_width: kind === 'image' ? relationshipImageDimension(value.image_width) : null,
    image_height: kind === 'image' ? relationshipImageDimension(value.image_height) : null,
  };
}

function relationshipOperationLabel(operation) {
  if (operation === 'create') return '新增';
  if (operation === 'update') return '更新';
  return '跳过';
}

function relationshipNatureLabel(nature) {
  if (nature === 'leverage' || nature === '经营' || nature === '经营型') return '经营型';
  if (nature === 'nurture' || nature === '陪伴' || nature === '陪伴型') return '陪伴型';
  if (nature === 'dual' || nature === '双重') return '双重';
  return relationshipText(nature);
}

function buildRelationshipPreview(response) {
  const proposal = response && response.proposal ? response.proposal : {};
  const source = relationshipPreviewSource(proposal.source);
  const countItems = RELATIONSHIP_COUNT_LABELS.map(item => ({
    label: item.label,
    value: relationshipCount(response && response.counts, item.key, relationshipList(proposal[item.key]).length),
  }));
  const quality = item => relationshipPreviewQuality(item, source);
  return {
    summary: relationshipClip(proposal.summary, 600) || '资料中未提供摘要',
    source,
    sourceImageLayout: source && source.image_layout,
    countItems,
    contacts: relationshipList(proposal.contacts).map(item => ({
      ...quality(item),
      operation: item.operation || 'skip',
      operationLabel: relationshipOperationLabel(item.operation),
      name: relationshipClip(item.name, 80) || '未命名联系人',
      company: relationshipClip(item.company, 120),
      title: relationshipClip(item.title, 120),
      nature: relationshipNatureLabel(item.nature),
      evidence: relationshipEvidence(item),
    })),
    interactions: relationshipList(proposal.interactions).map(item => ({
      ...quality(item),
      summary: relationshipClip(item.summary || item.pending || item.key_points),
      meta: relationshipMeta([item.contact_name, item.date]),
      evidence: relationshipEvidence(item),
    })),
    memories: relationshipList(proposal.memories).map(item => ({
      ...quality(item),
      summary: relationshipClip(item.content),
      meta: relationshipMeta([item.contact_name, item.type]),
      evidence: relationshipEvidence(item),
    })),
    importantDates: relationshipList(proposal.important_dates).map(item => ({
      ...quality(item),
      summary: relationshipClip(item.label || item.date),
      meta: relationshipMeta([item.contact_name, item.date]),
      evidence: relationshipEvidence(item),
    })),
    todos: relationshipList(proposal.todos).map(item => ({
      ...quality(item),
      summary: relationshipClip(item.task),
      meta: relationshipMeta([item.contact_name, item.due, item.priority]),
      evidence: relationshipEvidence(item),
    })),
    goals: relationshipList(proposal.goals).map(item => ({
      ...quality(item),
      summary: relationshipClip(item.title),
      meta: relationshipMeta([item.contact_name, item.criteria]),
      evidence: relationshipEvidence(item),
    })),
    meetings: relationshipList(proposal.meetings).map(item => ({
      ...quality(item),
      summary: relationshipClip(item.title || item.purpose),
      meta: relationshipMeta([item.date, item.location, item.purpose]),
      evidence: relationshipEvidence(item),
    })),
    actionCandidates: relationshipList(proposal.action_candidates).map(item => ({
      ...quality(item),
      summary: relationshipClip(item.suggested_topic || item.reason),
      meta: relationshipMeta([item.contact_name, item.type, item.source && item.source.kind === 'meeting' ? '来自会议' : '']),
      reason: relationshipClip(item.reason),
      evidence: relationshipEvidence(item),
    })),
    warnings: relationshipList(proposal.warnings).map(item => ({ summary: relationshipWarningText(item) })).filter(item => item.summary),
  };
}

function relationshipApplyHasPartialSuccess(value) {
  return value === true || value === 'true' || value === 'timeline_persisted' || value === 'todo_data_written';
}

function relationshipApplyErrorDetails(error) {
  const responseData = error && error.response && error.response.data;
  const source = responseData && typeof responseData === 'object' ? responseData : (error || {});
  const partialSuccess = source.partial_success !== undefined ? source.partial_success : error && error.partial_success;
  return {
    message: relationshipText(source.error || source.message) || relationshipText(error && error.message),
    retryable: source.retryable !== undefined ? source.retryable : error && error.retryable,
    partialSuccess: relationshipApplyHasPartialSuccess(partialSuccess),
    retryableScope: relationshipText(source.retryable_scope || (error && error.retryable_scope)),
    eventId: relationshipText(source.event_id || (error && error.event_id)),
  };
}

function relationshipApplyFailureMessage(details) {
  const base = details.message || '关系资料导入失败';
  if (details.partialSuccess) {
    return `${base} 部分关系资料已保存，请检查已保存内容后重试；已保存的数据不会重复导入。`;
  }
  if (details.retryable !== false) {
    return `${base} 网络或服务暂时不可用，请保持当前预览并重试确认导入。`;
  }
  return base;
}

function relationshipResultItem(value) {
  if (!value || typeof value !== 'object') return { summary: relationshipWarningText(value), meta: '', evidence: '' };
  const contact = value.contact && value.contact.name;
  const meetingSource = value.source && value.source.kind === 'meeting' ? '来自会议' : '';
  return {
    summary: relationshipClip(value.suggested_topic || value.task || value.reason || value.description || value.summary || value.message, 180),
    meta: relationshipMeta([contact || value.contact_name, value.due, value.type, meetingSource]),
    evidence: relationshipClip(value.source && value.source.evidence, 180),
  };
}

function buildRelationshipApplyResult(response) {
  const data = response || {};
  const stats = data.stats || {};
  const statLabels = [
    ['contacts_created', '新增联系人'],
    ['contacts_updated', '更新联系人'],
    ['interactions_created', '新增互动'],
    ['memories_added', '新增记忆'],
    ['dates_added', '新增日期'],
    ['todos_created', '新增待办'],
    ['goals_created', '新增目标'],
    ['meetings_created', '新增会议'],
    ['actions_created', '行动候选'],
  ];
  return {
    statItems: statLabels.map(([key, label]) => ({ label, value: Number(stats[key]) || 0 })),
    skipped: relationshipList(data.skipped).map(relationshipResultItem).filter(item => item.summary),
    warnings: relationshipList(data.warnings).map(item => ({ summary: relationshipWarningText(item) })).filter(item => item.summary),
    actionCandidates: relationshipList(data.action_candidates).map(relationshipResultItem).filter(item => item.summary),
    reminderCandidates: relationshipList(data.reminder_candidates).map(relationshipResultItem).filter(item => item.summary),
  };
}

function relationshipResultText(items, emptyText) {
  if (!items.length) return emptyText;
  const visible = items.slice(0, 12).map(item => [item.summary, item.meta].filter(Boolean).join(' · '));
  if (items.length > visible.length) visible.push(`还有 ${items.length - visible.length} 条`);
  return visible.join('\n');
}

Page({
  data: {
    components: [],
    inputValue: '',
    connected: false,
    scrollToId: '',
    relationshipImporting: false,
    relationshipImportStatus: '',
    relationshipImportError: '',
    relationshipRetryAvailable: false,
    relationshipApplyRetryable: false,
    relationshipApplyPartialSuccess: false,
    relationshipApplyRetryableScope: '',
    relationshipApplyEventId: '',
    relationshipOverlay: false,
    relationshipPreview: null,
    relationshipProposalId: '',
    relationshipConfirming: false,
  },

  socket: null,
  _unloaded: false,
  _reconnectTimer: null,
  _reconnectAttempts: 0,
  _inputValue: '',
  _scrollSeq: 0,

  _scrollTo(id, baseComponents) {
    this._scrollSeq++;
    const anchorId = `anchor_${this._scrollSeq}`;
    // 先插入锚点并渲染
    const source = baseComponents || this.data.components;
    const components = source.filter(c => !c.id?.startsWith('anchor_'));
    components.push({ id: anchorId, type: 'anchor' });
    this.setData({ components }, () => {
      // DOM 渲染完成后再触发滚动
      this.setData({ scrollToId: anchorId });
    });
  },

  async onLoad(options) {
    if (!api.getToken()) {
      try { await app.loginReady; } catch (e) { return; }
    }
    this._unloaded = false;
    this._draftContact = options && options.draft ? decodeURIComponent(options.draft) : '';
    this.connect();
  },

  onUnload() {
    this._unloaded = true;
    if (this._relationshipStatusTimer) { clearTimeout(this._relationshipStatusTimer); this._relationshipStatusTimer = null; }
    this._relationshipRetryFile = null;
    this._relationshipApplyKey = null;
    this._cleanup();
  },

  onHide() {
    // 保持连接，不清理
  },

  onShow() {
    if (!api.getToken()) return;
    if (!this._unloaded && !this.socket && !this.data.connected && !this._reconnectTimer) {
      this.connect();
    }
  },

  _cleanup() {
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
  },

  connect() {
    const token = api.getToken();
    if (!token) {
      this.setData({ connected: false });
      return;
    }

    this.setData({ connected: false });
    const wsUrl = api.getSyncUrl();
    if (!wsUrl) return;

    let opened = false;
    console.log('[sync] connecting to', wsUrl.substring(0, 60) + '...');

    // 修复：回调直接作为 connectSocket 参数传入，避免 onOpen 注册时连接已 open 导致回调丢失
    const socket = wx.connectSocket({
      url: wsUrl,
      success: () => { console.log('[sync] connectSocket success (pending open)'); },
      fail: (err) => { console.error('[sync] connectSocket FAIL:', err); },
      onOpen: () => {
        opened = true;
        this.socket = socket;
        this._reconnectAttempts = 0;
        this.setData({ connected: true });
        console.log('[sync] WebSocket connected');
        // 主动请求初始页面（兜底 stateless 模式下后端 pushRender 丢失）
        try {
          socket.send({ data: JSON.stringify({ action: 'init' }) });
        } catch (e) {
          console.warn('[sync] init send failed:', e.message);
        }
        // 一键拟消息：从 Dashboard 跳转来自动发起拟消息请求
        if (this._draftContact) {
          const msg = `帮我给${this._draftContact}写条消息`;
          setTimeout(() => {
            try { socket.send({ data: JSON.stringify({ action: 'input', value: msg }) }); } catch (e) {}
            this._draftContact = '';
          }, 800);
        }
      },
      onMessage: (res) => {
        this.handleMessage(res.data);
      },
      onError: (err) => {
        console.error('[sync] socket error:', JSON.stringify(err));
      },
      onClose: (result) => {
        this.socket = null;
        this.setData({ connected: false });
        console.log('[sync] closed, code:', result.code, 'reason:', result.reason, 'opened was:', opened);
        if (!opened) {
          console.error('[sync] NEVER connected — likely socket domain not configured or token invalid');
        }
        this._scheduleReconnect();
      },
    });

    // 兜底：如果 connectSocket 返回的 SocketTask 已 open（时序竞争），补注册回调
    if (socket && typeof socket.onOpen === 'function') {
      socket.onOpen(() => {
        if (!opened) {
          opened = true;
          this.socket = socket;
          this._reconnectAttempts = 0;
          this.setData({ connected: true });
          console.log('[sync] WebSocket connected (via SocketTask.onOpen)');
          try {
            socket.send({ data: JSON.stringify({ action: 'init' }) });
          } catch (e) {}
        }
      });
      socket.onMessage((res) => this.handleMessage(res.data));
      socket.onError((err) => console.error('[sync] socket error:', JSON.stringify(err)));
      socket.onClose((result) => {
        this.socket = null;
        this.setData({ connected: false });
        if (!this._reconnectTimer) this._scheduleReconnect();
      });
    }
  },

  _scheduleReconnect() {
    if (this._unloaded) return;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectAttempts++;
    const delay = Math.min(2000 * Math.pow(1.5, this._reconnectAttempts - 1), 30000);
    this._reconnectTimer = setTimeout(() => {
      if (this._unloaded) return;
      this.connect();
    }, delay);
  },

  handleMessage(data) {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    // 收到任何消息都说明连接已建立（兜底 stateless 模式下 onOpen 丢失的情况）
    if (!this.data.connected) {
      this.setData({ connected: true });
    }

    if (msg.type === 'render') {
      // 全量替换页面组件
      const components = msg.page?.components || [];
      this._inputValue = '';
      const last = components[components.length - 1];
      if (last) {
        this._scrollTo(last.id, components);
      } else {
        this.setData({ components, inputValue: '' });
      }
    } else if (msg.type === 'patch') {
      // 增量更新某个组件
      this.applyPatch(msg);
    } else if (msg.type === 'navigate') {
      if (msg.tab) {
        wx.switchTab({ url: msg.url });
      } else {
        wx.navigateTo({ url: msg.url });
      }
    } else if (msg.type === 'action' && msg.action?.setStorage) {
      wx.setStorageSync(msg.action.setStorage.key, msg.action.setStorage.value);
    } else if (msg.type === 'action' && msg.action?.pay) {
      this._handlePay(msg.action.pay);
    } else if (msg.type === 'action' && msg.action?.download) {
      this._handleDownload(msg.action.download);
    } else if (msg.type === 'toast') {
      wx.showToast({ title: msg.text || '', icon: 'none' });
    }
  },

  applyPatch(patch) {
    const components = this.data.components.slice();
    const idx = components.findIndex(c => c.id === patch.target);
    if (idx === -1) {
      // 目标组件不存在，创建新的
      if (patch.op === 'create') {
        components.push({ id: patch.target, type: 'text', content: patch.content || '' });
        this.setData({ components });
      }
      return;
    }

    if (patch.op === 'append') {
      components[idx] = {
        ...components[idx],
        content: (components[idx].content || '') + (patch.content || ''),
      };
      this._scrollTo(patch.target, components);
    } else if (patch.op === 'replace') {
      components[idx] = {
        ...components[idx],
        content: patch.content || '',
      };
      this._scrollTo(patch.target, components);
    } else if (patch.op === 'done') {
      // 流式输出完成，无操作
    } else if (patch.op === 'remove') {
      components.splice(idx, 1);
      this.setData({ components });
    }
  },

  onInput(e) {
    this._inputValue = e.detail.value;
    this.setData({ inputValue: e.detail.value });
  },

  onSend() {
    const value = this._inputValue;
    if (!value || !value.trim()) return;
    if (!this.socket) return;

    // 立即本地显示用户气泡，不等后端确认
    const components = this.data.components.filter(c => c.type !== 'input' && c.type !== 'buttons');
    const localId = `local_u_${Date.now()}`;
    components.push({ id: localId, type: 'text', role: 'user', content: value.trim() });
    this._inputValue = '';
    this._scrollTo(localId, components);
    this.setData({ inputValue: '' });

    this.socket.send({
      data: JSON.stringify({ action: 'input', value: value.trim() }),
    });
  },

  onTap(e) {
    if (!this.socket) return;
    const id = e.currentTarget.dataset.id;

    // 立即本地显示用户气泡
    const components = this.data.components.filter(c => c.type !== 'input' && c.type !== 'buttons');
    const localId = `local_u_${Date.now()}`;
    components.push({ id: localId, type: 'text', role: 'user', content: id });
    this._scrollTo(localId, components);

    this.socket.send({
      data: JSON.stringify({ action: 'tap', id }),
    });
  },

  noop() {},

  onAttachmentTap() {
    if (this.data.relationshipImporting || this.data.relationshipConfirming || this.data.relationshipOverlay) return;
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择', '选择文件'],
      success: (result) => {
        if (result.tapIndex === 0) this.chooseRelationshipImage(['camera']);
        else if (result.tapIndex === 1) this.chooseRelationshipImage(['album']);
        else if (result.tapIndex === 2) this.chooseRelationshipFile();
      },
    });
  },

  chooseRelationshipImage(sourceType) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType,
      sizeType: ['original'],
      camera: 'back',
      success: (result) => {
        const file = result.tempFiles && result.tempFiles[0];
        if (file) this._selectRelationshipFile(file, true);
      },
    });
  },

  chooseRelationshipFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: RELATIONSHIP_FILE_EXTENSIONS,
      success: (result) => {
        const file = result.tempFiles && result.tempFiles[0];
        if (file) this._selectRelationshipFile(file, false);
      },
    });
  },

  _selectRelationshipFile(file, isImage) {
    const descriptor = relationshipFileDescriptor(file, isImage);
    if (!descriptor.path || !descriptor.media_type) {
      this._relationshipRetryFile = null;
      this.setData({ relationshipRetryAvailable: false });
      wx.showToast({ title: '不支持的文件类型', icon: 'none' });
      return;
    }
    if (descriptor.is_image) {
      this._prepareRelationshipImage(descriptor);
      return;
    }
    this._startRelationshipFile(descriptor);
  },

  _prepareRelationshipImage(descriptor) {
    const finish = (prepared) => {
      const retryFile = relationshipRetryDescriptor(prepared);
      if (relationshipFileTooLarge(retryFile, '', RELATIONSHIP_MAX_FILE_BYTES)) {
        this._relationshipRetryFile = null;
        this.setData({ relationshipRetryAvailable: false, relationshipImportError: '文件不能超过8MB' });
        wx.showToast({ title: '文件不能超过8MB', icon: 'none' });
        return;
      }
      this._relationshipRetryFile = retryFile;
      this.setData({ relationshipRetryAvailable: true });
      this._readRelationshipFile(retryFile);
    };
    const enrich = (prepared) => this._getRelationshipImageInfo(prepared, finish);
    if (typeof wx.compressImage !== 'function') {
      enrich(descriptor);
      return;
    }
    wx.compressImage({
      src: descriptor.path,
      compressedWidth: 2048,
      quality: 92,
      success: (result) => {
        const compressedPath = result && (result.tempFilePath || result.path);
        const compressed = compressedPath ? relationshipFileDescriptor({
          path: compressedPath,
          tempFilePath: compressedPath,
          name: descriptor.filename,
          size: result.size,
          width: result.width,
          height: result.height,
        }, true) : descriptor;
        enrich(compressed);
      },
      fail: () => enrich(descriptor),
    });
  },

  _getRelationshipImageInfo(descriptor, done) {
    const current = {
      ...descriptor,
      layout: relationshipImageLayoutValue(descriptor.layout) || relationshipImageLayout(descriptor.width, descriptor.height),
    };
    if (current.width && current.height) {
      done(current);
      return;
    }
    if (typeof wx.getImageInfo !== 'function') {
      done(current);
      return;
    }
    wx.getImageInfo({
      src: current.path,
      success: (info) => {
        const width = relationshipImageDimension(info && info.width) || current.width;
        const height = relationshipImageDimension(info && info.height) || current.height;
        done({
          ...current,
          width,
          height,
          layout: relationshipImageLayout(current.width || width, current.height || height),
        });
      },
      fail: () => done(current),
    });
  },

  _startRelationshipFile(descriptor) {
    if (relationshipFileTooLarge(descriptor, '', RELATIONSHIP_MAX_FILE_BYTES)) {
      this._relationshipRetryFile = null;
      this.setData({ relationshipRetryAvailable: false, relationshipImportError: '文件不能超过8MB' });
      wx.showToast({ title: '文件不能超过8MB', icon: 'none' });
      return;
    }
    this._relationshipRetryFile = relationshipRetryDescriptor(descriptor);
    this.setData({ relationshipRetryAvailable: true });
    this._readRelationshipFile(this._relationshipRetryFile);
  },

  _readRelationshipFile(file) {
    const retryFile = relationshipRetryDescriptor(file);
    if (!retryFile.path || this.data.relationshipImporting || this.data.relationshipConfirming) return;
    this._relationshipRetryFile = retryFile;
    this._relationshipApplyKey = null;
    if (this._relationshipStatusTimer) clearTimeout(this._relationshipStatusTimer);
    this.setData({
      relationshipImporting: true,
      relationshipImportStatus: '正在读取文件…',
      relationshipImportError: '',
      relationshipRetryAvailable: true,
      relationshipApplyRetryable: false,
      relationshipApplyPartialSuccess: false,
      relationshipApplyRetryableScope: '',
      relationshipApplyEventId: '',
      relationshipOverlay: false,
      relationshipPreview: null,
      relationshipProposalId: '',
    });
    wx.getFileSystemManager().readFile({
      filePath: retryFile.path,
      encoding: 'base64',
      success: (result) => {
        const base64 = String(result.data || '');
        if (relationshipFileTooLarge(retryFile, base64, RELATIONSHIP_MAX_FILE_BYTES)) {
          this._relationshipRetryFile = null;
          this.setData({ relationshipImporting: false, relationshipImportStatus: '', relationshipImportError: '文件不能超过8MB', relationshipRetryAvailable: false });
          wx.showToast({ title: '文件不能超过8MB', icon: 'none' });
          return;
        }
        this.setData({ relationshipImportStatus: '正在上传…' });
        this._relationshipStatusTimer = setTimeout(() => {
          this._relationshipStatusTimer = null;
          if (this._unloaded) return;
          this.setData({ relationshipImportStatus: '正在解析…' });
          this._requestRelationshipExtract(retryFile, base64);
        }, 120);
      },
      fail: () => {
        this.setData({ relationshipImporting: false, relationshipImportStatus: '', relationshipImportError: '文件读取失败，请重试', relationshipRetryAvailable: true });
        wx.showToast({ title: '文件读取失败', icon: 'none' });
      },
    });
  },

  _requestRelationshipExtract(file, base64) {
    const payload = {
      file: {
        base64,
        filename: file.filename,
        media_type: file.media_type,
        is_image: file.is_image,
        image_width: file.is_image ? file.width : null,
        image_height: file.is_image ? file.height : null,
        image_layout: file.is_image ? file.layout : '',
      },
    };
    const clearPayload = () => {
      payload.file.base64 = '';
    };
    api.request('/ai/relationship_extract', payload, 'POST').then((response) => {
      if (this._unloaded) return;
      if (!response || !response.proposal_id || response.requires_confirmation !== true) {
        throw new Error('关系资料解析结果无效');
      }
      const preview = buildRelationshipPreview(response);
      this._relationshipRetryFile = relationshipRetryDescriptor(file);
      this._relationshipApplyKey = null;
      this.setData({
        relationshipImporting: false,
        relationshipImportStatus: '',
        relationshipImportError: '',
        relationshipRetryAvailable: true,
        relationshipApplyRetryable: false,
        relationshipApplyPartialSuccess: false,
        relationshipApplyRetryableScope: '',
        relationshipApplyEventId: '',
        relationshipOverlay: true,
        relationshipPreview: preview,
        relationshipProposalId: response.proposal_id,
      });
    }).catch((error) => {
      if (this._unloaded) return;
      this.setData({
        relationshipImporting: false,
        relationshipImportStatus: '',
        relationshipImportError: error.message || '解析失败，请重试',
        relationshipRetryAvailable: !!this._relationshipRetryFile,
      });
      wx.showToast({ title: error.message || '解析失败，请重试', icon: 'none', duration: 2500 });
    }).then(clearPayload, clearPayload);
  },

  retryRelationshipImport() {
    if (this.data.relationshipImporting || this.data.relationshipConfirming) return;
    if (this._relationshipRetryFile) {
      this._readRelationshipFile(this._relationshipRetryFile);
      return;
    }
    this.onAttachmentTap();
  },

  cancelRelationshipImport() {
    if (this.data.relationshipConfirming) return;
    this._relationshipRetryFile = null;
    this._relationshipApplyKey = null;
    this.setData({
      relationshipOverlay: false,
      relationshipPreview: null,
      relationshipProposalId: '',
      relationshipImportError: '',
      relationshipRetryAvailable: false,
      relationshipApplyRetryable: false,
      relationshipApplyPartialSuccess: false,
      relationshipApplyRetryableScope: '',
      relationshipApplyEventId: '',
    });
  },

  confirmRelationshipImport() {
    if (this.data.relationshipConfirming || !this.data.relationshipProposalId) return;
    if (!this._relationshipApplyKey) {
      this._relationshipApplyKey = `mp-rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const proposalId = this.data.relationshipProposalId;
    const applyKey = this._relationshipApplyKey;
    this.setData({ relationshipConfirming: true });
    api.request('/ai/relationship_apply', {
      proposal_id: proposalId,
      idempotency_key: applyKey,
    }, 'POST').then((response) => {
      if (!response || response.ok === false) {
        const applyError = new Error(response && response.error || '关系资料导入失败');
        if (response && typeof response === 'object') Object.assign(applyError, response);
        throw applyError;
      }
      const result = buildRelationshipApplyResult(response);
      this._relationshipRetryFile = null;
      this._relationshipApplyKey = null;
      this.setData({
        relationshipConfirming: false,
        relationshipOverlay: false,
        relationshipPreview: null,
        relationshipProposalId: '',
        relationshipImportError: '',
        relationshipRetryAvailable: false,
        relationshipApplyRetryable: false,
        relationshipApplyPartialSuccess: false,
        relationshipApplyRetryableScope: '',
        relationshipApplyEventId: '',
      });
      this._appendRelationshipApplyResult(result);
    }).catch((error) => {
      const details = relationshipApplyErrorDetails(error);
      const message = relationshipApplyFailureMessage(details);
      const retryable = details.retryable !== false;
      this.setData({
        relationshipConfirming: false,
        relationshipOverlay: true,
        relationshipImportError: message,
        relationshipRetryAvailable: retryable,
        relationshipApplyRetryable: retryable,
        relationshipApplyPartialSuccess: !!details.partialSuccess,
        relationshipApplyRetryableScope: details.retryableScope,
        relationshipApplyEventId: details.eventId,
      });
      wx.showToast({ title: message, icon: 'none', duration: 2500 });
    });
  },

  _appendRelationshipApplyResult(result) {
    const components = this.data.components.filter(c => c.type !== 'input' && c.type !== 'buttons');
    const localId = `local_a_relationship_${Date.now()}`;
    components.push({
      id: localId,
      type: 'card',
      role: 'assistant',
      avatar: '小维',
      name: '小维',
      title: '关系资料已确认导入',
      fields: result.statItems,
      items: [
        { label: '跳过', value: relationshipResultText(result.skipped, '无') },
        { label: '警告', value: relationshipResultText(result.warnings, '无') },
        { label: '下一步行动', value: relationshipResultText(result.actionCandidates, '无') },
        { label: '提醒候选', value: relationshipResultText(result.reminderCandidates, '无') },
        { label: '查看', value: '可在 Dashboard 查看下一步行动' },
      ],
    });
    this._scrollTo(localId, components);
  },

  _handleDownload(dl) {
    if (!dl || !dl.url) {
      console.error('[sync] download action received but no url', dl);
      return;
    }
    console.log('[sync] downloading PDF:', dl.url.substring(0, 80));
    wx.showLoading({ title: '下载中…' });
    wx.downloadFile({
      url: dl.url,
      success: (res) => {
        wx.hideLoading();
        console.log('[sync] download result:', res.statusCode, res.tempFilePath);
        if (res.statusCode === 200) {
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'pdf',
            showMenu: true,
            success: () => console.log('[sync] PDF opened'),
            fail: (e) => {
              console.error('[sync] openDocument failed:', e);
              wx.showToast({ title: '无法打开文件', icon: 'none' });
            },
          });
        } else {
          console.error('[sync] download failed, status:', res.statusCode);
          wx.showToast({ title: `下载失败(${res.statusCode})`, icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('[sync] downloadFile failed:', err);
        wx.showToast({ title: '下载失败: ' + (err.errMsg || ''), icon: 'none', duration: 3000 });
      },
    });
  },

  _handlePay(pay) {
    if (!pay || !pay.timeStamp) return;
    wx.requestPayment({
      timeStamp: pay.timeStamp,
      nonceStr: pay.nonceStr,
      package: pay.package,
      signType: pay.signType,
      paySign: pay.paySign,
      success: () => {
        if (this.socket) {
          this.socket.send({ data: JSON.stringify({ action: 'pay_result', status: 'success', orderId: pay.orderId }) });
        }
      },
      fail: (err) => {
        const cancelled = err.errMsg && err.errMsg.includes('cancel');
        if (this.socket) {
          this.socket.send({ data: JSON.stringify({ action: 'pay_result', status: cancelled ? 'cancelled' : 'failed', orderId: pay.orderId }) });
        }
      },
    });
  },

  reconnect() {
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    this._reconnectAttempts = 0;
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
    this.connect();
  },
});
