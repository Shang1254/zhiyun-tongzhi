/**
 * 知云同职 - 静态站点导出（npm run build:site）
 *
 * 作用：把 web/ 前端 + 数据库里的真实岗位库打成一个纯静态目录，
 *       可以直接扔到 GitHub Pages / Cloudflare Pages / Netlify / 任何对象存储 + CDN。
 *
 * 静态版能力：
 *   - 岗位库（导出当下全部有效岗位，含来源与原文投递链接）离线可用
 *   - 简历生成 / PDF 导出 / 防骗检测（纯前端规则）完整可用
 *   - 拼车板块需要后端，静态版会提示"未连接服务"
 *   - 可选 --api-base 指向一个独立部署的后端，静态站也能有拼车与每日推荐
 *
 * 用法：
 *   node scripts/build-site.js                       # 输出到 dist/site
 *   node scripts/build-site.js --out=D:\site         # 指定输出目录
 *   node scripts/build-site.js --api-base=https://api.example.com
 */
const fs = require('fs');
const path = require('path');

const config = require('../src/config');
const { db } = require('../src/db');

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

const OUT_DIR = path.resolve(getArg('out', path.join(config.rootDir, 'dist', 'site')));
const API_BASE = String(getArg('api-base', '')).replace(/\/+$/, '');
const BUILD_AT = new Date();

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function rowToJob(row) {
  let requirements = [];
  let tags = [];
  try { requirements = JSON.parse(row.requirements || '[]'); } catch (e) { /* 容错 */ }
  try { tags = JSON.parse(row.tags || '[]'); } catch (e) { /* 容错 */ }
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    province: row.province || '',
    city: row.city,
    district: row.district,
    category: row.category,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryType: row.salary_type,
    education: row.education,
    experience: row.experience,
    description: row.description,
    requirements,
    tags,
    source: row.source,
    postedAt: row.posted_at,
    applyUrl: row.apply_url,
    expired: !!row.expired,
    riskScore: row.risk_score,
  };
}

