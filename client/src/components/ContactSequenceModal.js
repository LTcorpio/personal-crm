import React, { useState, useEffect } from 'react';
import { Modal, message } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { contactApi } from '../api/crmApi';

export default function ContactSequenceModal({ open, onClose, contacts, onSaveSuccess }) {
  // 惰性初始化状态，规避二次重绘
  const [modalContacts, setModalContacts] = useState(() => [...contacts]);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);

  // 监听外部数据源同步
  useEffect(() => {
    if (open) {
      setModalContacts([...contacts]);
    }
  }, [contacts, open]);

  // --- 丝滑的实时拖拽逻辑 ---
  const handleDragStart = (index) => {
    setDraggingIndex(index);
  };

  const handleDragEnter = (index) => {
    if (draggingIndex === null || draggingIndex === index) return;

    const listCopy = [...modalContacts];
    const targetItem = listCopy[draggingIndex];
    
    listCopy.splice(draggingIndex, 1);
    listCopy.splice(index, 0, targetItem);
    
    setDraggingIndex(index);
    setModalContacts(listCopy);
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
  };

  // --- 提交排序保存 ---
  const handleSave = async () => {
    setSaveLoading(true);
    try {
      const contactIds = modalContacts.map(c => c.id);
      const res = await contactApi.updateOrder(contactIds);
      if (res.data?.success) {
        message.success('人员序列保存成功！');
        if (onSaveSuccess) onSaveSuccess();
        onClose();
      } else {
        message.error(res.data?.message || '保存失败');
      }
    } catch (error) {
      message.error('请求网络失败，请检查后端服务');
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <Modal
      title={<div className="text-lg font-bold text-gray-800">管理人员序列</div>}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saveLoading}
      destroyOnClose
      okText="保存序列"
      cancelText="取消"
      width="80%"
    >
      {/* 操作提示条 */}
      <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-md text-xs text-blue-700 flex justify-between items-center select-none">
        <span>💡 提示：支持<strong>直接按住并拖拽人员标签</strong>改变内部顺序；鼠标悬浮在标签上可查看人员详细凭证。</span>
        <span className="text-gray-400 font-medium">共 {modalContacts.length} 人</span>
      </div>
      
      {/* 人员标签流容器 (pt-7 为第一行悬浮气泡留出展示空间) */}
      <div className="flex flex-wrap gap-3 pt-4 pb-4 min-h-[200px]">
        {modalContacts.map((contact, index) => {
          const isDragging = draggingIndex === index;
          return (
            <div
              key={contact.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className={`
                group relative flex items-center gap-2 px-1.5 py-0.5 rounded-md select-none transition-all duration-200 cursor-grab active:cursor-grabbing
                ${isDragging 
                  ? 'opacity-40 border-dashed border-blue-400 bg-blue-50 scale-95' 
                  : 'bg-gray-50 hover:bg-blue-50/40 border border-gray-200 hover:border-blue-400'
                }
              `}
            >
              {/* 左侧：微型抓取手柄 */}
              <MenuOutlined className={`text-[11px] transition-colors ${isDragging ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-500'}`} />

              {/* 中间：核心人员信息 */}
              <div className="flex items-center gap-1.5 text-sm">
                <span className="font-semibold text-gray-800">{contact.name}</span>
                
                {/* 性别表现 */}
                {contact.gender === 1 && <span className="text-[10px] px-1 bg-blue-100/70 text-blue-700 rounded-sm scale-90 origin-left">男</span>}
                {contact.gender === 0 && <span className="text-[10px] px-1 bg-pink-100/70 text-pink-700 rounded-sm scale-90 origin-left">女</span>}
              </div>

              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex items-center gap-1.5 bg-gray-900/90 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded shadow-lg z-30 whitespace-nowrap pointer-events-none after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-gray-900/90">
                <span className="text-gray-400">ID:</span>
                <span className="font-mono font-medium">{contact.id}</span>
                <span className="text-gray-600">|</span>
                <span className="text-gray-400">标签:</span>
                <span className="font-medium">{contact.title || '无'}</span>
              </div>
            </div>
          );
        })}

        {modalContacts.length === 0 && (
          <div className="w-full py-12 text-center text-gray-400">暂无人员数据</div>
        )}
      </div>
    </Modal>
  );
}