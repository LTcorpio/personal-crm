import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Button, Slider, Spin, message } from 'antd';
import { ScissorOutlined, UndoOutlined, FullscreenOutlined } from '@ant-design/icons';

// 取景框边长（CSS px）与导出方图边长（px）
const VIEW = 280;
const OUTPUT = 512;
// 右侧圆形预览的直径（CSS px）
const PREVIEW = 104;
// 相对「铺满取景框」的最大放大倍数
const MAX_ZOOM = 3;
const MIN_ZOOM = 1;
// 四角标记的臂长
const CORNER = 26;

// 计算几何：base 保证图片始终铺满取景框（cover），zoom 为用户额外放大倍数
function geometry(natW, natH, zoom) {
  const base = Math.max(VIEW / natW, VIEW / natH);
  const scale = base * zoom;
  return { scale, width: natW * scale, height: natH * scale };
}

// 把图片偏移限制在「始终铺满取景框」的范围内
function clampOffset(x, y, g) {
  return {
    x: Math.min(0, Math.max(VIEW - g.width, x)),
    y: Math.min(0, Math.max(VIEW - g.height, y)),
  };
}

function centerOffset(natW, natH, zoom) {
  const g = geometry(natW, natH, zoom);
  return clampOffset((VIEW - g.width) / 2, (VIEW - g.height) / 2, g);
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 头像裁剪器：正方形取景框 + 拖拽平移 + 缩放，导出 512×512 JPEG。
 * 原图不经任何处理，由调用方另行上传存档。
 */
export default function AvatarCropper({ open, file, onCancel, onConfirm, onSkip }) {
  const [img, setImg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  const dragRef = useRef(null);

  // 载入待裁剪图片（用 objectURL，避免大图读成 DataURL 占内存）
  useEffect(() => {
    if (!open || !file) {
      setImg(null);
      setFailed(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setImg(null);
    setZoom(MIN_ZOOM);

    const url = URL.createObjectURL(file);
    const el = new window.Image();
    el.onload = () => {
      if (cancelled) return;
      if (!el.naturalWidth || !el.naturalHeight) {
        setLoading(false);
        setFailed(true);
        return;
      }
      setImg({ el, url, natW: el.naturalWidth, natH: el.naturalHeight });
      setOffset(centerOffset(el.naturalWidth, el.naturalHeight, MIN_ZOOM));
      setLoading(false);
    };
    el.onerror = () => {
      if (cancelled) return;
      setLoading(false);
      setFailed(true);
    };
    el.src = url;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [open, file]);

  const geom = useMemo(
    () => (img ? geometry(img.natW, img.natH, zoom) : null),
    [img, zoom],
  );

  // 圆形预览相对取景框的缩放比（两者都是正方形，直接等比缩小）
  const previewScale = PREVIEW / VIEW;

  // 缩放时锚定取景框中心：中心对应的图片位置保持不动
  const applyZoom = useCallback((next) => {
    if (!img) return;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(2))));
    const before = geometry(img.natW, img.natH, zoom);
    const after = geometry(img.natW, img.natH, z);
    const imgX = (VIEW / 2 - offset.x) / before.scale;
    const imgY = (VIEW / 2 - offset.y) / before.scale;
    setZoom(z);
    setOffset(clampOffset(VIEW / 2 - imgX * after.scale, VIEW / 2 - imgY * after.scale, after));
  }, [img, zoom, offset]);

  // 滚轮缩放：React 的 onWheel 是被动监听，这里挂原生监听才能 preventDefault 阻止页面滚动
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !img) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      applyZoom(zoom + (e.deltaY < 0 ? 0.12 : -0.12));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom, img, zoom]);

  const handlePointerDown = (e) => {
    if (!img) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handlePointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId || !geom) return;
    // 用「起点绝对偏移 + 总位移」计算，避免高频事件累积误差
    setOffset(clampOffset(drag.ox + (e.clientX - drag.startX), drag.oy + (e.clientY - drag.startY), geom));
  };

  const handlePointerUp = (e) => {
    if (dragRef.current && dragRef.current.id === e.pointerId) {
      dragRef.current = null;
    }
  };

  const reset = () => {
    if (!img) return;
    setZoom(MIN_ZOOM);
    setOffset(centerOffset(img.natW, img.natH, MIN_ZOOM));
  };

  const handleConfirm = () => {
    if (!img || !geom) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext('2d');
      // JPEG 无透明通道，先铺白底，避免透明区域变黑
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const side = VIEW / geom.scale; // 取景框对应的图片像素边长
      ctx.drawImage(
        img.el,
        -offset.x / geom.scale,
        -offset.y / geom.scale,
        side,
        side,
        0,
        0,
        OUTPUT,
        OUTPUT,
      );

      canvas.toBlob((blob) => {
        setBusy(false);
        if (!blob) {
          message.error('裁剪失败，请重试或改用原图');
          return;
        }
        onConfirm({ blob, previewUrl: URL.createObjectURL(blob) });
      }, 'image/jpeg', 0.92);
    } catch (err) {
      console.error('裁剪失败:', err);
      setBusy(false);
      message.error('裁剪失败，请重试或改用原图');
    }
  };

  return (
    <Modal
      title="裁剪头像"
      open={open}
      onCancel={onCancel}
      // 内容横向为「取景框(280)+间距+圆形预览(104)=400px」，420 偏窄会让内容与
      // footer 按钮因折行而对不齐；加宽到 480 保证一次放下一行
      width={480}
      destroyOnHidden
      maskClosable={false}
      footer={(
        // 显式右对齐、不折行，确保三个按钮始终在同一行，避免「取消」被挤到下一行
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
          <Button onClick={onCancel}>取消</Button>
          <Button icon={<FullscreenOutlined />} onClick={onSkip} disabled={!file}>
            不裁剪，直接用原图
          </Button>
          <Button type="primary" icon={<ScissorOutlined />} loading={busy} disabled={!img} onClick={handleConfirm}>
            确认裁剪
          </Button>
        </div>
      )}
    >
      <div className="flex flex-col items-center gap-3 pt-1 pb-2">
        <div className="flex items-start gap-4">
          {/* 取景框：框内的整块方形区域都会被保留并导出（没有任何被压暗丢弃的部分） */}
          <div
            ref={boxRef}
            className="relative overflow-hidden rounded-lg bg-gray-100 border border-gray-200 select-none shrink-0"
            style={{ width: VIEW, height: VIEW, cursor: img ? 'move' : 'default', touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center"><Spin /></div>
            )}
            {img && (
              <img
                src={img.url}
                alt="待裁剪图片"
                draggable={false}
                style={{
                  position: 'absolute',
                  left: offset.x,
                  top: offset.y,
                  width: geom.width,
                  height: geom.height,
                  maxWidth: 'none',
                  maxHeight: 'none',
                  userSelect: 'none',
                }}
              />
            )}
            {/* 三分构图线 + 四角标记：只做取景辅助，不改变任何裁切范围 */}
            <svg
              className="pointer-events-none absolute inset-0"
              width={VIEW}
              height={VIEW}
              aria-hidden="true"
            >
              <g stroke="rgba(255,255,255,0.45)" strokeWidth="1">
                <line x1={VIEW / 3} y1="0" x2={VIEW / 3} y2={VIEW} />
                <line x1={(VIEW * 2) / 3} y1="0" x2={(VIEW * 2) / 3} y2={VIEW} />
                <line x1="0" y1={VIEW / 3} x2={VIEW} y2={VIEW / 3} />
                <line x1="0" y1={(VIEW * 2) / 3} x2={VIEW} y2={(VIEW * 2) / 3} />
              </g>
              <g fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="square">
                <path d={`M0 ${CORNER} L0 0 L${CORNER} 0`} />
                <path d={`M${VIEW - CORNER} 0 L${VIEW} 0 L${VIEW} ${CORNER}`} />
                <path d={`M${VIEW} ${VIEW - CORNER} L${VIEW} ${VIEW} L${VIEW - CORNER} ${VIEW}`} />
                <path d={`M${CORNER} ${VIEW} L0 ${VIEW} L0 ${VIEW - CORNER}`} />
              </g>
            </svg>
            {failed && (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-500">
                这张图片无法在浏览器中解码（可能是不支持的格式），请换一张或改用原图
              </div>
            )}
          </div>

          {/* 圆形预览：仅说明头像在页面上的展示形状，不代表会被裁掉圆外内容 */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <div
              className="relative overflow-hidden rounded-full bg-gray-100 border border-gray-200"
              style={{ width: PREVIEW, height: PREVIEW }}
            >
              {img ? (
                <img
                  src={img.url}
                  alt="头像展示效果预览"
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: offset.x * previewScale,
                    top: offset.y * previewScale,
                    width: geom.width * previewScale,
                    height: geom.height * previewScale,
                    maxWidth: 'none',
                    maxHeight: 'none',
                    userSelect: 'none',
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">—</div>
              )}
            </div>
            <span className="text-[11px] text-gray-400 text-center leading-tight">
              头像展示效果
              <br />
              （展示为圆形，图片内容完整保留）
            </span>
          </div>
        </div>

        <div className="w-full flex items-center gap-3">
          <span className="text-xs text-gray-500 shrink-0">缩放</span>
          <Slider
            className="flex-1"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={applyZoom}
            disabled={!img}
            tooltip={{ formatter: (v) => `${v.toFixed(1)}×` }}
          />
          <Button size="small" type="text" icon={<UndoOutlined />} onClick={reset} disabled={!img} title="复位" />
        </div>

        <div className="w-full text-xs text-gray-400 leading-relaxed">
          拖拽图片调整位置，滑块或滚轮缩放。
          <span className="text-gray-500">左边方框内的区域会完整保留</span>，导出为 {OUTPUT}×{OUTPUT} 方形 JPEG；
          右边的圆形只是头像在页面上的展示形状，圆外内容同样保存在图片里。
          <br />
          原图会一并存档，之后可在历史头像里查看、下载或重新裁剪。
          {file && (
            <div className="mt-1 text-gray-400 truncate" title={file.name}>
              {file.name}
              {file.size ? ` · ${formatSize(file.size)}` : ''}
              {img ? ` · ${img.natW}×${img.natH}` : ''}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
