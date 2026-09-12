import React, { useState, useRef, useEffect } from 'react';
import { Avatar, Dropdown, Image } from 'antd';
import { UserOutlined, LinkOutlined, EyeOutlined, EditOutlined, PictureOutlined } from '@ant-design/icons';
import { avatarUrl } from '../api/crmApi';
import AvatarManagerModal from './AvatarManagerModal';

/**
 * 联系人头像。
 *
 * 展示与跳转已解耦：
 *   - thumbUrl 指向后端的本地头像文件（/api/avatars/<hash>.<ext>），
 *     图像内容不再随 Immich 变动而变动；
 *   - faceUuid 仅用于右键菜单「在 Immich 中浏览」的外链跳转。
 * 两者互相独立：可以只有本地头像而没有 UUID（例如本地上传的图片）。
 */
export default function ContactAvatar({
  faceUuid, thumbUrl, name, avatarConfig, sizeClass, textClass, iconClass = '',
  contactId, contactName, onAvatarChange,
  onOpenEdit,
  onOpenView,
  editMode = true,
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  // 右键菜单「管理头像」打开的独立弹窗（仅打开时挂载）
  const [manageOpen, setManageOpen] = useState(false);
  const showThumb = avatarConfig?.showAvatarThumb !== false && !!thumbUrl;
  const isTextFallback = !showThumb && avatarConfig?.avatarFallbackType && avatarConfig.avatarFallbackType !== 'default';
  const hasMenu = !!(contactId || faceUuid || thumbUrl);

  // 移动端长按菜单状态：桌面沿用右键 contextMenu，触屏长按手动展开下拉
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);
  const touchStartPos = useRef(null);

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = (e) => {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    longPressTriggered.current = false;
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    clearLongPressTimer();
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setMenuOpen(true);
    }, 500);
  };

  const moveLongPress = (e) => {
    const touch = e.touches && e.touches[0];
    if (!touch || !touchStartPos.current) return;
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;
    // 滑动超过 10px 视为滚动/拖拽，取消长按
    if (dx * dx + dy * dy > 100) clearLongPressTimer();
  };

  const endLongPress = () => {
    clearLongPressTimer();
    touchStartPos.current = null;
  };

  // 长按触发过菜单后，拦截随后派生的 click，避免误触父级打开编辑弹窗
  const handleAvatarClick = (e) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  useEffect(() => clearLongPressTimer, []);

  const handleMenuClick = ({ key, domEvent }) => {
    // 阻止菜单点击事件冒泡到父级，避免触发父级 onClick 打开详情/编辑弹窗
    domEvent?.stopPropagation();
    if (key === 'immich' && faceUuid) {
      // Immich 已收归 home.lan（容器端口仅 127.0.0.1 监听），
      // 「在 Immich 中浏览」固定走 https://photo.home.lan，不再直连 IP:2283
      const immichUrl = `https://photo.home.lan/people/${faceUuid}`;
      window.open(immichUrl, '_blank', 'noopener,noreferrer');
    } else if (key === 'preview' && thumbUrl) {
      setPreviewSrc(avatarUrl(thumbUrl));
      setPreviewOpen(true);
    } else if (key === 'manage' && contactId) {
      setManageOpen(true);
    } else if (key === 'view' && contactId) {
      onOpenView?.();
    } else if (key === 'edit' && contactId) {
      onOpenEdit?.();
    }
  };

  // 右键菜单按模块分组：人员信息 / 头像 / Immich
  // 每组只在存在可选项时生成，避免出现空标题
  const personGroup = [];
  const avatarGroup = [];
  const immichGroup = [];

  if (contactId) {
    if (editMode) {
      personGroup.push({ key: 'edit', label: '编辑人员信息', icon: <EditOutlined /> });
    }
    personGroup.push({ key: 'view', label: '查看人员信息', icon: <UserOutlined /> });
    avatarGroup.push({ key: 'manage', label: '管理头像', icon: <PictureOutlined /> });
  }
  if (thumbUrl) {
    avatarGroup.push({ key: 'preview', label: '查看大图', icon: <EyeOutlined /> });
  }
  if (faceUuid) {
    immichGroup.push({ key: 'immich', label: `在 Immich 中浏览「${name || ''}」`, icon: <LinkOutlined /> });
  }

  const menuItems = [];
  if (personGroup.length) menuItems.push({ type: 'group', label: '人员信息', children: personGroup });
  if (avatarGroup.length) menuItems.push({ type: 'group', label: '头像', children: avatarGroup });
  if (immichGroup.length) menuItems.push({ type: 'group', label: 'Immich', children: immichGroup });

  const avatarElement = (
    <div
      // 右键事件阻止冒泡，避免触发父级点击逻辑
      onContextMenu={(e) => e.stopPropagation()}
      onTouchStart={startLongPress}
      onTouchMove={moveLongPress}
      onTouchEnd={endLongPress}
      onTouchCancel={endLongPress}
      onClick={handleAvatarClick}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      className={`rounded-full select-none flex items-center justify-center overflow-hidden border flex-shrink-0 ${sizeClass} ${
        isTextFallback ? 'bg-blue-50 border-blue-200' : 'bg-gray-100 border-gray-200'
      }`}
    >
      {(() => {
        if (showThumb) {
          return (
            <img
              src={avatarUrl(thumbUrl)}
              alt={name || ''}
              className="w-full h-full object-cover"
              loading="lazy"
              // 文件缺失时隐藏，露出底层的兜底样式，不做二次请求
              onError={(e) => { e.target.style.visibility = 'hidden'; }}
            />
          );
        }
        if (avatarConfig?.avatarFallbackType === 'lastname' && name) {
          return <span className={`font-bold text-blue-600 ${textClass}`}>{name.charAt(0)}</span>;
        }
        if (avatarConfig?.avatarFallbackType === 'fullname' && name) {
          return (
            <Avatar size={64} gap={4} className="bg-transparent text-blue-600 font-bold flex items-center">
              {name}
            </Avatar>
          );
        }
        return <UserOutlined className={`text-gray-400 ${iconClass || ''}`} />;
      })()}
    </div>
  );

  return (
    <>
      {hasMenu ? (
        <Dropdown
          trigger={['contextMenu']}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          menu={{ items: menuItems, onClick: handleMenuClick }}
        >
          {avatarElement}
        </Dropdown>
      ) : (
        avatarElement
      )}
      {/* 隐藏的 Image 承载大图预览（antd 预览层自带缩放/1:1 实际尺寸/旋转） */}
      {/* 预览层虽由 Portal 渲染到 body，但点击事件仍会沿 React 树冒泡到父级 onClick，
          此处拦截冒泡，避免预览状态下误触父级打开「联系人详细档案」 */}
      {thumbUrl && (
        <div style={{ display: 'none' }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
          <Image
            src={previewSrc || avatarUrl(thumbUrl)}
            preview={{
              visible: previewOpen,
              onVisibleChange: (v) => setPreviewOpen(v),
            }}
          />
        </div>
      )}

      {/* 右键菜单直达的头像管理：仅打开时挂载，避免列表里每个头像都常驻一个弹窗 */}
      {/* Modal 经 createPortal 渲染到 body，但其事件仍沿 React 树冒泡；
         该弹窗是可点击卡片/表格行的子组件，若不拦截，点弹窗内任意处会触发父级 onClick
         打开「编辑人员信息」/详情。
         因此这里在冒泡阶段 stopPropagation：内部按钮自己的 onClick 先正常触发，
         事件向上冒泡经过本包裹 div 时才被截断，既不影响弹窗交互，又阻止误触父级。
         注意不能用 onClickCapture——捕获阶段在到达按钮前就拦截，会令弹窗内按钮全部失灵。
         用 display:contents 包裹，避免引入额外布局盒子。 */}
      {manageOpen && (
        <div
          style={{ display: 'contents' }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        >
          <AvatarManagerModal
            open={manageOpen}
            contactId={contactId}
            contactName={contactName || name}
            initialFaceUuid={faceUuid || ''}
            onClose={() => setManageOpen(false)}
            onSaved={() => onAvatarChange?.()}
          />
        </div>
      )}
    </>
  );
}