function exportJobs() {
  // 静态版只导出有效岗位：已判定虚假的、超过 30 天被标记过期的都不发布
  const rows = db
    .prepare("SELECT * FROM jobs WHERE is_fake = 0 AND expired = 0 ORDER BY posted_at DESC, id ASC")
    .all();
  const fakeSamples = db
    .prepare('SELECT * FROM jobs WHERE is_fake = 1 ORDER BY id ASC')
    .all()
    .map((r) => ({ ...rowToJob(r), riskFlags: JSON.parse(r.risk_flags || '[]') }));

  const bySource = rows.reduce((acc, r) => {
    const k = r.source || 'unknown';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const payload = {
    version: config.version,
    generatedAt: BUILD_AT.toISOString().slice(0, 10),
    notice:
      '本文件由 `npm run build:site` 从岗位库实时导出。官方渠道岗位保留原文投递链接；' +
      '演示岗位为虚构数据，仅用于防骗教学。',
    stats: { total: rows.length, real: rows.length, fakeSamples: fakeSamples.length, bySource },
    // 列表里同时放真实岗与骗术样本：前端按 id 前缀（fake_）分流，
    // "查看骗术样本"视图在离线/静态模式下也能用判定理由做防骗教学
    jobs: rows.map(rowToJob).concat(fakeSamples),
    fakeSamples, // 单独一份便于外部工具直接取用
  };
  fs.writeFileSync(path.join(OUT_DIR, 'data', 'seed-jobs.json'), JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function writeConfigJs() {
  const cfg = {
    apiBase: API_BASE,
    version: config.version,
    buildAt: BUILD_AT.toISOString(),
    mode: API_BASE ? 'static+api' : 'static',
  };
  fs.writeFileSync(
    path.join(OUT_DIR, 'js', 'config.js'),
    `/* 由 npm run build:site 生成，请勿手改 */\nwindow.ZY_CONFIG = ${JSON.stringify(cfg, null, 2)};\n`,
    'utf8'
  );
  return cfg;
}

function writeManifest() {
  const manifest = {
    name: '知云同职 · 民办生公益求职助手',
    short_name: '知云同职',
    description: '面向民办高校学生的公益求职助手：岗位库、虚假岗过滤、简历生成、拼车同行。永久免费，无广告。',
    lang: 'zh-CN',
    start_url: './index.html',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f5f8ff',
    theme_color: '#1e6fff',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2), 'utf8');
}

function writeServiceWorker() {
  const CACHE = `zy-${config.version}-${BUILD_AT.toISOString().slice(0, 10)}`;
  const PRECACHE = [
    './',
    './index.html',
    './css/app.css',
    './js/config.js',
    './js/api.js',
    './js/crypto.js',
    './js/fraudGuard.js',
    './js/jobs.js',
    './js/ride.js',
    './js/resume.js',
    './js/profile.js',
    './js/app.js',
    './vendor/crypto-js.min.js',
    './vendor/html2pdf.bundle.min.js',
    './manifest.webmanifest',
    './data/seed-jobs.json',
  ];
  const sw = `/* 知云同职 Service Worker · 构建于 ${BUILD_AT.toISOString()} */
const CACHE = '${CACHE}';
const PRECACHE = ${JSON.stringify(PRECACHE, null, 2)};

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 跨域 API 与第三方请求不接管（避免缓存掉最新岗位/推荐）
  if (url.origin !== self.location.origin) return;
  // 接口请求一律走网络，失败即由前端回退内置数据
  if (url.pathname.includes('/api/')) return;
  // 岗位数据：网络优先，弱网回退缓存（保证换岗后能拿到新数据）
  if (url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }
  // 静态资源：缓存优先，回源更新
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match('./index.html')))
  );
});
`;
  fs.writeFileSync(path.join(OUT_DIR, 'sw.js'), sw, 'utf8');
}

function writeExtras() {
  fs.writeFileSync(
    path.join(OUT_DIR, 'robots.txt'),
    'User-agent: *\nAllow: /\n# 知云同职 · 公益求职助手，欢迎搜索引擎收录公开岗位信息\n',
    'utf8'
  );
  // GitHub Pages 深链兜底：找不到的路径由 404.html 渲染首页
  fs.copyFileSync(path.join(OUT_DIR, 'index.html'), path.join(OUT_DIR, '404.html'));
  fs.writeFileSync(
    path.join(OUT_DIR, '_headers'),
    `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: SAMEORIGIN\n  Referrer-Policy: no-referrer-when-downgrade\n/index.html\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-cache\n`,
    'utf8'
  );
}

function syncFraudGuard() {
  // 防骗规则库单一来源：后端 services/fraudGuard.js，前端加载的是同一份文件（离线也能研判）
  const src = path.join(__dirname, '..', 'src', 'services', 'fraudGuard.js');
  fs.copyFileSync(src, path.join(config.webDir, 'js', 'fraudGuard.js'));
  fs.copyFileSync(src, path.join(OUT_DIR, 'js', 'fraudGuard.js'));
}

function main() {
  console.log(`[build:site] 输出目录 ${OUT_DIR}`);
  rmrf(OUT_DIR);
  fs.mkdirSync(path.join(OUT_DIR, 'data'), { recursive: true });
  copyDir(config.webDir, OUT_DIR);
  syncFraudGuard();

  const jobs = exportJobs();
  const cfg = writeConfigJs();
  writeManifest();
  writeServiceWorker();
  writeExtras();

  const size = (p) => {
    let total = 0;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) walk(f);
        else total += fs.statSync(f).size;
      }
    };
    walk(p);
    return (total / 1024).toFixed(0);
  };

  console.log(`[build:site] 岗位导出：${jobs.stats.real} 条有效岗位 + ${jobs.stats.fakeSamples} 条虚假岗样本`);
  console.log(`[build:site] 来源分布：${JSON.stringify(jobs.stats.bySource)}`);
  console.log(`[build:site] 运行模式：${cfg.mode}${cfg.apiBase ? ' → ' + cfg.apiBase : '（纯静态，最多离线数据）'}`);
  console.log(`[build:site] 产物体积：${size(OUT_DIR)} KB`);
  console.log(`[build:site] 完成，可直接上传整个目录`);
}

main();
