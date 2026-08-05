import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  relationshipBase64ByteLength,
  relationshipFileByteSize,
  relationshipFileTooLarge,
} from '../../miniprogram/utils/relationship-file-logic.js';

const root = path.resolve(process.cwd(), '..');
const RELATIONSHIP_MAX_FILE_BYTES = 8 * 1024 * 1024;
const syncJs = fs.readFileSync(path.join(root, 'miniprogram/pages/sync/sync.js'), 'utf8');
const relationshipLogic = fs.readFileSync(path.join(root, 'miniprogram/utils/relationship-file-logic.js'), 'utf8');
const syncWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/sync/sync.wxml'), 'utf8');
const syncWxss = fs.readFileSync(path.join(root, 'miniprogram/pages/sync/sync.wxss'), 'utf8');
const apiJs = fs.readFileSync(path.join(root, 'miniprogram/utils/api.js'), 'utf8');

describe('小维对话关系资料导入静态契约', () => {
  it('使用新关系提取/确认接口，不调用旧文件上传接口', () => {
    expect(syncJs).toContain('/ai/relationship_extract');
    expect(syncJs).toContain('/ai/relationship_apply');
    expect(syncJs).toContain('proposal_id');
    expect(syncJs).toContain('idempotency_key');
    expect(syncJs).not.toContain('/data/upload_file');
  });

  it('覆盖图片、文件选择、base64读取和8MB前端限制', () => {
    expect(syncJs).toContain('wx.chooseMedia');
    expect(syncJs).toContain('wx.chooseMessageFile');
    expect(syncJs).toContain('wx.getFileSystemManager()');
    expect(syncJs).toContain("encoding: 'base64'");
    expect(syncJs).toContain('正在上传');
    expect(syncJs).toContain('正在解析');
    expect(syncJs).toContain('8 * 1024 * 1024');
    expect(syncJs).toContain('relationshipKnownFileSize');
    expect(syncJs).toContain('relationshipFileTooLarge');
    expect(relationshipLogic).toContain('relationshipBase64ByteLength');
    for (const extension of ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'vcf', 'vcard', 'txt']) {
      expect(syncJs).toContain(`'${extension}'`);
    }
  });

  it('图片先压缩再做大小检查和读取，并把尺寸布局传给后端', () => {
    expect(syncJs).toContain('wx.compressImage');
    expect(syncJs).toContain('compressedWidth: 2048');
    expect(syncJs).toMatch(/quality:\s*9[0-2]/);
    expect(syncJs).toContain('wx.getImageInfo');
    expect(syncJs).toContain('image_width');
    expect(syncJs).toContain('image_height');
    expect(syncJs).toContain('image_layout');
    for (const layout of ['landscape', 'portrait', 'square']) expect(syncJs).toContain(`'${layout}'`);

    const compressIndex = syncJs.indexOf('wx.compressImage');
    const sizeCheckIndex = syncJs.indexOf('relationshipFileTooLarge', compressIndex);
    const readIndex = syncJs.indexOf('wx.getFileSystemManager().readFile');
    expect(compressIndex).toBeGreaterThan(-1);
    expect(sizeCheckIndex).toBeGreaterThan(compressIndex);
    expect(readIndex).toBeGreaterThan(sizeCheckIndex);
  });

  it('预览展示安全来源元数据、confidence和图片视觉质量提示，不把base64放入data', () => {
    expect(syncJs).toContain('source.image_layout');
    expect(syncJs).toContain('RELATIONSHIP_IMAGE_CONFIDENCE_THRESHOLD');
    expect(syncJs).toContain('confidence');
    expect(syncJs).toContain('需核对/不会自动写入');
    expect(syncWxml).toContain('relationshipPreview.source.image_layout');
    expect(syncWxml).toContain('confidence');
    expect(syncWxml).toContain('qualityLabel');
    expect(syncWxml).toContain('图片识别结果仅供核对，模糊内容不会自动写入');
    expect(syncJs).not.toContain('relationshipPreview.base64');
    expect(syncJs).not.toContain('relationshipPreview.source.base64');
  });

  it('提供附件入口、关系资料预览、确认取消和防重复提交状态', () => {
    expect(syncWxml).toContain('catchtap="onAttachmentTap"');
    expect(syncWxml).toContain('>+</view>');
    expect(syncWxml).toContain('relationshipOverlay');
    expect(syncWxml).toContain('relationshipPreview.summary');
    expect(syncWxml).toContain('proposal_id');
    for (const field of ['operation', 'company', 'title', 'nature', 'evidence']) {
      expect(syncWxml).toContain(`contact.${field}`);
    }
    expect(syncJs).toContain('action_candidates');
    expect(syncJs).toContain('reminder_candidates');
    expect(syncJs).toContain('可在 Dashboard 查看下一步行动');
    expect(syncWxml).toContain('确认导入并更新');
    expect(syncWxml).toContain('取消');
    expect(syncWxml).toContain('loading="{{relationshipConfirming}}"');
    expect(syncWxml).toContain('disabled="{{relationshipConfirming}}"');
    expect(syncJs).toContain('cancelRelationshipImport');
    expect(syncJs).toContain('retryRelationshipImport');
    expect(syncJs).toContain('confirmRelationshipImport');
    expect(syncJs).toContain('relationshipRetryDescriptor');
    expect(syncJs).toContain("payload.file.base64 = ''");
    expect(syncWxml).toContain('重试解析');
    expect(syncWxml).toContain('重新选择文件');
    expect(syncWxml).toContain('relationshipRetryAvailable');
    expect(syncWxml).toContain('身份证');
    expect(syncWxml).toContain('银行卡');
  });

  it('apply失败保留同一 proposal 和幂等 key，并按后端重试元数据提示状态', () => {
    const applyStart = syncJs.indexOf('  confirmRelationshipImport()');
    const applyEnd = syncJs.indexOf('  _appendRelationshipApplyResult', applyStart);
    const applySource = syncJs.slice(applyStart, applyEnd);
    const catchSource = applySource.slice(applySource.indexOf('}).catch((error) =>'));

    expect(applySource).toContain('const proposalId = this.data.relationshipProposalId');
    expect(applySource).toContain('const applyKey = this._relationshipApplyKey');
    expect(applySource).toContain('proposal_id: proposalId');
    expect(applySource).toContain('idempotency_key: applyKey');
    expect(catchSource).toContain('relationshipOverlay: true');
    expect(catchSource).not.toContain('this._relationshipApplyKey = null');
    expect(catchSource).not.toContain("relationshipProposalId: ''");
    expect(catchSource).not.toContain('relationshipPreview: null');
    for (const field of ['retryable', 'partial_success', 'retryable_scope', 'event_id']) {
      expect(syncJs).toContain(field);
    }
    expect(syncJs).toContain('relationshipApplyRetryable: retryable');
    expect(syncJs).toContain('relationshipApplyPartialSuccess: !!details.partialSuccess');
    expect(syncJs).toContain('relationshipApplyRetryableScope');
    expect(syncJs).toContain('relationshipApplyEventId');
    expect(syncJs).toContain('网络或服务暂时不可用');
    expect(syncJs).toContain('部分关系资料已保存');
    expect(syncJs).toContain('已保存的数据不会重复导入');
    expect(syncWxml).toContain('重试确认导入');
    expect(syncWxml).toContain('不会批量导入原始聊天记录或复述私密对话，只提取确认后的关系事实');
    expect(apiJs).toContain('Object.assign(requestError, responseData)');
    expect(apiJs).toContain('requestError.response = res');
  });

  it('取消 apply 失败预览时清理本地 proposal 和幂等 key', () => {
    const cancelStart = syncJs.indexOf('  cancelRelationshipImport()');
    const cancelEnd = syncJs.indexOf('  confirmRelationshipImport()', cancelStart);
    const cancelSource = syncJs.slice(cancelStart, cancelEnd);
    expect(cancelSource).toContain('this._relationshipApplyKey = null');
    expect(cancelSource).toContain('relationshipPreview: null');
    expect(cancelSource).toContain("relationshipProposalId: ''");
  });

  it('action候选和导入结果展示会议来源标记', () => {
    expect(syncJs).toContain('来自会议');
    expect(syncJs).toContain("item.source && item.source.kind === 'meeting'");
    expect(syncJs).toContain("value.source && value.source.kind === 'meeting'");
  });

  it('预览区域可滚动且使用安全区和冒泡隔离', () => {
    expect(syncWxml).toContain('class="relationship-overlay"');
    expect(syncWxml).toContain('class="relationship-preview-scroll"');
    expect(syncWxml).toContain('catchtap="noop"');
    expect(syncWxss).toContain('env(safe-area-inset-bottom)');
    expect(syncWxss).toContain('.relationship-overlay');
    expect(syncWxss).toContain('.relationship-preview-scroll');
    expect(syncWxss).toContain('.relationship-apply-feedback');
  });
});

