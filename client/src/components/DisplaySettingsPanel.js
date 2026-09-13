import React from 'react';
import { Segmented, Switch, Radio, Button } from 'antd';
import {
  AppstoreOutlined,
  HarmonyOSOutlined,
  BarsOutlined,
  TableOutlined,
  CloudDownloadOutlined,
  OrderedListOutlined,
} from '@ant-design/icons';

/**
 * Header「显示设置」浮窗的内容。
 *
 * 把原先散落在各处的显示类功能按用途分组收纳：
 *   1. 显示模式   —— 卡片 / 头像 / 列表
 *   2. 字段显示   —— 随当前模式切换：列表为「列设置」、卡片为「显示字段」
 *   3. 头像展示   —— 真实头像开关、兜底样式、补齐缺失头像
 *   4. 主题侧栏   —— 人物概览开关（仅按主题模式）
 *   5. 管理       —— 管理人员序列（仅按标签模式）
 */

// 统一的分组容器：组间用细分隔线区分，首组不加线
function SettingSection({ title, children }) {
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <div className="text-xs font-semibold tracking-wider text-gray-400">{title}</div>
      {children}
    </div>
  );
}

const typeLabel = (icon, text) => (
  <span className="flex w-full items-center justify-center gap-1.5">{icon}{text}</span>
);

export default function DisplaySettingsPanel({
  crmFeatureMode,
  viewMode,
  setViewMode,
  onOpenColumnSetting,
  onOpenCardFieldSetting,
  showAvatarThumb,
  setShowAvatarThumb,
  avatarFallbackType,
  setAvatarFallbackType,
  avatarSyncing,
  onSyncAvatars,
  onOpenSequence,
  showTopicOverview = true,
  setShowTopicOverview,
}) {
  const viewModeOptions = [
    { value: 'card', label: typeLabel(<AppstoreOutlined />, '卡片') },
    { value: 'mini', label: typeLabel(<HarmonyOSOutlined />, '头像') },
    { value: 'list', label: typeLabel(<BarsOutlined />, '列表') },
  ];

  return (
    <div className="flex w-[318px] flex-col">
      {/* 分组 1：显示模式 */}
      <SettingSection title="显示模式">
        <Segmented block value={viewMode} onChange={setViewMode} options={viewModeOptions} />
      </SettingSection>

      {/* 分组 2：字段显示（入口随当前显示模式变化） */}
      <SettingSection title="字段显示">
        {viewMode === 'list' ? (
          <Button block icon={<TableOutlined />} onClick={onOpenColumnSetting}>
            配置列表列
          </Button>
        ) : viewMode === 'card' ? (
          <Button block icon={<AppstoreOutlined />} onClick={onOpenCardFieldSetting}>
            配置卡片显示字段
          </Button>
        ) : (
          <div className="text-xs text-gray-400">头像模式不含字段显示配置</div>
        )}
      </SettingSection>

      {/* 分组 3：头像展示 */}
      <SettingSection title="头像展示">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">显示真实头像</span>
          <Switch size="small" checked={showAvatarThumb} onChange={setShowAvatarThumb} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="shrink-0 text-sm text-gray-700">兜底样式</span>
          <Radio.Group
            size="small"
            optionType="button"
            buttonStyle="solid"
            value={avatarFallbackType}
            onChange={(e) => setAvatarFallbackType(e.target.value)}
          >
            <Radio value="default">默认</Radio>
            <Radio value="lastname">姓氏</Radio>
            <Radio value="fullname">全名</Radio>
          </Radio.Group>
        </div>
        <Button block icon={<CloudDownloadOutlined />} loading={avatarSyncing} onClick={onSyncAvatars}>
          补齐缺失头像
        </Button>
      </SettingSection>

      {/* 分组 4：主题侧栏（仅按主题模式下存在该面板） */}
      {crmFeatureMode === 'topics' && (
        <SettingSection title="主题侧栏">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">人物概览</span>
            <Switch size="small" checked={showTopicOverview} onChange={setShowTopicOverview} />
          </div>
          {/* 说明文案跟随分组标题的语义，避免用户误以为是「主题成员配置」里的开关 */}
          <div className="text-xs leading-relaxed text-gray-400">
            在侧边栏下方展示当前主题的全部成员（含未匹配的人）
          </div>
        </SettingSection>
      )}

      {/* 分组 5：管理（人员序列仅在按标签模式下可用） */}
      {crmFeatureMode === 'tags' && (
        <SettingSection title="管理">
          <Button block icon={<OrderedListOutlined />} onClick={onOpenSequence}>
            管理人员序列
          </Button>
        </SettingSection>
      )}
    </div>
  );
}
