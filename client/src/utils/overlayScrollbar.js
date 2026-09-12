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
 *   - 滚动 / 悬停时轨道淡入，静止片刻后淡出；滑块支持鼠标 / 触控板拖拽
 *
 * 用法：在应用挂载后调用一次 initOverlayScrollbar()。
 * 接管是自动的：MutationObserver 监听 DOM 变化，弹窗（Modal/Drawer）打开、
 * 数据加载等场景下新出现的滚动容器都会被自动接管，容器销毁时自动清理。
 */

const TRACK_SIZE = 8; // 轨道宽度 / 高度
const TRACK_INSET = 3; // 轨道距容器边缘的内缩
const MIN_THUMB = 28; // 滑块最小尺寸
const AUTO_HIDE_DELAY = 900; // 停止滚动后自动隐藏的延迟
const MARK_CLASS = 'osb-tracked'; // 标记已接管的容器，避免重复处理

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

/** 依据容器的视口坐标摆放轨道（轨道挂在 body 上，position: fixed） */
function placeTrack(el, rec) {
  const r = el.getBoundingClientRect();
  const { y, x } = rec;
  if (r.width <= 0 || r.height <= 0) {
    y.track.style.display = 'none';
    x.track.style.display = 'none';
    return;
  }
  y.track.style.left = `${r.left + r.width - TRACK_SIZE - TRACK_INSET}px`;
  y.track.style.top = `${r.top + TRACK_INSET}px`;
  y.track.style.width = `${TRACK_SIZE}px`;
  y.track.style.height = `${Math.max(0, r.height - TRACK_INSET * 2)}px`;

  x.track.style.left = `${r.left + TRACK_INSET}px`;
  x.track.style.top = `${r.top + r.height - TRACK_SIZE - TRACK_INSET}px`;
  x.track.style.width = `${Math.max(0, r.width - TRACK_INSET * 2)}px`;
  x.track.style.height = `${TRACK_SIZE}px`;
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
    placeTrack(el, rec);
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
    if (rec.dragging) return;
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
  rec.onEnter = () => showTracks(rec);
  rec.onLeave = () => {
    if (!rec.dragging) hideSoon(rec, 120);
  };
  el.addEventListener('scroll', rec.onScroll, { passive: true });
  el.addEventListener('mouseenter', rec.onEnter);
  el.addEventListener('mouseleave', rec.onLeave);

  // 轨道挂在 body 上（容器外）：鼠标移出容器进入轨道时，若不处理会被容器
  // 的 mouseleave 触发隐藏，表现为「刚悬停就消失」。给轨道也绑定悬停保持。
  rec.onTrackEnter = () => showTracks(rec);
  rec.onTrackLeave = () => hideSoon(rec, 120);
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

let initialized = false;

/**
 * 初始化全站悬浮滚动条。在应用挂载后调用一次即可：
 * 扫描当前 DOM + 监听后续变化（弹窗打开、数据加载、内容增删等）。
 */
export function initOverlayScrollbar() {
  if (initialized) return;
  initialized = true;

  scan(document.body);

  let moScheduled = false;
  const mo = new MutationObserver(() => {
    if (moScheduled) return;
    moScheduled = true;
    window.requestAnimationFrame(() => {
      moScheduled = false;
      scan(document.body);
      updateAll();
    });
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });

  window.addEventListener('resize', updateAll);
}
