import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { FloatButton } from 'antd';
import Header from './components/Header';
import CrmPage from './pages/CrmPage';
import RelativeCalculatorPage from './pages/RelationshipCalculator';

export default function App() {
  // 模态框及弹窗控制
  const [formVisible, setFormVisible] = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  // 显示模式切换
    const [viewMode, setViewModeState] = useState(() =>localStorage.getItem('crm_view_mode') || 'card');
    const setViewMode = (mode) => {
      setViewModeState(mode);
      localStorage.setItem('crm_view_mode', mode);
    };

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-800 select-none">
        {/* 顶部主导航栏 */}
        <Header 
          viewMode={viewMode} 
          setViewMode={setViewMode} 
          onAddContact={() => { setEditingContact(null); setFormVisible(true); }} 
        />

        {/* 路由视图 */}
        <Routes>
          {/* 默认根路径指向 CRM 页面 */}
          <Route 
            path="/" 
            element={
              <CrmPage 
                viewMode={viewMode} 
                setViewMode={setViewMode}
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

        <FloatButton.BackTop 
          duration={300} // 回到顶部的动画时长（毫秒）
          visibilityHeight={300} // 滚动到多高（像素）才显示该按钮
          style={{ right: 24, bottom: 24 }} // 调整在右下角的位置
        />
      </div>
    </BrowserRouter>
  );
}