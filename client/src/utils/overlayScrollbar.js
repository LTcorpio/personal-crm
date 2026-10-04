/**
 * 全站自绘悬浮滚动条（overlay scrollbar）
 *
 * 背景：系统原生滚动条（尤其自定义 ::-webkit-scrollbar 后）会挤占内容区宽度；
 * Chrome 114+ 又将 overflow: overlay 别名为 auto，纯 CSS 已无法实现悬浮效果。
 * 本模块改为「隐藏原生滚动条 + JS 自绘悬浮轨道」：
 *   - 原生滚动条已由 index.css 全局隐藏（scrollbar-width: none / width: 0），不占布局宽度
 *   - 本模块自动接管所有可滚动容器，轨道用 position: fixed 挂在 body 上（坐标取自
 *     getBoundingClientRect），因此无需改动容器父元素的定位方式，也不受容器
 *     祖先 transform / overflow 裁剪的影响
 *   - 滚动 / 悬停时轨道淡入；**指针还停在容器上时不淡出**（离开或滚完且指针不在容器内才淡出）；
 *     滑块支持鼠标 / 触控板拖拽
 *   - 轨道尺寸（桌面 6px / 触屏 4px）与滑块透明度都在本文件 / index.css 内，
 *     改宽度只需改 TRACK_SIZE_DESKTOP（JS 写的是内联样式，优先级高于 CSS）
 *
 * 用法：在应用挂载后调用一次 initOverlayScrollbar()。
 * 接管是自动的：MutationObserver 监听 DOM 变化，弹窗（Modal/Drawer）打开、
 * 数据加载等场景下新出现的滚动容器都会被自动接管，容器销毁时自动清理；
 * 另外在窗口 resize / 自定义字体加载完成时会**补扫**一次 —— 容器可能因为
 * 纯布局变化才变得可滚动（不产生 DOM mutation，否则永远拿不到滚动条）。
 */

// 轨道宽度 / 高度：尺寸以此处为准（index.css 里的 .osb-track-y/-x 只是兜底，
// JS 在 placeTrack 里会写内联 width/height，内联样式优先级更高）
const TRACK_SIZE_DESKTOP = 6; // 桌面：原 8px，收窄一档
const TRACK_SIZE_TOUCH = 4; // 触屏（无 hover）：更细
const TRACK_INSET = 3; // 轨道距容器边缘的内缩
const MIN_THUMB = 28; // 滑块最小尺寸
const AUTO_HIDE_DELAY = 900; // 停止滚动后自动隐藏的延迟
const MARK_CLASS = 'osb-tracked'; // 标记已接管的容器，避免重复处理

let TRACK_SIZE = TRACK_SIZE_DESKTOP; // 由 initOverlayScrollbar 依据输入方式决定

const state = new Map(); // 容器元素 -> 滚动条记录

function buildTrack(axis) {
  const track = document.createElement('div');
  track.className = `osb-track osb-track-${axis}`;
  track.setAttribute('aria-hidden', 'true');
  const thumb = document.createElement('div');
  thumb.className = `osb-thumb osb-thumb-${axis}`;
  track.appendChild(thumb);
  return { track, thumb };
}

/** 判定元素是否为「真正会滚动」的容器（先快速跳过无溢出的元素，再查 computed style） */
function isScrollable(el) {
  if (!(el instanceof HTMLElement)) return false;
  const overflowY = el.scrollHeight > el.clientHeight + 1;
  const overflowX = el.scrollWidth > el.clientWidth + 1;
  if (!overflowY && !overflowX) return false;
  const cs = getComputedStyle(el);
  const yOk = cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflowY === 'overlay';
  const xOk = cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'overlay';
  return (overflowY && yOk) || (overflowX && xOk);
}

/**
 * 依据容器的视口坐标摆放轨道（轨道挂在 body 上，position: fixed）
 * @returns {boolean} 容器是否可见（宽高都 > 0）；false 时轨道已隐藏，调用方不要再算滑块
 */
