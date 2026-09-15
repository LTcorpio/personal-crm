import React, { useState } from 'react';
import { Card, Tag, Tooltip, Tabs } from 'antd';
import { PhoneOutlined, MailOutlined, EnvironmentOutlined, IdcardOutlined, WechatOutlined, QqOutlined, TikTokOutlined, QuestionCircleOutlined, RightOutlined } from '@ant-design/icons';
import Markdown from 'react-markdown';
import ContactAvatar from './ContactAvatar';
import ContactTopics from './ContactTopics';
import RelatedContactList from './RelatedContactList';
import { calculateAge, hasBuiltinContactValue } from '../utils/crmUtils';

export default function ContactCard({ contact, onClick, noBorder = false, onRelatedClick, avatarConfig, onAvatarChange, onOpenEdit, onOpenView, editMode = true, topicsByContactId, cardFields }) {
  // 该联系人所属的主题：卡片视图并入标签行展示，详细档案（noBorder）里另起独立区块
  const contactTopics = topicsByContactId?.get(String(contact.id)) || [];

  // 卡片显示字段：按「信息组」整体开关（配置入口在 Header 的「显示设置」浮窗）。
  // 详细档案（noBorder）不受该配置影响，始终展示全部信息。
  const fieldOn = (key) => noBorder || !cardFields || cardFields[key] !== false;

  // 卡片体积紧凑：「扩展信息 / 备注」页签默认不展开，点击对应页签才显示内容，
  // 再次点击当前页签则收起（activeKey 传 null 时 antd 会给所有面板加 -hidden，容器高度随之塌缩），
  // 避免长 Markdown 把卡片撑高。
  const [activeExtraTab, setActiveExtraTab] = useState(null);

  // 收起态（activeKey === null）必须把指示条一并隐藏：
  // rc-tabs 的 useIndicator 用「新样式是否与旧样式完全相等」来决定是否 setState，
  // 而无选中页时的 newInkStyle 是空对象，Object.keys({}).every(...) 恒为 true，
  // 于是被判为「没变化」→ 指示条保留上一次的位置与宽度，页签都收起了下面还留一条蓝线。
  // 这里在无激活页时直接 display:none（!hidden 覆盖 antd 的 cssinjs 样式）。
  const inkBarClass = activeExtraTab === null ? '[&_.ant-tabs-ink-bar]:!hidden' : '';

  // 从全路径标签中提取叶子节点的简写用于展示
  const getLeafTagName = (path) => path.split('/').pop();

  // 年龄计算统一走 utils/crmUtils.calculateAge（详细档案组件复用同一份口径）
  const ageInfo = calculateAge(contact.birthday_solar, contact.deathday);

  return (
    <Card
      hoverable={!noBorder}
      className={`flex flex-col justify-between h-full bg-white ${noBorder ? 'border-0 shadow-none' : 'border border-gray-100 shadow-sm hover:shadow-lg cursor-default'}`}
      styles={{
        body: noBorder ? { padding: 0 } : undefined
      }}
    >
      {/* 头像区域 / 所属主题任一可见时才渲染该行 */}
      {(fieldOn('header') || (!noBorder && fieldOn('topics'))) && (
      <div
        className="flex items-start gap-4 mb-4 cursor-pointer"
        onClick={onClick}
      >
        {/* 头像区域：可整体隐藏 */}
        {fieldOn('header') && <ContactAvatar 
          faceUuid={contact.face_uuid} 
          thumbUrl={contact.face_thumb_url}
          name={contact.name} 
          contactId={contact.id}
          contactName={contact.name}
          onAvatarChange={onAvatarChange}
          onOpenEdit={onOpenEdit}
          onOpenView={onOpenView}
          editMode={editMode}
          avatarConfig={avatarConfig}
          sizeClass="w-16 h-16"
          textClass="text-[28px]"
          iconClass="text-2xl"
        />}

        {/* 基本姓名与基本标签：可整体隐藏 */}
        <div className="flex-1 min-w-0">
          {fieldOn('header') && <>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl font-bold text-gray-800 truncate m-0">{contact.name}</h3>
            {contact.title && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{contact.title}</span>}
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${contact.gender === 1 ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>
              {contact.gender === 1 ? '男' : '女'}
            </span>
            {ageInfo && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border flex items-center gap-1 ${
                contact.deathday 
                  ? 'bg-red-50 text-red-700 border-red-100' 
                  : 'bg-green-50 text-green-700 border-green-100'
              }`}>
                {contact.deathday ? '享年 ' : ''}{ageInfo.age} 岁
                {ageInfo.isIncomplete && (
                  <Tooltip title="生日信息不完整，此为大致年龄">
                    <QuestionCircleOutlined className="cursor-help text-[10px]" />
                  </Tooltip>
                )}
              </span>
            )}
          </div>
          {contact.former_name?.length > 0 && (
            <p className="text-xs text-gray-400 mt-1 truncate">曾用名: {contact.former_name.join(', ')}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {contact.tag?.map((t, idx) => (
              noBorder ? (
                <span key={idx} className="text-xs bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 inline-flex items-center whitespace-nowrap">
                  {t.split('/').map((tag, index, arr) => {
                    const isLast = index === arr.length - 1;
                    return (
                      <span key={index} className="flex items-center">
                        <span className={isLast ? "font-bold text-blue-700" : "text-blue-700/80"}>{tag}</span>
                        {!isLast && <RightOutlined className="mx-1 text-blue-700/30 font-normal text-[10px]" />}
                      </span>
                    );
                  })}
                </span>
              ) : (
                <Tooltip title={t} key={idx}>
                  <Tag color="blue" className="border-none bg-blue-50 text-blue-600 rounded-lg align-middle max-w-[150px] truncate">
                    {getLeafTagName(t)}
                  </Tag>
                </Tooltip>
              )
            ))}
          </div>
          </>}
          {/* 卡片视图：所属主题在标签行下方独占一行（w-full），作为独立信息组可单独隐藏；
              详细档案里另起带标题的独立区块，此处不渲染，避免重复展示 */}
          {!noBorder && fieldOn('topics') && <ContactTopics topics={contactTopics} className="w-full mt-1" />}
        </div>
      </div>
      )}

      {/* 核心基础信息 */}
      <div className="space-y-2 text-sm text-gray-600 flex-1">
        {fieldOn('address') && contact.location && (
          <div className="flex items-start gap-2">
            <EnvironmentOutlined className="text-gray-400 mt-1 flex-shrink-0" />
            <span className="break-all">{contact.location}{contact.address}</span>
          </div>
        )}
        {/* 生日 / 民族 / 籍贯：可整体隐藏 */}
        {fieldOn('profile') && (
        <div className="flex flex-col gap-1 text-xs border-t border-b border-gray-50 py-2 my-2">
          {(contact.birthday_solar || contact.birthday_lunar) && (
            <div className="flex items-start gap-2">
              {/* 左侧固定统一的标题 */}
              <span className="text-gray-400 w-6 text-right flex-shrink-0">生日</span>
              
              {/* 右侧通过 flex-col 实现多行组合展示 */}
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                {contact.birthday_solar && (
                  <div className="break-all text-gray-700">
                    <span className="text-gray-400 mr-1">阳历</span>{contact.birthday_solar}
                  </div>
                )}
                {contact.birthday_lunar && (
                  <div className="break-all text-gray-700">
                    <span className="text-gray-400 mr-1">阴历</span>{contact.birthday_lunar}
                  </div>
                )}
              </div>
            </div>
          )}
          {contact.ethnicity && (
            <div className="flex items-start gap-2">
              <span className="text-gray-400 w-6 text-right flex-shrink-0">民族</span>
              <span className="break-all flex-1">{contact.ethnicity}</span>
            </div>
          )}
          {contact.native_place && (
            <div className="flex items-start gap-2">
              <span className="text-gray-400 w-6 text-right flex-shrink-0">籍贯</span>
              <span className="break-all flex-1">{contact.native_place}</span>
            </div>
          )}
        </div>
        )}

        {/* 身份证 / 联系方式：可整体隐藏；自定义联系方式不在卡片中展示，仅按内置类型判断 */}
        {(fieldOn('contact') && (contact.id_card || hasBuiltinContactValue(contact.contact))) && (
          <div className="flex flex-col gap-1.5 bg-gray-50 p-2 rounded-lg text-xs font-mono">
            {contact.id_card && (
              <div className="flex items-start gap-2">
                <span className="w-4 text-right flex-shrink-0 text-gray-400 flex items-center justify-end gap-1">
                  <IdcardOutlined className="text-gray-500" />
                </span>
                <span className="break-all flex-1 text-gray-600">{contact.id_card}</span>
              </div>
            )}
            {contact.contact?.tel && (
              <div className="flex items-start gap-2">
                <span className="w-4 text-right flex-shrink-0 text-gray-400 flex items-center justify-end gap-1">
                  <PhoneOutlined className="text-green-500" />
                </span>
                <span className="break-all flex-1 text-gray-600">{contact.contact.tel}</span>
              </div>
            )}
            {contact.contact?.wechat && (
              <div className="flex items-start gap-2">
                <span className="w-4 text-right flex-shrink-0 text-gray-400 flex items-center justify-end gap-1">
                  <WechatOutlined className="text-green-600" />
                </span>
                <span className="break-all flex-1 text-gray-600">{contact.contact.wechat}</span>
              </div>
            )}
            {contact.contact?.qq && (
              <div className="flex items-start gap-2">
                <span className="w-4 text-right flex-shrink-0 text-gray-400 flex items-center justify-end gap-1">
                  <QqOutlined className="text-blue-400" />
                </span>
                <span className="break-all flex-1 text-gray-600">{contact.contact.qq}</span>
              </div>
            )}
            {contact.contact?.email && (
              <div className="flex items-start gap-2">
                <span className="w-4 text-right flex-shrink-0 text-gray-400 flex items-center justify-end gap-1">
                  <MailOutlined className="text-purple-400" />
                </span>
                <span className="break-all flex-1 text-gray-600">{contact.contact.email}</span>
              </div>
            )}
            {contact.contact?.tiktok && (
              <div className="flex items-start gap-2">
                <span className="w-4 text-right flex-shrink-0 text-gray-400 flex items-center justify-end gap-1">
                  <TikTokOutlined className="text-gray-700" />
                </span>
                <span className="break-all flex-1 text-gray-600">{contact.contact.tiktok}</span>
              </div>
            )}
          </div>
        )}

        {/* 所属主题：仅详细档案里单独成块（卡片视图已在标签行展示，不重复） */}
        {noBorder && contactTopics.length > 0 && (
          <div className="mt-3">
            <span className="text-xs font-bold text-gray-400 block mb-1.5">所属主题</span>
            <ContactTopics topics={contactTopics} />
          </div>
        )}

        {/* 关联人脉：可整体隐藏；chip 样式与详细档案共用 RelatedContactList（卡片取小一档） */}
        {fieldOn('related') && contact.related?.length > 0 && (
          <div className="mt-3">
            <span className="text-xs font-bold text-gray-400 block mb-1.5">关联人</span>
            <RelatedContactList
              related={contact.related}
              onRelatedClick={onRelatedClick}
              size="sm"
            />
          </div>
        )}

        {/* 扩展信息 / 备注：改用页签（与详细档案形态一致），只有一项也保留页签；可整体隐藏 */}
        {fieldOn('extra') && (contact.extra || contact.remark) && (
          <Tabs
            size="small"
            className={`[&_.ant-tabs-tab]:!text-xs [&_.ant-tabs-nav]:!mb-2 ${inkBarClass}`}
            activeKey={activeExtraTab}
            onTabClick={(key) => setActiveExtraTab((prev) => (prev === key ? null : key))}
            destroyOnHidden
            items={[
              contact.extra && {
                key: 'extra',
                label: '扩展信息',
                children: (
                  <div className="prose prose-sm max-w-none text-sm">
                    <Markdown>{contact.extra}</Markdown>
                  </div>
                )
              },
              contact.remark && {
                key: 'remark',
                label: '备注',
                children: (
                  <div className="prose prose-sm max-w-none text-sm">
                    <Markdown>{contact.remark}</Markdown>
                  </div>
                )
              },
            ].filter(Boolean)}
          />
        )}
      </div>
    </Card>
  );
}