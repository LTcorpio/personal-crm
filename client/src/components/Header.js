import { useState, useEffect } from 'react';
import { Button, Drawer, Segmented, Divider, Menu, Tooltip } from 'antd';
import {
  PlusOutlined,
  AppstoreOutlined,
  BarsOutlined,
  HarmonyOSOutlined,
  TagsOutlined,
  BarChartOutlined,
  ApartmentOutlined,
  FileTextOutlined,
  MenuOutlined,
  ToolOutlined,
  EditOutlined,
  EyeOutlined,
  TableOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

// 品牌 LOGO：渐变圆角方块 + 人脉网络节点，寓意「个人人脉管理」
function BrandLogo({ size = 40 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 drop-shadow-sm"
      aria-label="个人 CRM 系统 Logo"
    >
      <defs>
        <linearGradient id="crmLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="55%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#crmLogoGradient)" />
      {/* 人脉连接线 */}
      <path
        d="M20 16 L11.5 24 M20 16 L28.5 24 M13 26.5 L27 26.5"
        stroke="white"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* 中心人物节点 */}
      <circle cx="20" cy="13" r="4.2" fill="white" />
      <path d="M14 22c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5v1.5H14V22z" fill="white" opacity="0.95" />
      {/* 两侧人物节点 */}
      <circle cx="11" cy="25" r="3" fill="white" opacity="0.85" />
      <path d="M8 31.5c0-2.4 1.8-4 3.5-4s3.5 1.6 3.5 4v1H8v-1z" fill="white" opacity="0.8" />
      <circle cx="29" cy="25" r="3" fill="white" opacity="0.85" />
      <path d="M26 31.5c0-2.4 1.8-4 3.5-4s3.5 1.6 3.5 4v1H26v-1z" fill="white" opacity="0.8" />
    </svg>
  );
}

