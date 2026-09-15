import React from 'react';
import { Button, Descriptions, Tabs, Tooltip } from 'antd';
import {
  QuestionCircleOutlined,
  RightOutlined,
  EditOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import Markdown from 'react-markdown';
import ContactAvatar from './ContactAvatar';
import ContactTopics from './ContactTopics';
import RelatedContactList from './RelatedContactList';
import { calculateAge, immichPersonUrl, extractCustomContactMethods } from '../utils/crmUtils';

/**
 * 联系人详细档案（详情弹窗的内容）。
 *
 * 与网格卡片刻意解耦：卡片是为窄容器设计的单列竖排布局，直接塞进 720px 宽的弹窗会
 * 出现「头部右侧大片留白 + 中下部单列堆叠 + 长文本撑高」的头轻脚重问题。
 * 这里改用详情专用版式：
 *   - 资料头：头像 + 姓名 / 头衔 / 性别 / 年龄 / 曾用名（整行垂直居中），右侧放快捷操作，填满宽度
 *   - 标签 / 主题 / 关联人：统一为「左侧字段名 + 右侧条目」两栏结构，排在资料头下方；
 *     字段名宽度自适应（不设固定宽度）、间距 10px，与下方 Descriptions 的字段名观感一致
 *   - 信息区：Descriptions column=2，字段两两配对，纵向高度约为单列的一半
 *   - 底部：扩展信息与备注统一用页签切换（只一项也保留页签），不再默认全部展开把弹窗撑高
 *
 * 注意：这里不受卡片「显示字段」配置影响，始终展示全部信息。
 */
export default function ContactDetail({
  contact,
  topicsByContactId,
  onEdit,
  avatarConfig,
  onAvatarChange,
  editMode = true,
  onRelatedClick,
}) {
  const contactTopics = topicsByContactId?.get(String(contact.id)) || [];
  const ageInfo = calculateAge(contact.birthday_solar, contact.deathday);

  // ---- 描述列表条目：只收录有值的字段，antd 会按 column=2 自动两两配对 ----
  const descItems = [];

  if (contact.location || contact.address) {
    descItems.push({
      key: 'address',
      label: '地址',
      // 地址通常较长，独占一行
      span: 2,
      children: <span className="break-all">{contact.location}{contact.address}</span>,
    });
  }

  if (contact.birthday_solar || contact.birthday_lunar) {
    descItems.push({
      key: 'birthday',
      label: '生日',
      children: (
        <div className="flex flex-col gap-0.5">
          {contact.birthday_solar && (
            <span className="break-all"><span className="text-gray-400 mr-1">阳历</span>{contact.birthday_solar}</span>
          )}
          {contact.birthday_lunar && (
            <span className="break-all"><span className="text-gray-400 mr-1">阴历</span>{contact.birthday_lunar}</span>
          )}
        </div>
      ),
    });
  }

  if (contact.ethnicity) {
    descItems.push({ key: 'ethnicity', label: '民族', children: <span className="break-all">{contact.ethnicity}</span> });
  }
  if (contact.native_place) {
    descItems.push({ key: 'native_place', label: '籍贯', children: <span className="break-all">{contact.native_place}</span> });
  }
  if (contact.id_card) {
    descItems.push({ key: 'id_card', label: '身份证', children: <span className="break-all font-mono">{contact.id_card}</span> });
  }
  if (contact.contact?.tel) {
    descItems.push({ key: 'tel', label: '电话', children: <span className="break-all font-mono">{contact.contact.tel}</span> });
  }
  if (contact.contact?.wechat) {
    descItems.push({ key: 'wechat', label: '微信', children: <span className="break-all font-mono">{contact.contact.wechat}</span> });
  }
  if (contact.contact?.qq) {
    descItems.push({ key: 'qq', label: 'QQ', children: <span className="break-all font-mono">{contact.contact.qq}</span> });
  }
  if (contact.contact?.email) {
    descItems.push({ key: 'email', label: '邮箱', children: <span className="break-all font-mono">{contact.contact.email}</span> });
  }
  if (contact.contact?.tiktok) {
    descItems.push({ key: 'tiktok', label: '抖音', children: <span className="break-all font-mono">{contact.contact.tiktok}</span> });
  }
  // 自定义联系方式（如小红书 / LinkedIn / Instagram 等）：仅在详细档案中展示
  extractCustomContactMethods(contact.contact).forEach(({ type, value }) => {
    descItems.push({ key: `contact_${type}`, label: type, children: <span className="break-all font-mono">{value}</span> });
  });

  // ---- 扩展信息 / 备注：有内容即用页签切换（只一项也保留页签），缺则整块不渲染 ----
  const markdownBlock = (content) => (
    <div className="prose max-w-none text-base"><Markdown>{content}</Markdown></div>
  );
  const tabItems = [
    contact.extra && { key: 'extra', label: '扩展信息', children: markdownBlock(contact.extra) },
    contact.remark && { key: 'remark', label: '备注', children: markdownBlock(contact.remark) },
  ].filter(Boolean);

  const hasActions = (editMode && !!onEdit) || !!contact.face_uuid;

  return (
    <div className="flex flex-col gap-4">
      {/* 资料头：向下滚动时吸顶（只有它固定，下面的信息照常滚动）。
          -mx-6 / px-6：吸顶条要比内容宽出外层滚动容器的左右留白，
                        否则滚动时内容会从两侧 24px 的缝隙里透出来；
          -mb-4：抵消父级 flex 的 gap-4，让静态间距完全由自身的 pb-4 提供，
                 这样吸顶前后的观感一致（下方内容被裁剪的位置就是头像栏底部再留 16px）。 */}
      <div className="sticky top-0 z-10 -mx-6 -mb-4 px-6 pb-4 bg-white flex items-center gap-4">
        <ContactAvatar
          faceUuid={contact.face_uuid}
          thumbUrl={contact.face_thumb_url}
          name={contact.name}
          contactId={contact.id}
          contactName={contact.name}
          onAvatarChange={onAvatarChange}
          onOpenEdit={onEdit}
          editMode={editMode}
          avatarConfig={avatarConfig}
          hideViewItem
          sizeClass="w-20 h-20"
          textClass="text-[34px]"
          iconClass="text-3xl"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-3xl font-bold text-gray-800 truncate m-0">{contact.name}</h3>
            {contact.title && <span className="text-base bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded">{contact.title}</span>}
            <span className={`text-base px-3 py-0.5 rounded-full font-semibold ${contact.gender === 1 ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>
              {contact.gender === 1 ? '男' : '女'}
            </span>
            {ageInfo && (
              <span className={`text-base px-3 py-0.5 rounded-full font-semibold border flex items-center gap-1 ${
                contact.deathday ? 'bg-red-50 text-red-700 border-red-100' : 'bg-green-50 text-green-700 border-green-100'
              }`}>
                {contact.deathday ? '享年 ' : ''}{ageInfo.age} 岁
                {ageInfo.isIncomplete && (
                  <Tooltip title="生日信息不完整，此为大致年龄">
                    <QuestionCircleOutlined className="cursor-help text-sm" />
                  </Tooltip>
                )}
              </span>
            )}
          </div>

          {contact.former_name?.length > 0 && (
            <p className="text-base text-gray-400 mt-2 truncate">曾用名: {contact.former_name.join(', ')}</p>
          )}

        </div>

        {/* 快捷操作：编辑资料 / 在 Immich 查看（没有可选项时整列不渲染） */}
        {hasActions && (
          <div className="flex flex-col gap-2 flex-shrink-0">
            {editMode && onEdit && (
              <Button icon={<EditOutlined />} onClick={onEdit}>编辑资料</Button>
            )}
            {contact.face_uuid && (
              <Button
                icon={<LinkOutlined />}
                onClick={() => window.open(immichPersonUrl(contact.face_uuid), '_blank', 'noopener,noreferrer')}
              >
                在 Immich 查看
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 标签 + 主题：移到头像区下方，各自带字段名；多个条目时行内间距放大到 8px，避免挤在一起。
          字段名不设固定宽度、与内容间距取 10px（gap-2.5）——
          下方 Descriptions 的字段名是内联自适应宽度，其 label 的 ::after 在 colon={false} 下
          仍保留 margin-inline 2px/8px，即「字段名 → 内容」的视觉间距恰为 10px。
          这样三行的字段名宽度、间距与「地址/生日」等完全一致。 */}
      {(contact.tag?.length > 0 || contactTopics.length > 0) && (
        <div className="flex flex-col gap-2.5">
          {contact.tag?.length > 0 && (
            <div className="flex items-start gap-2.5">
              <span className="text-base text-gray-500 flex-shrink-0 whitespace-nowrap h-[26px] flex items-center">标签</span>
              <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                {contact.tag.map((t, idx) => (
                  <span key={idx} className="text-sm bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 inline-flex items-center whitespace-nowrap">
                    {t.split('/').map((tag, index, arr) => {
                      const isLast = index === arr.length - 1;
                      return (
                        <span key={index} className="flex items-center">
                          <span className={isLast ? 'font-bold text-blue-700' : 'text-blue-700/80'}>{tag}</span>
                          {!isLast && <RightOutlined className="mx-1 text-blue-700/30 font-normal text-xs" />}
                        </span>
                      );
                    })}
                  </span>
                ))}
              </div>
            </div>
          )}
          {contactTopics.length > 0 && (
            <div className="flex items-start gap-2.5">
              <span className="text-base text-gray-500 flex-shrink-0 whitespace-nowrap h-[26px] flex items-center">主题</span>
              <ContactTopics topics={contactTopics} size="md" gapClass="gap-2" className="flex-1 min-w-0" />
            </div>
          )}
        </div>
      )}

      {/* 信息区：两列描述列表；antd 默认 14px，这里整体提到 16px 与上下文字号保持一致 */}
      {descItems.length > 0 && (
        <Descriptions
          column={2}
          size="small"
          colon={false}
          items={descItems}
          styles={{ label: { fontSize: 16 }, content: { fontSize: 16 } }}
        />
      )}

      {/* 关联人：与上方「标签 / 主题」统一为「左侧字段名 + 右侧条目」两栏结构，
          字段名同样不锁宽度、间距 10px，与 Descriptions 的字段名保持一致 */}
      {contact.related?.length > 0 && (
        <div className="flex items-start gap-2.5">
          <span className="text-base text-gray-500 flex-shrink-0 whitespace-nowrap h-[26px] flex items-center">关联人</span>
          <RelatedContactList
            related={contact.related}
            onRelatedClick={onRelatedClick}
            size="md"
            className="flex-1 min-w-0"
          />
        </div>
      )}

      {/* 扩展信息 / 备注：两者都用页签切换，只有一项时也保留页签，避免两处形态不一致 */}
      {tabItems.length > 0 && (
        <div className="pt-3 border-t border-gray-100 [&_.ant-tabs-tab]:!text-[15px]">
          <Tabs size="small" items={tabItems} />
        </div>
      )}
    </div>
  );
}
