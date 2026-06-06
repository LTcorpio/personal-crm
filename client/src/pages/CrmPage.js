import React, { useState, useEffect, useCallback } from 'react';
import { Button, message, Spin, Empty, Tag, Modal, Layout, FloatButton } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import ColumnSetting, { DEFAULT_COLUMNS } from '../components/ColumnSetting';
import axios from 'axios';
import ContactCard from '../components/ContactCard';
import ContactMiniCard from '../components/ContactMiniCard';
import ContactForm from '../components/ContactForm';
import ContactListTable from '../components/ContactListTable';
import Sidebar from '../components/Sidebar';
import SearchFilter from '../components/SearchFilter';

import { filterContacts, enrichTreeWithCounts } from '../utils/crmUtils';
import { useResizableSider } from '../hooks/useResizableSider';

const { Content, Sider } = Layout;
const API_BASE = 'http://localhost:15197/api';

export default function CrmPage({ viewMode, setViewMode, formVisible, setFormVisible, editingContact, setEditingContact }) {
  const [contacts, setContacts] = useState([]);
  const [tagTree, setTagTree] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTxt, setSearchTxt] = useState('');
  const [selectedTagPath, setSelectedTagPath] = useState(null);
  
  // 列表模式下的列设置
  const [columnConfigs, setColumnConfigs] = useState(() => {
    const saved = localStorage.getItem('crm_column_configs');
    return saved ? JSON.parse(saved) : DEFAULT_COLUMNS;
  });
  const [settingVisible, setSettingVisible] = useState(false);

  // 侧边栏宽度
  const { siderWidth, handleMouseDown } = useResizableSider(260, 200, 600);
  
  // 搜索范围
  const [searchFields, setSearchFields] = useState(() => {
    const saved = localStorage.getItem('crm_search_fields');
    return saved ? JSON.parse(saved) : [];
  });
  // 查看联系人详情的 Modal 状态
  const [detailContact, setDetailContact] = useState(null);

  const handleColumnConfigsChange = (newConfigs) => {
    setColumnConfigs(newConfigs);
    localStorage.setItem('crm_column_configs', JSON.stringify(newConfigs));
  };

  const handleSearchFieldsChange = (newFields) => {
    setSearchFields(newFields);
    localStorage.setItem('crm_search_fields', JSON.stringify(newFields));
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/contacts`, {
        params: {
          search: searchTxt,
          fields: searchFields.join(',')
        }
      });
      setContacts(res.data);
      const tagRes = await axios.get(`${API_BASE}/tags/tree`);
      setTagTree(tagRes.data);
    } catch (err) {
      message.error('无法同步后端数据，请检查服务是否开启');
    } finally {
      setLoading(false);
    }
  }, [searchTxt, searchFields]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 处理点击关联人：通过 ID 查找联系人并展示详情弹窗
  const handleRelatedClick = (relatedId) => {
    // 从所有人脉 contacts 中寻找（确保即使不在当前过滤结果里也能找到）
    const found = contacts.find(c => String(c.id) === String(relatedId));
    if (found) {
      setDetailContact(found);
    } else {
      message.warning('未找到该关联人的详细档案');
    }
  };

  // 新增与修改联系人
  const handleSaveContact = async (fullData) => {
    try {
      await axios.post(`${API_BASE}/contacts`, fullData);
      message.success('联系人数据保存成功');
      setFormVisible(false);
      setEditingContact(null);
      fetchData();
    } catch (err) {
      message.error('保存失败');
    }
  };

  // 删除联系人
  const handleDeleteContact = async (id) => {
    try {
      await axios.delete(`${API_BASE}/contacts/${id}`);
      message.success('删除成功');
      fetchData();
    } catch (err) {
      message.error('删除失败');
    }
  };

  const filteredContacts = filterContacts(contacts, searchTxt, searchFields, selectedTagPath);

  // 渲染前，动态生成带人数的树数据
  const processedTagTree = enrichTreeWithCounts(tagTree, contacts);

  return (
    <>
      <Layout className="max-w-[100vw] mx-auto bg-transparent p-6 flex flex-row gap-6 relative">
        {/* 左侧：常驻标签树导航面板 */}
        <Sider
          theme="light"
          trigger={null}
          width={siderWidth}
          className="bg-transparent rounded-xl !border-0 transition-none"
          style={{ background: 'transparent' }}
        >
          <Sidebar 
            processedTagTree={processedTagTree}
            selectedTagPath={selectedTagPath}
            setSelectedTagPath={setSelectedTagPath}
          />
        </Sider>

        {/* 隐形拖拽条。放置在 Sider 和 Content 的 gap 间隙正中间 */}
        <div
          onMouseDown={handleMouseDown}
          className="w-2 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500 rounded transition-colors"
          style={{
            marginRight: '-20px', // 抵消部分 gap 从而完美居中
            marginLeft: '-20px',
            zIndex: 10,
            height: 'calc(100vh - 120px)',
            position: 'sticky',
            top: '96px'
          }}
        />
        
        {/* 右侧：搜索框与联系人展示区 */}
        <Content className="flex-1 min-w-0">
          <SearchFilter 
            searchTxt={searchTxt}
            setSearchTxt={setSearchTxt}
            selectedTagPath={selectedTagPath}
            searchFields={searchFields}
            onSearchFieldsChange={handleSearchFieldsChange}
          />
          
          {viewMode === 'list' && (
            <div className="bg-white p-3 rounded-xl border border-gray-100 mb-4 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">💡 提示：点击列表中的头像或姓名可查看完整详情卡片。</span>
              <Button size="small" icon={<SettingOutlined />} onClick={() => setSettingVisible(true)}>
                列设置
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center py-24"><Spin size="large" tip="加载中..." /></div>
          ) : filteredContacts.length > 0 ? (
            <>
              {/* 1. 标准卡片模式 */}
              {viewMode === 'card' && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-6">
                  {filteredContacts.map(item => (
                    <ContactCard
                      key={item.id}
                      contact={item}
                      onClick={() => { setEditingContact(item); setFormVisible(true); }}
                      onRelatedClick={handleRelatedClick}
                    />
                  ))}
                </div>
              )}
              {/* 2. 微型卡片模式 (头像、姓名、性别、昵称) */}
              {viewMode === 'mini' && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-4">
                  {filteredContacts.map(item => (
                    <ContactMiniCard
                      key={item.id}
                      contact={item}
                      onClick={() => setDetailContact(item)}
                    />
                  ))}
                </div>
              )}
              {/* 3. 列表表格模式 */}
              {viewMode === 'list' && (
                <ContactListTable
                  dataSource={filteredContacts}
                  columnConfigs={columnConfigs}
                  setDetailContact={setDetailContact}
                  setEditingContact={setEditingContact}
                  setFormVisible={setFormVisible}
                  handleDeleteContact={handleDeleteContact}
                />
              )}
            </>
          ) : (
            <Empty className="py-20 bg-white rounded-xl border border-dashed border-gray-200" description="无匹配的联系人" />
          )}
        </Content>
      </Layout>

      {/* 弹窗 - 编辑信息 */}
      <ContactForm 
        visible={formVisible} 
        contact={editingContact} 
        onCancel={() => { setFormVisible(false); setEditingContact(null); }} 
        onSave={handleSaveContact} 
        onDelete={handleDeleteContact}
      />
      
      {/* 弹窗 - 列设置 */}
      <ColumnSetting
        visible={settingVisible}
        columns={columnConfigs}
        onClose={() => setSettingVisible(false)}
        onSave={handleColumnConfigsChange}
      />

      {/* 弹窗 - 联系人详情卡片 */}
      <Modal
        title={
          <div className="flex items-center justify-between pr-6">
            <span>联系人详细档案</span>
            {detailContact?.id && (
              <Tag color="default" className="font-mono text-gray-400 border-gray-200 m-0">
                ID: {detailContact.id}
              </Tag>
            )}
          </div>
        }
        open={!!detailContact}
        onCancel={() => setDetailContact(null)}
        footer={null}
        width={720}
        destroyOnHidden
        className='select-none'
      >
        {detailContact && (
          <div className="pt-4">
            <ContactCard 
              contact={detailContact} 
              onClick={() => { 
                const currentContact = detailContact;
                setDetailContact(null);
                setEditingContact(currentContact);
                setFormVisible(true);
              }}
              onRelatedClick={handleRelatedClick}
              noBorder={true}
            />
          </div>
        )}
      </Modal>

      {/* <FloatButton.BackTop duration={300} visibilityHeight={300} style={{ right: 24, bottom: 24 }} /> */}
    </>
  );
}