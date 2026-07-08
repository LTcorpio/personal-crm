import React from 'react';
import { Tabs, Card, Empty } from 'antd';
import { CalculatorOutlined, EnvironmentOutlined } from '@ant-design/icons';
import RelationshipCalculator from './RelationshipCalculator';

export default function ToolsPage() {
  const tabItems = [
    {
      key: 'calculator',
      label: (
        <span className="flex items-center gap-2">
          <CalculatorOutlined />
          亲戚计算器
        </span>
      ),
      children: <RelationshipCalculator />,
    },
    {
      key: 'division',
      label: (
        <span className="flex items-center gap-2">
          <EnvironmentOutlined />
          行政区划查询
        </span>
      ),
      children: (
        <div className="py-10 text-center">
          <Empty 
            description="行政区划查询功能正在开发中，敬请期待..." 
            image={Empty.PRESENTED_IMAGE_SIMPLE} 
          />
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 md:p-6 mx-auto">
      <Card>
        <Tabs 
          defaultActiveKey="calculator" 
          items={tabItems} 
          type="line"
          size="large"
          tabPlacement="start"
          className="min-h-[500px]"
        />
      </Card>
    </div>
  );
}