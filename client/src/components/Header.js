import { useState, useEffect } from 'react';
import { Button, Radio, Select, Drawer, Segmented } from 'antd';
import {
  PlusOutlined,
  AppstoreOutlined,
  BarsOutlined,
  HarmonyOSOutlined,
  TeamOutlined,
  CalculatorOutlined,
  TagsOutlined,
  BarChartOutlined,
  ApartmentOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

export default function Header({ viewMode, setViewMode, crmFeatureMode, setCrmFeatureMode, onAddContact }) {
  const navigate = useNavigate();
  const location = useLocation();

  // 控制抽屉显隐的状态
  const [drawerVisible, setDrawerVisible] = useState(false);
  // 存储 markdown 文本内容
  const [readmeContent, setReadmeContent] = useState('');

  // 判断当前是否在 CRM 页面
  const isCrmPage = location.pathname === '/' || location.pathname === '/crm';

  // 当打开抽屉时，去 /public 目录异步获取使用说明
  useEffect(() => {
    if (drawerVisible && !readmeContent) {
      fetch('/readme.md') // 对应 public/readme.md
        .then((res) => res.text())
        .then((text) => setReadmeContent(text))
        .catch((err) => console.error('加载使用说明失败:', err));
    }
  }, [drawerVisible, readmeContent]);

  return (
    <header className="bg-cyan shadow-sm border-b border-gray-200 sticky top-0 z-40 px-6 py-4 flex items-center justify-between relative">
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

      {isCrmPage && (
        <div className="absolute left-1/2 -translate-x-1/2">
          模式选择：
          <Select
            value={crmFeatureMode}
            onChange={(value) => setCrmFeatureMode(value)}
            style={{ width: 200 }}
            options={[
              { value: 'tags', label: <><TagsOutlined /> 按标签查看</> },
              { value: 'topics', label: <><ApartmentOutlined /> 按主题查看</> },
              { value: 'stats', label: <><BarChartOutlined /> 信息统计</> },
            ]}
          />
        </div>
      )}

      {/* 右侧：动作按钮 */}
      <div className="flex items-center gap-3"> {/* 修改点：不论是否在 CRM 页，右侧容器都保持展示，方便放“使用说明” */}
        {isCrmPage && crmFeatureMode !== 'stats'  && (
          <>
            {crmFeatureMode === 'tags' && <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              className="rounded-lg font-medium shadow-sm" 
              onClick={onAddContact}
            >
              新增联系人
            </Button>}
            <Segmented
              options={[
                { value: 'card', icon: <AppstoreOutlined /> },
                { value: 'mini', icon: <HarmonyOSOutlined /> },
                { value: 'list', icon: <BarsOutlined /> },
              ]}
              value={viewMode}
              onChange={e => setViewMode(e)}
            />
          </>
        )}
        
        {/* 使用说明按钮 */}
        <Button 
          icon={<QuestionCircleOutlined />} 
          onClick={() => setDrawerVisible(true)}
        >
          使用说明
        </Button>
      </div>

      {/* 右侧滑出的抽屉组件 */}
      <Drawer
        title="系统使用说明"
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width={720}
      >
        {/* 使用 Tailwind 的 prose 样式美化 Markdown 渲染 */}
        <div className="prose max-w-none">
          <ReactMarkdown>{readmeContent || '正在加载说明文档...'}</ReactMarkdown>
        </div>
      </Drawer>
    </header>
  );
}