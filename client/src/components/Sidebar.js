import React from 'react';
import { Tree, Button } from 'antd';
import { TagsOutlined } from '@ant-design/icons';

export default function Sidebar({ processedTagTree, selectedTagPath, setSelectedTagPath }) {
  return (
    <div className="w-full h-[calc(100vh-120px)] bg-white p-4 rounded-xl shadow-sm border border-gray-100 sticky top-24 overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
        <span className="font-bold text-gray-700 flex items-center gap-2">
          <TagsOutlined className="text-blue-500" /> 标签
        </span>
        <Button disabled={!selectedTagPath} type="link" size="small" onClick={() => setSelectedTagPath(null)} className="p-0">
          清除选择
        </Button>
      </div>
      
      {processedTagTree.length > 0 ? (
        <Tree
          showLine={{ showLeafIcon: true }}
          defaultExpandAll
          treeData={processedTagTree}
          selectedKeys={selectedTagPath ? [selectedTagPath] : []}
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