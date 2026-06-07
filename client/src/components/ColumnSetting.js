import { useState } from 'react';
import { Modal, Table, Button, Switch, message } from 'antd';
import { HolderOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// 提取并导出默认列配置，供 App.js 初始状态使用
export const DEFAULT_COLUMNS = [
  { id: '1', title: '头像', dataIndex: 'face_thumb_url', key: 'face_thumb_url', visible: true },
  { id: '2', title: '姓名', dataIndex: 'name', key: 'name', visible: true, canHide: false },
  { id: '3', title: '性别', dataIndex: 'gender', key: 'gender', visible: true },
  { id: '4', title: '称呼', dataIndex: 'title', key: 'title', visible: false },
  { id: '5', title: '阳历生日', dataIndex: 'birthday_solar', key: 'birthday_solar', visible: true },
  { id: '6', title: '农历生日', dataIndex: 'birthday_lunar', key: 'birthday_lunar', visible: false },
  { id: '7', title: '民族', dataIndex: 'ethnicity', key: 'ethnicity', visible: false },
  { id: '8', title: '籍贯', dataIndex: 'native_place', key: 'native_place', visible: false },
  { id: '9', title: '地区', dataIndex: 'location', key: 'location', visible: true },
  { id: '10', title: '身份证', dataIndex: 'id_card', key: 'id_card', visible: false },
  { id: '11', title: '标签', dataIndex: 'tag', key: 'tag', visible: false },
  { id: '12', title: '详细住址', dataIndex: 'address', key: 'address', visible: false },
];

// 可拖拽的行组件
const SortableRow = (props) => {
  const { setNodeRef, transform, transition, isDragging } = useSortable({
    id: props['data-row-key']
  });

  const style = {
    ...props.style,
    transform: CSS.Transform.toString(transform && { ...transform, y: transform.y }),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999, background: '#fafafa' } : {})
  };

  // 注意：这里移除了 tr 上的 attributes，交由内部的拖拽手柄单独控制
  return (
    <tr {...props} ref={setNodeRef} style={style}>
      {props.children}
    </tr>
  );
};

// 拖拽手柄：将 useSortable 的关键属性绑定在这里，实现仅手柄可拖拽
const DragHandle = ({ id }) => {
  const { attributes, listeners } = useSortable({ id });
  return (
    <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing px-2 py-1 flex items-center justify-center">
      <HolderOutlined style={{ color: '#999' }} />
    </div>
  );
};

const ColumnSetting = ({ visible, columns, onClose, onSave }) => {
  const [localColumns, setLocalColumns] = useState(columns);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 }, // 限制移动4px以上才触发，防止误触
    })
  );

  // 同步外部 columns 变化
  const handleOpen = () => {
    setLocalColumns([...columns]);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = localColumns.findIndex(col => col.key === active.id);
      const newIndex = localColumns.findIndex(col => col.key === over.id);
      setLocalColumns(arrayMove(localColumns, oldIndex, newIndex));
    }
  };

  const handleVisibleChange = (key, checked) => {
    setLocalColumns(prev =>
      prev.map(col => col.key === key ? { ...col, visible: checked } : col)
    );
  };

  const handleSave = () => {
    onSave(localColumns);
    message.success('列设置已保存');
    onClose();
  };

  const handleReset = () => {
    setLocalColumns(DEFAULT_COLUMNS);
  };

  const tableColumns = [
    {
      title: '排序',
      key: 'sort',
      width: 60,
      align: 'center',
      render: (_, record) => <DragHandle id={record.key} /> // 将行数据的 key 传给手柄
    },
    {
      title: '列名',
      dataIndex: 'title',
      key: 'title'
    },
    {
      title: '显示',
      dataIndex: 'visible',
      key: 'visible',
      width: 90,
      align: 'center',
      render: (visible, record) => (
        <Switch
          size="small"
          checked={visible}
          disabled={record.canHide === false}
          onChange={(checked) => handleVisibleChange(record.key, checked)}
        />
      )
    }
  ];

  return (
    <Modal
      title="配置列表字段与排序"
      open={visible}
      afterOpenChange={(open) => open && handleOpen()}
      onCancel={onClose}
      footer={[
        <Button key="reset" onClick={handleReset}>恢复默认</Button>,
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="save" type="primary" onClick={handleSave}>保存</Button>
      ]}
      width={450}
      destroyOnHidden
    >
      {/* 限制仅垂直轴拖拽修饰器：restrictToVerticalAxis */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
        <SortableContext items={localColumns.map(col => col.key)} strategy={verticalListSortingStrategy}>
          <Table
            columns={tableColumns}
            dataSource={localColumns}
            rowKey="key"
            pagination={false}
            size="small"
            components={{
              body: {
                row: SortableRow
              }
            }}
            onRow={(record) => ({
              'data-row-key': record.key
            })}
          />
        </SortableContext>
      </DndContext>
    </Modal>
  );
};

export default ColumnSetting;
