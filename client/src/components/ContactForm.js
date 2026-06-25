import React, { useEffect } from 'react';
import { Modal, Form, Input, Radio, Button, Popconfirm, Tag, Cascader, Avatar } from 'antd';
import { MinusCircleOutlined, PlusOutlined, HolderOutlined, UserOutlined, EditOutlined } from '@ant-design/icons';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { contactApi } from '../api/crmApi';

function DragRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 9999 : 'auto',
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-start sm:items-center mb-2 bg-purple-50/50 p-2 rounded w-full">
      {/* 拖拽把手 */}
      <div {...attributes} {...listeners} className="cursor-grab pr-1 pt-2 sm:pt-6 text-gray-400 hover:text-gray-600 active:cursor-grabbing">
        <HolderOutlined />
      </div>
      {children}
    </div>
  );
}

const commonStyle = {
  cursor: 'move',
  transition: 'unset',
};

function DragTag({ id, text, onRemove, onEdit, tagTree }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(text);
  const [tempCascaderValue, setTempCascaderValue] = React.useState([]);
  const [searchValue, setSearchValue] = React.useState('');

  React.useEffect(() => {
    setEditValue(text);
  }, [text]);

  const style = transform
    ? {
        ...commonStyle,
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        transition: isDragging ? 'unset' : transition,
      }
    : commonStyle;

  const handleEditConfirm = () => {
    if (editValue.trim() && editValue !== text) {
      onEdit(text, editValue.trim());
    } else {
      setEditValue(text);
    }
    setIsEditing(false);
  };

  return (
    <div ref={setNodeRef} style={{...style, cursor: 'default'}} {...attributes} className="select-none">
      {isEditing ? (
        tagTree && tagTree.length > 0 ? (
          <Cascader
            options={tagTree}
            expandTrigger="hover"
            fieldNames={{ label: 'name', value: 'name', children: 'children' }}
            changeOnSelect
            size="small"
            className="w-48"
            placeholder="选择标签"
            value={tempCascaderValue}
            defaultValue={text.split('/')}
            open={isEditing}
            showSearch={{
              filter: (inputValue, path) => path.some(option => option.name.toLowerCase().indexOf(inputValue.toLowerCase()) > -1)
            }}
            onDropdownVisibleChange={(open) => {
              if (!open) {
                if (tempCascaderValue && tempCascaderValue.length > 0) {
                  const newTag = tempCascaderValue.join('/');
                  if (newTag !== text) {
                    onEdit(text, newTag);
                  }
                }
                setIsEditing(false);
              }
            }}
            onChange={(val) => {
              setTempCascaderValue(val || []);
            }}
            onSearch={(val) => setSearchValue(val)}
            notFoundContent={
              searchValue ? (
                <div className="p-1 text-center">
                  <Button
                    type="link"
                    size="small"
                    onMouseDown={(e) => e.preventDefault()} // 阻止失焦导致下拉框提前收起
                    onClick={() => {
                      onEdit(text, searchValue.trim());
                      setTempCascaderValue([]); // 清空，防止触发常规 visibleChange 保存
                      setSearchValue('');
                      setIsEditing(false);
                    }}
                  >
                    改为自定义: "{searchValue}"
                  </Button>
                </div>
              ) : undefined
            }
          />
        ) : (
          <Input
            size="small"
            className="w-48 h-[22px] text-xs px-1"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleEditConfirm}
            onPressEnter={handleEditConfirm}
            autoFocus
          />
        )
      ) : (
        <Tag closable onClose={onRemove} color="purple" className="mr-0 inline-flex items-center gap-1">
          <span {...listeners} className="cursor-grab flex items-center pr-0.5 active:cursor-grabbing">
            <HolderOutlined />
          </span>
          <span 
            className="cursor-edit hover:text-purple-700 font-medium" 
            title="点击修改文本"
            onClick={(e) => {
              e.stopPropagation();
              setTempCascaderValue(text.split('/'));
              setSearchValue('');
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

function EditableTagGroup({ value = [], onChange, tagTree }) {
  const [inputValue, setInputValue] = React.useState('');
  const [inputVisible, setInputVisible] = React.useState(false);
  const [tempCascaderValue, setTempCascaderValue] = React.useState([]);
  const [searchValue, setSearchValue] = React.useState('');

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = value.indexOf(active.id);
      const newIndex = value.indexOf(over.id);
      const newValue = arrayMove(value, oldIndex, newIndex);
      onChange?.(newValue);
    }
  };

  const handleRemove = (removedTag) => {
    const newValue = value.filter((tag) => tag !== removedTag);
    onChange?.(newValue);
  };

  const handleEdit = (oldTag, newTag) => {
    if (value.includes(newTag)) return;
    const newValue = value.map((tag) => (tag === oldTag ? newTag : tag));
    onChange?.([...newValue]);
  };

  // 原文本标签的新增确认逻辑
  const handleInputConfirm = () => {
    if (inputValue && !value.includes(inputValue)) {
      onChange?.([...value, inputValue]);
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
              tagTree={tagTree}
              onRemove={() => handleRemove(tag)} 
              onEdit={handleEdit}
            />
          ))}
        </SortableContext>
      </DndContext>

      {inputVisible ? (
        // 有级联树时用 Cascader，没有时用普通 Input
        tagTree && tagTree.length > 0 ? (
          <Cascader
            options={tagTree}
            expandTrigger="hover"
            fieldNames={{ label: 'name', value: 'name', children: 'children' }}
            changeOnSelect
            placeholder="搜索或选择标签"
            size="small"
            className="w-48"
            open={inputVisible}
            showSearch={{
              filter: (inputValue, path) => path.some(option => option.name.toLowerCase().indexOf(inputValue.toLowerCase()) > -1)
            }}
            onDropdownVisibleChange={(open) => {
              if (!open) setInputVisible(false);
            }}
            onSearch={(val) => setSearchValue(val)} // 实时同步搜索文本
            notFoundContent={
              // 当搜索不到结果时展示自定义添加按钮
              searchValue ? (
                <div className="p-1 text-center">
                  <Button
                    type="link"
                    size="small"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const customTag = searchValue.trim();
                      if (customTag && !value.includes(customTag)) {
                        onChange?.([...value, customTag]);
                      }
                      setTempCascaderValue([]);
                      setSearchValue('');
                      setInputVisible(false);
                    }}
                  >
                    添加为自定义: "{searchValue}"
                  </Button>
                </div>
              ) : undefined
            }
            onChange={(val) => {
              if (val && val.length > 0) {
                const tagString = val.join('/');
                if (!value.includes(tagString)) {
                  onChange?.([...value, tagString]);
                }
              }
              setInputVisible(false);
            }}
          />
        ) : (
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
        )
      ) : (
        <Tag 
          onClick={() => {
            setTempCascaderValue([]);
            setSearchValue('');
            setInputVisible(true);
          }} 
          className="border-dashed bg-gray-50 cursor-pointer"
        >
          <PlusOutlined /> 新增
        </Tag>
      )}
    </div>
  );
}

