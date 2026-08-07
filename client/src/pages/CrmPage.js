import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { message, Spin, Empty, Tag, Modal, Layout, FloatButton, Drawer, Checkbox, Radio, Flex, Tooltip } from 'antd';
import { OrderedListOutlined, TableOutlined, UserOutlined } from '@ant-design/icons';
import ColumnSetting, { DEFAULT_COLUMNS } from '../components/ColumnSetting';
import ContactCard from '../components/ContactCard';
import ContactMiniCard from '../components/ContactMiniCard';
import ContactForm from '../components/ContactForm';
import ContactListTable from '../components/ContactListTable';
import Sidebar, { SidebarTitle, SidebarExtra } from '../components/Sidebar';
import ContactSequenceModal from '../components/ContactSequenceModal';
import TagManagementModal from '../components/TagManagementModal';
import SearchFilter from '../components/SearchFilter';
import CrmStatsView from '../views/CrmStatsView';
import CrmBottomBar from '../components/CrmBottomBar';

import { filterContacts, enrichTreeWithCounts } from '../utils/crmUtils';
import { useResizableSider } from '../hooks/useResizableSider';
import { contactApi, tagApi, topicApi } from '../api/crmApi';

const { Content, Sider } = Layout;

export default function CrmPage({ viewMode, setViewMode, crmFeatureMode, formVisible, setFormVisible, editingContact, setEditingContact, editMode = true, setEditMode }) {
  const [contacts, setContacts] = useState([]);
  const [tagTree, setTagTree] = useState([]);
  const [topics, setTopics] = useState([]);
  // 持久化选中的主题/标签，刷新后恢复
  const [selectedTopicId, setSelectedTopicId] = useState(() => {
    const saved = localStorage.getItem('crm_selected_topic_id');
    return saved ? parseInt(saved, 10) : null;
  });
  const [loading, setLoading] = useState(true);
  const [searchTxt, setSearchTxt] = useState('');
  const [selectedTagPath, setSelectedTagPath] = useState(() => {
    return localStorage.getItem('crm_selected_tag_path') || null;
  });
  const [sequenceModalVisible, setSequenceModalVisible] = useState(false);
  const [tagManageVisible, setTagManageVisible] = useState(false);
  const sidebarRef = useRef(null);
  const gridRef = useRef(null);
  
  // 侧边栏折叠与响应式抽屉状态
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [drawerSidebarVisible, setDrawerSidebarVisible] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // 监听屏幕宽度变化以适应移动端/小视窗
  useEffect(() => {
    const handleResize = () => {
      const small = window.innerWidth < 768;
      setIsSmallScreen(small);
      if (small) {
        setSiderCollapsed(false); // 避免切回大屏时状态错乱
      } else {
        setDrawerSidebarVisible(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 分页状态管理
  // 卡片/头像视图按「行」分页，列表视图按「记录数」分页，两者独立持久化
  const [currentPage, setCurrentPage] = useState(() => {
    const saved = localStorage.getItem('crm_current_page');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [cardPageSize, setCardPageSize] = useState(() => {
    const saved = localStorage.getItem('crm_card_page_size');
    return saved ? parseInt(saved, 10) : 3; // 默认 3 行
  });
  const [listPageSize, setListPageSize] = useState(() => {
    const saved = localStorage.getItem('crm_page_size');
    return saved ? parseInt(saved, 10) : 20;
  });
  // 网格视图每行列数（由 ResizeObserver 实时测量），0 表示尚未测量
  const [columnsPerRow, setColumnsPerRow] = useState(0);

  // 头像显示模式
  const [showAvatarThumb, setShowAvatarThumb] = useState(() => {
    const saved = localStorage.getItem('crm_show_avatar_thumb');
    return saved !== 'false';
  });
  const [avatarFallbackType, setAvatarFallbackType] = useState(() => {
    return localStorage.getItem('crm_avatar_fallback_type') || 'default';
  });
  const [avatarDrawerVisible, setAvatarDrawerVisible] = useState(false);
  const avatarConfig = useMemo(() => ({ showAvatarThumb, avatarFallbackType }), [showAvatarThumb, avatarFallbackType]);
  
  // 列表模式下的列设置
  const [columnConfigs, setColumnConfigs] = useState(() => {
    const saved = localStorage.getItem('crm_column_configs');
    return saved ? JSON.parse(saved) : DEFAULT_COLUMNS;
  });
  const [settingVisible, setSettingVisible] = useState(false);

  // 侧边栏宽度
  const { siderWidth, handleMouseDown } = useResizableSider(260, 260, 600);
  
  // 搜索范围
  const [searchFields, setSearchFields] = useState(() => {
    const saved = localStorage.getItem('crm_search_fields');
    return saved ? JSON.parse(saved) : [];
  });

  // 记录上一轮筛选条件，仅在条件实际变化时才重置页码（兼容 StrictMode 双调用）
  const prevFilters = useRef({ searchTxt, selectedTagPath, selectedTopicId, searchFields, crmFeatureMode, viewMode });

  // 切换筛选条件时重置页码，仅在条件实际变化时执行（兼容 StrictMode 双调用）
  useEffect(() => {
    const prev = prevFilters.current;
    const changed =
      prev.searchTxt !== searchTxt ||
      prev.selectedTagPath !== selectedTagPath ||
      prev.selectedTopicId !== selectedTopicId ||
      prev.searchFields !== searchFields ||
      prev.crmFeatureMode !== crmFeatureMode ||
      prev.viewMode !== viewMode;
    prevFilters.current = { searchTxt, selectedTagPath, selectedTopicId, searchFields, crmFeatureMode, viewMode };
    if (changed) {
      setCurrentPage(1);
    }
  }, [searchTxt, selectedTagPath, selectedTopicId, searchFields, crmFeatureMode, viewMode]);

  // 持久化选中的标签路径、主题ID、页码
  useEffect(() => {
    localStorage.setItem('crm_selected_tag_path', selectedTagPath || '');
  }, [selectedTagPath]);

  useEffect(() => {
    localStorage.setItem('crm_selected_topic_id', selectedTopicId ? String(selectedTopicId) : '');
  }, [selectedTopicId]);

  useEffect(() => {
    localStorage.setItem('crm_current_page', String(currentPage));
  }, [currentPage]);

  // 实时测量网格视图的每行列数，用于按行分页
  // 依赖 loading：数据重载时 grid div 会被卸载再重建，需在重建后重新绑定 observer
  useEffect(() => {
    if (crmFeatureMode === 'stats' || viewMode === 'list' || loading) return;
    const el = gridRef.current;
    if (!el) return;
    const updateColumns = () => {
      const template = window.getComputedStyle(el).gridTemplateColumns;
      const count = template.split(' ').filter(s => s.trim()).length;
      if (count > 0) setColumnsPerRow(count);
    };
    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(el);
    return () => observer.disconnect();
  }, [crmFeatureMode, viewMode, loading]);
  
  const [detailContact, setDetailContact] = useState(null);

  // 编辑模式状态由父组件 App.js 统一管理（Header 与 CrmPage 共享），默认开启

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
      const res = await contactApi.getAll();
      setContacts(res.data);
      const tagRes = await tagApi.getTree();
      setTagTree(tagRes.data);
      const topicRes = await topicApi.getAll();
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
    // topics 尚未加载时不重置，避免清空持久化的 selectedTopicId
    if (topics.length === 0) return;
    // 数据加载后，若持久化的主题ID不在列表中，才回退到第一个
    if (!topics.some(topic => topic.id === selectedTopicId)) {
      setSelectedTopicId(topics[0].id);
    }
  }, [crmFeatureMode, topics, selectedTopicId]);

  const handleRelatedClick = (relatedId) => {
    const found = contacts.find(c => String(c.id) === String(relatedId));
    if (found) {
      setDetailContact(found);
    } else {
      message.warning('未找到该关联人的详细档案');
    }
  };

  // 打开人员编辑弹窗：仅在编辑模式下允许调出，否则降级为只读详情视图
  const handleOpenEdit = (contact) => {
    if (!editMode) {
      setDetailContact(contact);
      return;
    }
    setEditingContact(contact);
    setFormVisible(true);
  };

  const handleSaveContact = async (fullData) => {
    try {
      await contactApi.save(fullData);
      message.success('联系人数据保存成功');
      setFormVisible(false);
      setEditingContact(null);
      fetchData();
    } catch (err) {
      message.error('保存失败');
    }
  };

  const handleDeleteContact = async (id) => {
    try {
      await contactApi.delete(id);
      message.success('删除成功');
      fetchData();
    } catch (err) {
      message.error('删除失败');
    }
  };

  const handleSaveTopic = async (topicId, data) => {
    try {
      const res = topicId ? await topicApi.update(topicId, data) : await topicApi.create(data);
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
      await topicApi.delete(topicId);
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
  // 优化后的主题数据处理：提取所有成员并标记是否匹配成功
  const { topicContacts, allTopicMembers } = useMemo(() => {
    if (!selectedTopic) return { topicContacts: [], allTopicMembers: [] };
    const contactsById = new Map(contacts.map(contact => [String(contact.id), contact]));
    // const contactsByName = new Map();
    // contacts.forEach(contact => {
    //   if (!contactsByName.has(contact.name)) contactsByName.set(contact.name, contact);
    // });

    const seen = new Set();
    const matched = [];
    const allMembersProcessed = [];

    (selectedTopic.members || []).forEach(member => {
      const contact = member.contactId ? contactsById.get(String(member.contactId)) : null; // contactsByName.get(member.name);
      if (contact) {
        const key = String(contact.id);
        if (!seen.has(key)) {
          seen.add(key);
          matched.push(contact);
        }
      }
      // 组装完整成员列表，并附带状态标记
      allMembersProcessed.push({
        ...member,
        isMatched: !!contact
      });
    });
    return { topicContacts: matched, allTopicMembers: allMembersProcessed };
  }, [contacts, selectedTopic]);

  const activeContacts = crmFeatureMode === 'topics' ? topicContacts : contacts;
  const filteredContacts = crmFeatureMode === 'topics'
    ? filterContacts(activeContacts, searchTxt, searchFields, null)
    : filterContacts(activeContacts, searchTxt, searchFields, selectedTagPath);

  // 根据视图模式计算有效分页参数
  // 卡片/头像视图：pageSize 代表行数，实际每页记录 = 行数 × 每行列数
  // 列表视图：pageSize 代表记录数，维持原逻辑
  const isGridView = viewMode === 'card' || viewMode === 'mini';
  // 网格视图在列数测量完成前不计算分页，避免初始 columnsPerRow=0 导致闪烁
  const gridReady = !isGridView || columnsPerRow > 0;
  const effectiveColumns = isGridView ? Math.max(1, columnsPerRow) : 1;
  const activePageSize = isGridView ? cardPageSize : listPageSize;
  const recordsPerPage = isGridView ? cardPageSize * effectiveColumns : listPageSize;
  const effectiveTotal = isGridView
    ? Math.ceil(filteredContacts.length / effectiveColumns)
    : filteredContacts.length;

  // 列数变化时可能超出页码范围，钳制到有效区间
  const maxPage = Math.max(1, Math.ceil(effectiveTotal / activePageSize));
  const safeCurrentPage = Math.min(currentPage, maxPage);

  const startIndex = (safeCurrentPage - 1) * recordsPerPage;
  const pagedContacts = filteredContacts.slice(startIndex, startIndex + recordsPerPage);
  const isLastPage = safeCurrentPage >= maxPage;
  const processedTagTree = enrichTreeWithCounts(tagTree, contacts);

  // 持久化的页码可能超出总页数（如数据被删除后），自动跳到最后一页
  // 网格视图需等列数测量完成后再钳制，避免用错误的 maxPage 误判
  useEffect(() => {
    if (!loading && gridReady && currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, maxPage, loading, gridReady]);

  // 统一分发控制栏侧边面板折叠/展开行为
  const handleToggleSider = () => {
    if (isSmallScreen) {
      setDrawerSidebarVisible(prev => !prev);
    } else {
      setSiderCollapsed(prev => !prev);
    }
  };

  const handlePageChange = (page, size) => {
    setCurrentPage(page);
    if (isGridView) {
      setCardPageSize(size);
      localStorage.setItem('crm_card_page_size', String(size));
    } else {
      setListPageSize(size);
      localStorage.setItem('crm_page_size', String(size));
    }
  };

  const renderSidebarInner = (hideHeader = false) => (
    <div 
      style={{ width: isSmallScreen ? '100%' : siderWidth }} 
      className="h-full flex flex-col shrink-0 overflow-hidden"
    >
      <div className="flex-1 min-h-0">
        <Sidebar
          ref={sidebarRef}
          mode={crmFeatureMode}
          hideHeader={hideHeader}
          contacts={contacts}
          processedTagTree={processedTagTree}
          selectedTagPath={selectedTagPath}
          setSelectedTagPath={setSelectedTagPath}
          onManageTags={() => setTagManageVisible(true)}
          topics={topics}
          setTopics={setTopics}
          selectedTopicId={selectedTopicId}
          setSelectedTopicId={setSelectedTopicId}
          onSaveTopic={handleSaveTopic}
          onDeleteTopic={handleDeleteTopic}
          editMode={editMode}
        />
      </div>

      {crmFeatureMode === 'topics' && selectedTopic && allTopicMembers.length > 0 && (
        <div className="border-t border-gray-200 bg-slate-50/50 p-4 flex flex-col overflow-hidden max-h-[45%]">
          <div className="flex flex-row flex-wrap gap-2 overflow-y-auto justify-center pb-2 w-full">
            {allTopicMembers.map((member, idx) => {
              const tagComponent = (
                <Tag 
                  color={member.isMatched ? 'green' : 'orange'}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs m-0 transition-all ${
                    member.remark ? 'cursor-help border-dashed !border-slate-400 shadow-sm' : ''
                  } ${
                    member.isMatched ? 'border-green-100 bg-green-50/50' : 'border-orange-100 bg-orange-50/50'
                  }`}
                >
                  <span className="font-medium text-gray-800">
                    {member.name}
                  </span>
                  {!member.isMatched && (
                    <span className="text-[10px] text-orange-600 bg-orange-100/60 px-1 rounded scale-95 font-normal shrink-0">
                      未匹配
                    </span>
                  )}
                </Tag>
              );

              return member.remark ? (
                <Tooltip key={idx} title={member.remark} placement="top">
                  {tagComponent}
                </Tooltip>
              ) : (
                React.cloneElement(tagComponent, { key: idx })
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {crmFeatureMode === 'stats' ? (
        <CrmStatsView
          contacts={contacts}
          tagTree={processedTagTree}
          onContactClick={(contact) => setDetailContact(contact)}
        />
      ) : (
      <Layout className="max-w-[100vw] mx-auto bg-transparent flex flex-row relative h-full overflow-hidden">
        
        {/* 大屏模式下的常驻/可折叠 Sider */}
        {!isSmallScreen && (
          <Sider
            theme="light"
            trigger={null}
            collapsible
            collapsed={siderCollapsed}
            collapsedWidth={0}
            width={siderWidth}
            className="bg-white transition-all duration-300 border-r border-gray-200 overflow-hidden"
          >
            {renderSidebarInner()}
          </Sider>
        )}

        {/* 隐形拖拽条：非小屏且未收起时才渲染 */}
        {!isSmallScreen && !siderCollapsed && (
          <div
            onMouseDown={handleMouseDown}
            className="absolute top-0 bottom-0 cursor-col-resize group flex items-center justify-center transition-colors"
            style={{
              left: `${siderWidth}px`,
              width: '8px',
              marginLeft: '-4px',
              zIndex: 50,
            }}
          >
            <div className="w-[4px] h-full bg-transparent group-hover:bg-blue-500/40 group-hover:active:bg-blue-500/80 transition-all duration-200 ease-in-out" />
          </div>
        )}

        {/* 小屏/移动端形态下的弹出式 Drawer 侧栏 */}
        <Drawer
          placement="left"
          onClose={() => setDrawerSidebarVisible(false)}
          open={isSmallScreen && drawerSidebarVisible}
          size={480}
          styles={{ body: { padding: 0 } }}
          // 1. 动态对齐 Drawer 的标题栏，根据当前 crmFeatureMode 自动切换显示
          title={<SidebarTitle mode={crmFeatureMode} />}
          // 2. 动态分发 Drawer 的右侧功能区按钮
          extra={
            <SidebarExtra
              mode={crmFeatureMode}
              selectedTagPath={selectedTagPath}
              setSelectedTagPath={setSelectedTagPath}
              onManageTags={() => setTagManageVisible(true)}
              onManageTopics={() => sidebarRef.current?.openManageModal()} // 👈 通过单 ref 直接唤起主题管理
              editMode={editMode}
            />
          }
          className='select-none'
        >
          {/* 3. 传入 true 隐藏 Drawer 内部主体的原有头部，避免重复渲染 */}
          {renderSidebarInner(true)}
        </Drawer>
        
        {/* 右侧主视窗内容区 */}
        <Content className="flex-1 min-w-0 flex flex-col h-full bg-gray-50/50">
          <SearchFilter
            searchTxt={searchTxt}
            setSearchTxt={setSearchTxt}
            searchFields={searchFields}
            onSearchFieldsChange={handleSearchFieldsChange}
          />

          <div id="crm-content" className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex justify-center items-center py-24"><Spin size="large" description="加载中..." /></div>
            ) : filteredContacts.length > 0 ? (
              <>
                {viewMode === 'card' && (
                  <div ref={gridRef} className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-6">
                    {pagedContacts.map(item => (
                      <ContactCard
                        key={item.id}
                        contact={item}
                        onClick={() => handleOpenEdit(item)}
                        onRelatedClick={handleRelatedClick}
                        avatarConfig={avatarConfig}
                      />
                    ))}
                  </div>
                )}
                {viewMode === 'mini' && (
                  <div ref={gridRef} className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-4">
                    {pagedContacts.map(item => (
                      <ContactMiniCard
                        key={item.id}
                        contact={item}
                        onClick={() => setDetailContact(item)}
                        avatarConfig={avatarConfig}
                      />
                    ))}
                  </div>
                )}
                {viewMode === 'list' && (
                  <ContactListTable
                    dataSource={pagedContacts}
                    columnConfigs={columnConfigs}
                    setDetailContact={setDetailContact}
                    setEditingContact={setEditingContact}
                    setFormVisible={setFormVisible}
                    handleDeleteContact={handleDeleteContact}
                    avatarConfig={avatarConfig}
                    editMode={editMode}
                  />
                )}
                <div className="text-center text-gray-400 text-xs mt-8 pb-4 select-none tracking-wide">
                  {isLastPage ? (
                    <span>— 这是最后一页了 —</span>
                  ) : (
                    <span
                      className="text-blue-400/80 cursor-pointer hover:text-blue-500 transition-colors"
                      onClick={() => setCurrentPage(safeCurrentPage + 1)}
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

          <CrmBottomBar
            crmFeatureMode={crmFeatureMode}
            selectedTopic={selectedTopic}
            selectedTagPath={selectedTagPath}
            currentPage={safeCurrentPage}
            pageSize={activePageSize}
            total={effectiveTotal}
            filteredContactsCount={filteredContacts.length}
            activeContactsCount={topicContacts.length}
            totalContactsCount={contacts.length}
            pageSizeOptions={isGridView
              ? ['1', '2', '3', '4', '5', '6', '8', '10']
              : Array.from({ length: 20 }, (_, i) => String((i + 1) * 5))
            }
            sizeChangerLabel={isGridView ? '行' : '条'}
            paginationReady={gridReady}
            onPageChange={handlePageChange}
            siderCollapsed={isSmallScreen ? drawerSidebarVisible : siderCollapsed}
            onToggleSider={handleToggleSider}
          />
        </Content>
      </Layout>
      )}

      <ContactForm
        visible={formVisible}
        contact={editingContact}
        tagTree={tagTree}
        contacts={contacts}
        onCancel={() => { setFormVisible(false); setEditingContact(null); }}
        onSave={handleSaveContact}
        onDelete={handleDeleteContact}
      />
      <ColumnSetting
        visible={settingVisible}
        columns={columnConfigs}
        onClose={() => setSettingVisible(false)}
        onSave={handleColumnConfigsChange}
      />
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
        className='select-none'
      >
        {detailContact && (
          <div className="pt-4">
            <ContactCard
              contact={detailContact}
              onClick={() => {
                if (!editMode) return; // 只读模式下不允许从详情视图跳转到编辑弹窗
                const currentContact = detailContact;
                setDetailContact(null);
                setEditingContact(currentContact);
                setFormVisible(true);
              }}
              onRelatedClick={handleRelatedClick}
              noBorder={true}
              avatarConfig={avatarConfig}
            />
          </div>
        )}
      </Modal>

      <ContactSequenceModal
        open={sequenceModalVisible}
        onClose={() => setSequenceModalVisible(false)}
        contacts={contacts}
        onSaveSuccess={fetchData}
      />

      <TagManagementModal
        visible={tagManageVisible}
        onClose={() => { setTagManageVisible(false); fetchData(); }}
        tagTree={tagTree}
      />

      <FloatButton.Group>
        {/* 回到顶部 */}
        <FloatButton.BackTop duration={300} visibilityHeight={150} target={() => document.getElementById('crm-content') || window} style={{ position: 'static' }} />
        {/* 当处于列表视图时，显示列设置悬浮按钮 */}
        {viewMode === 'list' && (
          <FloatButton icon={<TableOutlined />} tooltip="列设置" onClick={() => setSettingVisible(true)} />
        )}
        {/* 人物序列调整 */}
        {crmFeatureMode === 'tags' && <FloatButton 
          icon={<OrderedListOutlined />} 
          tooltip="管理人员序列" 
          onClick={() => setSequenceModalVisible(true)} 
        />}
        {/* 头像展示设置 */}
        {(crmFeatureMode === 'tags' || crmFeatureMode === 'topics') && <FloatButton icon={<UserOutlined />} tooltip="头像展示设置" onClick={() => setAvatarDrawerVisible(true)} />}
      </FloatButton.Group>

      <Drawer title="头像展示全局配置" placement="bottom" height={200} onClose={() => setAvatarDrawerVisible(false)} open={avatarDrawerVisible} destroyOnClose>
        <div className="max-w-md mx-auto select-none">
          <Flex vertical gap="middle">
            <Flex align="center" justify="space-between" className="py-1">
              <span className="font-medium text-gray-800">头像缩略图</span>
              <Checkbox checked={showAvatarThumb} onChange={(e) => { setShowAvatarThumb(e.target.checked); localStorage.setItem('crm_show_avatar_thumb', String(e.target.checked)); }}>
                显示真实头像
              </Checkbox>
            </Flex>
            <Flex align="center" justify="space-between" className="py-1">
              <span className="font-medium text-gray-800">未渲染时兜底</span>
              <Radio.Group value={avatarFallbackType} buttonStyle="solid" optionType="button" onChange={(e) => { setAvatarFallbackType(e.target.value); localStorage.setItem('crm_avatar_fallback_type', e.target.value); }}>
                <Radio value="default">默认占位</Radio>
                <Radio value="lastname">姓氏</Radio>
                <Radio value="fullname">全名</Radio>
              </Radio.Group>
            </Flex>
          </Flex>
        </div>
      </Drawer>
    </>
  );
}