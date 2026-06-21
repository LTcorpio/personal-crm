import React from 'react';
import { Table, Button, Popconfirm, Space, Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';

export default function ContactListTable({
  dataSource,
  columnConfigs,
  setDetailContact,
  setEditingContact,
  setFormVisible,
  handleDeleteContact,
  avatarConfig
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
            const showThumb = avatarConfig?.showAvatarThumb !== false && text;
            const isTextFallback = !showThumb && avatarConfig?.avatarFallbackType && avatarConfig.avatarFallbackType !== 'default';

            return (
              <div
                className="flex justify-center items-center w-full cursor-pointer"
                onClick={() => setDetailContact(record)}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border select-none ${
                  isTextFallback ? 'bg-blue-50 border-blue-200' : 'bg-gray-100 border-gray-200'
                }`}>
                  {(() => {
                    if (showThumb) {
                      return <img src={text} alt="" className="w-full h-full object-cover" />;
                    }
                    if (avatarConfig?.avatarFallbackType === 'lastname' && record.name) {
                      return <span className="text-[16px] font-bold text-blue-600">{record.name.charAt(0)}</span>;
                    }
                    if (avatarConfig?.avatarFallbackType === 'fullname' && record.name) {
                      return <span className="text-[9px] font-bold text-blue-600 px-0.5 text-center w-full">{record.name}</span>;
                    }
                    return <UserOutlined className="text-gray-400" />;
                  })()}
                </div>
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
      pagination={false}
      className="bg-white rounded-xl border border-gray-100 overflow-hidden"
      columns={columns}
      size='small'
    />
  );
}