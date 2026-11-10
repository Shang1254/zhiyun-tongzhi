/**
 * 知云同职 - 主入口：Tab 路由与全局工具
 */
(function () {
  const toastEl = () => document.getElementById('toast');
  let toastTimer = null;

  function toast(msg) {
    const t = toastEl();
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function go(tab) {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.getElementById('page-' + tab).classList.add('active');
    document.querySelectorAll('.tabbar .tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    window.scrollTo(0, 0);
  }

  function bindTabs() {
    document.querySelectorAll('.tabbar .tab').forEach((btn) => {
      btn.addEventListener('click', () => go(btn.dataset.tab));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindTabs();
    window.ZYJobs.init();
    window.ZYResume.init();
    window.ZYProfile.init();
    window.ZYRide.init();
    registerServiceWorker();
  });

  // PWA：注册离线缓存（仅 http(s) 生效，APK 内的 file:// 不注册）
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      /* 未放置 sw.js 的托管环境静默跳过，不影响任何功能 */
    });
  }

  window.ZYApp = { toast, go };
})();
