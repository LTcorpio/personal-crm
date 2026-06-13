import { useState } from 'react';

export function useResizableSider(defaultWidth, minWidth, maxWidth) {
  const [siderWidth, setSiderWidth] = useState(() => {
    const savedWidth = localStorage.getItem('crm_sider_width');
    return savedWidth ? parseInt(savedWidth, 10) : defaultWidth;
  });

  // 处理鼠标按下拖拽条的事件
  const handleMouseDown = (e) => {
    e.preventDefault();
    
    const startX = e.clientX;
    const startWidth = siderWidth;
    let currentLatestWidth = startWidth;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      // 限制拖拽的最小和最大宽度
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
      currentLatestWidth = newWidth; 
      setSiderWidth(newWidth);
    };

    const handleMouseUp = () => {
      localStorage.setItem('crm_sider_width', currentLatestWidth);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return { siderWidth, handleMouseDown };
}