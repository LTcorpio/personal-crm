import React, { useState, useEffect } from 'react';
import { Modal, Button, Breadcrumb, message, Space, Empty, Popconfirm } from 'antd';
import { 
  ArrowUpOutlined, 
  ArrowDownOutlined, 
  DeleteOutlined, 
  FolderOpenOutlined, 
  ArrowLeftOutlined,
  HomeOutlined 
} from '@ant-design/icons';

import { tagApi } from '../api/crmApi';

export default function TagManagementModal({ visible, onClose, tagTree }) {
  // currentPath 存储下钻路线中的父辈节点对象数组
  const [currentPath, setCurrentPath] = useState([]);
  const [currentList, setCurrentList] = useState([]);

  // 根据系统的完整 tagTree 及当前的下钻深度 currentPath，动态提纯出当前的同级标签集合
  useEffect(() => {
    if (!visible) return;
    
    let list = tagTree;
    for (const pathNode of currentPath) {
      const found = list.find(t => t.id === pathNode.id);
      if (found && found.children) {
        list = found.children;
      } else {
        list = [];
        break;
      }
    }
    setCurrentList([...list]);
  }, [tagTree, currentPath, visible]);

  // 处理标签上下移动排序变换
  const handleMove = async (index, direction) => {
    const newList = [...currentList];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newList.length) return;
    
    // 同级换位
    const temp = newList[index];
    newList[index] = newList[targetIndex];
    newList[targetIndex] = temp;
    
    try {
      const tagIds = newList.map(item => item.id);
      await tagApi.updateOrder(tagIds);
      message.success('排序已同步');
      setCurrentList(newList);
    } catch (err) {
      message.error('排序保存失败，请检查网络链接');
    }
  };

  // 处理安全删除逻辑
  const handleDelete = async (id) => {
    try {
      const res = await tagApi.delete(id);
      if (res.data.success) {
        message.success(res.data.message || '标签删除成功');
        setCurrentList(prev => prev.filter(item => item.id !== id));
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || '该标签包含下属联系人，删除受限';
      message.error(errMsg);
    }
  };

  const breadcrumbItems = [
    {
      title: (
        <a 
          onClick={(e) => { e.preventDefault(); setCurrentPath([]); }} 
          className="flex items-center"
          title="返回根目录"
        >
          <HomeOutlined />
        </a>
      ),
    },
    ...currentPath.map((node, idx) => {
      const isLast = idx === currentPath.length - 1;
      return {
        key: node.id,
        title: isLast ? (
          // 最后一级
          <span>{node.name}</span>
        ) : (
          // 中间级
          <a onClick={(e) => { e.preventDefault(); setCurrentPath(prev => prev.slice(0, idx + 1)); }}>
            {node.name}
          </a>
        ),
      };
    })
  ];

  return (
    <Modal
      title="标签管理"
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="close" type="primary" onClick={onClose} className="rounded-md">
          完成并关闭
        </Button>
      ]}
      width={600}
      destroyOnHidden
      className='select-none'
    >
      <div className="flex flex-col gap-4 pt-2 select-none">
        {/* 上方面包屑导航栏与回溯控制 */}
        <div className="flex items-center gap-3 bg-gray-50/80 p-3 rounded-xl border border-gray-100">
          <Button
            size="small"
            icon={<ArrowLeftOutlined />}
            onClick={() => setCurrentPath(prev => prev.slice(0, -1))}
            className="flex items-center text-xs"
            disabled={!currentPath.length}
          >
            返回上级
          </Button>
          <Breadcrumb items={breadcrumbItems} className="flex items-center" />
        </div>

        {/* 下方同级核心业务看板区 */}
        <div className="border border-gray-200/80 rounded-xl max-h-[380px] overflow-y-auto bg-white shadow-sm">
          {currentList.length === 0 ? (
            <Empty 
              image={Empty.PRESENTED_IMAGE_SIMPLE} 
              description={<span className="text-gray-400 text-xs">该目录下暂无子级标签</span>}
              className="py-12 my-0"
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {currentList.map((item, index) => (
                <div
                  key={item.id}
                  className="px-4 py-3 hover:bg-gray-50/50 transition-all duration-200 flex items-center justify-between group"
                >
                  {/* 左侧标签基础信息 */}
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="font-medium text-sm text-gray-700 truncate">{item.name}</span>
                    {item.children && item.children.length > 0 && (
                      <span className="text-[11px] bg-gray-100 text-gray-500 font-medium px-2 py-0.5 rounded-full shrink-0">
                        子级 × {item.children.length}
                      </span>
                    )}
                  </div>

                  {/* 右侧操作交互区 */}
                  <Space size="middle" className="shrink-0">
                    {/* 下钻穿透触点 */}
                    {item.children.length !== 0 && <Button
                      size="small"
                      type="text"
                      icon={<FolderOpenOutlined />}
                      disabled={!item.children || item.children.length === 0}
                      onClick={() => setCurrentPath(prev => [...prev, { id: item.id, name: item.name }])}
                      className="text-gray-600"
                    >
                      下一级
                    </Button>}

                    {/* 排序微调按钮组 */}
                    <div className="flex items-center bg-gray-50 rounded-md p-0.5 border border-gray-100">
                      <Button
                        size="small"
                        type="text"
                        icon={<ArrowUpOutlined className="text-xs" />}
                        disabled={index === 0}
                        onClick={() => handleMove(index, 'up')}
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white disabled:opacity-30"
                      />
                      <div className="w-px h-3 bg-gray-200 mx-0.5" />
                      <Button
                        size="small"
                        type="text"
                        icon={<ArrowDownOutlined className="text-xs" />}
                        disabled={index === currentList.length - 1}
                        onClick={() => handleMove(index, 'down')}
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white disabled:opacity-30"
                      />
                    </div>

                    {/* 气泡确认破坏性删除操作 */}
                    <Popconfirm
                      title="确认彻底删除该标签吗？"
                      description="若标签下包含联系人，删除可能会受到系统限制。"
                      onConfirm={() => handleDelete(item.id)}
                      okText="确认"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button
                        size="small"
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        className="hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-md"
                      />
                    </Popconfirm>
                  </Space>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}