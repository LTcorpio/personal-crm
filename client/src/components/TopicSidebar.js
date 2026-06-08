import React, { useState, useEffect } from 'react';
import { Button, ColorPicker, Empty, Form, Input, Modal, Popconfirm } from 'antd';
import {
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios from 'axios';

// --- 单项主题排序组件 ---
function SortableTopicItem({ topic, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: topic.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 border border-gray-200 rounded-md bg-white mb-2 ${isDragging ? 'opacity-50' : ''}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab p-1 text-gray-400 hover:text-gray-600">
        <HolderOutlined />
      </div>
      <div className="flex-1 min-w-0 font-medium text-sm text-gray-800 truncate">{topic.name}</div>
      <div className="flex items-center gap-1">
        <Button type="text" size='small' icon={<EditOutlined />} onClick={() => onEdit(topic)}>编辑</Button>
        <Popconfirm
          title="确认删除该主题吗？"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => onDelete(topic.id)}
        >
          <Button type="text" danger size='small' icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      </div>
    </div>
  );
}

// --- 单项成员排序组件 ---
function SortableMemberItem({ field, remove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[32px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_32px] gap-2 items-center bg-gray-50/50 p-2 border border-gray-100 rounded-md ${isDragging ? 'opacity-50' : ''}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab text-center text-gray-400 hover:text-gray-600">
        <HolderOutlined />
      </div>
      <Form.Item name={[field.name, 'contactId']} className="mb-0">
        <Input placeholder="人物ID" />
      </Form.Item>
      <Form.Item
        name={[field.name, 'name']}
        className="mb-0"
        rules={[{ required: true, message: '请输入姓名' }]}
      >
        <Input placeholder="姓名" />
      </Form.Item>
      <Form.Item name={[field.name, 'remark']} className="mb-0">
        <Input placeholder="备注" />
      </Form.Item>
      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
    </div>
  );
}

