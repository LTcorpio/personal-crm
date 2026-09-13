import React from 'react';
import { Tooltip } from 'antd';

/**
 * 联系人所属主题的统一展示组件（只读）。
 *
 * 卡片 / 头像 / 列表 / 详细档案四处共用同一套样式，避免各写一份导致视觉不一致。
 * 标签颜色取自主题自身配置的颜色：底色与描边由该颜色叠加透明度派生，文字直接用该颜色。
 *
 * 悬浮提示：仅当该联系人在这个主题下填了成员备注时，鼠标移入标签才弹浮窗，
 * 浮窗内容就是这条备注（备注由 buildContactTopicMap 注入为 topic.memberRemark）；
 * 没填备注的标签不挂浮窗、移入无任何提示。
 */

// 解析 #rgb / #rrggbb，失败返回 null
const parseHex = (color) => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

// sRGB 亮度加权近似，仅用于判断主题色是否过浅
const brightness = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

const toHex = ([r, g, b]) => `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;

const FALLBACK_RGB = [99, 102, 241]; // 主题默认色 #6366f1

/**
 * 根据主题色生成标签内联样式。
 * 主题色过浅（浅黄、纯白等）时文字降级为深灰、描边改为中性灰，保证标签仍然看得见。
 */
export const topicTagStyle = (color) => {
  const rgb = parseHex(color) || FALLBACK_RGB;
  const [r, g, b] = rgb;
  if (brightness(rgb) > 0.75) {
    return {
      backgroundColor: `rgba(${r}, ${g}, ${b}, 0.35)`,
      borderColor: '#d1d5db',
      color: '#4b5563',
    };
  }
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.12)`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.35)`,
    color: toHex(rgb),
  };
};

export default function ContactTopics({ topics = [], size = 'sm', max = 0, nowrap = false, className = '', gapClass = 'gap-1' }) {
  const list = topics || [];
  if (list.length === 0) return null;

  // max > 0 时只展示前 max 个，其余折叠为 +N（鼠标悬停可看完整名单）
  const visible = max > 0 ? list.slice(0, max) : list;
  const restList = max > 0 ? list.slice(max) : [];

  const sizeClass = size === 'xs'
    ? 'text-[10px] leading-4 px-1.5 rounded'
    : size === 'md'
      ? 'text-sm px-2.5 py-0.5 rounded-md'
      : 'text-xs px-2 py-0.5 rounded-md';

  return (
    <div className={`flex items-center ${gapClass} ${nowrap ? 'flex-nowrap overflow-hidden' : 'flex-wrap'} ${className}`}>
      {visible.map(topic => {
        const remark = String(topic.memberRemark || '').trim();
        const tagEl = (
          <span
            key={topic.id}
            style={topicTagStyle(topic.color)}
            className={`inline-flex items-center border whitespace-nowrap min-w-0 max-w-full ${sizeClass}`}
          >
            <span className="truncate">{topic.name}</span>
          </span>
        );
        // 只有填了备注的成员才挂浮窗（浮窗显示备注内容）；没有备注时鼠标移入不弹任何提示
        return remark ? <Tooltip key={topic.id} title={remark}>{tagEl}</Tooltip> : tagEl;
      })}
      {restList.length > 0 && (
        <Tooltip title={restList.map(t => t.name).join('、')}>
          <span className={`inline-flex items-center border border-gray-200 bg-gray-50 text-gray-500 whitespace-nowrap shrink-0 ${sizeClass}`}>
            +{restList.length}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