function placeTrack(el, rec) {
  const r = el.getBoundingClientRect();
  const { y, x } = rec;
  if (r.width <= 0 || r.height <= 0) {
    y.track.style.display = 'none';
    x.track.style.display = 'none';
    return false;
  }
  y.track.style.left = `${r.left + r.width - TRACK_SIZE - TRACK_INSET}px`;
  y.track.style.top = `${r.top + TRACK_INSET}px`;
  y.track.style.width = `${TRACK_SIZE}px`;
  y.track.style.height = `${Math.max(0, r.height - TRACK_INSET * 2)}px`;

  x.track.style.left = `${r.left + TRACK_INSET}px`;
  x.track.style.top = `${r.top + r.height - TRACK_SIZE - TRACK_INSET}px`;
  x.track.style.width = `${Math.max(0, r.width - TRACK_INSET * 2)}px`;
  x.track.style.height = `${TRACK_SIZE}px`;
  return true;
}

/** 计算某个轴的滑块尺寸与偏移；无溢出时隐藏该轴轨道 */
function updateAxis(el, parts, axis) {
  const isY = axis === 'y';
  const { track, thumb } = parts;

  const viewport = isY ? el.clientHeight : el.clientWidth;
  const scrollSize = isY ? el.scrollHeight : el.scrollWidth;
  const maxScroll = scrollSize - viewport;

  if (maxScroll <= 1) {
    track.style.display = 'none';
    return;
  }
  track.style.display = '';

  const trackSize = isY ? track.clientHeight : track.clientWidth;
  if (trackSize <= 0) return;

  const thumbSize = Math.max(
    MIN_THUMB,
    Math.min(trackSize, Math.round((viewport / scrollSize) * trackSize))
  );
  const scrollPos = isY ? el.scrollTop : el.scrollLeft;
  const offset = (scrollPos / maxScroll) * (trackSize - thumbSize);

  if (isY) {
    thumb.style.height = `${thumbSize}px`;
    thumb.style.transform = `translateY(${offset}px)`;
  } else {
    thumb.style.width = `${thumbSize}px`;
    thumb.style.transform = `translateX(${offset}px)`;
  }
}

function scheduleUpdate(el, rec) {
  if (rec.rafId) return;
  rec.rafId = window.requestAnimationFrame(() => {
    rec.rafId = 0;
    // 容器不可见（被折叠 / 尺寸为 0）时，placeTrack 已经把轨道藏起来了，
    // 这里必须直接返回：否则 updateAxis 会把 display 又置回，轨道留在旧坐标上
    // 变成一条悬在页面上的幽灵滚动条
    if (!placeTrack(el, rec)) return;
    updateAxis(el, rec.y, 'y');
    updateAxis(el, rec.x, 'x');
  });
}

function showTracks(rec) {
  window.clearTimeout(rec.hideTimer);
  rec.y.track.classList.add('osb-visible');
  rec.x.track.classList.add('osb-visible');
}

function hideSoon(rec, delay = AUTO_HIDE_DELAY) {
  window.clearTimeout(rec.hideTimer);
  rec.hideTimer = window.setTimeout(() => {
    // 指针还停在容器 / 轨道上时不隐藏。
    // 否则「滚动一下 → 900ms 后淡出 → 指针没离开容器就再也不会重新淡入」，
    // 观感就是「这个区域没有滚动条」（侧栏最容易踩到：树滚动一次后滚动条就消失了）。
    if (rec.dragging || rec.hovering) return;
    rec.y.track.classList.remove('osb-visible');
    rec.x.track.classList.remove('osb-visible');
  }, delay);
}

