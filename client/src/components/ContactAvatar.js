import React from 'react';
import { Avatar } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import AuthenticatedAvatar from './AuthenticatedAvatar';

export default function ContactAvatar({ faceUuid, name, avatarConfig, sizeClass, textClass, iconClass = '' }) {
  const showThumb = avatarConfig?.showAvatarThumb !== false && faceUuid;
  const isTextFallback = !showThumb && avatarConfig?.avatarFallbackType && avatarConfig.avatarFallbackType !== 'default';

  return (
    <div className={`rounded-full flex items-center justify-center overflow-hidden border select-none flex-shrink-0 ${sizeClass} ${
      isTextFallback ? 'bg-blue-50 border-blue-200' : 'bg-gray-100 border-gray-200'
    }`}>
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
}