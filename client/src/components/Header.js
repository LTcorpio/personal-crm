import { Button, Radio } from 'antd';
import { PlusOutlined, AppstoreOutlined, BarsOutlined, HarmonyOSOutlined, TeamOutlined, CalculatorOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Header({ viewMode, setViewMode, onAddContact }) {
  const navigate = useNavigate();
  const location = useLocation();

  // 判断当前是否在 CRM 页面
  const isCrmPage = location.pathname === '/' || location.pathname === '/crm';

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
      {/* 左侧：Logo + 页面级路由切换 */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <div className="bg-blue-600 text-white w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xl shadow-md">C</div>
          <h1 className="text-xl font-bold tracking-tight m-0">个人 CRM 系统</h1>
        </div>

        {/* 页面级别导航栏 */}
        <Radio.Group 
          value={isCrmPage ? 'crm' : 'calculator'} 
          onChange={(e) => navigate(e.target.value === 'crm' ? '/' : '/calculator')}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="crm"><TeamOutlined /> 人脉管理</Radio.Button>
          <Radio.Button value="calculator"><CalculatorOutlined /> 亲戚计算器</Radio.Button>
        </Radio.Group>
      </div>

      {/* 右侧：动作按钮（仅在 CRM 页面显示） */}
      {isCrmPage && (
        <div className="flex gap-3">
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            className="rounded-lg font-medium shadow-sm" 
            onClick={onAddContact}
          >
            新增联系人
          </Button>
          <Radio.Group value={viewMode} onChange={(e) => setViewMode(e.target.value)} buttonStyle="solid">
            <Radio.Button value="card"><AppstoreOutlined /></Radio.Button>
            <Radio.Button value="mini"><HarmonyOSOutlined /></Radio.Button>
            <Radio.Button value="list"><BarsOutlined /></Radio.Button>
          </Radio.Group>
        </div>
      )}
    </header>
  );
}