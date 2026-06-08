import React, { useMemo, useState } from 'react';
import { Button, Drawer, Empty, Modal, Popover, Tag, Tree } from 'antd';
import { BarChartOutlined, FilterOutlined, TagsOutlined, TeamOutlined } from '@ant-design/icons';

const currentYear = new Date().getFullYear();
const MONTHS = [
  { value: 1, label: '1 月', days: 31 },
  { value: 2, label: '2 月', days: new Date(currentYear, 2, 0).getDate() }, // 动态获取今年2月的天数（2026年为28天）
  { value: 3, label: '3 月', days: 31 },
  { value: 4, label: '4 月', days: 30 },
  { value: 5, label: '5 月', days: 31 },
  { value: 6, label: '6 月', days: 30 },
  { value: 7, label: '7 月', days: 31 },
  { value: 8, label: '8 月', days: 31 },
  { value: 9, label: '9 月', days: 30 },
  { value: 10, label: '10 月', days: 31 },
  { value: 11, label: '11 月', days: 30 },
  { value: 12, label: '12 月', days: 31 }
];

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function countTags(nodes = []) {
  return nodes.reduce((sum, node) => sum + 1 + countTags(node.children || []), 0);
}

function parseSolarBirthday(value) {
  const str = (value || '').trim();
  const match = str.match(/^(?:\d{4}-)?(\d{2})-(\d{2})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const monthConfig = MONTHS.find(item => item.value === month);

  if (!monthConfig || day < 1 || day > monthConfig.days) return null;

  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getIntensityClass(count, maxCount) {
  if (!count) return 'bg-gray-50 border-gray-100 text-gray-300';
  const ratio = count / Math.max(maxCount, 1);
  if (ratio >= 0.75) return 'bg-rose-500 border-rose-500 text-white';
  if (ratio >= 0.5) return 'bg-orange-400 border-orange-400 text-white';
  if (ratio >= 0.25) return 'bg-amber-300 border-amber-300 text-amber-950';
  return 'bg-emerald-200 border-emerald-200 text-emerald-950';
}

export default function CrmStatsView({ contacts, tagTree, onContactClick }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]); // 存储选中的标签 key 数组
  const [modalVisible, setModalVisible] = useState(false);

  // ====== 计算未筛选前的总生日人数 ======
  const totalBirthdayCount = useMemo(() => {
    return contacts.filter(c => parseSolarBirthday(c.birthday_solar)).length;
  }, [contacts]);

  // ====== 根据选中的标签过滤联系人 ======
  const filteredContacts = useMemo(() => {
    if (selectedTags.length === 0) return contacts;
    return contacts.filter(contact => {
      return contact.tag?.some(contactTag => 
        selectedTags.some(selectedTag => 
          contactTag === selectedTag || contactTag.startsWith(selectedTag + '/')
        )
      );
    });
  }, [contacts, selectedTags]);

  const stats = useMemo(() => {
    const birthdaysByDate = new Map();

    filteredContacts.forEach(contact => {
      const key = parseSolarBirthday(contact.birthday_solar);
      if (!key) return;

      if (!birthdaysByDate.has(key)) birthdaysByDate.set(key, []);
      birthdaysByDate.get(key).push(contact);
    });

    const maxBirthdayCount = Math.max(0, ...Array.from(birthdaysByDate.values()).map(items => items.length));

    return {
      tagCount: countTags(tagTree),
      birthdaysByDate,
      maxBirthdayCount
    };
  }, [filteredContacts, tagTree]);

  const selectedMonthConfig = MONTHS.find(item => item.value === selectedMonth);
  const selectedMonthDays = Array.from({ length: selectedMonthConfig.days }, (_, index) => {
    const day = index + 1;
    const key = `${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return {
      day,
      key,
      people: stats.birthdaysByDate.get(key) || []
    };
  });

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ====== 新增：顶部工具栏（显示已选标签与筛选按钮） ====== */}
        <div className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-500">当前筛选标签：</span>
            {selectedTags.length === 0 ? (
              <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">全部人员</span>
            ) : (
              selectedTags.map(tag => (
                <Tag 
                  key={tag} 
                  closable 
                  color="blue" 
                  onClose={() => setSelectedTags(selectedTags.filter(t => t !== tag))}
                >
                  {tag.split('/').pop()} {/* 只显示叶子节点的标签名 */}
                </Tag>
              ))
            )}
          </div>
          <Button 
            type="primary" 
            icon={<FilterOutlined />} 
            onClick={() => setDrawerVisible(true)}
            className="shrink-0"
          >
            筛选标签
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-sm">
            <div className="flex items-center gap-3 text-gray-500 font-medium">
              <TeamOutlined className="text-blue-500" />
              人员总数
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 text-center">
              {filteredContacts.length}
              <span className="text-lg text-gray-400 font-normal ml-1">/ {contacts.length}</span>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-sm">
            <div className="flex items-center gap-3 text-gray-500 font-medium">
              <TagsOutlined className="text-emerald-500" />
              标签总数
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 text-center">{stats.tagCount}</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-sm">
            <div className="flex items-center gap-3 text-gray-500 font-medium">
              <BarChartOutlined className="text-rose-500" />
              已录入阳历生日
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 text-center">
              {Array.from(stats.birthdaysByDate.values()).reduce((sum, people) => sum + people.length, 0)}
              <span className="text-lg text-gray-400 font-normal ml-1">/ {totalBirthdayCount}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h2 className="m-0 text-base font-bold text-gray-800">生日日历图</h2>
              <p className="m-0 mt-1 text-xs text-gray-400">按阳历生日统计每天的人数，点击月份名称查看详情</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="w-4 h-4 rounded bg-gray-50 border border-gray-100" />
              <span>少</span>
              <span className="w-4 h-4 rounded bg-emerald-200" />
              <span className="w-4 h-4 rounded bg-amber-300" />
              <span className="w-4 h-4 rounded bg-orange-400" />
              <span className="w-4 h-4 rounded bg-rose-500" />
              <span>多</span>
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {MONTHS.map(month => {
              const firstWeekday = new Date(currentYear, month.value - 1, 1).getDay();
              const leadingBlanks = firstWeekday === 0 ? 6 : firstWeekday - 1;
              const days = Array.from({ length: month.days }, (_, index) => index + 1);

              return (
                <div key={month.value} className="min-w-0">
                  {/* 头部的月份标题 */}
                  <div 
                    className="mb-2 flex items-center justify-between cursor-pointer hover:text-blue-500 transition-colors"
                    onClick={() => {
                      setSelectedMonth(month.value);
                      setModalVisible(true);
                    }}
                  >
                    <span className="font-semibold text-gray-700">{month.label}</span>
                    <span className="text-xs text-gray-400">
                      {days.reduce((sum, day) => {
                        const key = `${String(month.value).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        return sum + (stats.birthdaysByDate.get(key)?.length || 0);
                      }, 0)} 人
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {WEEKDAYS.map(day => (
                      <div key={day} className="text-[16px] text-gray-300 h-5 leading-5">{day}</div>
                    ))}
                    {Array.from({ length: leadingBlanks }).map((_, index) => (
                      <div key={`blank-${index}`} />
                    ))}
                    {days.map(day => {
                      const key = `${String(month.value).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const people = stats.birthdaysByDate.get(key) || [];
                      const count = people.length;

                      // 1. 构建 Popover 气泡框内部显示的内容
                      const popoverContent = (
                        <div>
                          {count > 0 ? (
                            <div className="flex flex-wrap gap-1.5 max-w-[240px]">
                              {people.map(person => (
                                <Tag
                                  key={person.id}
                                  color="blue"
                                  className="rounded-md cursor-pointer m-0 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onContactClick(person);
                                  }}
                                >
                                  {person.name}
                                </Tag>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">暂无生日人员</span>
                          )}
                        </div>
                      );

                      return (
                        <Popover
                          key={key}
                          trigger="hover"
                          placement="top"
                          title={<span className="font-bold text-gray-700">{month.label} {day} 日</span>}
                          content={popoverContent}
                        >
                          <button
                            type="button"
                            className={`h-8 w-full rounded border text-[14px] transition-colors ${getIntensityClass(count, stats.maxBirthdayCount)}`}
                          >
                            {day}
                          </button>
                        </Popover>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Drawer
        title="选择筛选标签"
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        size={540}
        className='select-none'
      >
        {tagTree.length > 0 ? (
          <Tree
            checkable
            defaultExpandAll
            treeData={tagTree}
            checkedKeys={selectedTags}
            onCheck={(checkedKeys) => {
              // 支持多选，如果是严格受控模式也可以加 checkStrictly
              setSelectedTags(Array.isArray(checkedKeys) ? checkedKeys : checkedKeys.checked);
            }}
            className="text-sm"
          />
        ) : (
          <div className="text-gray-400 text-xs text-center py-8">暂无标签数据</div>
        )}
      </Drawer>

      {/* 生日名单弹窗 */}
      <Modal
        title={`${selectedMonthConfig?.label} 生日名单`}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={550}
        centered
        className='select-none'
      >
        <div className="mt-4">
          {selectedMonthDays.some(item => item.people.length > 0) ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto p-1">
              {selectedMonthDays
                .filter(item => item.people.length > 0)
                .map(item => (
                  <div key={item.key} className="border border-gray-100 rounded-lg p-3 bg-gray-50/70">
                    <div className="text-xs font-bold text-gray-700 mb-2">
                      {selectedMonthConfig.label} {item.day} 日
                      <span className="ml-2 text-xs font-normal text-gray-400">{item.people.length} 人</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {item.people.map(person => (
                        <Tag
                          key={person.id}
                          color="blue"
                          className="rounded-md cursor-pointer m-0 text-xs"
                          onClick={() => {
                            onContactClick(person);
                            setModalVisible(false); // 点击联系人后自动关闭弹窗
                          }}
                        >
                          {person.name}
                        </Tag>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <Empty className="py-8" description={`${selectedMonthConfig?.label} 暂无阳历生日记录`} />
          )}
        </div>
      </Modal>
    </div>
  );
}