function bindScrollEvents(rec) {
  const { el } = rec;
  rec.onScroll = () => {
    scheduleUpdate(el, rec);
    showTracks(rec);
    hideSoon(rec);
  };
  rec.onEnter = () => {
    rec.hovering = true;
    showTracks(rec);
  };
  rec.onLeave = () => {
    rec.hovering = false;
    if (!rec.dragging) hideSoon(rec, 120);
  };
  el.addEventListener('scroll', rec.onScroll, { passive: true });
  el.addEventListener('mouseenter', rec.onEnter);
  el.addEventListener('mouseleave', rec.onLeave);

  // 轨道挂在 body 上（容器外）：鼠标移出容器进入轨道时，若不处理会被容器
  // 的 mouseleave 触发隐藏，表现为「刚悬停就消失」。给轨道也绑定悬停保持。
  rec.onTrackEnter = () => {
    rec.hovering = true;
    showTracks(rec);
  };
  rec.onTrackLeave = () => {
    rec.hovering = false;
    hideSoon(rec, 120);
  };
  rec.y.track.addEventListener('mouseenter', rec.onTrackEnter);
  rec.y.track.addEventListener('mouseleave', rec.onTrackLeave);
  rec.x.track.addEventListener('mouseenter', rec.onTrackEnter);
  rec.x.track.addEventListener('mouseleave', rec.onTrackLeave);
}

function bindDrag(rec, parts, axis) {
  const { el } = rec;
  const isY = axis === 'y';

  rec.onDragMove = (event) => {
    if (!rec.dragging) return;
    const current = rec.dragging.axis === 'y' ? event.clientY : event.clientX;
    const next = rec.dragging.startScroll + (current - rec.dragging.startPos) * rec.dragging.ratio;
    if (rec.dragging.axis === 'y') {
      el.scrollTop = next;
    } else {
      el.scrollLeft = next;
    }
  };

  rec.onDragEnd = () => {
    if (!rec.dragging) return;
    rec.dragging.parts.track.classList.remove('osb-dragging');
    rec.dragging = null;
    document.body.classList.remove('osb-dragging');
    window.removeEventListener('pointermove', rec.onDragMove);
    window.removeEventListener('pointerup', rec.onDragEnd);
    window.removeEventListener('pointercancel', rec.onDragEnd);
    hideSoon(rec);
  };

  rec.onThumbDown = (event) => {
    if (event.button !== 0) return;
    const trackSize = isY ? parts.track.clientHeight : parts.track.clientWidth;
    const thumbSize = isY ? parts.thumb.offsetHeight : parts.thumb.offsetWidth;
    const viewport = isY ? el.clientHeight : el.clientWidth;
    const scrollSize = isY ? el.scrollHeight : el.scrollWidth;
    const maxScroll = scrollSize - viewport;
    const maxOffset = trackSize - thumbSize;
    if (maxScroll <= 0 || maxOffset <= 0) return;

    event.preventDefault();
    event.stopPropagation();

    rec.dragging = {
      axis,
      parts,
      startPos: isY ? event.clientY : event.clientX,
      startScroll: isY ? el.scrollTop : el.scrollLeft,
      ratio: maxScroll / maxOffset,
    };

    parts.track.classList.add('osb-dragging');
    document.body.classList.add('osb-dragging');
    if (parts.thumb.setPointerCapture) {
      try {
        parts.thumb.setPointerCapture(event.pointerId);
      } catch (err) {
        /* 某些浏览器在 pointerdown 之外调用会抛错，忽略即可 */
      }
    }
    window.addEventListener('pointermove', rec.onDragMove);
    window.addEventListener('pointerup', rec.onDragEnd);
    window.addEventListener('pointercancel', rec.onDragEnd);
  };

  parts.thumb.addEventListener('pointerdown', rec.onThumbDown);
}

function createScrollbar(el) {
  if (state.has(el)) return;

  const rec = {
    el,
    y: buildTrack('y'),
    x: buildTrack('x'),
    rafId: 0,
    hideTimer: 0,
    dragging: null,
    hovering: false,
    ro: null,
    onScroll: null,
    onEnter: null,
    onLeave: null,
    onDragMove: null,
    onDragEnd: null,
    onThumbDown: null,
  };

  document.body.appendChild(rec.y.track);
  document.body.appendChild(rec.x.track);

  bindScrollEvents(rec);
  bindDrag(rec, rec.y, 'y');
  bindDrag(rec, rec.x, 'x');

  // 容器尺寸变化（含布局动画）→ 重算轨道位置与滑块
  rec.ro = new ResizeObserver(() => scheduleUpdate(el, rec));
  rec.ro.observe(el);

  state.set(el, rec);
  el.classList.add(MARK_CLASS);

  scheduleUpdate(el, rec);
  // 挂载即有溢出内容时，短暂显示一次滚动条提示用户
  showTracks(rec);
  hideSoon(rec, 1000);
}

