import React from 'react';
import { Card, Tag, Tooltip, Collapse } from 'antd';
import { PhoneOutlined, MailOutlined, EnvironmentOutlined, IdcardOutlined, WechatOutlined, QqOutlined, TikTokOutlined, QuestionCircleOutlined, CommentOutlined, RightOutlined } from '@ant-design/icons';
import Markdown from 'react-markdown';
import ContactAvatar from './ContactAvatar';
import ContactTopics from './ContactTopics';

export default function ContactCard({ contact, onClick, noBorder = false, onRelatedClick, avatarConfig, onAvatarChange, onOpenEdit, onOpenView, editMode = true, topicsByContactId, cardFields }) {
  // 该联系人所属的主题：卡片视图并入标签行展示，详细档案（noBorder）里另起独立区块
  const contactTopics = topicsByContactId?.get(String(contact.id)) || [];

  // 卡片显示字段：按「信息组」整体开关（配置入口在 Header 的「显示设置」浮窗）。
  // 详细档案（noBorder）不受该配置影响，始终展示全部信息。
  const fieldOn = (key) => noBorder || !cardFields || cardFields[key] !== false;

  // 从全路径标签中提取叶子节点的简写用于展示
  const getLeafTagName = (path) => path.split('/').pop();

  // 根据阳历生日计算周岁年龄的函数
  const calculateAge = (birthdayStr, deathdayStr) => {
    if (!birthdayStr) return null;

    const str = birthdayStr.trim();
    let normalizedDateStr = '';
    let isIncomplete = false;

    // 正则匹配三种可能的格式
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      // 完整格式 YYYY-MM-DD
      normalizedDateStr = str;
      isIncomplete = false;
    } else if (/^\d{4}-\d{2}$/.test(str)) {
      // 缺失日 YYYY-MM
      normalizedDateStr = `${str}-01`;
      isIncomplete = true;
    } else if (/^\d{4}$/.test(str)) {
      // 缺失月日 YYYY
      normalizedDateStr = `${str}-01-01`;
      isIncomplete = true;
    } else {
      // 格式不匹配，不予计算
      return null;
    }

    const birthDate = new Date(normalizedDateStr);
    // 确保日期转换合法
    if (isNaN(birthDate.getTime())) return null;

    // 如果有死亡日期，则以死亡日期为基准计算，否则以今天为基准
    const endDate = deathdayStr ? new Date(deathdayStr.trim()) : new Date();
    if (isNaN(endDate.getTime())) return null;

    let age = endDate.getFullYear() - birthDate.getFullYear();
    const monthDiff = endDate.getMonth() - birthDate.getMonth();
    
    // 如果是完整日期，需要精准判断是否过了生日
    if (!isIncomplete) {
      if (monthDiff < 0 || (monthDiff === 0 && endDate.getDate() < birthDate.getDate())) {
        age--;
      }
    }
    
    return { age, isIncomplete }
  };

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

        {/* 身份证 / 联系方式：可整体隐藏 */}
        {(fieldOn('contact') && (contact.id_card || (contact.contact && Object.values(contact.contact).some(val => val)))) && (
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

        {/* 关联人脉：可整体隐藏 */}
        {fieldOn('related') && contact.related?.length > 0 && (
          <div className="mt-3">
            <span className="text-xs font-bold text-gray-400 block mb-1.5">关联人</span>
            <div className="flex flex-wrap gap-x-2 gap-y-2">
              {contact.related.map((r, idx) => {
                // 判断是否有关联备注（排除空字符串、undefined或null）
                const hasRemark = r.remark && r.remark.trim() !== '';
                const hasId = !!r.id; // 判断是否有绑定的 ID

                const tagContent = (
                  <Tag 
                    className="text-[11px] border-none p-0 overflow-hidden inline-flex items-center rounded m-0 h-auto shadow-sm"
                    onClick={(e) => {
                      if (hasId && onRelatedClick) {
                        e.stopPropagation(); // 阻止冒泡，避免触发卡片整体的点击事件
                        onRelatedClick(r.id);
                      }
                    }}
                  >
                    <span className="bg-gray-100 text-gray-600 px-1.5 py-0.4 font-medium border-r border-gray-200">
                      {r.relation}
                    </span>
                    <span className={`px-2 py-0.4 flex items-center gap-1 ${
                      hasId 
                        ? 'bg-blue-50 text-blue-600' // 有 ID 时高亮为蓝色
                        : 'bg-gray-50 text-gray-500' // 没有 ID 时保持低调的灰色
                    }`}>
                      {r.name}
                      {/* 如果有备注，显示图标 */}
                      {hasRemark && <CommentOutlined />}
                    </span>
                  </Tag>
                );

                // 如果有备注，包裹 Tooltip；否则直接返回 Tag
                return hasRemark ? (
                  <Tooltip title={r.remark} key={idx}>
                    {tagContent}
                  </Tooltip>
                ) : (
                  <div key={idx}>{tagContent}</div>
                );
              })}
            </div>
          </div>
        )}

        {/* 扩展 Markdown 块与备注：可整体隐藏 */}
        {fieldOn('extra') && (contact.extra || contact.remark) && (
          <Collapse
            size='small' bordered={false}
            defaultActiveKey={noBorder ? ['1', '2'] : []}
            className='text-xs'
            classNames={{
              title: 'self-center'
            }}
            items={[
              contact.extra && {
                key: '1',
                label: '扩展信息',
                children: (
                  <div className="prose prose-sm max-w-none text-sm">
                    <Markdown>{contact.extra}</Markdown>
                  </div>
                )
              },
              contact.remark && {
                key: '2',
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