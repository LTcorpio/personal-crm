import React, { useState, useEffect } from 'react';
import { contactApi } from '../api/crmApi';

const avatarCache = new Map();

export default function AuthenticatedAvatar({ uuid, alt = '', className }) {
  const [avatarUrl, setAvatarUrl] = useState(null);

  useEffect(() => {
    if (!uuid) {
      setAvatarUrl(null);
      return;
    }

    // 💡 2. 新增：命中缓存则直接使用，拦截后续的 API 请求
    if (avatarCache.has(uuid)) {
      setAvatarUrl(avatarCache.get(uuid));
      return;
    }

    contactApi.getAvatar(uuid)
      .then((res) => {
        const currentUrl = URL.createObjectURL(res.data);
        
        // 💡 3. 新增：将生成的本地 URL 塞入全局缓存
        avatarCache.set(uuid, currentUrl); 
        
        setAvatarUrl(currentUrl);
      })
      .catch((err) => {
        console.error('获取头像失败:', err);
        setAvatarUrl(null);
      });

    // 💡 4. 关键改动：删除了原本 return () => URL.revokeObjectURL(currentUrl) 的清理函数。
    // 允许 ObjectURL 留存在全局缓存中，从而在切页和重新挂载时能够瞬间读取，消除闪烁。
  }, [uuid]);

  return avatarUrl ? (
    <img src={avatarUrl} alt={alt} className={className} onError={(e) => { e.target.style.display = 'none'; }} />
  ) : null;
}