export default function ContactForm({ visible, contact, tagTree = [], onCancel, onSave, onDelete }) {
  const [form] = Form.useForm();
  
  const faceUuid = Form.useWatch('face_uuid', form);
  const genderWatch = Form.useWatch('gender', form);
  const [uuidModalVisible, setUuidModalVisible] = React.useState(false);
  const [tempUuid, setTempUuid] = React.useState('');
  const [avatarUrl, setAvatarUrl] = React.useState(null);

  useEffect(() => {
    if (visible) {
      if (contact) {
        form.setFieldsValue(contact);
      } else {
        form.resetFields();
      }
    }
  }, [visible, contact, form]);

  useEffect(() => {
    if (!faceUuid) {
      setAvatarUrl(null);
      return;
    }

    let currentUrl = null;

    contactApi.getAvatar(faceUuid)
      .then((res) => {
        // res.data 此时是一个 Blob 对象
        currentUrl = URL.createObjectURL(res.data);
        setAvatarUrl(currentUrl);
      })
      .catch((err) => {
        console.error('获取头像失败:', err);
        setAvatarUrl(null);
      });

    // 清理函数：组件卸载或 uuid 改变时释放内存，防止内存泄漏
    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [faceUuid]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      onSave({ ...contact, ...values });
    } catch (info) {
      console.log('表单校验失败:', info);
    }
  };

  const openUuidEdit = () => {
    setTempUuid(faceUuid || '');
    setUuidModalVisible(true);
  };

  const saveUuid = () => {
    form.setFieldsValue({ face_uuid: tempUuid.trim() });
    setUuidModalVisible(false);
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

    if (contact && onDelete) {
      buttons.unshift(
        <Popconfirm
          key="delete"
          title="确认彻底删除这位联系人吗？"
          description="删除后关联的外键将被同步清理。"
          onConfirm={() => {
            onDelete(contact.id);
            onCancel();
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
      move(active.id, over.id);
    }
  };

  const renderTitle = () => {
    if (contact) {
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <span>编辑人员信息</span>
          <Tag color="blue" className="font-mono cursor-pointer" title="点击可复制 ID">
            <span className="select-none">ID: </span>
            <span className="select-all">{contact.id}</span>
          </Tag>
        </div>
      );
    }
    return "添加新人员";
  };

  return (
    <>
      <Modal
        title={renderTitle()}
        open={visible}
        onCancel={onCancel}
        footer={renderFooter()}
        width={1080}
        destroyOnHidden
        className="select-none"
      >
        <Form form={form} layout="vertical" name="contact_form" initialValues={{ gender: 1 }}>
          
          {/* 隐藏表单项，确保存储及提交时能拿到真实的 face_uuid */}
          <Form.Item name="face_uuid" noStyle>
            <Input type="hidden" />
          </Form.Item>

          {/* 头像 + 基础数据混合行：移动端自适应垂直堆叠 */}
          <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-stretch md:items-start mb-4">
            
            {/* 左侧/上方：核心头像与姓名性别交互区 */}
            {/* 移动端 flex-row（左头像右信息），桌面端 md:flex-col（上头像下信息） */}
            <div className="flex flex-row md:flex-col items-center gap-4 md:gap-3 w-full md:w-48 border-b md:border-b-0 md:border-r border-gray-100 pb-4 md:pb-0 md:pr-4 shrink-0">
              
              {/* 头像：移动端稍缩小至 20(80px) 更精致，桌面端保持 28(112px) */}
              <div 
                onClick={openUuidEdit}
                className="relative w-20 h-20 md:w-28 md:h-28 rounded-full overflow-hidden border-2 border-purple-100 hover:border-purple-400 cursor-pointer group shadow-sm bg-gray-50 flex items-center justify-center transition-all shrink-0"
                title="点击配置人脸 UUID"
              >
                {avatarUrl ? (
                  <img 
                    src={avatarUrl} 
                    alt="Face Avatar" 
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : null}
                <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-gray-100/50 -z-10">
                  <UserOutlined className="text-2xl md:text-3xl" />
                </div>
                {/* Hover 遮罩层 */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-xs font-medium transition-opacity gap-1">
                  <EditOutlined className="text-base" />
                  <span>修改头像</span>
                </div>
              </div>

              {/* 姓名与性别包裹容器：移动端撑满右侧，桌面端居中对齐 */}
              <div className="flex-1 md:w-full flex flex-col items-stretch md:items-center gap-1.5">
                {/* {faceUuid && (
                  <span className="text-[10px] text-gray-400 font-mono max-w-[120px] truncate text-left md:text-center block" title={faceUuid}>
                    {faceUuid}
                  </span>
                )} */}

                <Form.Item name="name" rules={[{ required: true, message: '请输入姓名' }]} className="w-full mb-1">
                  <Input placeholder="姓名" className="text-left md:text-center font-bold text-xl" />
                </Form.Item>

                <Form.Item name="gender" className="w-full mb-0">
                  <Radio.Group className="w-full flex gap-2">
                    <Radio.Button 
                      value={1} 
                      className={`flex-1 text-center transition-all ${
                        genderWatch === 1 
                          ? '!bg-blue-500 !border-blue-500 !text-white hover:!text-white' 
                          : 'hover:!text-blue-500 hover:!border-blue-500'
                      }`}
                    >
                      ♂ 男
                    </Radio.Button>
                    <Radio.Button 
                      value={0} 
                      className={`flex-1 text-center transition-all ${
                        genderWatch === 0 
                          ? '!bg-pink-500 !border-pink-500 !text-white hover:!text-white' 
                          : 'hover:!text-pink-500 hover:!border-pink-500'
                      }`}
                    >
                      ♀ 女
                    </Radio.Button>
                  </Radio.Group>
                </Form.Item>
              </div>
            </div>

            {/* 右侧：其余基础字段格（全部并入此处，移动端前后间距紧凑） */}
            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-2 pt-2 md:pt-0">
              <Form.Item name="ethnicity" label="民族" className="mb-0"><Input placeholder="汉" defaultValue={"汉"} /></Form.Item>
              <Form.Item name="native_place" label="籍贯" className="mb-0"><Input placeholder="如：浙江绍兴" /></Form.Item>
              <Form.Item name="id_card" label="身份证号码" className="mb-0"><Input /></Form.Item>
              <Form.Item name="title" label="称呼" className="mb-0"><Input placeholder='花名 / 尊称 等' /></Form.Item>

              <Form.Item name="birthday_solar" label="阳历生日" className="mb-0"><Input placeholder="YYYY-MM-DD" /></Form.Item>
              <Form.Item name="birthday_lunar" label="农历生日" className="mb-0"><Input placeholder="如：己卯年冬月廿五" /></Form.Item>
              <Form.Item name="deathday" label="阳历死亡日期" className="mb-0"><Input placeholder="YYYY-MM-DD" /></Form.Item>
              
              <Form.Item name="location" label="所在地区" className="mb-0 sm:col-span-1 lg:col-span-1 xl:col-span-2"><Input placeholder="浙江省杭州市上城区" /></Form.Item>
              <Form.Item name="address" label="详细住址" className="mb-0 sm:col-span-1 lg:col-span-1 xl:col-span-2"><Input placeholder="XX街道XX小区XX号" /></Form.Item>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-4">
            <Form.Item name="tag" label="标签" className="flex-1 mb-0">
              <EditableTagGroup tagTree={tagTree} />
            </Form.Item>
            <Form.Item name="former_name" label="曾用名" className="flex-1 mb-0">
              <EditableTagGroup />
            </Form.Item>
          </div>
          
          <h4 className="font-bold my-2 text-gray-700">联系方式</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 bg-gray-50 p-3 rounded-lg">
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
                      {/* 内嵌表单项转换为响应式网格 */}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 w-full">
                        <Form.Item {...restField} name={[name, 'id']} label="系统ID" className="mb-0"><Input placeholder="可选录入系统内的ID" /></Form.Item>
                        <Form.Item {...restField} name={[name, 'name']} label="姓名" rules={[{ required: true, message: '必填' }]} className="mb-0"><Input /></Form.Item>
                        <Form.Item {...restField} name={[name, 'relation']} label="关系" rules={[{ required: true, message: '必填' }]} className="mb-0"><Input placeholder="如：父亲" /></Form.Item>
                        <Form.Item {...restField} name={[name, 'remark']} label="备注" className="mb-0"><Input /></Form.Item>
                      </div>
                      <MinusCircleOutlined className="text-red-500 pt-2 sm:pt-6 text-lg cursor-pointer self-center sm:self-auto" onClick={() => remove(name)} />
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

      {/* 独立轻量级头像设置小弹窗 */}
      <Modal
        title="设置人员人脸 UUID"
        open={uuidModalVisible}
        onOk={saveUuid}
        onCancel={() => setUuidModalVisible(false)}
        width={400}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <div className="pt-2 pb-4">
          <p className="text-xs text-gray-400 mb-2">人脸数据与 Immich 系统深度绑定，只支持从 Immich 导入，如需新增人脸请先在 Immich 创建。</p>
          <Input 
            placeholder="" 
            value={tempUuid}
            onChange={(e) => setTempUuid(e.target.value)}
            allowClear
          />
        </div>
      </Modal>
    </>
  );
}