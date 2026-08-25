import React from 'react';
import { Table, Button, Space, Tag, Tooltip } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import ContactAvatar from './ContactAvatar';

export default function ContactListTable({
  dataSource,
  columnConfigs,
  setDetailContact,
  setEditingContact,
  setFormVisible,
  handleDeleteContact,
  avatarConfig,
  editMode = true
}) {
  const columns = [
    ...columnConfigs
      .filter((col) => col.visible)
      .map((col) => ({
        title: col.title,
        dataIndex: col.dataIndex,
        key: col.key,
        align: 'center',
        render: (text, record) => {
          if (col.key === 'face_thumb_url') {
            return (
              <div
                className="flex justify-center items-center w-full cursor-pointer"
                onClick={() => setDetailContact(record)}
              >
                <ContactAvatar
                  faceUuid={record.face_uuid}
                  name={record.name}
                  avatarConfig={avatarConfig}
                  sizeClass="w-9 h-9"
                  textClass="text-[16px]"
                />
              </div>
            )
          }
          if (col.key === 'name') {
            return (
              <span
                className="text-blue-600 font-medium cursor-pointer hover:underline"
                onClick={() => setDetailContact(record)}
              >
                {text}
              </span>
            );
          }
          if (col.key === 'gender') {
            return text === 1 ? <Tag color="blue">男</Tag> : <Tag color="pink">女</Tag>;
          }
          if (col.key === 'tag') {
            if (!text || text.length === 0) return null;
            // 提取叶子标签名，用于窄屏模式下展示
            const getLeafName = (path) => path.split('/').pop();
            return (
              <div className="flex flex-col gap-1 items-center">
                {text.map((item, index) => (
                  <div key={index} className="contents">
                    {/* 宽屏：完整路径，无 Tooltip */}
                    <span className="hidden md:inline-flex text-xs bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 items-center whitespace-nowrap">
                      {item.split('/').map((tag, idx, arr) => {
                        const isLast = idx === arr.length - 1;
                        return (
                          <span key={idx} className="flex items-center">
                            <span className={isLast ? "font-bold text-blue-700" : "text-blue-700/80"}>{tag}</span>
                            {!isLast && <RightOutlined className="mx-1 text-blue-700/30 font-normal text-[10px]" />}
                          </span>
                        );
                      })}
                    </span>
                    {/* 窄屏：仅叶子标签，带 Tooltip */}
                    <Tooltip title={item}>
                      <span className="inline-flex md:hidden text-xs bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 items-center whitespace-nowrap font-bold text-blue-700">
                        {getLeafName(item)}
                      </span>
                    </Tooltip>
                  </div>
                ))}
              </div>
            );
          }
          return text || '-';
        },
      })),
    // 只在编辑模式下展示操作列，只读模式下隐藏避免空列
    ...(editMode ? [{
      title: '操作',
      key: 'action',
      align: 'center',
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="link"
            size="small"
            onClick={() => {
              setEditingContact(record);
              setFormVisible(true);
            }}
          >
            编辑
          </Button>
          {/* <Popconfirm
            title="确认彻底删除这位联系人吗？"
            description="删除后关联的外键将被同步清理。"
            onConfirm={() => handleDeleteContact(record.id)}
            okText="确认"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm> */}
        </Space>
      ),
    }] : []),
  ];

  return (
    <Table
      dataSource={dataSource}
      rowKey="id"
      pagination={false}
      className="bg-white rounded-xl border border-gray-100 overflow-hidden"
      columns={columns}
      size='small'
    />
  );
}