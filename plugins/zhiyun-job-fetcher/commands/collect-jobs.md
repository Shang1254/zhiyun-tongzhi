---
description: 跑一次知云同职官方岗位采集（可选指定站点/条数），并汇报采集报告
allowed-tools: Bash, Read, Grep
---

# 官方岗位采集

按以下流程执行一次官方岗位采集并向用户汇报。全程遵守插件技能 `zhiyun-official-job-agent` 的合规红线：只运行项目自带采集器，不临时编写抓取逻辑，不伪装 UA、不绕过登录。

## 参数

- 站点：$ARGUMENTS（可省略；支持 `wllm`=高校联盟晴川优先 / `mohrss`=中国公共招聘网 / `ncss`=仅探测 / 留空=全部）

## 步骤

1. 在 `server/` 目录运行（把 SITE 替换为上方参数，空则全部站点；白天时段或用户只要试跑时追加 `--limit=5`）：

   ```bash
   node src/fetcher/run.js --site=SITE
   ```

2. 读取 `server/data/reports/fetch-YYYY-MM-DD.md` 当日新增段落，向用户如实汇报：
   - 各站点发现 / 抓取 / 入库 / 跳过 / 失败数、请求与重试次数
   - 是否触发熔断（有则说明是对方限流，建议隔日低峰再跑，不要提高频率）
   - 虚假岗过滤条数（评分引擎自动标记）
   - ncss 探测结论如实转述（登录墙/不可达就明说「未绕过」，给出机构接口对接建议）

3. 若用户需要验证入库结果，提示先在 `server/` 目录 `npm start`，然后访问 `http://localhost:3000/api/jobs?pageSize=10`，新岗位应带 `source` 与 `applyUrl`，前端/APP 内带「✔官方渠道」标签。
