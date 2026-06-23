import React from 'react';
import { Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import AuthenticatedAvatar from './AuthenticatedAvatar';

export default function ContactMiniCard({ contact, onClick, avatarConfig }) {
  const { face_uuid, name, gender, title } = contact;
  const showThumb = avatarConfig?.showAvatarThumb !== false && face_uuid;
  const isTextFallback = !showThumb && avatarConfig?.avatarFallbackType && avatarConfig.avatarFallbackType !== 'default';

  return (
    <div 
      onClick={onClick}
      className="p-2 rounded-xl flex flex-col items-center text-center gap-3 cursor-pointer hover:bg-slate-100 transition-colors"
    >
      {/* 头像 */}
      <div className="flex-shrink-0">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center overflow-hidden border select-none ${
          isTextFallback ? 'bg-blue-50 border-blue-200' : 'bg-gray-100 border-gray-200'
        }`}>
          {(() => {
            if (showThumb) {
              return <AuthenticatedAvatar uuid={face_uuid} alt={name} className="w-full h-full object-cover" />;
            }
            if (avatarConfig?.avatarFallbackType === 'lastname' && name) {
              return <span className="text-[24px] font-bold text-blue-600">{name.charAt(0)}</span>;
            }
            if (avatarConfig?.avatarFallbackType === 'fullname' && name) {
              return <span className="text-[14px] font-bold text-blue-600 px-1 text-center w-full">{name}</span>;
            }
            return <UserOutlined className="text-xl text-gray-400" />;
          })()}
        </div>
      </div>

      {/* 信息区域：姓名、性别、称呼 */}
      <div className="w-full min-w-0">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-base font-semibold text-slate-800 truncate max-w-[70%]">{name}</span>
          {gender === 1 ? (
            <Tag color="blue" className="m-0 text-xs px-1.5 py-0">男</Tag>
          ) : (
            <Tag color="pink" className="m-0 text-xs px-1.5 py-0">女</Tag>
          )}
        </div>
        {title &&<div className="text-xs text-gray-400 truncate">{title}</div>}
      </div>
    </div>
  );
}