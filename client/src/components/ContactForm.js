import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, Radio, Button, Popconfirm, Tag } from 'antd';
import { MinusCircleOutlined, PlusOutlined, HolderOutlined } from '@ant-design/icons';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function DragRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 9999 : 'auto',
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-center mb-2 bg-purple-50/50 p-2 rounded">
      {/* 拖拽把手 */}
      <div {...attributes} {...listeners} className="cursor-grab pr-1 pt-6 text-gray-400 hover:text-gray-600">
        <HolderOutlined />
      </div>
      {children}
    </div>
  );
}

const commonStyle = {
  cursor: 'move',
  transition: 'unset', // Prevent element from shaking after drag
};

function DragTag({ id, text, onRemove, onEdit }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(text);

  const style = transform
    ? {
        ...commonStyle,
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        transition: isDragging ? 'unset' : transition, // Improve performance/visual effect when dragging
      }
    : commonStyle;

  const handleEditConfirm = () => {
    if (editValue.trim() && editValue !== text) {
      onEdit(text, editValue.trim()); // 触发父组件的修改回调
    } else {
      setEditValue(text); // 如果为空或者没变，恢复原值
    }
    setIsEditing(false);
  };

  return (
    <div ref={setNodeRef} style={{...style, cursor: 'default'}} {...attributes} className="select-none">
      {isEditing ? (
        <Input
          size="small"
          className="w-48 h-[22px] text-xs px-1"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleEditConfirm}
          onPressEnter={handleEditConfirm}
          autoFocus
        />
      ) : (
        <Tag closable onClose={onRemove} color="purple" className="mr-0 inline-flex items-center gap-1">
          <span {...listeners} className="cursor-grab flex items-center pr-0.5 active:cursor-grabbing">
            <HolderOutlined />
          </span>
          <span 
            className="cursor-edit hover:text-purple-700 font-medium" 
            title="点击修改文本"
            onClick={(e) => {
              e.stopPropagation(); // 阻止冒泡
              setIsEditing(true);
            }}
          >
            {text}
          </span>
        </Tag>
      )}
    </div>
  );
}

function EditableTagGroup({ value = [], onChange }) {
  const [inputValue, setInputValue] = React.useState('');
  const [inputVisible, setInputVisible] = React.useState(false);

  // 处理拖拽结束排序（左右拖拽）
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = value.indexOf(active.id);
      const newIndex = value.indexOf(over.id);
      const newValue = arrayMove(value, oldIndex, newIndex);
      onChange?.(newValue);
    }
  };

  // 移除 Tag
  const handleRemove = (removedTag) => {
    const newValue = value.filter((tag) => tag !== removedTag);
    onChange?.(newValue);
  };

  const handleEdit = (oldTag, newTag) => {
    // 如果新名字已经在数组里存在了，就不做修改（防止重复）
    if (value.includes(newTag)) return;
    
    const newValue = value.map((tag) => (tag === oldTag ? newTag : tag));
    onChange?.([...newValue]);
  };

  // 确认新增 Tag
  const handleInputConfirm = () => {
    if (inputValue && !value.includes(inputValue)) {
      const newValue = [...value, inputValue];
      onChange?.(newValue);
    }
    setInputValue('');
    setInputVisible(false);
  };

  return (
    <div className="flex flex-wrap gap-y-2 gap-x-1 items-center border border-gray-300 p-1.5 rounded-md min-h-[32px] bg-white">
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={value} strategy={horizontalListSortingStrategy}>
          {value.map((tag) => (
            <DragTag 
              key={tag} 
              id={tag} 
              text={tag} 
              onRemove={() => handleRemove(tag)} 
              onEdit={handleEdit} // 传入修改回调
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* 新增 Tag 的输入控制 */}
      {inputVisible ? (
        <Input
          type="text"
          size="small"
          className="w-48"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleInputConfirm}
          onPressEnter={handleInputConfirm}
          autoFocus
        />
      ) : (
        <Tag onClick={() => setInputVisible(true)} className="border-dashed bg-gray-50 cursor-pointer">
          <PlusOutlined /> 新增
        </Tag>
      )}
    </div>
  );
}

