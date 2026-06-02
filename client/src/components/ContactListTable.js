import React from 'react';
import { Table, Button, Popconfirm, Space, Tag, Avatar } from 'antd';
import { UserOutlined } from '@ant-design/icons';

export default function ContactListTable({
  dataSource,
  columnConfigs,
  setDetailContact,
  setEditingContact,
  setFormVisible,
  handleDeleteContact,
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
                {text ? (
                  <img src={text} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <Avatar icon={<UserOutlined />} size="small" />
                )}
              </div>
            );
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
            return text ? text.map((item, index) => <Tag key={index}>{item}</Tag>) : null;
          }
          return text || '-';
        },
      })),
    {
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
          <Popconfirm
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
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={dataSource}
      rowKey="id"
      pagination={{ pageSize: 10 }}
      className="bg-white rounded-xl border border-gray-100 overflow-hidden"
      columns={columns}
    />
  );
}