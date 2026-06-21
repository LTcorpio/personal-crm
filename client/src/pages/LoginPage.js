import React, { useState } from 'react';
import { Button, Form, Input, message } from 'antd';
import { authApi } from '../api/crmApi';

export default function LoginPage({ onLoginSuccess }) {
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async (values) => {
    setLoginLoading(true);
    try {
      const res = await authApi.login(values.password);
      if (res.data && res.data.success) {
        const receivedToken = res.data.token;
        localStorage.setItem('crm_token', receivedToken);
        message.success('欢迎回来'); // 精简提示音
        onLoginSuccess(receivedToken);
      }
    } catch (error) {
      console.error(error);
      const errMsg = error.response?.data?.message || '密码错误或网络异常';
      message.error(errMsg);
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-slate-50 flex items-center justify-center p-6 select-none">
      
      {/* 极简白底卡片，微调圆角与阴影 */}
      <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200/60 p-8 shadow-sm">
        
        {/* 头部区域：无图标，纯文字排版 */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            个人 CRM 系统
          </h1>
          <p className="text-slate-400 text-xs mt-1.5">
            输入密码访问并管理人脉信息
          </p>
        </div>

        {/* 表单区域：去掉冗余装饰 */}
        <Form onFinish={handleLogin} layout="vertical" requiredMark={false}>
          <Form.Item
            name="password"
            label={<span className="text-slate-500 font-medium text-xs">访问密码</span>}
            rules={[{ required: true, message: '请输入密码' }]}
            className="mb-5"
          >
            <Input.Password 
              size="large"
              className="rounded-lg border-slate-200 h-10 hover:border-slate-300 focus:border-slate-400 shadow-none transition-colors"
            />
          </Form.Item>

          <Form.Item className="mb-0">
            <Button 
              type="primary" 
              htmlType="submit" 
              block 
              size="large" 
              loading={loginLoading}
              className="bg-slate-900 hover:bg-slate-800 active:bg-black border-none rounded-lg font-medium h-10 shadow-none text-white transition-colors"
            >
              进入
            </Button>
          </Form.Item>
        </Form>

      </div>
    </div>
  );
}