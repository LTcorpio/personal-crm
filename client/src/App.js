import React, { useState, useMemo } from 'react';
import { ConfigProvider, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import CrmPage from './pages/CrmPage';
import ToolsPage from './pages/ToolsPage';
import RosterManagement from './pages/RosterManagement';
import { contactApi } from './api/crmApi';

export default function App() {
  // 模态框及弹窗控制
  const [formVisible, setFormVisible] = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  // 显示模式切换
  const [viewMode, setViewModeState] = useState(() => localStorage.getItem('crm_view_mode') || 'card');
  const setViewMode = (mode) => {
    setViewModeState(mode);
    localStorage.setItem('crm_view_mode', mode);
  };

  // CRM 功能模式切换
  const [crmFeatureMode, setCrmFeatureModeState] = useState(() => localStorage.getItem('crm_feature_mode') || 'tags');
  const setCrmFeatureMode = (mode) => {
    setCrmFeatureModeState(mode);
    localStorage.setItem('crm_feature_mode', mode);
  };

  // 编辑模式开关：关闭后不可管理标签/主题，也无法调出人员编辑弹窗
  // 默认只读模式（false），状态持久化到 localStorage
  const [editMode, setEditModeState] = useState(() => localStorage.getItem('crm_edit_mode') === 'true');
  const setEditMode = (mode) => {
    setEditModeState(mode);
    localStorage.setItem('crm_edit_mode', String(mode));
  };

  // ---------------- 显示类设置（统一收纳进 Header 的「显示设置」浮窗） ----------------

  // 头像展示配置：卡片 / 头像 / 列表三处共用
  const [showAvatarThumb, setShowAvatarThumbState] = useState(
    () => localStorage.getItem('crm_show_avatar_thumb') !== 'false'
  );
  const setShowAvatarThumb = (value) => {
    setShowAvatarThumbState(value);
    localStorage.setItem('crm_show_avatar_thumb', String(value));
  };

  const [avatarFallbackType, setAvatarFallbackTypeState] = useState(
    () => localStorage.getItem('crm_avatar_fallback_type') || 'default'
  );
  const setAvatarFallbackType = (value) => {
    setAvatarFallbackTypeState(value);
    localStorage.setItem('crm_avatar_fallback_type', value);
  };

  const avatarConfig = useMemo(
    () => ({ showAvatarThumb, avatarFallbackType }),
    [showAvatarThumb, avatarFallbackType]
  );

  // 浮窗里的三个弹窗入口：显隐状态由 App 持有，Header 负责触发、CrmPage 负责渲染
  const [columnSettingVisible, setColumnSettingVisible] = useState(false);
  const [cardFieldSettingVisible, setCardFieldSettingVisible] = useState(false);
  const [sequenceModalVisible, setSequenceModalVisible] = useState(false);

  // 补齐缺失头像：动作放在 App（按钮在 Header），完成后用 refreshTick 通知 CrmPage 重拉列表
  const [avatarSyncing, setAvatarSyncing] = useState(false);
  const [crmRefreshTick, setCrmRefreshTick] = useState(0);

  const handleSyncAvatars = async () => {
    setAvatarSyncing(true);
    try {
      const res = await contactApi.syncAvatars();
      const result = res.data?.result || {};
      if (result.failed > 0) {
        message.warning(`${res.data?.message}（成功 ${result.fetched} 位，失败 ${result.failed} 位）`);
      } else {
        message.success(res.data?.message || '头像同步完成');
      }
      setCrmRefreshTick((tick) => tick + 1);
    } catch (err) {
      message.error('头像同步失败，请检查 Immich 服务是否可达');
    } finally {
      setAvatarSyncing(false);
    }
  };

  // 传给 Header「显示设置」浮窗的一揽子配置
  const displaySettings = {
    viewMode,
    setViewMode,
    onOpenColumnSetting: () => setColumnSettingVisible(true),
    onOpenCardFieldSetting: () => setCardFieldSettingVisible(true),
    showAvatarThumb,
    setShowAvatarThumb,
    avatarFallbackType,
    setAvatarFallbackType,
    avatarSyncing,
    onSyncAvatars: handleSyncAvatars,
    onOpenSequence: () => setSequenceModalVisible(true),
  };

  // 身份认证由反向代理层（Authelia SSO）统一完成，前端直接渲染主系统布局
  return (
    <ConfigProvider
      theme={{
        token: {
          fontFamily: '"LXGW WenKai Screen", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          motionDurationFast: '0.1s',
          motionDurationMid: '0.1s',
          motionDurationSlow: '0.1s',
        },
      }}
      locale={zhCN}
    >
      <BrowserRouter>
        <div className="h-screen bg-slate-50 text-slate-800 flex flex-col">
          {/* 顶部主导航栏 */}
          <Header
            crmFeatureMode={crmFeatureMode}
            setCrmFeatureMode={setCrmFeatureMode}
            editMode={editMode}
            onToggleEditMode={setEditMode}
            onAddContact={() => { setEditingContact(null); setFormVisible(true); }}
            displaySettings={displaySettings}
          />

          {/* 路由视图 */}
          <div className="flex-1 min-h-0 w-full relative">
            <Routes>
              {/* 默认根路径指向 CRM 页面 */}
              <Route
                path="/"
                element={
                  <CrmPage
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    crmFeatureMode={crmFeatureMode}
                    formVisible={formVisible}
                    setFormVisible={setFormVisible}
                    editingContact={editingContact}
                    setEditingContact={setEditingContact}
                    editMode={editMode}
                    setEditMode={setEditMode}
                    avatarConfig={avatarConfig}
                    refreshTick={crmRefreshTick}
                    columnSettingVisible={columnSettingVisible}
                    setColumnSettingVisible={setColumnSettingVisible}
                    cardFieldSettingVisible={cardFieldSettingVisible}
                    setCardFieldSettingVisible={setCardFieldSettingVisible}
                    sequenceModalVisible={sequenceModalVisible}
                    setSequenceModalVisible={setSequenceModalVisible}
                  />
                }
              />
              <Route
                path="/crm"
                element={<Navigate to="/" replace />}
              />
              {/* 名单管理页面 */}
              <Route
                path="/rosters"
                element={<RosterManagement />}
              />
              {/* 亲戚计算器页面 */}
              <Route
                path="/tools"
                element={<ToolsPage />}
              />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </ConfigProvider>
  );
}
