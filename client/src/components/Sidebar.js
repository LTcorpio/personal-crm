import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Tree, Button, Tooltip, ColorPicker, Empty, Form, Input, Modal, Popconfirm, AutoComplete } from 'antd';
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

function SortableMemberItem({ field, remove, contacts, form }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });
  
  // 1. 建立联想下拉菜单的候选数据（注入唯一后缀，解决冲突核心）
  const autoCompleteOptions = React.useMemo(() => {
    return contacts.map(c => ({
      // 将 value 拼接上 ID 确保全局唯一，彻底防止 AntD 内部 Key 覆盖引发的 Bug
      value: `${c.name} #ID:${c.id}`,
      id: String(c.id),
      realName: c.name, // 留存一份纯净的名字供后续回填
      label: (
        <div className="flex justify-between items-center w-full">
          <span className="font-medium text-gray-700">{c.name}</span>
          <span className="text-gray-400 font-mono text-xs">ID: {c.id}</span>
        </div>
      )
    }));
  }, [contacts]);

  // 2. 当用户从下拉列表中显式选择某人时触发
  const handleSelect = (value, option) => {
    form.setFieldValue(['members', field.name, 'contactId'], option.id);
    form.setFieldValue(['members', field.name, 'name'], option.realName); // 强行将输入框改回纯净名字，不把后缀露给用户
  };

  // 3. 当用户打字、清空或选择导致输入框变更时触发
  const handleChange = (value) => {
    // 如果带有唯一标识后缀，说明是由点击下拉菜单触发的二次变更，直接解析并同步表单
    if (value && value.includes(' #ID:')) {
      const [realName, contactId] = value.split(' #ID:');
      form.setFieldValue(['members', field.name, 'contactId'], contactId);
      form.setFieldValue(['members', field.name, 'name'], realName);
      return;
    }

    // 允许强健的边缘操作：如果手打的纯文本恰好完美卡中某人的名字，帮他自动锁上第一个匹配的 ID
    const exactMatch = contacts.find(c => c.name === value);
    form.setFieldValue(['members', field.name, 'contactId'], exactMatch ? String(exactMatch.id) : '');
  };

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 999 : 'auto' }}
      // grid-cols 分别修改各个组件的宽度
      className={`grid grid-cols-[32px_90px_minmax(0,0.8fr)_minmax(0,1fr)_32px] gap-2 items-center bg-gray-50/50 p-2 border border-gray-100 rounded-md ${isDragging ? 'opacity-50' : ''}`}>
      <div {...attributes} {...listeners} className="cursor-grab text-center text-gray-400 hover:text-gray-600"><HolderOutlined /></div>

      {/* 隐藏的 id 字段，确保提交时保留原记录的物理主键 */}
      <Form.Item name={[field.name, 'id']} noStyle>
        <Input type="hidden" />
      </Form.Item>
      
      {/* 人物 ID 显示框 */}
      <Form.Item name={[field.name, 'contactId']} className="mb-0">
        <Input placeholder="未匹配" disabled className="text-center bg-gray-100/80 text-gray-400 font-mono text-xs border-dashed" />
      </Form.Item>

      {/* 名字输入框重塑为过滤逻辑修正后的 AutoComplete */}
      <Form.Item name={[field.name, 'name']} className="mb-0" rules={[{ required: true, message: '请输入姓名' }]}>
        <AutoComplete
          options={autoCompleteOptions}
          onSelect={handleSelect}
          onChange={handleChange}
          placeholder="输入名字或下拉选择"
          // 注意：过滤时要拿纯净的 realName 进行比对，避免带有 #ID 后缀干扰用户的正常输入检索
          filterOption={(inputValue, option) =>
            option.realName.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
          }
        />
      </Form.Item>
      
      <Form.Item name={[field.name, 'remark']} className="mb-0"><Input placeholder="备注" /></Form.Item>
      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
    </div>
  );
}

// --- 统一导出的标题组件 ---
export function SidebarTitle({ mode }) {
  // min-h-6（24px）与右侧 size="small" 按钮等高，保证「有无按钮」时标题行高度一致
  if (mode === 'topics') {
    return (
      <span className="font-bold text-gray-700 flex items-center gap-2 min-h-6">
        <ApartmentOutlined className="text-indigo-500" /> 主题分类
      </span>
    );
  }
  return (
    <span className="font-bold text-gray-700 flex items-center gap-2 min-h-6">
      <TagsOutlined className="text-blue-500" /> 标签
    </span>
  );
}

