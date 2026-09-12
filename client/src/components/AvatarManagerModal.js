import React, { useEffect, useRef } from 'react';
import { Modal, Button, Input, Tag, Spin, Empty, Tooltip, Image, message } from 'antd';
import {
  UserOutlined,
  CloudDownloadOutlined,
  UploadOutlined,
  DeleteOutlined,
  UndoOutlined,
  EyeOutlined,
  PictureOutlined,
  ScissorOutlined,
} from '@ant-design/icons';
import { contactApi, avatarUrl } from '../api/crmApi';
import AvatarCropper from './AvatarCropper';

// 历史头像的时间：SQLite 的 CURRENT_TIMESTAMP 存的是 UTC 的 "YYYY-MM-DD HH:MM:SS"
function formatAvatarTime(value) {
  if (!value) return '';
  const raw = String(value);
  const iso = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 历史头像的来源描述
function avatarSourceText(item) {
  if (item.source === 'immich') return 'Immich 来源';
  if (item.original_file_name) {
    return item.original_file_name === item.file_name ? '本地上传 · 未裁剪' : '本地上传 · 已裁剪';
  }
  return '本地上传';
}

/**
 * 头像管理弹窗（独立组件）。
 *
 * 两个入口共用同一份实现：
 *   - 编辑联系人表单里点头像；
 *   - 列表 / 卡片上右键头像 →「管理头像」直接进入，无需先打开编辑表单。
 *
 * 弹窗内的所有改动只落在本地草稿上，点「保存」才真正写库；
 * 直接关闭（或点取消）则全部丢弃，不会在数据库里留下半成品。
 */
export default function AvatarManagerModal({
  open,
  contactId,
  initialFaceUuid = '',
  onClose,
  onSaved,
  onFaceUuidChange,
}) {
  // avatarState：服务端当前的当前头像（弹窗打开时初始化，保存后刷新）
  const [avatarState, setAvatarState] = React.useState({ hash: '', url: '' });
  const [avatarHistory, setAvatarHistory] = React.useState([]);
  const [avatarLoading, setAvatarLoading] = React.useState(false);
  const [avatarSaving, setAvatarSaving] = React.useState(false);
  // draft：待生效的新当前头像
  //   { kind: 'history'|'upload'|'immich', hash?, uuid?, blob?, original?, preview }
  const [draft, setDraft] = React.useState(null);
  // pendingDeletes：待删除的历史头像哈希（保存时统一真删）
  const [pendingDeletes, setPendingDeletes] = React.useState([]);
  const [uuidDraft, setUuidDraft] = React.useState('');
  const [uuidPreviewLoading, setUuidPreviewLoading] = React.useState(false);
  const [cropper, setCropper] = React.useState({ open: false, file: null });
  // recropHash：正在取回原图准备重新裁剪的那条历史（用于禁用按钮）
  const [recropHash, setRecropHash] = React.useState('');
  // bigPreviewUrl：共享的「查看大图 / 查看原图」预览源（弹窗复用同一个 antd Image 预览层）
  const [bigPreviewUrl, setBigPreviewUrl] = React.useState('');
  const fileInputRef = useRef(null);
  // 草稿中用到的 objectURL，关闭 / 保存时统一释放，避免内存泄漏
  const draftUrlsRef = useRef([]);

  // 释放草稿里临时生成的预览地址
  const releaseDraftUrls = () => {
    draftUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    draftUrlsRef.current = [];
  };
  const trackDraftUrl = (url) => {
    if (url) draftUrlsRef.current.push(url);
    return url;
  };

  // 拉取该联系人的历史头像（含当前头像）
  const loadAvatarHistory = React.useCallback(async () => {
    if (!contactId) {
      setAvatarHistory([]);
      setAvatarState({ hash: '', url: '' });
      return;
    }
    setAvatarLoading(true);
    try {
      const res = await contactApi.getAvatars(contactId);
      const list = res.data?.avatars || [];
      setAvatarHistory(list);
      const current = list.find((a) => a.is_current);
      setAvatarState(current ? { hash: current.hash, url: current.url } : { hash: '', url: '' });
    } catch (err) {
      console.error('加载历史头像失败:', err);
      message.error('加载历史头像失败');
    } finally {
      setAvatarLoading(false);
    }
  }, [contactId]);

  // 每次打开都重新拉一次：既拿到服务端最新状态，也丢弃上一次残留的草稿
  useEffect(() => {
    if (!open) return;
    setUuidDraft(initialFaceUuid || '');
    setCropper({ open: false, file: null });
    setDraft(null);
    setPendingDeletes([]);
    releaseDraftUrls();
    loadAvatarHistory();
    // 仅在「打开」时重置，不跟随 initialFaceUuid / 回调变化重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contactId]);

  // 卸载时释放草稿中临时生成的预览地址
  useEffect(() => () => {
    draftUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    draftUrlsRef.current = [];
  }, []);

  const resetAvatarDraft = () => {
    setDraft(null);
    setPendingDeletes([]);
    releaseDraftUrls();
  };

  // 是否已有未保存的头像改动（新当前头像 或 待删除项）。
  // 若草稿只是「选择了当前本身就是的那张历史头像」（与加载时无差异），不算改动。
  const avatarDirty =
    (draft && !(draft.kind === 'history' && avatarState.hash && draft.hash === avatarState.hash)) ||
    pendingDeletes.length > 0;

  // 真正关闭弹窗：清空草稿并释放临时地址
  const doClose = () => {
    setCropper({ open: false, file: null });
    setDraft(null);
    setPendingDeletes([]);
    releaseDraftUrls();
    onClose?.();
  };

  const handleCancel = () => {
    if (!avatarDirty) {
      doClose();
      return;
    }
    Modal.confirm({
      title: '有未保存的头像改动',
      content: '关闭后这些改动会被丢弃，确定继续吗？',
      okText: '丢弃并关闭',
      okButtonProps: { danger: true },
      cancelText: '继续编辑',
      onOk: doClose,
    });
  };

  // 把历史中的某一张选为新的当前头像（只改草稿，不落库）
  const pickHistoryAvatar = (item) => {
    // 选回当前正在使用的头像时，本质等于没改当前头像：直接清掉草稿，
    // 避免顶部残留「新头像待保存 · 来源：历史头像」与黄色边框。
    // 历史头像的删除标记（pendingDeletes）与此无关，保持不动。
    if (item.hash === avatarState.hash) {
      releaseDraftUrls();
      setDraft(null);
      return;
    }
    releaseDraftUrls();
    setDraft({ kind: 'history', hash: item.hash, preview: avatarUrl(item.url) });
  };

  // 选择本地图片 → 先进裁剪器，确认后也只留在草稿里
  const handleFilePicked = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // 允许连续选择同一个文件
    if (!file) return;
    if (!contactId) {
      message.warning('请先保存联系人，再上传头像');
      return;
    }
    if (!file.type.startsWith('image/')) {
      message.warning('请选择图片文件');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      message.warning('图片体积不能超过 20MB');
      return;
    }
    setCropper({ open: true, file });
  };

  // 裁剪确认：方图与原始文件都留在内存，点「保存」时一起上传
  const handleCropConfirm = ({ blob, previewUrl }) => {
    const originalFile = cropper.file;
    setCropper({ open: false, file: null });
    releaseDraftUrls();
    trackDraftUrl(previewUrl);
    setDraft({ kind: 'upload', blob, original: originalFile, preview: previewUrl });
  };

  // 跳过裁剪：原图直接当头像（仍按内容哈希落盘、全库去重）。
  // 同时把这条头像登记为「原图即头像」，之后仍能在历史里重新裁剪，
  // 且不必把同一份字节传两遍（后端按 original_is_file 标记复用）。
  const handleSkipCrop = () => {
    const originalFile = cropper.file;
    if (!originalFile) return;
    setCropper({ open: false, file: null });
    releaseDraftUrls();
    const preview = trackDraftUrl(URL.createObjectURL(originalFile));
    setDraft({ kind: 'upload', blob: originalFile, original: null, originalIsFile: true, preview });
  };

  // 从 Immich 抓取：只按 UUID 取一张用于预览，点「保存」时才会真正落库
  const handleFetchAvatar = async () => {
    const uuid = (uuidDraft || '').trim();
    if (!uuid) {
      message.warning('请先填写 Immich 人脸 UUID');
      return;
    }

    setUuidPreviewLoading(true);
    try {
      const res = await contactApi.previewImmichFace(uuid);
      releaseDraftUrls();
      const preview = trackDraftUrl(URL.createObjectURL(res.data));
      setDraft({ kind: 'immich', uuid, preview });
      if (!contactId) {
        // 新建联系人尚无 id：只预览，并把 UUID 回写给上层表单，保存联系人时后端会自动抓取
        onFaceUuidChange?.(uuid);
        message.info('已预览该 UUID 的头像，保存联系人后会自动抓取到本地');
      } else {
        message.info('已按该 UUID 预览头像，点「保存」后生效');
      }
    } catch (err) {
      message.error('从 Immich 获取失败，请确认 UUID 是否正确');
    } finally {
      setUuidPreviewLoading(false);
    }
  };

  // 历史头像的删除也走草稿：先打标记，点「保存」时才真正删除
  const togglePendingDelete = (hash) => {
    setPendingDeletes((prev) => (prev.includes(hash) ? prev.filter((h) => h !== hash) : [...prev, hash]));
  };

  // 重新裁剪：取回这条历史头像存档的原图，重新进裁剪器取景。
  // 结果作为一张新头像走同样的「保存」流程；原图内容哈希不变，不会重复占盘。
  const handleRecrop = async (item) => {
    if (!item?.original_file_name || recropHash) return;
    setRecropHash(item.hash);
    try {
      const res = await contactApi.getAvatarBlob(item.original_file_name);
      const blob = res.data;
      const file = new File([blob], item.original_file_name, { type: blob.type || 'image/jpeg' });
      setCropper({ open: true, file });
    } catch (err) {
      console.error('取回原图失败:', err);
      message.error('取回原图失败，无法重新裁剪');
    } finally {
      setRecropHash('');
    }
  };

  // 重新裁剪「刚上传、尚未保存」的草稿：用原图（或未裁剪时的原文件）重新取景。
  // 结果仍只落在草稿里，点「保存」才真正生效。
  const handleRecropDraft = () => {
    if (draft?.kind !== 'upload' || avatarSaving) return;
    setCropper({ open: true, file: draft.original || draft.blob });
  };

  // 查看「刚上传、尚未保存」草稿的原图：
  // 裁剪路径打开剪裁前的原图；未裁剪路径原图即头像，直接走大图预览。
  const handleViewDraftOriginal = () => {
    if (draft?.kind !== 'upload') return;
    if (draft.original) {
      const url = trackDraftUrl(URL.createObjectURL(draft.original));
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      setBigPreviewUrl(draft.preview);
    }
  };

  // 保存头像改动：先把新头像设为当前，再删历史
  // （后端不允许删除正在使用的头像，顺序反了会被拒）
  const handleSave = async () => {
    if (!contactId) return;
    if (!avatarDirty) {
      doClose();
      return;
    }
    setAvatarSaving(true);
    try {
      if (draft?.kind === 'upload') {
        await contactApi.uploadAvatar(contactId, draft.blob, draft.original || undefined, draft.originalIsFile);
      } else if (draft?.kind === 'immich') {
        await contactApi.fetchAvatar(contactId, draft.uuid);
        // 后端会同步写回 face_uuid，这里回传给上层表单，避免「确定」时用旧值覆盖
        onFaceUuidChange?.(draft.uuid);
      } else if (draft?.kind === 'history') {
        await contactApi.setAvatar(contactId, draft.hash);
      }
      for (const hash of pendingDeletes) {
        await contactApi.deleteAvatar(contactId, hash);
      }
      message.success('头像已保存');
      // 先刷新自身数据再通知关闭，避免父级卸载本组件后仍在 setState
      await loadAvatarHistory();
      onSaved?.();
      setCropper({ open: false, file: null });
      setDraft(null);
      setPendingDeletes([]);
      releaseDraftUrls();
      onClose?.();
    } catch (err) {
      message.error(err.response?.data?.message || '保存头像失败');
    } finally {
      setAvatarSaving(false);
    }
  };

  return (
    <>
      <Modal
        title={(
          <div className="flex items-center gap-2">
            <span>头像管理</span>
            {avatarDirty && <Tag color="orange" className="mr-0">未保存</Tag>}
          </div>
        )}
        open={open}
        onCancel={handleCancel}
        width={680}
        maskClosable={false}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={handleCancel} disabled={avatarSaving}>
            取消
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={avatarSaving}
            disabled={!contactId}
            onClick={handleSave}
          >
            保存
          </Button>,
        ]}
      >
        <div className="pt-2 pb-2 space-y-5">
          {/* 当前头像与操作入口 */}
          <div className="flex items-center gap-5">
            <div
              className={`relative w-24 h-24 rounded-full overflow-hidden border-2 bg-gray-50 flex items-center justify-center shrink-0 ${
                draft ? 'border-amber-300' : 'border-gray-100'
              }`}
            >
              {draft?.preview || avatarState.url ? (
                <img
                  src={draft?.preview || avatarUrl(avatarState.url)}
                  alt="当前头像"
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserOutlined className="text-gray-300 text-4xl" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-500 mb-3">
                {draft ? (
                  <span className="text-amber-600">
                    新头像待保存 · 来源：
                    {draft.kind === 'upload' ? '本地上传' : draft.kind === 'immich' ? 'Immich' : '历史头像'}
                  </span>
                ) : avatarState.hash ? (
                  <>当前头像 <span className="font-mono text-xs text-gray-400">{avatarState.hash.slice(0, 12)}…</span></>
                ) : '尚未设置头像'}
                {!contactId && <span className="ml-2 text-amber-600">（联系人未保存，暂不能上传或写入头像）</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button icon={<CloudDownloadOutlined />} loading={uuidPreviewLoading} onClick={handleFetchAvatar}>
                  从 Immich 获取
                </Button>
                <Button
                  icon={<UploadOutlined />}
                  disabled={!contactId || avatarSaving}
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  上传本地图片
                </Button>
                {/* 刚上传、尚未保存的本地头像：提供重新裁剪与查看原图入口 */}
                {draft?.kind === 'upload' && (
                  <>
                    <Button
                      icon={<ScissorOutlined />}
                      disabled={avatarSaving}
                      onClick={handleRecropDraft}
                    >
                      重新裁剪
                    </Button>
                    <Button
                      icon={<EyeOutlined />}
                      disabled={avatarSaving}
                      onClick={handleViewDraftOriginal}
                    >
                      查看原图
                    </Button>
                  </>
                )}
                {avatarDirty && (
                  <Button type="text" icon={<UndoOutlined />} onClick={resetAvatarDraft} disabled={avatarSaving}>
                    撤销全部更改
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFilePicked}
                />
              </div>
            </div>
          </div>

          {/* Immich UUID */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-2 leading-relaxed">
              Immich 人脸 UUID 仅用于「右键头像 → 在 Immich 中浏览」跳转，与本地头像相互独立。
              「从 Immich 获取」只做预览，点右下角「保存」才会抓取并设为当前头像。
            </div>
            <Input
              placeholder="粘贴 Immich 人物页 URL 中的 UUID"
              value={uuidDraft}
              onChange={(e) => setUuidDraft(e.target.value)}
              allowClear
            />
          </div>

          {/* 历史头像 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-800">历史头像</span>
              <span className="text-xs text-gray-400">
                共 {avatarHistory.length} 张 · 相同图片全库只保存一份
                {pendingDeletes.length > 0 && (
                  <span className="text-red-500 ml-1">· {pendingDeletes.length} 张待删除</span>
                )}
              </span>
            </div>

            {!contactId ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="保存联系人后即可管理历史头像" />
            ) : avatarLoading ? (
              <div className="flex justify-center py-8"><Spin /></div>
            ) : avatarHistory.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史头像" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {avatarHistory.map((item) => {
                  const markedDelete = pendingDeletes.includes(item.hash);
                  // 有草稿时以草稿为准；草稿是上传/抓取时，历史里就不标「当前」了
                  const isCurrent = draft
                    ? draft.kind === 'history' && draft.hash === item.hash
                    : item.is_current;
                  return (
                    <div
                      key={item.hash}
                      className={`border rounded-lg p-1.5 ${
                        markedDelete
                          ? 'border-red-300 bg-red-50/60'
                          : isCurrent
                            ? 'border-blue-400 bg-blue-50/60'
                            : 'border-gray-200'
                      }`}
                    >
                      <div className="relative w-full aspect-square rounded-md overflow-hidden bg-gray-50 cursor-pointer" onClick={() => { if (!markedDelete && !isCurrent) pickHistoryAvatar(item); }}>
                        <img
                          src={avatarUrl(item.url)}
                          alt="历史头像"
                          draggable={false}
                          className="w-full h-full object-cover block"
                          style={{ opacity: markedDelete ? 0.45 : 1 }}
                          title={`${avatarSourceText(item)}${item.created_at ? ` · ${formatAvatarTime(item.created_at)}` : ''}${isCurrent ? ' · 当前头像' : ' · 点击设为当前头像'}`}
                        />
                        {isCurrent && !markedDelete && (
                          <span className="absolute top-1 left-1 text-[10px] leading-4 bg-blue-500 text-white px-1 rounded pointer-events-none">
                            当前
                          </span>
                        )}
                        {!markedDelete && (
                          <span className="absolute top-1 right-1 text-[10px] leading-4 bg-gray-700/70 text-white px-1 rounded pointer-events-none">
                            {item.source === 'immich' ? 'Immich' : '上传'}
                          </span>
                        )}
                        {markedDelete && (
                          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-red-600 pointer-events-none">
                            待删除
                          </span>
                        )}
                      </div>
                      {/* 右上角徽标已标明来源，这里仅保留时间 */}
                      <div className="mt-1 text-[10px] leading-4 text-gray-400">{formatAvatarTime(item.created_at)}</div>
                      <div className="flex flex-wrap items-center gap-0.5 mt-0.5">
                        <Tooltip title="查看大图（点击缩略图即可设为当前头像）">
                          <Button
                            size="small"
                            type="text"
                            icon={<EyeOutlined />}
                            disabled={markedDelete || avatarSaving}
                            onClick={() => setBigPreviewUrl(avatarUrl(item.url))}
                          />
                        </Tooltip>
                        {item.original_file_name ? (
                          // 上传的历史头像：保存后仍可查看原图 / 重新裁剪
                          <>
                            <Tooltip title="查看原图">
                              <Button
                                size="small"
                                type="text"
                                icon={<PictureOutlined />}
                                disabled={markedDelete || avatarSaving}
                                onClick={() => setBigPreviewUrl(avatarUrl(item.original_url))}
                              />
                            </Tooltip>
                            <Tooltip title="裁剪头像">
                              <Button
                                size="small"
                                type="text"
                                icon={<ScissorOutlined />}
                                loading={recropHash === item.hash}
                                disabled={markedDelete || avatarSaving || recropHash === item.hash}
                                onClick={() => handleRecrop(item)}
                              />
                            </Tooltip>
                          </>
                        ) : (
                          <span />
                        )}
                        <Tooltip
                          title={
                            isCurrent
                              ? '当前头像不能删除，请先切换到其它头像'
                              : markedDelete
                                ? '撤销删除'
                                : '标记为待删除（点「保存」后生效）'
                          }
                        >
                          <Button
                            size="small"
                            type="text"
                            danger={!markedDelete}
                            icon={markedDelete ? <UndoOutlined /> : <DeleteOutlined />}
                            disabled={isCurrent || avatarSaving}
                            onClick={() => togglePendingDelete(item.hash)}
                            className="ml-auto"
                          />
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {avatarDirty && (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded p-2">
              以上改动尚未生效，点右下角「保存」后才会写入；删除历史头像同样需要保存。
            </div>
          )}
        </div>

        {/* 共享的大图预览层：真正根治空白的关键是让承载预览的宿主元素不占任何布局空间。
            所以用 wrapperStyle 隐藏整个外层（.ant-image），而不是只隐藏内部 <img>——
            只隐藏 img 时外层仍占位，无论放哪里都会挤出空白。
            预览对话框本身经 portal 渲染到 body，不受宿主隐藏影响。 */}
        {bigPreviewUrl && (
          <Image
            src={bigPreviewUrl}
            alt="头像大图"
            wrapperStyle={{ display: 'none' }}
            preview={{
              visible: !!bigPreviewUrl,
              src: bigPreviewUrl,
              onVisibleChange: (v) => { if (!v) setBigPreviewUrl(''); },
            }}
          />
        )}
      </Modal>

      {/* 本地上传：先裁剪成正方形，原图另行存档 */}
      <AvatarCropper
        open={cropper.open}
        file={cropper.file}
        onCancel={() => setCropper({ open: false, file: null })}
        onConfirm={handleCropConfirm}
        onSkip={handleSkipCrop}
      />
    </>
  );
}
