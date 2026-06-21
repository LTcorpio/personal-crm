import { useState, useEffect } from 'react';
import { Button, Radio, Select, Drawer, Segmented, Divider, Form, Modal, Input, message, Dropdown, Avatar } from 'antd';
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
  MenuOutlined,
  UserSwitchOutlined,
  LogoutOutlined,
  LockOutlined,
  UserOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { authApi } from '../api/crmApi';

export default function Header({ viewMode, setViewMode, crmFeatureMode, setCrmFeatureMode, onAddContact }) {
  const navigate = useNavigate();
  const location = useLocation();

  // 控制系统说明抽屉显隐的状态
  const [drawerVisible, setDrawerVisible] = useState(false);
  // 控制移动端配置菜单抽屉显隐的状态
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  // 存储 markdown 文本内容
  const [readmeContent, setReadmeContent] = useState('');
  // 修改密码
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordForm] = Form.useForm();

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

  // 修改密码
  // 1. 下拉菜单项定义
  const userMenuItems = [
    {
      key: 'intro',
      label: '使用说明',
      icon: <QuestionCircleOutlined />,
    },
    {
      key: 'password',
      label: '修改密码',
      icon: <LockOutlined />,
    },
    {
      key: 'logout',
      label: '退出登录',
      icon: <LogoutOutlined />,
      danger: true,
    },
  ];

  // 2. 下拉菜单点击监听
  const handleMenuClick = ({ key }) => {
    if (key === 'intro') {
      setDrawerVisible(true);
    } else if (key === 'password') {
      setIsPasswordModalOpen(true);
    } else if (key === 'logout') {
      // 退出系统加一个防误触弹窗确认
      Modal.confirm({
        title: '提示',
        content: '确定要退出系统吗？',
        okText: '确定',
        cancelText: '取消',
        onOk: () => handleLogout(),
      });
    }
  };

  // 3. 更新密码的 API 请求体变更 (加入 oldPassword)
  const handleChangePassword = async (values) => {
    try {
      const res = await authApi.changePassword(values.oldPassword, values.newPassword);
      if (res.data && res.data.success) {
        message.success('密码修改成功，请重新登录！');
        setIsPasswordModalOpen(false);
        passwordForm.resetFields();
        handleLogout(); // 强制退出重新登录
      }
    } catch (error) {
      const msg = error.response?.data?.message || '原密码错误或网络异常';
      message.error(msg);
    }
  };

  // 退出登录
  const handleLogout = () => {
    localStorage.removeItem('crm_token'); // 清除本地凭证
    window.location.reload(); // 刷新页面，状态机自动退回登录卡片
  };

  return (
    <header className="bg-gray-50 shadow-sm border-b border-gray-200 sticky top-0 z-40 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between relative select-none">
      {/* 1. 左侧区域：Logo + 桌面端页面级路由切换 */}
      <div className="flex items-center gap-4 md:gap-6">
        <div className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <div className="bg-blue-600 text-white w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center font-bold text-lg md:text-xl shadow-md shrink-0">
            <TeamOutlined />
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
            <Radio.Button value="crm"><UserSwitchOutlined />
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
            {/* 移动端保留为 Icon 按钮，大屏显示完整文字 */}
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
        {/* <Button 
          icon={<QuestionCircleOutlined />} 
          onClick={handleOpenReadme}
          // className="hidden md:inline-flex"
        >
          <span className="hidden xl:inline">使用说明</span>
        </Button> */}

        <Dropdown menu={{ items: userMenuItems, onClick: handleMenuClick }} trigger={['click']} placement="bottomRight">
          <div className="hidden sm:flex items-center gap-2 cursor-pointer py-1 text-gray-600 hover:text-blue-600 transition-colors select-none">
            <Avatar style={{ backgroundColor: '#1677ff' }} icon={<UserOutlined />} size="small" />
            <span className="font-medium text-sm">管理员</span>
          </div>
        </Dropdown>

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
            onClick={() => setDrawerVisible(true)}
            className="mt-2 text-gray-600"
          >
            系统使用说明
          </Button>

          <Button 
            block
            type="dashed"
            icon={<LockOutlined />} 
            onClick={() => {
              setMobileMenuVisible(false); // 先关闭移动端控制面板
              setIsPasswordModalOpen(true); // 打开修改密码弹窗
            }}
            className="text-gray-600"
          >
            修改密码
          </Button>

          <Button 
            block
            danger
            type="primary"
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            className="rounded-lg font-medium shadow-sm bg-red-500 hover:bg-red-600"
          >
            退出系统
          </Button>
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

      <Modal
        title="修改管理员密码"
        open={isPasswordModalOpen}
        onOk={() => passwordForm.submit()}
        onCancel={() => {
          setIsPasswordModalOpen(false);
          passwordForm.resetFields();
        }}
        okText="确定修改"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={passwordForm} onFinish={handleChangePassword} layout="vertical" className="mt-4">
          <Form.Item
            name="oldPassword"
            label="当前旧密码"
            rules={[{ required: true, message: '请输入当前旧密码进行身份验证' }]}
          >
            <Input.Password placeholder="请输入当前旧密码" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="输入新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '为了系统安全，密码长度至少为 6 位' }
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入密码以确认' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致，请重新检查'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>

    </header>
  );
}
