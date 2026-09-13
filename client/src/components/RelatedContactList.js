import React from 'react';
import { Tooltip } from 'antd';
import { CommentOutlined } from '@ant-design/icons';

/**
 * 「关联人」条目的统一展示组件（只读）。
 *
 * 详细档案与网格卡片共用一份，避免两处各写一套导致样式漂移。
 * 每颗 chip 固定为「左侧关系 + 右侧姓名（+ 备注图标）」：
 *   - 两段共用同一套纵向度量（leading + py），高度确定，且靠 items-stretch 让分隔线满高
 *   - 每颗 chip 直接作为 flex item，不套任何包装元素：否则在 align-items:stretch 下
 *     会被拉伸出空隙、与其他 chip 对齐基准不一致
 *   - 备注图标固定字号并包一层 inline-flex，不参与行高，避免「有备注的比没备注的高」
 *
 * 不使用 antd Tag：Tag 自带的 line-height / font-size / border / vertical-align
 * 需要逐个覆盖，极易出现「覆盖失效导致高度不一致」的问题。
 */

export default function RelatedContactList({ related = [], onRelatedClick, size = 'md', className = '' }) {
  const list = related || [];
  if (list.length === 0) return null;

  // md：详细档案（14px）；sm：卡片网格（12px，窄容器取更小一档）
  const isMd = size === 'md';
  const segBase = `${isMd ? 'text-sm leading-5' : 'text-xs leading-4'} py-0.5 flex items-center whitespace-nowrap`;
  const padX = isMd ? 'px-2.5' : 'px-2';
  const iconCls = isMd ? 'text-[13px]' : 'text-[12px]';
  // 图标盒与文字行盒等高（md:20px / sm:16px）：
  // 这样两个子项在 align-items:center 下是同一高度的盒子，图标与文字必然同一基准，
  // 不会出现「图标略高/略低」的观感差异。
  const iconBoxCls = isMd ? 'h-5' : 'h-4';

  return (
    <div className={`flex flex-wrap items-start gap-2 ${className}`}>
      {list.map((r, idx) => {
        // 判断是否有关联备注（排除空字符串、undefined 或 null）
        const hasRemark = r.remark && r.remark.trim() !== '';
        const hasId = !!r.id; // 有绑定的联系人 ID 才可点击跳转

        const chip = (
          <span
            key={idx}
            className={`group inline-flex items-stretch rounded-md overflow-hidden border border-gray-200 ${
              hasId ? 'cursor-pointer' : ''
            }`}
            onClick={(e) => {
              if (!hasId || !onRelatedClick) return;
              e.stopPropagation(); // 阻止冒泡，避免触发卡片整体的点击事件
              onRelatedClick(r.id);
            }}
          >
            <span className={`${segBase} ${padX} bg-gray-100 text-gray-600 font-medium border-r border-gray-200`}>
              {/* 包一层 span：文字成为「显式 flex item」，不依赖浏览器对匿名文本项的居中处理 */}
              <span>{r.relation}</span>
            </span>
            <span
              className={`${segBase} ${padX} gap-1 transition-colors ${
                hasId
                  ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-100' // 有 ID：可点击的蓝色态
                  : 'bg-gray-50 text-gray-500' // 没有 ID：低调的灰色态
              }`}
            >
              <span>{r.name}</span>
              {hasRemark && (
                <span className={`inline-flex items-center leading-none ${iconCls} ${iconBoxCls}`}>
                  <CommentOutlined />
                </span>
              )}
            </span>
          </span>
        );

        // 有备注时挂 Tooltip 显示全文；包装只作用于 chip 自身，不额外产生元素
        return hasRemark ? (
          <Tooltip title={r.remark} key={idx}>
            {chip}
          </Tooltip>
        ) : (
          chip
        );
      })}
    </div>
  );
}