export default function TopicSidebar({
  topics,
  setTopics,
  selectedTopicId,
  setSelectedTopicId,
  onSaveTopic,
  onDeleteTopic
}) {
  const [form] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState(null);
  const [saving, setSaving] = useState(false);
  const [managedTopics, setManagedTopics] = useState([]);

  useEffect(() => {
    setManagedTopics(topics);
  }, [topics]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const openCreateModal = () => {
    setEditingTopic(null);
    form.setFieldsValue({ name: '', color: '#6366f1', members: [] });
    setModalOpen(true);
  };

  const openEditModal = (topic) => {
    setEditingTopic(topic);
    form.setFieldsValue({
      name: topic.name,
      color: topic.color || '#6366f1',
      members: topic.members?.length ? topic.members : [{ contactId: '', name: '', remark: '' }]
    });
    setModalOpen(true);
  };

  // 保存主题排序的点击函数
  const handleSaveOrder = async () => {
    // 1. 比对前后的 ID 顺序，判断值是否更改
    const originalIds = topics.map(t => t.id).join(',');
    const currentIds = managedTopics.map(t => t.id).join(',');
    const isChanged = originalIds !== currentIds;
    try {
      if (isChanged) {
        await axios.put('http://localhost:15197/api/topics/order', {
          topicIds: managedTopics.map(t => t.id)
        });
        
        setTopics(managedTopics); 
      }
      setManageModalOpen(false);
    } catch (err) {
      console.error("更新主题排序失败", err);
    }
  };

  const handleTopicDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = managedTopics.findIndex(t => t.id === active.id);
    const newIndex = managedTopics.findIndex(t => t.id === over.id);
    const newOrder = arrayMove(managedTopics, oldIndex, newIndex);
    setManagedTopics(newOrder); // 仅更新本地状态
  };

  const handleSubmit = async () => {
    try {
      // 使用 try 包裹住 validateFields，校验失败时由 catch 消化，不至于让整个系统崩溃
      const values = await form.validateFields();
      setSaving(true);
      
      await onSaveTopic(editingTopic?.id, {
        name: values.name,
        color: typeof values.color === 'object' ? values.color.toHexString() : values.color,
        members: (values.members || []).map(member => ({
          contactId: member.contactId || '',
          name: member.name || '',
          remark: member.remark || ''
        }))
      });
      setModalOpen(false);
    } catch (err) {
      // 仅打印或在这里做轻提示，阻止错误向上抛出
      console.log('表单校验未通过:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full h-full bg-white flex flex-col">
      <div className="flex items-center justify-between p-4 pb-2 border-b border-gray-100">
        <span className="font-bold text-gray-700 flex items-center gap-2">
          <ApartmentOutlined className="text-indigo-500" /> 主题分类
        </span>
        <Button 
          type="text" 
          size="small" 
          icon={<SettingOutlined />} 
          onClick={() => { setManagedTopics(topics); setManageModalOpen(true); }}
        >
          管理主题
        </Button>
      </div>

      <div className="flex-1 p-2 min-h-0 overflow-y-auto">
        {topics.length > 0 ? (
          <div className="space-y-2">
            {topics.map(topic => {
              const active = selectedTopicId === topic.id;
              // 颜色加上透明度（例如 12%，即后置加上十六进制的 1f）
              const baseColor = topic.color || '#6366f1';
              const bgStyle = active 
                ? { backgroundColor: `${baseColor}26`, borderColor: baseColor } 
                : { backgroundColor: `${baseColor}0d`, borderColor: 'transparent' };

              return (
                <div
                  key={topic.id}
                  style={bgStyle}
                  className={`group border rounded-lg px-3 py-2.5 cursor-pointer transition-all ${
                    active ? 'border font-medium shadow-sm' : 'hover:border-gray-200'
                  }`}
                  onClick={() => setSelectedTopicId(topic.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: baseColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-800 truncate">{topic.name}</div>
                    </div>
                    <div className="text-xs text-gray-400 bg-white/60 px-1.5 py-0.5 rounded-full border border-gray-100">
                      {topic.members?.length || 0} 人
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty className="py-10" description="暂无主题" />
        )}
      </div>

      <Modal
        title="管理主题分类"
        open={manageModalOpen}
        onCancel={() => setManageModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setManageModalOpen(false)}>取消</Button>,
          <Button key="save" type="primary" onClick={handleSaveOrder}>保存排序</Button>
        ]}
        width={450}
        className='select-none'
      >
        <div className="mb-4 flex justify-between items-center">
          <span className="text-xs text-gray-400">💡 拖动左侧手柄可对主题进行上下排序</span>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreateModal}>
            新增主题
          </Button>
        </div>
        <div className="max-h-[50vh] overflow-hidden pr-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTopicDragEnd}>
            <SortableContext items={managedTopics.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {managedTopics.map(topic => (
                <SortableTopicItem 
                  key={topic.id} 
                  topic={topic} 
                  onEdit={(t) => { openEditModal(t); }} 
                  onDelete={onDeleteTopic} 
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </Modal>

      <Modal
        title={editingTopic ? '编辑主题详情' : '创建新主题'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={720}
        destroyOnHidden
        className='select-none'
      >
        <Form form={form} layout="vertical" className="pt-4">
          <div className="grid grid-cols-[1fr_200px] gap-4">
            <Form.Item
              name="name"
              label="主题名称"
              rules={[{ required: true, message: '请输入主题名称' }]}
            >
              <Input placeholder="例如：XX 项目、黑名单..." />
            </Form.Item>
            <Form.Item
              name="color"
              label="主题底色"
              rules={[{ required: true }]}
            >
              <ColorPicker defaultValue="#ffffff" showText className='w-full' />
            </Form.Item>
          </div>

          <Form.List name="members">
            {(fields, { add, remove, move }) => {
              const handleMemberDragEnd = (event) => {
                const { active, over } = event;
                if (!over || active.id === over.id) return;
                const oldIndex = fields.findIndex(f => f.key === active.id);
                const newIndex = fields.findIndex(f => f.key === over.id);
                move(oldIndex, newIndex);
              };

              return (
                <div>
                  <div className="flex items-center justify-between mb-2 pb-1 border-b border-gray-100">
                    <span className="text-sm font-medium text-gray-700">主题成员配置</span>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => add({ contactId: '', name: '', remark: '' })}>
                      添加成员
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMemberDragEnd}>
                      <SortableContext items={fields.map(f => f.key)} strategy={verticalListSortingStrategy}>
                        {fields.map(field => (
                          <SortableMemberItem key={field.key} field={field} remove={remove} />
                        ))}
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>
              );
            }}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}