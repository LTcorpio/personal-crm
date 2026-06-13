import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Tree, Button, Tooltip, ColorPicker, Empty, Form, Input, Modal, Popconfirm } from 'antd';
import {
  ClearOutlined,
  SettingOutlined,
  TagsOutlined,
  UserDeleteOutlined,
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { topicApi } from '../api/crmApi';

// --- 排序辅助组件 ---
function SortableTopicItem({ topic, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: topic.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 999 : 'auto' }}
      className={`flex items-center gap-2 p-2 border border-gray-200 rounded-md bg-white mb-2 ${isDragging ? 'opacity-50' : ''}`}>
      <div {...attributes} {...listeners} className="cursor-grab p-1 text-gray-400 hover:text-gray-600"><HolderOutlined /></div>
      <div className="flex-1 min-w-0 font-medium text-sm text-gray-800 truncate">{topic.name}</div>
      <div className="flex items-center gap-1">
        <Button type="text" size='small' icon={<EditOutlined />} onClick={() => onEdit(topic)}>编辑</Button>
        <Popconfirm title="确认删除该主题吗？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => onDelete(topic.id)}>
          <Button type="text" danger size='small' icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      </div>
    </div>
  );
}

function SortableMemberItem({ field, remove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 999 : 'auto' }}
      className={`grid grid-cols-[32px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_32px] gap-2 items-center bg-gray-50/50 p-2 border border-gray-100 rounded-md ${isDragging ? 'opacity-50' : ''}`}>
      <div {...attributes} {...listeners} className="cursor-grab text-center text-gray-400 hover:text-gray-600"><HolderOutlined /></div>
      <Form.Item name={[field.name, 'contactId']} className="mb-0"><Input placeholder="人物ID" /></Form.Item>
      <Form.Item name={[field.name, 'name']} className="mb-0" rules={[{ required: true, message: '请输入姓名' }]}><Input placeholder="姓名" /></Form.Item>
      <Form.Item name={[field.name, 'remark']} className="mb-0"><Input placeholder="备注" /></Form.Item>
      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
    </div>
  );
}

// --- 统一导出的标题组件 ---
export function SidebarTitle({ mode }) {
  if (mode === 'topics') {
    return (
      <span className="font-bold text-gray-700 flex items-center gap-2">
        <ApartmentOutlined className="text-indigo-500" /> 主题分类
      </span>
    );
  }
  return (
    <span className="font-bold text-gray-700 flex items-center gap-2">
      <TagsOutlined className="text-blue-500" /> 标签
    </span>
  );
}

// --- 统一导出的功能操作组件 ---
export function SidebarExtra({ mode, selectedTagPath, setSelectedTagPath, onManageTags, onManageTopics }) {
  if (mode === 'topics') {
    return (
      <Button type="text" size="small" icon={<SettingOutlined />} onClick={onManageTopics}>管理主题</Button>
    );
  }
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button icon={<SettingOutlined />} type="text" size="small" onClick={onManageTags} title="管理标签">管理标签</Button>
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
        <Button type="default" size="small" icon={<ClearOutlined />} onClick={() => setSelectedTagPath(null)} disabled={!selectedTagPath} />
      </Tooltip>
    </div>
  );
}

