import React from 'react';
import { Tree, Button } from 'antd';
import { TagsOutlined } from '@ant-design/icons';

export default function Sidebar({ processedTagTree, selectedTagPath, setSelectedTagPath }) {
  return (
    <div className="w-full h-full bg-white p-4 overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
        <span className="font-bold text-gray-700 flex items-center gap-2">
          <TagsOutlined className="text-blue-500" /> 标签
        </span>
        {/* 无标签人员筛选 */}
        <div className="flex items-center gap-2">
          <Button 
            type={selectedTagPath === '__NO_TAGS__' ? 'primary' : 'link'} 
            size="small" 
            danger={selectedTagPath === '__NO_TAGS__'}
            onClick={() => setSelectedTagPath(selectedTagPath === '__NO_TAGS__' ? null : '__NO_TAGS__')} 
            className="text-xs"
          >
            {selectedTagPath === '__NO_TAGS__' ? '无标签人员' : '筛选无标签人员'}
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => setSelectedTagPath(null)}
            disabled={!selectedTagPath}
            className="p-0 text-xs"
          >
            清除选择
          </Button>
        </div>
      </div>
      
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
  );
}