/**
 * 知云同职 - 数据服务层
 * 优先连接本地轻后端（地址可在个人中心配置，如 http://192.168.x.x:3000）；
 * 连接失败时自动回退内置岗位库（离线可用），保证 APP 永远打开就有内容。
 */
(function () {
  const SERVER_KEY = 'zy_server_url';
  // 部署时的注入配置（build-site 生成的 js/config.js）：静态站 + 独立 API 时填 apiBase
  const CONFIG = window.ZY_CONFIG || {};
  // APK 内置数据在 assets/www/data/ 下；浏览器本地开发在 web/data/ 下
  const FALLBACK_URLS = ['data/seed-jobs.json', '../data/seed-jobs.json'];

  function baseUrl() {
    return localStorage.getItem(SERVER_KEY) || defaultBaseUrl();
  }

  function defaultBaseUrl() {
    if (CONFIG.apiBase) return String(CONFIG.apiBase).replace(/\/+$/, '');
    // WebView 中 file:// 无法直连，默认尝试局域网常见地址；浏览器里走同源
    if (location.protocol === 'file:') return 'http://192.168.1.100:3000';
    return location.origin;
  }

  function setBaseUrl(url) {
    if (url) localStorage.setItem(SERVER_KEY, url.replace(/\/+$/, ''));
    else localStorage.removeItem(SERVER_KEY);
  }

  let seedCache = null;

  async function loadSeed() {
    if (seedCache) return seedCache;
    for (const u of FALLBACK_URLS) {
      try {
        const r = await fetch(u);
        if (r.ok) {
          seedCache = await r.json();
          return seedCache;
        }
      } catch (e) { /* 尝试下一个路径 */ }
    }
    seedCache = { jobs: [] };
    return seedCache;
  }

  async function tryFetch(path, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const r = await fetch(baseUrl() + path, { ...options, signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** 离线回退：对内置数据做与后端一致的展示处理（风险分后端已算好并随 seed 同步） */
  function seedToJobs(seed, show) {
    // 内置数据未预评分——前端离线时展示全部，真实岗在前（不冒充服务端判定）
    const all = (seed.jobs || []).map((j) => ({ ...j, offline: true }));
    const real = all.filter((j) => !String(j.id).startsWith('fake_'));
    const fake = all.filter((j) => String(j.id).startsWith('fake_'));
    if (show === 'fake') return fake;
    if (show === 'all') return all;
    return real;
  }

  const api = {
    baseUrl, setBaseUrl,

    async health() {
      return tryFetch('/api/health');
    },

    /**
     * 岗位列表
     * @param {{keyword?:string, city?:string, category?:string, education?:string, show?:'real'|'fake'}} q
     */
    async jobs(q = {}) {
      const params = new URLSearchParams({ pageSize: '50', show: q.show || 'real' });
      ['keyword', 'province', 'city', 'category', 'education'].forEach((k) => { if (q[k]) params.set(k, q[k]); });
      try {
        const data = await tryFetch('/api/jobs?' + params.toString());
        return { ...data, online: true };
      } catch (e) {
        const seed = await loadSeed();
        let list = seedToJobs(seed, q.show || 'real');
        if (q.keyword) {
          const kw = q.keyword.toLowerCase();
          list = list.filter((j) => (j.title + j.company + (j.description || '')).toLowerCase().includes(kw));
        }
        if (q.city) list = list.filter((j) => j.city === q.city || String(j.city || '').startsWith(q.city));
        if (q.province) {
          const p = q.province.replace(/省$/, '');
          list = list.filter((j) => (j.province || '').includes(p) || (j.city || '').includes(p));
        }
        if (q.category) list = list.filter((j) => j.category === q.category);
        if (q.education) list = list.filter((j) => j.education === q.education || j.education === '不限');
        return { total: list.length, list, online: false };
      }
    },

    async stats() {
      try {
        return { ...(await tryFetch('/api/jobs/meta/stats')), online: true };
      } catch (e) {
        const seed = await loadSeed();
        const jobs = seed.jobs || [];
        return {
          total: jobs.length,
          fakeFiltered: jobs.filter((j) => String(j.id).startsWith('fake_')).length,
          online: false,
        };
      }
    },

    /** 省份列表（服务端 = 索引∪库内；离线返回空由调用方隐藏筛选） */
    async provinces() {
      try {
        return await tryFetch('/api/meta/provinces');
      } catch (e) {
        return { fromIndex: [], inDb: [] };
      }
    },

    /** 保存匹配画像（仅匿名三元组，无敏感信息） */
    async saveProfile(deviceId, profile) {
      try {
        await tryFetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, ...profile }),
        });
        return true;
      } catch (e) {
        return false; // 离线时画像仅存本地，待联网后自动使用
      }
    },

    /** 今日推荐：先试服务端（deviceId 画像 + 本地画像兜底），离线时按画像从内置库即时挑选 */
    async digest(profile, deviceId) {
      try {
        const p = profile || {};
        const params = new URLSearchParams();
        if (deviceId) params.set('deviceId', deviceId);
        if (p.direction) params.set('direction', p.direction);
        if (p.city) params.set('city', p.city);
        if (p.education) params.set('education', p.education);
        return { ...(await tryFetch('/api/digest/today?' + params.toString())), online: true };
      } catch (e) {
        const seed = await loadSeed();
        const real = seedToJobs(seed, 'real');
        const p = profile || {};
        const scored = real
          .map((j) => {
            let s = 0;
            if (p.direction && (j.category === p.direction || j.title.includes(p.direction))) s += 50;
            if (p.city && (j.city === p.city || j.city === '全国')) s += 30;
            if (!p.education || j.education === '不限' || j.education === p.education) s += 10;
            return { j, s };
          })
          .sort((a, b) => b.s - a.s)
          .slice(0, 3)
          .map(({ j }) => ({ ...j, reason: '离线模式 · 来自内置岗位库' }));
        const dt = new Date();
        const dstr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        return { date: dstr, items: scored, online: false };
      }
    },
  };

  window.ZYApi = api;
})();
