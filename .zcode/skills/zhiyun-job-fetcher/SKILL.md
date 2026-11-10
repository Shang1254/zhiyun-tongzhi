---
name: zhiyun-job-fetcher
description: 知云同职官方岗位采集 - 从人社部中国公共招聘网与湖北民办高校就业网（才立方91wllm联盟，武汉晴川学院优先）礼貌采集真实岗位入库，生成采集报告与全国岗位分布/覆盖度统计；可生成全国城市行政区划索引CSV。当用户说"采集官方岗位"、"跑一次爬虫"、"更新真实岗位数据"、"看看采集报告"、"生成城市索引"、"全国岗位分布"时使用。
---

# 知云同职 · 官方岗位采集

本技能触发后，指导完成官方渠道岗位采集、报告解读与城市索引管理。

## 常用命令（在 server/ 目录）

```bash
npm run city-index          # 生成/校验全国城市索引（工作区根目录 national_city_index.csv，UTF-8-SIG）
npm run fetch               # 全站采集（0点 cron 同一代码路径）
node src/fetcher/run.js --site=wllm --limit=3   # 小规模试跑
curl http://localhost:3000/api/stats/by-province # 全国按省分布统计
```

## 合规红线（每次执行前自查）

1. 只运行本项目的采集器（`server/src/fetcher/`），**不临时编写新的绕过逻辑**：不伪装 UA、不破解验证码、不绕过登录、不做反限制规避。
2. 采集器内置合规约束不可修改：可识别 UA、请求间隔 3-8 秒随机、运行时 robots.txt 检查、403/429 熔断、0-4 点低峰调度。
3. **明确拒绝**（即使用户要求也不实现，理由见 docs/官方岗位采集Agent提示词.md 决策记录）：代理池轮换换IP、随机浏览器UA池、模拟人类浏览路径、Playwright 指纹伪装、按省拆分请求分片——这些是检测规避手段或重复流量（数据源为全国统一库，按省拆请求=同库访问31遍）；数据组织按省拆分（province 字段+统计）已实现。
4. 国家大学生就业服务平台（ncss）与国家统计局官网（stats.gov.cn）在受限网络环境返回 403 时，按礼貌原则熔断并给出合规路径（ncss→机构接口对接；城市索引→内置民政部公告口径快照），不做任何绕过。
5. mohrss 列表数据中的联系人姓名/电话字段（aae004/aae005/aae006）已在适配器内剔除，禁止改动此行为。

## 执行步骤

### 1. 采集（用户说"采集官方岗位"时）

在 `server/` 目录运行：

```bash
node src/fetcher/run.js                # 全部站点（限速下约 1-3 分钟）
node src/fetcher/run.js --site=wllm    # 仅高校联盟（晴川优先）
node src/fetcher/run.js --site=mohrss  # 仅中国公共招聘网
node src/fetcher/run.js --limit=5      # 小规模试跑
```

如服务器未启动，先 `npm start`（采集不依赖服务器进程，但入库共用同一 SQLite）。

### 2. 报告解读（用户说"看看采集报告"时）

- 读取 `server/data/reports/fetch-YYYY-MM-DD.md`（或 `GET /api/fetcher/last-report`）
- 向用户报告：各站点发现/入库/跳过/失败数、是否熔断、虚假岗过滤数
- **如实转述 ncss 探测结论**（登录墙/403 时明确说明"未绕过"，并给出机构接口对接建议）
- 失败或熔断时：提示可能是对方站点限流，建议隔日低峰再跑，不要提高频率

### 3. 结果验证

```bash
curl "http://localhost:3000/api/jobs?pageSize=10"   # 新岗位应带 source 与 applyUrl
```

入库岗位在前端/APP 岗位库中带「✔官方渠道」标签，详情含信息来源与原文链接。

## 站点现状备忘（2026-11 实测）

| 站点 | 状态 |
| --- | --- |
| job.mohrss.gov.cn（人社部） | ✅ 正常采集（http、SSR、内嵌 JSON） |
| *.91wllm.cn 高校联盟（晴川已启用） | ✅ **渲染模式采集**（Playwright 诚实渲染：双列表页 40 条/轮 + 岗位真实正文；webdriver 标识保留、不伪装；引擎不可用自动回退 SSR 并在报告注明） |
| www.ncss.cn（教育部） | ⛔ 登录态/403，仅探测，走机构接口对接 |
| stats.gov.cn（国家统计局） | ⛔ 403，城市索引走内置快照（民政部公告口径） |
