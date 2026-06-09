import React from 'react';
import { Tree, Button, Tooltip } from 'antd';
import { ClearOutlined, SettingOutlined, TagsOutlined, UserDeleteOutlined } from '@ant-design/icons';

export default function Sidebar({ processedTagTree, selectedTagPath, setSelectedTagPath, onManageTags }) {
  return (
    <div className="w-full h-full bg-white flex flex-col">
      <div className="flex items-center justify-between p-4 pb-2 border-b border-gray-100">
        <span className="font-bold text-gray-700 flex items-center gap-2">
          <TagsOutlined className="text-blue-500" /> 标签
        </span>
        
        {/* 无标签人员筛选 */}
        <div className="flex items-center gap-1 shrink-0">
          {/* 配置管理入口 */}
          <Button 
            icon={<SettingOutlined />} 
            type="text" 
            size="small" 
            onClick={onManageTags}
            title="管理标签"
          >
            管理标签
          </Button>
          <Tooltip title={selectedTagPath === '__NO_TAGS__' ? '取消无标签筛选' : '筛选无标签人员'}>
            <Button 
              type={selectedTagPath === '__NO_TAGS__' ? 'primary' : 'default'} 
              size="small" 
              danger={selectedTagPath === '__NO_TAGS__'}
              icon={<UserDeleteOutlined />}
              onClick={() => setSelectedTagPath(selectedTagPath === '__NO_TAGS__' ? null : '__NO_TAGS__')} 
            />
          </Tooltip>
          <Tooltip title="清除选择">
            <Button
              type="default"
              size="small"
              icon={<ClearOutlined />}
              onClick={() => setSelectedTagPath(null)}
              disabled={!selectedTagPath}
            />
          </Tooltip>
        </div>
      </div>
      
      <div className="flex-1 p-2 pl-4 min-h-0 overflow-y-auto">
        {processedTagTree.length > 0 ? (
          <Tree
            showLine={{ showLeafIcon: true }}
            defaultExpandParent
            treeData={processedTagTree}
            // 如果当前选中的是 '__NO_TAGS__'，树组件不要高亮任何常规节点
            selectedKeys={selectedTagPath && selectedTagPath !== '__NO_TAGS__' ? [selectedTagPath] : []}
            onSelect={(selectedKeys) => {
              if (selectedKeys.length > 0) {
                setSelectedTagPath(selectedKeys[0]);
              } else {
                setSelectedTagPath(null);
              }
            }}
            className="text-sm"
          />
        ) : (
          <div className="text-gray-400 text-xs text-center py-8">暂无标签数据</div>
        )}
      </div>
    </div>
  );
}