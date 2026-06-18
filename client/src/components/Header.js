import { useState, useEffect } from 'react';
import { Button, Radio, Select, Drawer, Segmented, Divider } from 'antd';
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
  QuestionCircleOutlined,
  MenuOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

export default function Header({ viewMode, setViewMode, crmFeatureMode, setCrmFeatureMode, onAddContact }) {
  const navigate = useNavigate();
  const location = useLocation();

  // 控制系统说明抽屉显隐的状态
  const [drawerVisible, setDrawerVisible] = useState(false);
  // 控制移动端配置菜单抽屉显隐的状态
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
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

  // 封装统一的说明文档触发行为
  const handleOpenReadme = () => {
    setMobileMenuVisible(false); // 如果是在移动端菜单里点的，先关掉菜单
    setDrawerVisible(true);
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between relative select-none">
      
      {/* 1. 左侧区域：Logo + 桌面端页面级路由切换 */}
      <div className="flex items-center gap-4 md:gap-6">
        <div className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <div className="bg-blue-600 text-white w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center font-bold text-lg md:text-xl shadow-md shrink-0">
            C
          </div>
          <h1 className="text-lg md:text-xl font-bold tracking-tight m-0 sm:block">
            个人 CRM 系统
          </h1>
        </div>

        {/* 桌面端页面导航：中屏及以上显示 */}
        <div className="hidden lg:block">
          <Radio.Group 
            value={isCrmPage ? 'crm' : 'calculator'} 
            onChange={(e) => navigate(e.target.value === 'crm' ? '/' : '/calculator')}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="crm"><TeamOutlined />
              <span className='hidden xl:inline ml-1.5'>人脉管理</span>
            </Radio.Button>
            <Radio.Button value="calculator"><CalculatorOutlined />
              <span className='hidden xl:inline ml-1.5'>亲戚计算器</span>
            </Radio.Button>
          </Radio.Group>
        </div>
      </div>

      {/* 2. 中间区域：桌面端核心功能模式选择（绝对定位居中，中屏及以上显示） */}
      {isCrmPage && (
        <div className="hidden md:block absolute left-1/2 -translate-x-1/2">
          <span className="text-gray-500 mr-2 text-sm">模式选择：</span>
          <Select
            value={crmFeatureMode}
            onChange={(value) => setCrmFeatureMode(value)}
            style={{ width: 180 }}
            options={[
              { value: 'tags', label: <><TagsOutlined /> 按标签查看</> },
              { value: 'topics', label: <><ApartmentOutlined /> 按主题查看</> },
              { value: 'stats', label: <><BarChartOutlined /> 信息统计</> },
            ]}
          />
        </div>
      )}

      {/* 3. 右侧区域：动作操作区 */}
      <div className="flex items-center gap-2 md:gap-3">
        {isCrmPage && crmFeatureMode !== 'stats' && (
          <>
            {/* 核心“新增人脉”高频动作：移动端保留为 Icon 按钮，大屏显示完整文字 */}
            {crmFeatureMode === 'tags' && (
              <Button 
                type="primary" 
                icon={<PlusOutlined />} 
                className="rounded-lg font-medium shadow-sm flex items-center justify-center" 
                onClick={onAddContact}
              >
                <span className="hidden xl:inline">新增联系人</span>
              </Button>
            )}
            
            {/* 桌面端视图切换：中屏及以上显示 */}
            <div className="hidden lg:block">
              <Segmented
                options={[
                  { value: 'card', icon: <AppstoreOutlined /> },
                  { value: 'mini', icon: <HarmonyOSOutlined /> },
                  { value: 'list', icon: <BarsOutlined /> },
                ]}
                value={viewMode}
                onChange={e => setViewMode(e)}
              />
            </div>
          </>
        )}
        
        {/* 桌面端说明文档按钮 */}
        <Button 
          icon={<QuestionCircleOutlined />} 
          onClick={handleOpenReadme}
          // className="hidden md:inline-flex"
        >
          <span className="hidden xl:inline">使用说明</span>
        </Button>

        {/* 移动端菜单唤醒按钮：仅在小屏下显示 */}
        <Button
          type="text"
          icon={<MenuOutlined className="text-lg" />}
          className="lg:hidden flex items-center justify-center"
          onClick={() => setMobileMenuVisible(true)}
        />
      </div>

      {/* ==================== 移动端专属控制收纳抽屉 ==================== */}
      <Drawer
        title="控制面板"
        placement="right"
        onClose={() => setMobileMenuVisible(false)}
        open={mobileMenuVisible}
        size={360}
        className='select-none'
      >
        <div className="flex flex-col gap-5">
          {/* 模块1：系统页面路由切换 */}
          <div>
            <div className="text-xs font-semibold text-gray-400 mb-2 tracking-wider">当前系统</div>
            <Radio.Group 
              value={isCrmPage ? 'crm' : 'calculator'} 
              onChange={(e) => {
                navigate(e.target.value === 'crm' ? '/' : '/calculator');
                setMobileMenuVisible(false);
              }}
              optionType="button"
              buttonStyle="solid"
              className="w-full flex"
            >
              <Radio.Button value="crm" className="flex-1 text-center"><TeamOutlined /> 人脉管理</Radio.Button>
              <Radio.Button value="calculator" className="flex-1 text-center"><CalculatorOutlined /> 亲戚计算器</Radio.Button>
            </Radio.Group>
          </div>

          {isCrmPage && <Divider className="my-1 border-gray-100" />}

          {/* 模块2：CRM 查看维度的切换 */}
          {isCrmPage && (
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-2 tracking-wider">功能模式</div>
              <Select
                value={crmFeatureMode}
                onChange={(value) => {
                  setCrmFeatureMode(value);
                  setMobileMenuVisible(false);
                }}
                className="w-full"
                options={[
                  { value: 'tags', label: <><TagsOutlined /> 按标签查看</> },
                  { value: 'topics', label: <><ApartmentOutlined /> 按主题查看</> },
                  { value: 'stats', label: <><BarChartOutlined /> 信息统计</> },
                ]}
              />
            </div>
          )}

          {isCrmPage && crmFeatureMode !== 'stats' && <Divider className="my-1 border-gray-100" />}

          {/* 模块3：人脉平铺样式的切换 */}
          {isCrmPage && crmFeatureMode !== 'stats' && (
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-2 tracking-wider">视图布局</div>
              <Segmented
                block
                options={[
                  { value: 'card', icon: <AppstoreOutlined />, label: '卡片' },
                  { value: 'mini', icon: <HarmonyOSOutlined />, label: '头像' },
                  { value: 'list', icon: <BarsOutlined />, label: '列表' },
                ]}
                value={viewMode}
                onChange={e => setViewMode(e)}
              />
            </div>
          )}

          <Divider className="my-1 border-gray-100" />

          {/* 模块4：文档与系统支持 */}
          <Button 
            block
            type="dashed"
            icon={<QuestionCircleOutlined />} 
            onClick={handleOpenReadme}
            className="mt-2 text-gray-600"
          >
            系统使用说明
          </Button>
        </div>
      </Drawer>

      {/* ==================== 系统核心说明文档抽屉 ==================== */}
      <Drawer
        title="系统使用说明"
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width={window.innerWidth > 768 ? 720 : '100%'} // 智能判定：移动端下直接全屏阅读体验更佳
      >
        <div className="prose max-w-none px-2">
          <ReactMarkdown>{readmeContent || '正在加载说明文档...'}</ReactMarkdown>
        </div>
      </Drawer>

    </header>
  );
}