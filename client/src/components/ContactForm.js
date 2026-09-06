import React, { useEffect } from 'react';
import { Modal, Form, Input, Radio, Button, Popconfirm, Tag, Cascader, Popover, Select, AutoComplete } from 'antd';
import { MinusCircleOutlined, PlusOutlined, HolderOutlined, UserOutlined, EditOutlined } from '@ant-design/icons';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { contactApi } from '../api/crmApi';

const commonStyle = {
  cursor: 'move',
  transition: 'unset',
};

// 关联人编辑行：姓名输入框重塑为 AutoComplete，下拉选择时自动回填系统ID
function RelatedRow({ field, remove, contacts, form, duplicateIds }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });

  // 监听本行的系统ID，用于判断是否与其它行重复
  const rowId = Form.useWatch(['related', field.name, 'id'], form);
  const isDuplicate = rowId && duplicateIds && duplicateIds.has(String(rowId));

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

  // 2. 当用户从下拉列表中显式选择某人时触发：此时才锁定 ID
  const handleSelect = (value, option) => {
    form.setFieldValue(['related', field.name, 'id'], option.id);
    form.setFieldValue(['related', field.name, 'name'], option.realName); // 强行将输入框改回纯净名字，不把后缀露给用户
  };

  // 3. 当用户打字、清空或选择导致输入框变更时触发
  const handleChange = (value) => {
    // 如果带有唯一标识后缀，说明是由点击下拉菜单触发的二次变更，直接解析并同步表单
    if (value && value.includes(' #ID:')) {
      const [realName, contactId] = value.split(' #ID:');
      form.setFieldValue(['related', field.name, 'id'], contactId);
      form.setFieldValue(['related', field.name, 'name'], realName);
      return;
    }

    // 允许同名不同人：手打纯文本时不自动锁定 ID，留空由用户自行决定是否下拉选择
    form.setFieldValue(['related', field.name, 'id'], '');
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 9999 : 'auto',
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      title={isDuplicate ? '该系统ID与其它关联人重复' : undefined}
      className={`flex gap-2 items-start sm:items-center mb-2 p-2 rounded w-full transition-colors ${
        isDuplicate ? 'bg-amber-100/80 ring-1 ring-amber-400' : 'bg-purple-50/50'
      }`}
    >
      {/* 拖拽把手 */}
      <div {...attributes} {...listeners} className="cursor-grab pr-1 pt-2 sm:pt-6 text-gray-400 hover:text-gray-600 active:cursor-grabbing">
        <HolderOutlined />
      </div>
      {/* 内嵌表单项转换为响应式网格：系统ID/姓名/关系收窄，备注加宽 */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[0.6fr_0.8fr_0.8fr_1.8fr] gap-2 w-full">
        <Form.Item name={[field.name, 'id']} label="系统ID" className="mb-0">
          <Input placeholder="" disabled className={`text-center font-mono text-xs border-dashed ${isDuplicate ? 'bg-amber-200/80 text-amber-700' : 'bg-gray-100/80 text-gray-400'}`} />
        </Form.Item>
        <Form.Item name={[field.name, 'name']} label="姓名" rules={[{ required: true, message: '必填' }]} className="mb-0">
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
        <Form.Item name={[field.name, 'relation']} label="关系" rules={[{ required: true, message: '必填' }]} className="mb-0"><Input placeholder="如：父亲" /></Form.Item>
        <Form.Item name={[field.name, 'remark']} label="备注" className="mb-0"><Input /></Form.Item>
      </div>
      <MinusCircleOutlined className="text-red-500 pt-2 sm:pt-6 text-lg cursor-pointer self-center sm:self-auto" onClick={() => remove(field.name)} />
    </div>
  );
}

// 提取出的联动编辑面板，实现 Cascader 和 Input 并存且联动
function TagEditorContent({ initialValue, tagTree, onConfirm, onCancel }) {
  const [currentValue, setCurrentValue] = React.useState(initialValue || '');
  const cascaderValue = currentValue ? currentValue.split('/') : [];

  return (
    <div className="flex flex-col gap-3 p-1 w-100">
      {tagTree && tagTree.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-gray-400 font-medium text-xs">从分类树选择:</span>
          <Cascader
            options={tagTree}
            expandTrigger="hover"
            fieldNames={{ label: 'name', value: 'name', children: 'children' }}
            changeOnSelect
            value={cascaderValue}
            onChange={(val) => {
              setCurrentValue(val && val.length > 0 ? val.join('/') : '');
            }}
            placeholder="点击选择路径"
            className="w-full"
            size="small"
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-gray-400 font-medium text-xs">自定义文本:</span>
        <Input
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
          placeholder="手动输入或微调标签"
          className="w-full"
          size="small"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="small" onClick={onCancel}>取消</Button>
        <Button size="small" type="primary" onClick={() => onConfirm(currentValue)}>确定</Button>
      </div>
    </div>
  );
}

function DragTag({ id, text, onRemove, onEdit, tagTree }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [visible, setVisible] = React.useState(false);

  const style = transform
    ? {
        ...commonStyle,
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        transition: isDragging ? 'unset' : transition,
        zIndex: isDragging ? 9999 : 'auto',
        opacity: isDragging ? 0.6 : 1,
        cursor: 'default',
      }
    : commonStyle;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex gap-2 items-center mb-2 bg-purple-50/50 p-2 rounded w-full"
    >
      {/* 拖拽把手 */}
      <div {...attributes} {...listeners} className="cursor-grab pr-1 text-gray-400 hover:text-gray-600 active:cursor-grabbing">
        <HolderOutlined />
      </div>
      
      {/* 点击触发 Popover 编辑 */}
      <Popover
        open={visible}
        onOpenChange={setVisible}
        trigger="click"
        destroyTooltipOnHide
        placement="bottomLeft"
        content={
          <TagEditorContent
            initialValue={text}
            tagTree={tagTree}
            onCancel={() => setVisible(false)}
            onConfirm={(newValue) => {
              if (newValue.trim() && newValue.trim() !== text) {
                onEdit(text, newValue.trim());
              }
              setVisible(false);
            }}
          />
        }
      >
        <span 
          className="cursor-pointer font-medium text-purple-700 hover:bg-purple-100/60 px-2 py-0.5 rounded transition-all"
          title="点击编辑标签"
        >
          {text}
        </span>
      </Popover>

      {/* 右侧删除按钮 */}
      <MinusCircleOutlined 
        className="text-red-500 cursor-pointer ml-auto text-lg hover:text-red-700" 
        onClick={onRemove} 
      />
    </div>
  );
}

