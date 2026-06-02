import React from 'react';
import { Avatar, Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';

export default function ContactMiniCard({ contact, onClick }) {
  const { face_thumb_url, name, gender, title } = contact;

  return (
    <div 
      onClick={onClick}
      className="p-2 rounded-xl flex flex-col items-center text-center gap-3 cursor-pointer hover:bg-slate-100 transition-colors"
    >
      {/* 1. 头像在上 */}
      <div className="flex-shrink-0">
        {face_thumb_url ? (
          <img src={face_thumb_url} alt={name} className="w-14 h-14 rounded-full object-cover" />
        ) : (
          <Avatar icon={<UserOutlined />} size={56} />
        )}
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