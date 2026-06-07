import React, { useMemo, useState } from 'react';
import { Empty, Select, Tag, Tooltip } from 'antd';
import { BarChartOutlined, TagsOutlined, TeamOutlined } from '@ant-design/icons';

const MONTHS = [
  { value: 1, label: '1 月', days: 31 },
  { value: 2, label: '2 月', days: 29 },
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

  const stats = useMemo(() => {
    const birthdaysByDate = new Map();

    contacts.forEach(contact => {
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
  }, [contacts, tagTree]);

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-sm">
            <div className="flex items-center gap-3 text-gray-500 text-sm font-medium">
              <TeamOutlined className="text-blue-500" />
              人员总数
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900">{contacts.length}</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-sm">
            <div className="flex items-center gap-3 text-gray-500 text-sm font-medium">
              <TagsOutlined className="text-emerald-500" />
              标签总数
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900">{stats.tagCount}</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-sm">
            <div className="flex items-center gap-3 text-gray-500 text-sm font-medium">
              <BarChartOutlined className="text-rose-500" />
              已录入阳历生日
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900">
              {Array.from(stats.birthdaysByDate.values()).reduce((sum, people) => sum + people.length, 0)}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h2 className="m-0 text-base font-bold text-gray-800">生日日历图</h2>
              <p className="m-0 mt-1 text-xs text-gray-400">按阳历生日统计 365 天内每天的人数</p>
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
              const firstWeekday = new Date(2026, month.value - 1, 1).getDay();
              const leadingBlanks = firstWeekday === 0 ? 6 : firstWeekday - 1;
              const days = Array.from({ length: month.days }, (_, index) => index + 1);

              return (
                <div key={month.value} className="min-w-0">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">{month.label}</span>
                    <span className="text-xs text-gray-400">
                      {days.reduce((sum, day) => {
                        const key = `${String(month.value).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        return sum + (stats.birthdaysByDate.get(key)?.length || 0);
                      }, 0)} 人
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {WEEKDAYS.map(day => (
                      <div key={day} className="text-[11px] text-gray-300 h-5 leading-5">{day}</div>
                    ))}
                    {Array.from({ length: leadingBlanks }).map((_, index) => (
                      <div key={`blank-${index}`} />
                    ))}
                    {days.map(day => {
                      const key = `${String(month.value).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const people = stats.birthdaysByDate.get(key) || [];
                      const count = people.length;

                      return (
                        <Tooltip
                          key={key}
                          title={count ? `${month.label} ${day} 日：${people.map(person => person.name).join('、')}` : `${month.label} ${day} 日`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMonth(month.value);
                              const target = document.getElementById('birthday-month-list');
                              target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                            className={`h-8 rounded border text-[11px] transition-colors ${getIntensityClass(count, stats.maxBirthdayCount)}`}
                          >
                            {day}
                          </button>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div id="birthday-month-list" className="bg-white border border-gray-100 rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <h2 className="m-0 text-base font-bold text-gray-800">生日名单</h2>
            <Select
              value={selectedMonth}
              onChange={setSelectedMonth}
              options={MONTHS.map(month => ({ label: month.label, value: month.value }))}
              className="w-32"
            />
          </div>

          <div className="p-5">
            {selectedMonthDays.some(item => item.people.length > 0) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {selectedMonthDays
                  .filter(item => item.people.length > 0)
                  .map(item => (
                    <div key={item.key} className="border border-gray-100 rounded-lg p-4 bg-gray-50/70">
                      <div className="text-sm font-bold text-gray-700 mb-3">
                        {selectedMonthConfig.label} {item.day} 日
                        <span className="ml-2 text-xs font-normal text-gray-400">{item.people.length} 人</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.people.map(person => (
                          <Tag
                            key={person.id}
                            color="blue"
                            className="rounded-md cursor-pointer m-0"
                            onClick={() => onContactClick(person)}
                          >
                            {person.name}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <Empty className="py-12" description={`${selectedMonthConfig.label}暂无阳历生日记录`} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
