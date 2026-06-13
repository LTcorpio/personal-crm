import React from 'react';
import { Pagination, Button } from 'antd';
import { RightOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';

export default function CrmBottomBar({
  crmFeatureMode,
  selectedTopic,
  selectedTagPath,
  currentPage,
  pageSize,
  filteredContactsCount,
  activeContactsCount,
  totalContactsCount,
  onPageChange,
  siderCollapsed,
  onToggleSider,
}) {
  return (
    <div className="bg-white px-4 py-2.5 sm:px-6 sm:py-3 border-t border-gray-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-gray-500 shrink-0 select-none">
      
      {/* 左侧：折叠控制器 + 当前维度状态 */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0 w-full md:w-auto">
        <Button
          type="text"
          size="small"
          icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggleSider}
          className="text-gray-500 hover:text-blue-500 flex items-center justify-center shrink-0"
          title={siderCollapsed ? "展开侧边栏" : "收起侧边栏"}
        />
        
        <span className="text-xs sm:text-sm shrink-0">
          {crmFeatureMode === 'topics' ? '当前主题:' : '当前标签:'}
        </span>
        
        {crmFeatureMode === 'topics' ? (
          <span 
            className="text-xs px-2 py-0.5 rounded-md border font-medium transition-all duration-200 truncate max-w-[140px] sm:max-w-none shrink-0"
            style={{
              backgroundColor: `${selectedTopic?.color || '#6366f1'}1f`, 
              borderColor: selectedTopic?.color || '#6366f1',            
              color: selectedTopic?.color || '#6366f1',                  
            }}
            title={selectedTopic?.name || '未选择主题'}
          >
            {selectedTopic?.name || '未选择主题'}
          </span>
        ) : selectedTagPath && selectedTagPath !== '__NO_TAGS__' ? (
          /* 核心优化：移动端窄屏下支持横向滚动，隐藏滚动条，避免撑开高度 */
          <span className="text-xs bg-blue-50 text-blue-400 px-2 py-1 rounded-md border border-blue-100 flex items-center overflow-x-auto whitespace-nowrap min-w-0 flex-1 md:flex-initial [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {selectedTagPath.split('/').map((tag, index, arr) => {
              const isLast = index === arr.length - 1;
              return (
                <span key={index} className="flex items-center shrink-0">
                  <span className={isLast ? "font-bold text-blue-700" : "text-blue-700/80"}>
                    {tag}
                  </span>
                  {!isLast && (
                    <span className="mx-1 text-blue-700/30 font-normal text-[10px]">
                      <RightOutlined />
                    </span>
                  )}
                </span>
              );
            })}
          </span>
        ) : selectedTagPath === '__NO_TAGS__' ? (
          <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-100 font-medium shrink-0">
            无标签人员
          </span>
        ) : (
          <span className="text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded border border-gray-200 shrink-0">
            全部
          </span>
        )}
      </div>

      {/* 右侧：分页器 + 计数值 */}
      {/* 核心修改 1：通过 flex-row-reverse 让移动端分页器居右、人数居左。去掉了 border-t 和 pt-2 分割线线 */}
      <div className="flex flex-row-reverse items-center justify-between md:flex-row md:justify-end gap-3 md:gap-4 w-full md:w-auto md:shrink-0">
        {filteredContactsCount > 0 && (
          // 优化：增加 md:shrink-0 确保未折行时分页器不被压扁变形导致遮挡
          <div className="md:flex-initial md:shrink-0 min-w-0">
            <Pagination
              size='small'
              simple
              current={currentPage}
              pageSize={pageSize}
              total={filteredContactsCount}
              onChange={onPageChange}
              showSizeChanger
              pageSizeOptions={Array.from({ length: 20 }, (_, i) => String((i + 1) * 5))}
              // 核心修改 2：利用 Tailwind 穿透覆盖 AntD 的原生隐藏样式，强行在窄屏下展示 sizeChanger
              className="max-w-full [&_.ant-pagination-options]:!inline-flex"
            />
          </div>
        )}
        <div className="font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded-xl border border-gray-100 text-xs md:text-sm shrink-0">
          人数: <span className="text-blue-600 font-bold">{filteredContactsCount}</span>
          <span className="mx-1 text-gray-300">/</span>
          <span className="text-gray-500">{crmFeatureMode === 'topics' ? activeContactsCount : totalContactsCount}</span>
        </div>
      </div>

    </div>
  );
}