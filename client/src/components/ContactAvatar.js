import React from 'react';
import { Avatar, Dropdown } from 'antd';
import { UserOutlined, LinkOutlined } from '@ant-design/icons';
import AuthenticatedAvatar from './AuthenticatedAvatar';

export default function ContactAvatar({ faceUuid, name, avatarConfig, sizeClass, textClass, iconClass = '' }) {
  const showThumb = avatarConfig?.showAvatarThumb !== false && faceUuid;
  const isTextFallback = !showThumb && avatarConfig?.avatarFallbackType && avatarConfig.avatarFallbackType !== 'default';

  const handleMenuClick = ({ key, domEvent }) => {
    if (key === 'immich' && faceUuid) {
      // 阻止菜单点击事件冒泡到父级，避免触发父级 onClick 打开详情/编辑弹窗
      domEvent?.stopPropagation();
      const immichUrl = `http://${window.location.hostname}:2283/people/${faceUuid}`;
      window.open(immichUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const avatarElement = (
    <div
      // 右键事件阻止冒泡，避免触发父级点击逻辑
      onContextMenu={(e) => e.stopPropagation()}
      className={`rounded-full flex items-center justify-center overflow-hidden border select-none flex-shrink-0 ${sizeClass} ${
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

  // 有 face_uuid 时，右键弹出 Immich 快捷菜单
  if (faceUuid) {
    return (
      <Dropdown
        trigger={['contextMenu']}
        menu={{
          items: [
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
    );
  }

  return avatarElement;
}
