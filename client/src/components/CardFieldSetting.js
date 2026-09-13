import { useState } from 'react';
import { Modal, Button, Switch, message } from 'antd';

/**
 * 卡片模式的「显示字段」配置。
 *
 * 卡片在视觉上由若干「信息组」拼成，这里按信息组整体开关：
 * 关掉某组即整块从卡片上隐藏，默认全显。
 * 持久化形态为 { [key]: boolean }；缺失的键一律按「显示」处理，
 * 这样后续新增分组时会自动出现在卡片上，无需迁移旧配置。
 */
export const DEFAULT_CARD_FIELDS = [
  { key: 'header', title: '头像区域', desc: '头像、姓名、称呼、性别、年龄、曾用名、标签' },
  { key: 'topics', title: '所属主题', desc: '该联系人所属的主题' },
  { key: 'address', title: '地址', desc: '所在地区与详细住址' },
  { key: 'profile', title: '生日 / 民族 / 籍贯', desc: '阳历、阴历生日，民族与籍贯' },
  { key: 'contact', title: '身份证 / 联系方式', desc: '身份证号、电话、微信、QQ、邮箱、抖音' },
  { key: 'related', title: '关联人', desc: '亲属与关联人' },
  { key: 'extra', title: '扩展信息与备注', desc: '扩展信息与备注（Markdown）' },
];

/** 把持久化的 { key: boolean } 归一化成「每个分组都有值」的完整对象，缺省为显示 */
export const resolveCardFields = (saved) => {
  const result = {};
  DEFAULT_CARD_FIELDS.forEach(({ key }) => {
    result[key] = !saved || saved[key] !== false;
  });
  return result;
};

// 弹窗内部的编辑态：在默认分组定义上叠加当前的显隐值
const toLocalList = (fields) =>
  DEFAULT_CARD_FIELDS.map((item) => ({ ...item, visible: (fields || {})[item.key] !== false }));

const CardFieldSetting = ({ visible, fields, onClose, onSave }) => {
  const [localFields, setLocalFields] = useState(() => toLocalList(fields));

  // 每次打开都从外部配置重新同步一次，避免上一次未保存的改动残留
  const handleOpen = () => setLocalFields(toLocalList(fields));

  const handleToggle = (key, checked) => {
    setLocalFields((prev) => prev.map((item) => (item.key === key ? { ...item, visible: checked } : item)));
  };

  const handleReset = () => {
    setLocalFields(DEFAULT_CARD_FIELDS.map((item) => ({ ...item, visible: true })));
  };

  const handleSave = () => {
    const next = {};
    localFields.forEach((item) => { next[item.key] = item.visible; });
    onSave(next);
    message.success('卡片显示字段已保存');
    onClose();
  };

  return (
    <Modal
      title="配置卡片显示字段"
      open={visible}
      afterOpenChange={(open) => open && handleOpen()}
      onCancel={onClose}
      footer={[
        <Button key="reset" onClick={handleReset}>恢复默认</Button>,
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="save" type="primary" onClick={handleSave}>保存</Button>,
      ]}
      width={450}
      destroyOnHidden
    >
      <div className="flex flex-col divide-y divide-gray-100 pt-1">
        {localFields.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800">{item.title}</div>
              <div className="mt-0.5 text-xs text-gray-400">{item.desc}</div>
            </div>
            <Switch size="small" checked={item.visible} onChange={(checked) => handleToggle(item.key, checked)} />
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default CardFieldSetting;
