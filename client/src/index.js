import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initOverlayScrollbar } from './utils/overlayScrollbar';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 应用挂载后接管全站滚动容器（隐藏原生滚动条 + 自绘悬浮滚动条）
initOverlayScrollbar();
