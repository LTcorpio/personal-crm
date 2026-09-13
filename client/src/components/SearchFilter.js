import React, { useState, useEffect } from 'react';
import { Input, Checkbox, Popover, Button, Space } from 'antd';
import { FilterOutlined, SearchOutlined } from '@ant-design/icons';

// 完整的可查选项映射
const OPTIONS = [
  { label: '姓名', value: 'name' },
  { label: '曾用名', value: 'former_name' },
  { label: '称呼', value: 'title' },
  { label: '联系方式', value: 'contact' },
  { label: '身份证号', value: 'id_card' },
  { label: '籍贯', value: 'native_place' },
  { label: '现居地区', value: 'location' },
  { label: '详细地址', value: 'address' },
  { label: '民族', value: 'ethnicity' },
  { label: '阳历生日', value: 'birthday_solar' },
  { label: '阴历生日', value: 'birthday_lunar' },
  { label: '死亡日期', value: 'deathday' },
  { label: '关联人', value: 'related' },
  { label: '备注', value: 'remark' },
  { label: '附加信息', value: 'extra' },
];
const DEFAULT_VALUES = ['name', 'location', 'address', 'contact', 'remark', 'extra'];
const ALL_VALUES = OPTIONS.map(o => o.value);

export default function SearchFilter({
  searchTxt,
  setSearchTxt,
  searchFields = [],
  onSearchFieldsChange,
  leading, // 行首插槽：目前用于放侧边栏「展开/收起」按钮，保持本组件对侧栏状态无感知
}) {
  const [visible, setVisible] = useState(false);
  // 气泡内部的局部临时状态，防止未点击确定就直接修改了全局搜索行为
  const [tempFields, setTempFields] = useState(searchFields);

  const [tempSearchTxt, setTempSearchTxt] = useState(searchTxt);
  useEffect(() => {
    setTempSearchTxt(searchTxt);
  }, [searchTxt]);

  const handleTriggerSearch = () => {
    setSearchTxt(tempSearchTxt); // 此时才真正通知父组件 App.js 改变状态并触发后端 fetchData
  };

  // 当气泡打开时，将当前的全局状态同步给临时状态
  useEffect(() => {
    if (!searchFields || searchFields.length === 0) {
      onSearchFieldsChange(DEFAULT_VALUES);
      setTempFields(DEFAULT_VALUES);
      return;
    }
    if (visible) {
      setTempFields(searchFields);
    }
  }, [visible, searchFields, onSearchFieldsChange]);

  // 处理全选/全不选
  const isAllChecked = tempFields.length === OPTIONS.length;
  const isIndeterminate = tempFields.length > 0 && tempFields.length < OPTIONS.length;
  const handleCheckAllChange = (e) => {
    setTempFields(e.target.checked ? ALL_VALUES : []);
  };

  // 恢复默认
  const handleReset = () => {
    setTempFields(DEFAULT_VALUES);
  };

  // 点击确认按钮：保存并关闭
  const handleSave = () => {
    onSearchFieldsChange(tempFields); // 触发父组件更新状态并持久化
    setVisible(false);
  };

  // 气泡弹窗内部的渲染布局
  const popoverContent = (
    <div className="w-[380px] p-1">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
        <Space size="middle">
          <span className="font-bold text-gray-700">搜索范围</span>
          <Checkbox
            indeterminate={isIndeterminate}
            onChange={handleCheckAllChange}
            checked={isAllChecked}
            className="text-xs text-blue-600 font-medium"
          >
            全选
          </Checkbox>
        </Space>
        <Button type="link" size="small" onClick={handleReset} className="p-0 text-gray-400 hover:text-blue-500">
          恢复默认
        </Button>
      </div>
      
      {/* 字段多选网格 */}
      <Checkbox.Group
        className="grid grid-cols-3 gap-y-2.5 gap-x-2 w-full mb-4"
        options={OPTIONS}
        value={tempFields}
        onChange={(checkedValues) => setTempFields(checkedValues)}
      />

      {/* 底部操作按钮 */}
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-50">
        <Button size="small" onClick={() => setVisible(false)}>取消</Button>
        <Button size="small" type="primary" onClick={handleSave} disabled={tempFields.length === 0}>
          确认保存
        </Button>
      </div>
    </div>
  );

  return (
    // h-12（48px）= 常规尺寸输入框/按钮 32px + 上下各 8px：与 Sidebar 标题行锁定的高度一致，
    // 两者的 border-b 才能连成一条横贯整屏的线（改高度时须同步改 Sidebar 的标题行）。
    // 行首左侧留 8px（pl-2）：与「按钮 → 右侧分隔线」的 gap-2（8px）等宽，
    // 按钮因此正好居中于侧栏线与分隔线之间；无行首插槽时维持原来的 pl-4（16px）
    <div className="bg-white h-12 pr-4 border-b border-gray-100 shrink-0 flex items-center">
      <div className={`flex gap-2 items-center w-full ${leading ? 'pl-2' : 'pl-4'}`}>
        {leading}
        <Input
          placeholder="输入关键字，回车或点击搜索..."
          value={tempSearchTxt}
          onChange={(e) => setTempSearchTxt(e.target.value)}
          onPressEnter={handleTriggerSearch}
          allowClear
          onClear={() => {
            setTempSearchTxt('');
            setSearchTxt('');
          }}
        />
        <Button 
          type="primary" 
          onClick={handleTriggerSearch}
          icon={<SearchOutlined />}
        >
          搜索
        </Button>
        
        {/* 范围配置气泡按钮 */}
        <Popover
          content={popoverContent}
          trigger="click"
          open={visible}
          onOpenChange={setVisible}
          placement="bottomLeft"
          overlayClassName="search-filter-popover"
        >
          <Button icon={<FilterOutlined />}>
            搜索范围 {searchFields.length < OPTIONS.length && `(${searchFields.length})`}
          </Button>
        </Popover>
      </div>
    </div>
  );
}