function EditableTagGroup({ value = [], onChange, tagTree }) {
  const [addVisible, setAddVisible] = React.useState(false);

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

  return (
    <div className="flex flex-col w-full">
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={value} strategy={verticalListSortingStrategy}>
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

      <Popover
        open={addVisible}
        onOpenChange={setAddVisible}
        trigger="click"
        destroyTooltipOnHide
        placement="bottomLeft"
        content={
          <TagEditorContent
            initialValue=""
            tagTree={tagTree}
            onCancel={() => setAddVisible(false)}
            onConfirm={(newValue) => {
              const cleaned = newValue.trim();
              if (cleaned && !value.includes(cleaned)) {
                onChange?.([...value, cleaned]);
              }
              setAddVisible(false);
            }}
          />
        }
      >
        <Button 
          type="dashed" 
          block 
          icon={<PlusOutlined />} 
          className="mt-1"
        >
          新增标签
        </Button>
      </Popover>
    </div>
  );
}

export default function ContactForm({ visible, contact, tagTree = [], contacts = [], onCancel, onSave, onDelete }) {
  const [form] = Form.useForm();

  const faceUuid = Form.useWatch('face_uuid', form);
  const genderWatch = Form.useWatch('gender', form);
  const relatedValues = Form.useWatch('related', form);
  const [uuidModalVisible, setUuidModalVisible] = React.useState(false);
  const [tempUuid, setTempUuid] = React.useState('');
  const [avatarUrl, setAvatarUrl] = React.useState(null);

  // 统计关联人里出现次数大于 1 的系统ID，用于行底色高亮提示重复
  const duplicateIds = React.useMemo(() => {
    const counts = new Map();
    (relatedValues || []).forEach((r) => {
      const id = r && r.id ? String(r.id) : '';
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    });
    const dupes = new Set();
    counts.forEach((count, id) => { if (count > 1) dupes.add(id); });
    return dupes;
  }, [relatedValues]);

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

  const renderTitle = () => {
    if (contact) {
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <span>编辑人员信息</span>
          <Tag color="blue" className="font-mono cursor-pointer" title="点击可复制 ID">
            <span className="">ID: </span>
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
        className=""
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
                className="relative w-20 h-20 md:w-28 md:h-28 rounded-full overflow-hidden border-2 cursor-pointer group shadow-sm bg-gray-50 flex items-center justify-center transition-all shrink-0"
                title="点击配置人脸 UUID"
              >
                {avatarUrl ? (
                  <img 
                    src={avatarUrl} 
                    alt="人脸缩略图" 
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : <UserOutlined className="text-gray-400 text-3xl md:text-4xl" />}
                {/* Hover 遮罩层 */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-md font-medium transition-opacity gap-1">
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
              <Select
                mode="tags"
                style={{ width: '100%' }}
                placeholder="输入曾用名后回车添加"
                tokenSeparators={[',', '，']} // 支持逗号自动切分标签
                options={[]} // 动态标签页默认无需预设选项
              />
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
                onDragEnd={(event) => {
                  const { active, over } = event;
                  if (over && active.id !== over.id) {
                    move(fields.findIndex(f => f.key === active.id), fields.findIndex(f => f.key === over.id));
                  }
                }}
              >
                <SortableContext
                  items={fields.map((field) => field.key)}
                  strategy={verticalListSortingStrategy}
                >
                  {fields.map((field) => (
                    <RelatedRow
                      key={field.key}
                      field={field}
                      remove={remove}
                      contacts={contacts}
                      form={form}
                      duplicateIds={duplicateIds}
                    />
                  ))}
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} className="mt-2">新增关联关系</Button>
                </SortableContext>
              </DndContext>
            )}
          </Form.List>

          <Form.Item name="extra" label="扩展信息" className="mt-4"><Input.TextArea rows={6} placeholder="# 教育经历&#10;- XX大学 计算机科学&#10;# 工作经历&#10;- XX公司 架构师" /></Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
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