// --- 统一导出的功能操作组件 ---
// 只读模式下，编辑类按钮（管理标签/管理主题）直接隐藏，仅保留筛选类按钮
export function SidebarExtra({ mode, selectedTagPath, setSelectedTagPath, onManageTags, onManageTopics, editMode = true }) {
  if (mode === 'topics') {
    // 只读模式下隐藏「管理主题」按钮
    if (!editMode) return null;
    return (
      <Button type="text" size="small" icon={<SettingOutlined />} onClick={onManageTopics} title="管理主题">管理主题</Button>
    );
  }
  return (
    <div className="flex items-center gap-1 shrink-0">
      {/* 只读模式下隐藏「管理标签」按钮 */}
      {editMode && (
        <Button icon={<SettingOutlined />} type="text" size="small" onClick={onManageTags} title="管理标签">管理标签</Button>
      )}
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
  contacts = [],
  // 标签相关属性
  processedTagTree = [], selectedTagPath, setSelectedTagPath, onManageTags,
  // 主题相关属性
  topics = [], setTopics, selectedTopicId, setSelectedTopicId, onSaveTopic, onDeleteTopic,
  // 编辑模式开关
  editMode = true
}, ref) {
  const [form] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState(null);
  const [saving, setSaving] = useState(false);
  const [managedTopics, setManagedTopics] = useState([]);

  useEffect(() => { setManagedTopics(topics); }, [topics]);

  // 只读模式开启时，强制关闭所有主题管理/编辑弹窗，避免残留可操作界面
  useEffect(() => {
    if (!editMode) {
      setManageModalOpen(false);
      setModalOpen(false);
    }
  }, [editMode]);

  const handleOpenManage = () => {
    if (!editMode) return; // 只读模式下禁止唤起主题管理弹窗
    setManagedTopics(topics);
    setManageModalOpen(true);
  };
  
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
        members: (values.members || []).map(m => ({ 
          id: m.id || null, 
          contactId: m.contactId || '', 
          name: m.name || '', 
          remark: m.remark || '' 
        }))
      });
      setModalOpen(false);
    } catch (err) { console.log(err); } finally { setSaving(false); }
  };

  return (
    <div className="w-full h-full bg-white flex flex-col">
      {!hideHeader && (
        <div className="flex items-center justify-between p-4 pb-2 border-b border-gray-100 min-h-[48px]">
          {/* min-h-[48px] = 上下内边距 24px + 内容行 24px（对齐 size="small" 按钮的 24px 高度）：
              锁定标题行高度，使只读模式隐藏右侧按钮时容器高度与编辑模式完全一致，切换不再跳动 */}
          <SidebarTitle mode={mode} />
          <SidebarExtra mode={mode} selectedTagPath={selectedTagPath} setSelectedTagPath={setSelectedTagPath} onManageTags={onManageTags} onManageTopics={handleOpenManage} editMode={editMode} />
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
                    {/* min-h-[22px]：与「N 人」徽标、编辑按钮等高，保证编辑/只读两种模式下主题项高度完全一致 */}
                    <div className="flex items-center gap-2 min-h-[22px]">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: baseColor }} />
                      <div className="flex-1 min-w-0"><div className="text-sm text-gray-800 truncate">{topic.name}</div></div>
                      <div className="text-xs text-gray-400 bg-white/60 px-1.5 py-0.5 rounded-full border border-gray-100 shrink-0">{topic.members?.length || 0} 人</div>
                      {/* 编辑模式：常驻编辑入口，直接进入该主题的编辑弹窗（删除仍只在「管理主题」里操作）。
                          按钮强制压到 22px，避免撑高主题项；stopPropagation 防止顺带触发「点击 = 筛选该主题」 */}
                      {editMode && (
                        <Tooltip title="编辑该主题">
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined style={{ color: '#9ca3af' }} />}
                            className="!h-[22px] !w-[22px] !min-w-0 !p-0 shrink-0"
                            onClick={(e) => { e.stopPropagation(); openEditModal(topic); }}
                          />
                        </Tooltip>
                      )}
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
        className=''
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
        className=''
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
                      {fields.map(field => (
                        <SortableMemberItem 
                          key={field.key} 
                          field={field} 
                          remove={remove} 
                          contacts={contacts} // 👈 传进去用来解析联想列表
                          form={form}         // 👈 传进去用于动态修改对应的联动的字段
                        />
                      ))}
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