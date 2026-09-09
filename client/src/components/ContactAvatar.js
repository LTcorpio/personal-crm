import React, { useState, useRef, useEffect } from 'react';
import { Avatar, Dropdown, Image } from 'antd';
import { UserOutlined, LinkOutlined, EyeOutlined } from '@ant-design/icons';
import AuthenticatedAvatar, { getAvatarUrl } from './AuthenticatedAvatar';

export default function ContactAvatar({ faceUuid, name, avatarConfig, sizeClass, textClass, iconClass = '' }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  const showThumb = avatarConfig?.showAvatarThumb !== false && faceUuid;
  const isTextFallback = !showThumb && avatarConfig?.avatarFallbackType && avatarConfig.avatarFallbackType !== 'default';

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
    } else if (key === 'preview' && faceUuid) {
      // 复用 AuthenticatedAvatar 缓存获取头像原图 URL，用于大图预览
      getAvatarUrl(faceUuid).then((url) => {
        if (url) {
          setPreviewSrc(url);
          setPreviewOpen(true);
        }
      });
    }
  };

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
      className={`rounded-full select-none flex items-center justify-center overflow-hidden borderflex-shrink-0 ${sizeClass} ${
        isTextFallback ? 'bg-blue-50 border-blue-200' : 'bg-gray-100 border-gray-200'
      }`}
    >
      {(() => {
        if (showThumb) {
          return <AuthenticatedAvatar uuid={faceUuid} alt={name} className="w-full h-full object-cover" />;
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
      {faceUuid ? (
        <Dropdown
          trigger={['contextMenu']}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          menu={{
            items: [
              {
                key: 'preview',
                label: '查看大图',
                icon: <EyeOutlined />,
              },
              {
                key: 'immich',
                label: `在 Immich 中浏览「${name || ''}」`,
                icon: <LinkOutlined />,
              },
            ],
            onClick: handleMenuClick,
          }}
        >
          {avatarElement}
        </Dropdown>
      ) : (
        avatarElement
      )}
      {/* 隐藏的 Image 承载大图预览（antd 预览层自带缩放/1:1 实际尺寸/旋转） */}
      {/* 预览层虽由 Portal 渲染到 body，但点击事件仍会沿 React 树冒泡到父级 onClick，
          此处拦截冒泡，避免预览状态下误触父级打开「联系人详细档案」 */}
      {faceUuid && (
        <div style={{ display: 'none' }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
          <Image
            src={previewSrc}
            preview={{
              visible: previewOpen,
              onVisibleChange: (v) => setPreviewOpen(v),
            }}
          />
        </div>
      )}
    </>
  );
}