function destroyScrollbar(el) {
  const rec = state.get(el);
  if (!rec) return;
  if (rec.rafId) window.cancelAnimationFrame(rec.rafId);
  window.clearTimeout(rec.hideTimer);
  el.removeEventListener('scroll', rec.onScroll);
  el.removeEventListener('mouseenter', rec.onEnter);
  el.removeEventListener('mouseleave', rec.onLeave);
  rec.y.track.removeEventListener('mouseenter', rec.onTrackEnter);
  rec.y.track.removeEventListener('mouseleave', rec.onTrackLeave);
  rec.x.track.removeEventListener('mouseenter', rec.onTrackEnter);
  rec.x.track.removeEventListener('mouseleave', rec.onTrackLeave);
  window.removeEventListener('pointermove', rec.onDragMove);
  window.removeEventListener('pointerup', rec.onDragEnd);
  window.removeEventListener('pointercancel', rec.onDragEnd);
  rec.y.thumb.removeEventListener('pointerdown', rec.onThumbDown);
  rec.x.thumb.removeEventListener('pointerdown', rec.onThumbDown);
  if (rec.ro) rec.ro.disconnect();
  rec.y.track.remove();
  rec.x.track.remove();
  el.classList.remove(MARK_CLASS);
  state.delete(el);
}

/** 扫描 root 下的所有元素，接管可滚动容器 */
function scan(root) {
  const nodes = root.querySelectorAll('*');
  for (const el of nodes) {
    if (state.has(el) || el.classList.contains(MARK_CLASS)) continue;
    if (isScrollable(el)) createScrollbar(el);
  }
}

/** 更新所有已接管的容器（内容变化 / 窗口尺寸变化时调用），并清理已脱离文档的容器 */
function updateAll() {
  for (const [el, rec] of state) {
    if (!el.isConnected) {
      destroyScrollbar(el);
      continue;
    }
    scheduleUpdate(el, rec);
  }
}

/**
 * 全量扫一遍「先补扫、再更新」。
 *
 * 为什么不能只 updateAll：一个容器可能因为**纯布局变化**才变得可滚动 ——
 * 窗口尺寸变化、字体加载完成导致行高变化等，这类变化不产生 DOM mutation，
 * MutationObserver 不会触发，容器就永远没被接管（表现：某些区域一直没有滚动条，
 * 侧栏最典型：列表/树的高度直接取决于视口高度）。
 */
function sweep() {
  scan(document.body);
  updateAll();
}

let sweepScheduled = false;

/** rAF 节流：拖窗口时会高频触发 resize，避免每次都全量扫描 */
function scheduleSweep() {
  if (sweepScheduled) return;
  sweepScheduled = true;
  window.requestAnimationFrame(() => {
    sweepScheduled = false;
    sweep();
  });
}

let initialized = false;

/**
 * 初始化全站悬浮滚动条。在应用挂载后调用一次即可：
 * 扫描当前 DOM + 监听后续变化（弹窗打开、数据加载、内容增删、视口尺寸变化等）。
 */
export function initOverlayScrollbar() {
  if (initialized) return;
  initialized = true;

  // 触屏（无 hover 能力）用更细的轨道。尺寸在 JS 里定：
  // placeTrack 写的是内联 width/height，CSS 里再写一份不会生效。
  if (typeof window.matchMedia === 'function') {
    TRACK_SIZE = window.matchMedia('(hover: none)').matches ? TRACK_SIZE_TOUCH : TRACK_SIZE_DESKTOP;
  }

  scan(document.body);

  let moScheduled = false;
  const mo = new MutationObserver(() => {
    if (moScheduled) return;
    moScheduled = true;
    window.requestAnimationFrame(() => {
      moScheduled = false;
      sweep();
    });
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });

  window.addEventListener('resize', scheduleSweep);
}
