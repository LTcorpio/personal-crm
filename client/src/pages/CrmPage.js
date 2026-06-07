import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import CrmStatsView from '../components/CrmStatsView';
import TopicSidebar from '../components/TopicSidebar';

import { filterContacts, enrichTreeWithCounts } from '../utils/crmUtils';
import { useResizableSider } from '../hooks/useResizableSider';

const { Content, Sider } = Layout;
const API_BASE = 'http://localhost:15197/api';

export default function CrmPage({ viewMode, setViewMode, crmFeatureMode, formVisible, setFormVisible, editingContact, setEditingContact }) {
  const [contacts, setContacts] = useState([]);
  const [tagTree, setTagTree] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTxt, setSearchTxt] = useState('');
  const [selectedTagPath, setSelectedTagPath] = useState(null);
  // 分页状态管理
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
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
  // 当搜索词或标签路径改变时，自动将页码重置回第 1 页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTxt, selectedTagPath, selectedTopicId, searchFields, crmFeatureMode]);
  
  // 查看联系人详情的 Modal 状态
  const [detailContact, setDetailContact] = useState(null);

  const handleColumnConfigsChange = (newConfigs) => {
    setColumnConfigs(newConfigs);
    localStorage.setItem('crm_column_configs', JSON.stringify(newConfigs));
  };

  const handleSearchFieldsChange = useCallback((newFields) => {
    setSearchFields(newFields);
    localStorage.setItem('crm_search_fields', JSON.stringify(newFields));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/contacts`);
      setContacts(res.data);
      const tagRes = await axios.get(`${API_BASE}/tags/tree`);
      setTagTree(tagRes.data);
      const topicRes = await axios.get(`${API_BASE}/topics`);
      setTopics(topicRes.data);
    } catch (err) {
      message.error('无法同步后端数据，请检查服务是否开启');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (crmFeatureMode !== 'topics') return;

    if (topics.length === 0) {
      setSelectedTopicId(null);
      return;
    }

    if (!topics.some(topic => topic.id === selectedTopicId)) {
      setSelectedTopicId(topics[0].id);
    }
  }, [crmFeatureMode, topics, selectedTopicId]);

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

  const handleSaveTopic = async (topicId, data) => {
    try {
      const res = topicId
        ? await axios.put(`${API_BASE}/topics/${topicId}`, data)
        : await axios.post(`${API_BASE}/topics`, data);

      message.success(topicId ? '主题已更新' : '主题已创建');
      await fetchData();

      if (res.data?.topic?.id) {
        setSelectedTopicId(res.data.topic.id);
      }
    } catch (err) {
      message.error('主题保存失败，请检查名称是否重复');
      throw err;
    }
  };

  const handleDeleteTopic = async (topicId) => {
    try {
      await axios.delete(`${API_BASE}/topics/${topicId}`);
      message.success('主题已删除');
      if (selectedTopicId === topicId) {
        setSelectedTopicId(null);
      }
      fetchData();
    } catch (err) {
      message.error('主题删除失败');
    }
  };

  const selectedTopic = topics.find(topic => topic.id === selectedTopicId);
  const { topicContacts, unmatchedTopicMembers } = useMemo(() => {
    if (!selectedTopic) return { topicContacts: [], unmatchedTopicMembers: [] };

    const contactsById = new Map(contacts.map(contact => [String(contact.id), contact]));
    const contactsByName = new Map();
    contacts.forEach(contact => {
      if (!contactsByName.has(contact.name)) contactsByName.set(contact.name, contact);
    });

    const seen = new Set();
    const matched = [];
    const unmatched = [];

    (selectedTopic.members || []).forEach(member => {
      const contact = member.contactId
        ? contactsById.get(String(member.contactId))
        : contactsByName.get(member.name);

      if (contact) {
        const key = String(contact.id);
        if (!seen.has(key)) {
          seen.add(key);
          matched.push(contact);
        }
      } else {
        unmatched.push(member);
      }
    });

    return { topicContacts: matched, unmatchedTopicMembers: unmatched };
  }, [contacts, selectedTopic]);

  const activeContacts = crmFeatureMode === 'topics' ? topicContacts : contacts;
  const filteredContacts = crmFeatureMode === 'topics'
    ? filterContacts(activeContacts, searchTxt, searchFields, null)
    : filterContacts(activeContacts, searchTxt, searchFields, selectedTagPath);

  // 计算当前页需要显示的数据切片
  const startIndex = (currentPage - 1) * pageSize;
  const pagedContacts = filteredContacts.slice(startIndex, startIndex + pageSize);

  const isLastPage = currentPage >= Math.ceil(filteredContacts.length / pageSize);

  // 渲染前，动态生成带人数的树数据
  const processedTagTree = enrichTreeWithCounts(tagTree, contacts);

  return (
    <>
      {crmFeatureMode === 'stats' ? (
        <CrmStatsView
          contacts={contacts}
          tagTree={tagTree}
          onContactClick={(contact) => setDetailContact(contact)}
        />
      ) : (
      <Layout className="max-w-[100vw] mx-auto bg-transparent flex flex-row relative h-full overflow-hidden">
        {/* 左侧：常驻标签树导航面板 */}
        <Sider
          theme="light"
          trigger={null}
          width={siderWidth}
          className="bg-white transition-none border-r border-gray-200"
        >
          {crmFeatureMode === 'topics' ? (
            <TopicSidebar
              topics={topics}
              setTopics={setTopics}
              selectedTopicId={selectedTopicId}
              setSelectedTopicId={setSelectedTopicId}
              onSaveTopic={handleSaveTopic}
              onDeleteTopic={handleDeleteTopic}
            />
          ) : (
            <Sidebar 
              processedTagTree={processedTagTree}
              selectedTagPath={selectedTagPath}
              setSelectedTagPath={setSelectedTagPath}
            />
          )}
        </Sider>

        {/* 隐形拖拽条，放置在 Sider 和 Content 的 gap 间隙正中间 */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 bottom-0 cursor-col-resize group flex items-center justify-center transition-colors"
          style={{
            left: `${siderWidth}px`, // 动态精准定位在侧边栏右侧边界
            width: '8px',            // 鼠标交互热区宽度
            marginLeft: '-4px',      // 居中对齐边界线
            zIndex: 50,              // 确保置于最顶层
          }}
        >
          {/* 内部高亮线条：平时透明，鼠标移入热区(group-hover)时显现 */}
          <div className="w-[4px] h-full bg-transparent 
            /* 1. 鼠标移入热区（Hover）：颜色变淡（使用 40% 不透明度） */
            group-hover:bg-blue-500/40 
            
            /* 2. 鼠标按住拖动（Active）：颜色变深（使用 80% 不透明度） */
            group-hover:active:bg-blue-500/80 
            
            /* 3. 伴有颜色（colors）和宽度/变形（all）的平滑过渡动画，时长 200 毫秒 */
            transition-all duration-200 ease-in-out
          " />
        </div>
        
        {/* 右侧：搜索框与联系人展示区 */}
        <Content className="flex-1 min-w-0 flex flex-col h-full bg-gray-50/50">
          <SearchFilter 
            searchTxt={searchTxt}
            setSearchTxt={setSearchTxt}
            selectedTagPath={selectedTagPath}
            scopeType={crmFeatureMode === 'topics' ? 'topic' : 'tag'}
            selectedScopeName={selectedTopic?.name}
            selectedScopeColor={selectedTopic?.color}
            searchFields={searchFields}
            onSearchFieldsChange={handleSearchFieldsChange}
            filteredCount={filteredContacts.length}
            totalCount={activeContacts.length}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={(page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            }}
          />

          {crmFeatureMode === 'topics' && unmatchedTopicMembers.length > 0 && (
            <div className="bg-orange-50 px-6 py-2 border-b border-orange-100 text-xs text-orange-700 shrink-0">
              当前主题中有 {unmatchedTopicMembers.length} 位成员未匹配到联系人档案：
              {unmatchedTopicMembers.map(member => member.name).join('、')}
            </div>
          )}
          
          {viewMode === 'list' && (
            <div className="bg-amber-50 px-6 py-2 border-b border-amber-100 flex items-center justify-between shrink-0">
              <span className="text-xs text-amber-700 font-medium">💡 提示：点击列表中的头像或姓名可查看完整详情卡片。</span>
              <Button size="small" icon={<SettingOutlined />} onClick={() => setSettingVisible(true)}>
                列设置
              </Button>
            </div>
          )}

          <div id="crm-content" className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex justify-center items-center py-24"><Spin size="large" description="加载中..." /></div>
            ) : filteredContacts.length > 0 ? (
              <>
                {/* 1. 标准卡片模式 */}
                {viewMode === 'card' && (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-6">
                    {pagedContacts.map(item => (
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
                    {pagedContacts.map(item => (
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
                    dataSource={pagedContacts}
                    columnConfigs={columnConfigs}
                    setDetailContact={setDetailContact}
                    setEditingContact={setEditingContact}
                    setFormVisible={setFormVisible}
                    handleDeleteContact={handleDeleteContact}
                  />
                )}
                {/* 触底提示 */}
                <div className="text-center text-gray-400 text-xs mt-8 pb-4 select-none tracking-wide font-sans">
                  {isLastPage ? (
                    <span>— 这是最后一页了 —</span>
                  ) : (
                    <span
                      className="text-blue-400/80 cursor-pointer hover:text-blue-500 transition-colors"
                      onClick={() => {
                        setCurrentPage(prev => prev + 1);
                      }}
                    >
                      — 点击查看下一页 —
                    </span>
                  )}
                </div>
              </>
            ) : (
              <Empty className="py-20 bg-white rounded-xl border border-dashed border-gray-200" description="无匹配的联系人" />
            )}
          </div>
        </Content>
      </Layout>
      )}

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

      <FloatButton.BackTop 
        duration={300} // 回到顶部的动画时长（毫秒）
        visibilityHeight={150} // 滚动到多高（像素）才显示该按钮
        target={() => document.getElementById('crm-content') || window}
        style={{ right: 24, bottom: 24 }} // 调整在右下角的位置
      />
    </>
  );
}