const Sidebar = forwardRef(function Sidebar({
  mode, // 'tags' 或 'topics'
  hideHeader = false,
  // 标签相关属性
  processedTagTree = [], selectedTagPath, setSelectedTagPath, onManageTags,
  // 主题相关属性
  topics = [], setTopics, selectedTopicId, setSelectedTopicId, onSaveTopic, onDeleteTopic
}, ref) {
  const [form] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState(null);
  const [saving, setSaving] = useState(false);
  const [managedTopics, setManagedTopics] = useState([]);

  useEffect(() => { setManagedTopics(topics); }, [topics]);

  const handleOpenManage = () => { setManagedTopics(topics); setManageModalOpen(true); };
  
  // 仅暴露单个统一的弹窗管理入口
  useImperativeHandle(ref, () => ({ openManageModal: handleOpenManage }));

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

  const handleSaveOrder = async () => {
    const isChanged = topics.map(t => t.id).join(',') !== managedTopics.map(t => t.id).join(',');
    try {
      if (isChanged) {
        await topicApi.updateOrder(managedTopics.map(t => t.id));
        setTopics(managedTopics); 
      }
      setManageModalOpen(false);
    } catch (err) { console.error(err); }
  };

  const handleTopicDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setManagedTopics(arrayMove(managedTopics, managedTopics.findIndex(t => t.id === active.id), managedTopics.findIndex(t => t.id === over.id)));
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await onSaveTopic(editingTopic?.id, {
        name: values.name,
        color: typeof values.color === 'object' ? values.color.toHexString() : values.color,
        members: (values.members || []).map(m => ({ contactId: m.contactId || '', name: m.name || '', remark: m.remark || '' }))
      });
      setModalOpen(false);
    } catch (err) { console.log(err); } finally { setSaving(false); }
  };

  return (
    <div className="w-full h-full bg-white flex flex-col">
      {!hideHeader && (
        <div className="flex items-center justify-between p-4 pb-2 border-b border-gray-100">
          <SidebarTitle mode={mode} />
          <SidebarExtra mode={mode} selectedTagPath={selectedTagPath} setSelectedTagPath={setSelectedTagPath} onManageTags={onManageTags} onManageTopics={handleOpenManage} />
        </div>
      )}

      <div className="flex-1 p-2 min-h-0 overflow-y-auto">
        {mode === 'topics' ? (
          topics.length > 0 ? (
            <div className="space-y-2">
              {topics.map(topic => {
                const active = selectedTopicId === topic.id;
                const baseColor = topic.color || '#6366f1';
                return (
                  <div key={topic.id} onClick={() => setSelectedTopicId(topic.id)} style={active ? { backgroundColor: `${baseColor}26`, borderColor: baseColor } : { backgroundColor: `${baseColor}0d`, borderColor: 'transparent' }}
                    className={`group border rounded-lg px-3 py-2.5 cursor-pointer transition-all ${active ? 'border font-medium shadow-sm' : 'hover:border-gray-200'}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: baseColor }} />
                      <div className="flex-1 min-w-0"><div className="text-sm text-gray-800 truncate">{topic.name}</div></div>
                      <div className="text-xs text-gray-400 bg-white/60 px-1.5 py-0.5 rounded-full border border-gray-100">{topic.members?.length || 0} 人</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <Empty className="py-10" description="暂无主题" />
        ) : (
          processedTagTree.length > 0 ? (
            <Tree
              showLine={{ showLeafIcon: true }}
              defaultExpandParent
              className="text-sm"
              treeData={[
                {
                  title: <span className="font-medium text-gray-800">全部</span>,
                  key: '__ALL_RECORDS__', // 定义一个特殊的虚拟根 Key
                  children: processedTagTree // 将原有的标签树整体作为它的子节点
                }
              ]}
              // 2. 默认展开这个新加的根节点
              defaultExpandedKeys={['__ALL_RECORDS__']}
              // 3. 处理高亮：如果 selectedTagPath 为空（即代表全部），则高亮这个根节点
              selectedKeys={
                !selectedTagPath 
                  ? ['__ALL_RECORDS__'] 
                  : (selectedTagPath !== '__NO_TAGS__' ? [selectedTagPath] : [])
              }
              // 4. 点击事件拦截处理
              onSelect={(keys) => {
                if (keys.length > 0) {
                  const targetKey = keys[0];
                  // 如果点击的是最外层父节点，相当于清空筛选（即查看全部）
                  if (targetKey === '__ALL_RECORDS__') {
                    setSelectedTagPath(null);
                  } else {
                    setSelectedTagPath(targetKey);
                  }
                } else {
                  // 允许点击已选中的节点来取消选择
                  setSelectedTagPath(null);
                }
              }}
            />
          ) : <div className="text-gray-400 text-xs text-center py-8">暂无标签数据</div>
        )}
      </div>

      {/* 主题管理的弹窗集群 */}
      <Modal
        title="管理主题分类"
        open={manageModalOpen}
        onCancel={() => setManageModalOpen(false)}
        width={450}
        footer={[
          <Button key="c" onClick={() => setManageModalOpen(false)}>取消</Button>,
          <Button key="s" type="primary" onClick={handleSaveOrder}>保存排序</Button>
        ]}
        className='select-none'
      >
        <div className="mb-4 flex justify-between items-center">
          <span className="text-xs text-gray-400">💡 拖动左侧手柄可对主题进行上下排序</span>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreateModal}>新增主题</Button>
        </div>
        <div className="max-h-[50vh] overflow-hidden pr-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTopicDragEnd}>
            <SortableContext items={managedTopics.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {managedTopics.map(t => <SortableTopicItem key={t.id} topic={t} onEdit={openEditModal} onDelete={onDeleteTopic} />)}
            </SortableContext>
          </DndContext>
        </div>
      </Modal>

      <Modal
        title={editingTopic ? '编辑主题详情' : '创建新主题'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)} cancelText="取消"
        onOk={handleSubmit} okText="保存"
        confirmLoading={saving}
        width={720}
        destroyOnHidden
        className='select-none'
      >
        <Form form={form} layout="vertical" className="pt-4">
          <div className="grid grid-cols-[1fr_200px] gap-4">
            <Form.Item name="name" label="主题名称" rules={[{ required: true, message: '请输入主题名称' }]}>
              <Input placeholder="" />
            </Form.Item>
            <Form.Item name="color" label="主题底色" rules={[{ required: true }]}>
              <ColorPicker defaultValue="#ffffff" showText className='w-full' />
            </Form.Item>
          </div>
          <Form.List name="members">
            {(fields, { add, remove, move }) => (
              <div>
                <div className="flex items-center justify-between mb-2 pb-1">
                  <span className="text-sm font-medium text-gray-700">主题成员配置</span>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => add({ contactId: '', name: '', remark: '' })}>添加成员</Button>
                </div>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => {
                      if (e.over && e.active.id !== e.over.id) move(fields.findIndex(f => f.key === e.active.id), fields.findIndex(f => f.key === e.over.id))
                    }}>
                    <SortableContext items={fields.map(f => f.key)} strategy={verticalListSortingStrategy}>
                      {fields.map(field => <SortableMemberItem key={field.key} field={field} remove={remove} />)}
                    </SortableContext>
                  </DndContext>
                </div>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
});

export default Sidebar;