describe('关系资料文件大小纯逻辑', () => {
  it('按 base64 解码字节数扣除 padding，不把编码长度当文件大小', () => {
    expect(relationshipBase64ByteLength('TQ==')).toBe(1);
    expect(relationshipBase64ByteLength('TWE=')).toBe(2);
    expect(relationshipBase64ByteLength('TWFu')).toBe(3);
    expect(relationshipBase64ByteLength('data:text/plain;base64, T W E =')).toBe(2);
  });

  it('descriptor.size 可用时使用 descriptor，并与后端严格一致地拒绝 > 8MB', () => {
    const exact = { size: RELATIONSHIP_MAX_FILE_BYTES };
    expect(relationshipFileByteSize(exact, 'TWFu')).toBe(RELATIONSHIP_MAX_FILE_BYTES);
    expect(relationshipFileTooLarge(exact, '', RELATIONSHIP_MAX_FILE_BYTES)).toBe(false);
    expect(relationshipFileTooLarge({ size: RELATIONSHIP_MAX_FILE_BYTES + 1 }, '', RELATIONSHIP_MAX_FILE_BYTES)).toBe(true);
  });

  it('descriptor.size 不可用时按 base64 解码字节数判断 8MB 边界', () => {
    const exactBase64 = Buffer.alloc(RELATIONSHIP_MAX_FILE_BYTES).toString('base64');
    const oversizedBase64 = Buffer.alloc(RELATIONSHIP_MAX_FILE_BYTES + 1).toString('base64');
    expect(relationshipFileByteSize({ size: null }, exactBase64)).toBe(RELATIONSHIP_MAX_FILE_BYTES);
    expect(relationshipFileTooLarge({ size: null }, exactBase64, RELATIONSHIP_MAX_FILE_BYTES)).toBe(false);
    expect(relationshipFileTooLarge({ size: undefined }, oversizedBase64, RELATIONSHIP_MAX_FILE_BYTES)).toBe(true);
  });
});