export default function Header({ viewMode, setViewMode, crmFeatureMode, setCrmFeatureMode, editMode = true, onToggleEditMode, onAddContact }) {
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
  // 判断当前是否在名单管理页面
  const isRosterPage = location.pathname === '/rosters';
  // 当前路由对应的菜单 key
  const currentRouteKey = isCrmPage ? 'crm' : (isRosterPage ? 'rosters' : 'tools');

  // 当打开抽屉时，去 /public 目录异步获取使用说明
  useEffect(() => {
    if (drawerVisible && !readmeContent) {
      fetch('/readme.md') // 对应 public/readme.md
        .then((res) => res.text())
        .then((text) => setReadmeContent(text))
        .catch((err) => console.error('加载使用说明失败:', err));
    }
  }, [drawerVisible, readmeContent]);

  // 桌面端页面导航菜单项
  const pageNavItems = [
    {
      key: 'crm',
      icon: <TagsOutlined />,
      label: '人脉管理',
    },
    {
      key: 'rosters',
      icon: <TableOutlined />,
      label: '名单管理',
    },
    {
      key: 'tools',
      icon: <ToolOutlined />,
      label: '实用工具',
    },
  ];

  // CRM 功能模式 Segmented 选项
  const crmModeOptions = [
    { value: 'tags', label: (<span className="w-full justify-center flex items-center gap-1.5"><TagsOutlined />按标签</span>) },
    { value: 'topics', label: (<span className="w-full justify-center flex items-center gap-1.5"><ApartmentOutlined />按主题</span>) },
    { value: 'stats', label: (<span className="w-full justify-center flex items-center gap-1.5"><BarChartOutlined />统计</span>) },
  ];

  // 视图布局 Segmented 选项
  const viewModeOptions = [
    { value: 'card', icon: <AppstoreOutlined /> },
    { value: 'mini', icon: <HarmonyOSOutlined /> },
    { value: 'list', icon: <BarsOutlined /> },
  ];

  return (
    <header className="bg-gray-50 shadow-sm border-b border-gray-200 sticky top-0 z-40 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between relative">
      {/* 1. 左侧区域：Logo + 桌面端页面导航 + CRM 功能模式 */}
      <div className="flex items-center gap-4 md:gap-6 min-w-0">
        <div className="flex items-center gap-2 md:gap-2.5 cursor-pointer shrink-0" onClick={() => navigate('/')}>
          <BrandLogo size={38} />
          <h1 className="text-lg md:text-xl font-bold tracking-tight m-0 sm:block">
            个人 CRM 系统
          </h1>
        </div>

        {/* 桌面端页面导航：中屏及以上显示 */}
        <div className="hidden lg:flex items-center shrink-0">
          <Menu
            mode="horizontal"
            selectedKeys={[currentRouteKey]}
            onClick={({ key }) => {
              if (key === 'crm') navigate('/');
              else if (key === 'rosters') navigate('/rosters');
              else if (key === 'tools') navigate('/tools');
            }}
            items={pageNavItems}
            className="!border-b-0 !bg-transparent !font-medium"
            style={{ minWidth: 320, lineHeight: '40px' }}
            disabledOverflow
          />
        </div>

        {/* CRM 功能模式切换：紧跟在页面导航之后，仅在 CRM 页面且中屏以上显示 */}
        {isCrmPage && (
          <div className="hidden lg:flex items-center shrink-0">
            <Segmented
              size="middle"
              value={crmFeatureMode}
              onChange={(v) => setCrmFeatureMode(v)}
              options={crmModeOptions}
            />
          </div>
        )}
      </div>

      {/* 2. 右侧区域：动作操作区 */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {isCrmPage && crmFeatureMode !== 'stats' && (
          <>
            {/* 新增联系人：仅编辑模式下显示，只读模式直接隐藏 */}
            {editMode && crmFeatureMode === 'tags' && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                className="rounded-lg font-medium shadow-sm flex items-center justify-center"
                onClick={onAddContact}
                title="新增联系人"
              >
                <span className="hidden xl:inline">新增联系人</span>
              </Button>
            )}

            {/* 桌面端视图切换：中屏及以上显示 */}
            <div className="hidden lg:block">
              <Segmented
                options={viewModeOptions}
                value={viewMode}
                onChange={e => setViewMode(e)}
              />
            </div>

            {/* 编辑/只读模式切换：圆形按钮，以颜色区分当前状态 */}
            {/* 编辑模式 = 蓝色（活跃），只读模式 = 绿色（安全浏览） */}
            {onToggleEditMode && (
              <Tooltip title={editMode ? '编辑模式 · 点击切换为只读' : '只读模式 · 点击开启编辑'}>
                <Button
                  shape="circle"
                  icon={editMode ? <EditOutlined /> : <EyeOutlined />}
                  onClick={() => onToggleEditMode(!editMode)}
                  type={editMode ? 'primary' : 'default'}
                  style={!editMode ? {
                    backgroundColor: '#52c41a',
                    borderColor: '#52c41a',
                    color: '#fff',
                  } : undefined}
                />
              </Tooltip>
            )}
          </>
        )}

        {/* 使用说明按钮：圆形图标，与编辑模式按钮风格一致 */}
        <Tooltip title="使用说明">
          <Button
            shape="circle"
            icon={<FileTextOutlined />}
            onClick={() => setDrawerVisible(true)}
          />
        </Tooltip>

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
      >
        <div className="flex flex-col gap-5">
          {/* 模块1：系统页面路由切换 */}
          <div>
            <div className="text-xs font-semibold text-gray-400 mb-2 tracking-wider">当前系统</div>
            <Segmented
              block
              value={currentRouteKey}
              onChange={(v) => {
                if (v === 'crm') navigate('/');
                else if (v === 'rosters') navigate('/rosters');
                else if (v === 'tools') navigate('/tools');
                setMobileMenuVisible(false);
              }}
              options={[
                { value: 'crm', label: (<span className="w-full justify-center flex items-center gap-1"><TagsOutlined />人脉</span>) },
                { value: 'rosters', label: (<span className="w-full justify-center flex items-center gap-1"><TableOutlined />名单</span>) },
                { value: 'tools', label: (<span className="w-full justify-center flex items-center gap-1"><ToolOutlined />工具</span>) },
              ]}
            />
          </div>

          {isCrmPage && <Divider className="my-1 border-gray-100" />}

          {/* 模块2：CRM 查看维度的切换 */}
          {isCrmPage && (
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-2 tracking-wider">功能模式</div>
              <Segmented
                block
                value={crmFeatureMode}
                onChange={(value) => {
                  setCrmFeatureMode(value);
                  setMobileMenuVisible(false);
                }}
                options={crmModeOptions}
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

          {/* 模块3.5：编辑模式开关 */}
          {isCrmPage && crmFeatureMode !== 'stats' && onToggleEditMode && (
            <>
              <Divider className="my-1 border-gray-100" />
              <div>
                <div className="text-xs font-semibold text-gray-400 mb-2 tracking-wider">编辑模式</div>
                <Segmented
                  block
                  value={editMode}
                  onChange={(v) => onToggleEditMode(v)}
                  options={[
                    { value: true, icon: <EditOutlined />, label: '编辑模式' },
                    { value: false, icon: <EyeOutlined />, label: '只读模式' },
                  ]}
                />
              </div>
            </>
          )}

          </div>
      </Drawer>

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
