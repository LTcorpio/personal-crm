import React, { useState } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import LoginPage from './pages/LoginPage';
import CrmPage from './pages/CrmPage';
import RelativeCalculatorPage from './pages/RelationshipCalculator';

export default function App() {
  // 检查本地是否存在 Token
  const [token, setToken] = useState(() => localStorage.getItem('crm_token'));

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

  // ==========================================
  // 情况 A：未登录，渲染独立密码保护界面
  // ==========================================
  if (!token) {
    return (
      <ConfigProvider locale={zhCN}>
        <LoginPage onLoginSuccess={(receivedToken) => setToken(receivedToken)} />
      </ConfigProvider>
    );
  }

  // ==========================================
  // 情况 B：已登录，正常渲染主系统布局
  // ==========================================
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <div className="h-screen bg-slate-50 text-slate-800 select-none flex flex-col">
          {/* 顶部主导航栏 */}
          <Header 
            viewMode={viewMode} 
            setViewMode={setViewMode} 
            crmFeatureMode={crmFeatureMode}
            setCrmFeatureMode={setCrmFeatureMode}
            onAddContact={() => { setEditingContact(null); setFormVisible(true); }} 
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
                  />
                } 
              />
              <Route 
                path="/crm" 
                element={<Navigate to="/" replace />} 
              />
              {/* 亲戚计算器页面 */}
              <Route 
                path="/calculator" 
                element={<RelativeCalculatorPage />} 
              />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </ConfigProvider>
  );
}