export default function ContactForm({ visible, contact, onCancel, onSave, onDelete }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (visible) {
      if (contact) {
        form.setFieldsValue(contact);
      } else {
        form.resetFields();
      }
    }
  }, [visible, contact, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      onSave({ ...contact, ...values });
    } catch (info) {
      console.log('表单校验失败:', info);
    }
  };

  const renderFooter = () => {
    const buttons = [
      <Button key="back" onClick={onCancel}>
        取消
      </Button>,
      <Button key="submit" type="primary" onClick={handleSubmit}>
        确定
      </Button>
    ];

    // 如果是编辑模式（contact存在），在最左侧追加气泡确认删除按钮
    if (contact && onDelete) {
      buttons.unshift(
        <Popconfirm
          key="delete"
          title="确认彻底删除这位联系人吗？"
          description="删除后关联的外键将被同步清理。"
          onConfirm={() => {
            onDelete(contact.id);
            onCancel(); // 删除后顺便关闭弹窗
          }}
          okText="确认"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button type="primary" danger className="float-left">
            删除联系人
          </Button>
        </Popconfirm>
      );
    }

    return buttons;
  };

  const handleDragEnd = (event, move) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = active.id;
      const newIndex = over.id;
      
      // 使用 Form.List 提供的 move 方法移动表单项数据位置
      move(oldIndex, newIndex);
    }
  };

  const renderTitle = () => {
    if (contact) {
      return (
        <div className="flex items-center gap-2">
          <span>编辑人员信息</span>
          <Tag color="blue" className="font-mono cursor-pointer" title="点击可复制 ID">
            {/* 前缀设为不可选中 */}
            <span className="select-none">ID: </span>
            {/* 只有具体的 ID 文本可以被双击选中 */}
            <span className="select-all">{contact.id}</span>
          </Tag>
        </div>
      );
    }
    return "添加新人员";
  };

  return (
    <Modal
      title={renderTitle()}
      open={visible}
      onCancel={onCancel}
      footer={renderFooter()}
      width={1080}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" name="contact_form" initialValues={{ gender: 1 }}>
        <div className="grid grid-cols-5 gap-4">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}><Input /></Form.Item>
          <Form.Item name="gender" label="性别"><Radio.Group><Radio value={1}>男</Radio><Radio value={0}>女</Radio></Radio.Group></Form.Item>
          <Form.Item name="ethnicity" label="民族"><Input placeholder="汉" defaultValue={"汉"} /></Form.Item>
          <Form.Item name="native_place" label="籍贯"><Input placeholder="如：浙江绍兴" /></Form.Item>
          <Form.Item name="title" label="称呼"><Input placeholder='花名 / 尊称 等' /></Form.Item>
          
        </div>
        
        <div className="grid grid-cols-4 gap-4">
          <Form.Item name="birthday_solar" label="阳历生日"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="birthday_lunar" label="农历生日"><Input placeholder="如：己卯年冬月廿五" /></Form.Item>
          <Form.Item name="deathday" label="阳历死亡日期"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="id_card" label="身份证号码"><Input /></Form.Item>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Form.Item name="location" label="所在地区"><Input placeholder="浙江省杭州市上城区" /></Form.Item>
          <Form.Item name="address" label="详细住址"><Input placeholder="XX街道XX小区XX号" /></Form.Item>
          <Form.Item name="face_uuid" label="Immich Face UUID"><Input placeholder="请输入 Immich 中绑定的人脸 UUID" /></Form.Item>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Form.Item name="tag" label="标签">
            <EditableTagGroup />
          </Form.Item>
          <Form.Item name="former_name" label="曾用名">
            <EditableTagGroup />
          </Form.Item>
        </div>

        <h4 className="font-bold my-2 text-gray-700">联系方式</h4>
        <div className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg">
          <Form.Item name={['contact', 'tel']} label="电话" className="mb-0"><Input /></Form.Item>
          <Form.Item name={['contact', 'email']} label="邮箱" className="mb-0"><Input /></Form.Item>
          <Form.Item name={['contact', 'wechat']} label="微信" className="mb-0"><Input /></Form.Item>
          <Form.Item name={['contact', 'qq']} label="QQ" className="mb-0"><Input /></Form.Item>
          <Form.Item name={['contact', 'tiktok']} label="抖音" className="mb-0"><Input /></Form.Item>
        </div>

        <h4 className="font-bold my-2 text-gray-700 mt-4">关联人</h4>
        <Form.List name="related">
          {(fields, { add, remove, move }) => (
            <DndContext 
              collisionDetection={closestCenter} 
              onDragEnd={(event) => handleDragEnd(event, move)}
            >
              <SortableContext 
                items={fields.map((_, index) => index)} 
                strategy={verticalListSortingStrategy}
              >
                {fields.map(({ key, name, ...restField }, index) => (
                  <DragRow key={key} id={index}>
                    <Form.Item {...restField} name={[name, 'id']} label="系统ID" className="mb-0 flex-1"><Input placeholder="可选录入系统内的ID" /></Form.Item>
                    <Form.Item {...restField} name={[name, 'name']} label="姓名" rules={[{ required: true, message: '必填' }]} className="mb-0 flex-1"><Input /></Form.Item>
                    <Form.Item {...restField} name={[name, 'relation']} label="关系" rules={[{ required: true, message: '必填' }]} className="mb-0 flex-1"><Input placeholder="如：父亲" /></Form.Item>
                    <Form.Item {...restField} name={[name, 'remark']} label="备注" className="mb-0 flex-1"><Input /></Form.Item>
                    <MinusCircleOutlined className="text-red-500 pt-6" onClick={() => remove(name)} />
                  </DragRow>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} className="mt-2">新增关联关系</Button>
              </SortableContext>
            </DndContext>
          )}
        </Form.List>

        <Form.Item name="extra" label="扩展信息" className="mt-4"><Input.TextArea rows={6} placeholder="# 教育经历&#10;- XX大学 计算机科学&#10;# 工作经历&#10;- XX公司 架构师" /></Form.Item>
        <Form.Item name="remark" label="系统备注"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  );
}