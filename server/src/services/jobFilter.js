/**
 * 知云同职 - 子Agent①「岗位自动校验」落地实现
 *
 * 虚假/高风险岗位识别规则评分引擎（0-100 分，可解释、透明）：
 *   - 黑名单关键词（刷单、培训贷、押金、会费、境外高薪、垫付返款……）
 *   - 薪资异常（日结超高薪、月薪远超类别合理分位、薪资区间跨度过大）
 *   - 逻辑矛盾（无公司主体、联系方式引流、"无经验/无学历"与超高薪组合）
 *
 * 评分 >= 60 判定为「虚假岗」。每条命中规则都会输出原因，前端可展示，
 * 让求职者明白"为什么它被判定为虚假岗"——比黑盒更防骗。
 */

const RISK_BLACKLIST = [
  { kw: ['刷单', '点赞员', '垫付', '返款', '佣金日结'], score: 35, reason: '命中刷单/垫付返款类典型诈骗话术' },
  { kw: ['培训贷', '先学后付', '贷款培训', '先就业后付款'], score: 35, reason: '涉嫌「培训贷」套路（贷款培训、上岗还贷）' },
  { kw: ['押金', '保证金', '服装费', '建档费', '体检费', '工本费'], score: 30, reason: '入职前收取费用（押金/保证金类），正规岗位不会收费' },
  { kw: ['会费', '入群费', '会员费'], score: 30, reason: '要求缴纳会费/入群费' },
  { kw: ['境外高薪', '境外务工', '保密出行', '护照即可'], score: 45, reason: '境外高薪+保密出行，高度疑似境外务工诈骗' },
  { kw: ['月入过万不是梦', '躺赚', '动动手指', '日入过千', '轻松日入'], score: 25, reason: '含「躺赚/动动手指」类夸大话术' },
  { kw: ['保进大厂', '保就业', '不过退款', '内部名额'], score: 20, reason: '含「保录取/保就业」类承诺，正规招聘不作此类保证' },
  { kw: ['加QQ', '加微信', '联系时说明', '入群'], score: 15, reason: '以个人社交账号引流，绕开正规投递渠道' },
];

// 各岗位类别月薪合理上限（元）。超过上限 2 倍视为薪资虚标。
const CATEGORY_SALARY_CEILING = {
  客服: 8000, 行政: 8000, 运营: 12000, 电商: 11000, 销售: 15000,
  IT: 18000, 财务: 10000, 教育: 9000, 物流: 9000, 设计: 12000,
  兼职: 6000, 培训: 8000, 劳务: 10000,
};
const DEFAULT_CEILING = 12000;

// 兼职/日结合理日薪上限
const DAILY_SALARY_CEILING = 400;

function toSet(text) {
  return text || '';
}

/**
 * 对单条岗位做风险评分
 * @param {object} job 岗位对象（字段同 seed-jobs.json）
 * @returns {{score:number, isFake:boolean, flags:{reason:string,score:number}[]}}
 */
function assess(job) {
  let score = 0;
  const flags = [];
  const add = (s, reason) => {
    score += s;
    flags.push({ reason, score: s });
  };

  const haystack = toSet(
    [job.title, job.description, (job.requirements || []).join(' '), (job.tags || []).join(' ')].join(' ')
  );
  const company = (job.company || '').trim();

  // 规则一：黑名单关键词
  for (const rule of RISK_BLACKLIST) {
    if (rule.kw.some((k) => haystack.includes(k))) {
      add(rule.score, rule.reason);
    }
  }

  // 规则二：薪资异常
  const min = Number(job.salaryMin) || 0;
  const max = Number(job.salaryMax) || 0;
  if (job.salaryType === 'daily' && max > DAILY_SALARY_CEILING) {
    add(30, `日薪 ${max} 元远超兼职合理水平（≤${DAILY_SALARY_CEILING} 元/天）`);
  }
  if (job.salaryType === 'monthly') {
    const ceiling = CATEGORY_SALARY_CEILING[job.category] || DEFAULT_CEILING;
    if (max > ceiling * 2) {
      add(30, `月薪上限 ${max} 元超过「${job.category || '该类别'}」合理分位（约 ≤${ceiling} 元）的 2 倍`);
    }
  }
  if (min > 0 && max > 0 && max / min >= 3) {
    add(15, `薪资区间 ${min}-${max} 跨度过大（${(max / min).toFixed(1)} 倍），常见于先低薪引流后改口`);
  }

  // 规则三：逻辑矛盾
  if (!company || company.length < 4 || /\(联系|（联系/.test(company)) {
    add(20, '无明确公司主体或公司名含引流备注');
  }
  if (job.city === '境外') {
    add(25, '岗位地点为境外且待遇异常优厚');
  }
  if (
    /无需(任何)?(经验|技能|学历)/.test(haystack) &&
    ((job.salaryType === 'daily' && max >= 500) || (job.salaryType === 'monthly' && max >= 20000))
  ) {
    add(25, '「零门槛」与「超高薪」组合，典型诈骗特征');
  }

  // 规则四：描述空洞（字数过少却承诺高回报）
  if ((job.description || '').length < 40 && max >= 30000) {
    add(15, '描述空洞但承诺极高回报');
  }

  score = Math.min(100, score);
  return { score, isFake: score >= 60, flags };
}

/** 批量评分并返回统计 */
function assessAll(jobs) {
  return jobs.map((j) => {
    const r = assess(j);
    return { ...j, riskScore: r.score, isFake: r.isFake, riskFlags: r.flags };
  });
}

module.exports = { assess, assessAll, CATEGORY_SALARY_CEILING };
