/**
 * 知云同职 - 省-市-区县三级地理规范化
 *
 * 依据工作区根目录 national_city_index.csv（国家统计局口径行政区划索引），
 * 将采集岗位的 city/district 规范化为 {province, city, district}：
 *   - "武汉" → { province: 湖北省, city: 武汉市, district: 原值 }
 *   - "恩施" → { province: 湖北省, city: 恩施土家族苗族自治州, district: 原值 }
 *   - "湖南省"/省级名 → { province: 湖南省, city: '' }
 *   - "全国"/空 → { province: '', city: 原值 }
 * 入库前由 jobStore.importJobs 统一调用，所有导入路径自动获得省份归属。
 */
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', '..', '..', 'national_city_index.csv');

let indexCache = null; // { byCityKey: Map, byProvinceKey: Map }

function stripSuffix(name) {
  return String(name || '')
    .replace(/(土家族|苗族|回族|彝族|白族|傣族|蒙古族|藏族|羌族|壮族|哈尼族|侗族|瑶族|朝鲜族|傈僳族|柯尔克孜|哈萨克|满族|达斡尔|锡伯)+/g, '#')
    .replace(/[#]*自治州$/, '')
    .replace(/[#]*自治县$/, '')
    .replace(/[#]*地区$/, '')
    .replace(/林区$/, '')
    .replace(/特区$/, '')
    .replace(/[市区县盟州]$/, '');
}

function loadIndex() {
  if (indexCache) return indexCache;
  indexCache = { byCityKey: new Map(), byProvinceKey: new Map() };
  if (!fs.existsSync(CSV_PATH)) {
    // 索引未生成时不阻断入库，仅省份列为空
    return indexCache;
  }
  const text = fs.readFileSync(CSV_PATH, 'utf-8').replace(/^\uFEFF/, '');
  for (const line of text.trim().split('\n').slice(1)) {
    const [provinceCode, provinceName, cityCode, cityName, level] = line.split(',');
    if (!cityName) continue;
    const row = { provinceCode, provinceName, cityCode, cityName, level: level || '' };
    for (const key of new Set([stripSuffix(cityName), cityName])) {
      if (key && !indexCache.byCityKey.has(key)) indexCache.byCityKey.set(key, row);
    }
    const pKey = stripSuffix(provinceName);
    if (pKey && !indexCache.byProvinceKey.has(pKey)) indexCache.byProvinceKey.set(pKey, row);
  }
  return indexCache;
}

/**
 * 规范化岗位地域。返回 { province, city, district }（新对象字段，不修改入参）。
 */
function normalizeRegion(job) {
  const idx = loadIndex();
  const rawCity = String(job.city || '').trim();
  const rawDistrict = String(job.district || '').trim();
  if (!rawCity || rawCity === '全国' || rawCity === '境外') {
    return { province: '', city: rawCity, district: rawDistrict };
  }
  const cKey = stripSuffix(rawCity);
  const hit = idx.byCityKey.get(cKey) || idx.byCityKey.get(rawCity);
  if (hit) {
    return { province: hit.provinceName, city: hit.cityName, district: rawDistrict };
  }
  // 岗位 city 里填的是省级名（如"湖南省"）
  const pHit = idx.byProvinceKey.get(cKey);
  if (pHit) {
    return { province: pHit.provinceName, city: '', district: rawDistrict };
  }
  return { province: '', city: rawCity, district: rawDistrict };
}

/** 索引概况（供统计与覆盖度报告） */
function indexSummary() {
  const idx = loadIndex();
  const provinces = new Map(); // code -> name
  for (const row of idx.byCityKey.values()) provinces.set(row.provinceCode, row.provinceName);
  return { provinceCount: provinces.size, provinces: [...provinces.entries()].map(([code, name]) => ({ code, name })) };
}

module.exports = { normalizeRegion, indexSummary, stripSuffix };
