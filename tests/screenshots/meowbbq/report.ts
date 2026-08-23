/**
 * 把 meowbbq 截图打成一份自包含 HTML（图片内联为 data URI，可直接发给别人）
 * 运行：npx tsx tests/screenshots/meowbbq/report.ts
 */
import fs from "fs";
import path from "path";

const OUT = path.resolve(__dirname, "../output/meowbbq");
const JPG = path.join(OUT, "jpg");
const REPORT = path.join(OUT, "report.html");

const SECTIONS: Array<{
  key: string;
  label: string;
  intro: string;
  shots: Array<{ id: string; title: string; url: string; note: string; check?: string[] }>;
}> = [
  {
    key: "platform",
    label: "平台与公开页",
    intro: "顾客不登录就能看到的入口。",
    shots: [
      { id: "a1", title: "平台首页", url: "/", note: "顾客默认落地页" },
      { id: "a2", title: "商家品牌页", url: "/shop/meow-bbq", note: "品牌主页 —— 券产品货架" },
      { id: "a3", title: "门店页", url: "/store/…", note: "单店视角" },
      { id: "a4", title: "商戶合作页", url: "/for-business", note: "招商落地页" },
    ],
  },
  {
    key: "business",
    label: "商家管理",
    intro: "商家登录后的配置与日常操作。",
    shots: [
      { id: "b1", title: "商家工作台", url: "/business", note: "登录后首页" },
      {
        id: "b2",
        title: "消费返 + 抽奖 · 活动配置",
        url: "/business/cashback",
        note: "费率滑块 + 月成本预览 + 门店 opt-in + 额度负债",
        check: [
          "3% + 2% = 5%，落在 [3%,15%] 区间内",
          "月流水 S$60,000 → 平台费 S$510 = 首 S$30k×1% + S$30k×0.7%（阶梯分段正确）",
          "返利标注「记账负债，不预扣现金」——与资金模型一致",
        ],
      },
      {
        id: "b3",
        title: "收银台（店员出码）",
        url: "/business/cashback-desk",
        note: "店员只输一个数字",
        check: ["快捷金额 + 单号后四位（防重复指纹）"],
      },
      {
        id: "b4",
        title: "出码结果",
        url: "/business/cashback-desk",
        note: "二维码 + 短码 + 10 分钟倒计时",
        check: ["金额由店员录入并固化在令牌上，顾客无法篡改"],
      },
      {
        id: "b5",
        title: "新建券 · 券模版目录",
        url: "/business/voucher-templates",
        note: "储值券 3 种 + 权益券 3 种",
        check: [
          "抵扣额度与奖励券由系统按规则发放，刻意不出现在此菜单",
          "页底灰卡说明原因并给出去活动配置的入口",
        ],
      },
      {
        id: "b6",
        title: "折扣券 · 折扣率可调",
        url: "/business/voucher-templates",
        note: "0% = 原价代金 · 10% = 9折卡 · 20% = 8折卡",
        check: ["原本写死的两个 pack 现在合并成一个参数化模版"],
      },
      { id: "b7", title: "券产品列表", url: "/business/products", note: "由券模版创建的 SKU" },
      {
        id: "b8",
        title: "活动列表",
        url: "/business/campaigns",
        note: "活动容器",
        check: [
          "只显示 4 个真活动，已正确过滤掉 4 个 product_mirror 影子",
          "规则型活动（消费返 / 节日满赠）显示「无需挂券」而非误导性的「未挂券产品」告警",
        ],
      },
    ],
  },
  {
    key: "customer",
    label: "顾客侧",
    intro: "扫码领取到钱包的完整路径。",
    shots: [
      {
        id: "c1",
        title: "扫码领取（公开页）",
        url: "/c/cashback/[token]",
        note: "无需登录即可打开",
        check: ["金额来自令牌，页面上没有让顾客填金额的输入框"],
      },
      {
        id: "c2",
        title: "领取成功",
        url: "/c/cashback/[token]",
        note: "抵扣额度 + 当场即时奖 + 大奖进度 + 积分",
        check: [
          "消费 S$80 → 返 S$2.40（3%）",
          "即时奖 S$0.30 已并入抵扣额度，不单列",
          "大奖进度指向下一个未发放档位，目标按活动客单价固定为 S$833",
        ],
      },
      {
        id: "c3",
        title: "钱包 · 三分区",
        url: "/balance",
        note: "购券余额 / 消费抵扣额度 / 中奖奖励券",
        check: [
          "抵扣额度 S$2.70 = 返利 2.40 + 即时奖 0.30",
          "到期日 2028-08-22 = 24 个月无活动失效",
          "两类余额分开展示，可提现与不可提现不混淆",
        ],
      },
      { id: "c4", title: "顾客首页", url: "/home", note: "" },
    ],
  },
];

function dataUri(id: string): string {
  const p = path.join(JPG, `${id}.jpg`);
  if (!fs.existsSync(p)) return "";
  return `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}`;
}

const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meow BBQ 功能验证</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#111827;--muted:#6b7280;--line:#e5e7eb;--accent:#1a6eff;--ok:#059669;--warn:#b45309}
@media (prefers-color-scheme:dark){:root{--bg:#0b0d10;--card:#15181d;--fg:#e8eaed;--muted:#9aa1ab;--line:#262b33}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.65 -apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:40px 20px 80px}
h1{font-size:30px;margin:0 0 6px;letter-spacing:-.02em}
.sub{color:var(--muted);margin:0 0 28px}
.meta{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:34px}
.pill{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 13px;font-size:13px;color:var(--muted)}
h2{font-size:20px;margin:44px 0 4px;padding-top:22px;border-top:1px solid var(--line)}
h2:first-of-type{border-top:0;padding-top:0}
.intro{color:var(--muted);margin:0 0 20px;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.shot{background:#e9ecef;border-bottom:1px solid var(--line)}
@media (prefers-color-scheme:dark){.shot{background:#0b0d10}}
.shot img{display:block;width:100%;height:auto}
.body{padding:14px 16px 16px}
.t{font-weight:650;font-size:15px;margin:0 0 3px}
.u{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--accent);word-break:break-all;margin:0 0 8px}
.n{color:var(--muted);font-size:13px;margin:0}
ul.chk{margin:11px 0 0;padding-left:0;list-style:none}
ul.chk li{position:relative;padding-left:20px;font-size:13px;color:var(--fg);margin-bottom:6px;line-height:1.55}
ul.chk li:before{content:"✓";position:absolute;left:0;top:0;color:var(--ok);font-weight:700}
.found{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:10px;padding:18px 20px;margin:30px 0 0}
.found h3{margin:0 0 12px;font-size:16px}
.found ol{margin:0;padding-left:20px}
.found li{margin-bottom:11px;font-size:14px}
.found code{background:rgba(127,127,127,.14);padding:1px 5px;border-radius:4px;font-size:12.5px}
</style></head><body><div class="wrap">
<h1>Meow BBQ · 主要功能验证</h1>
<p class="sub">完全重置为新建商家状态后，走通全流程并逐页截图。</p>
<div class="meta">
  <span class="pill">商家 <b>meow-bbq</b> · 2 门店</span>
  <span class="pill">默认活动 4 · 券产品 4</span>
  <span class="pill">${SECTIONS.reduce((n, s) => n + s.shots.length, 0)} 张截图</span>
  <span class="pill">视口 390×844</span>
  <span class="pill">npm run db:full-reset-meowbbq</span>
</div>
${SECTIONS.map(
  (sec) => `<h2>${sec.label}</h2><p class="intro">${sec.intro}</p><div class="grid">${sec.shots
    .map((s) => {
      const uri = dataUri(s.id);
      return `<div class="card">
  ${uri ? `<div class="shot"><img loading="lazy" src="${uri}" alt="${s.title}"></div>` : ""}
  <div class="body">
    <p class="t">${s.title}</p>
    <p class="u">${s.url}</p>
    ${s.note ? `<p class="n">${s.note}</p>` : ""}
    ${s.check ? `<ul class="chk">${s.check.map((c) => `<li>${c}</li>`).join("")}</ul>` : ""}
  </div>
</div>`;
    })
    .join("")}</div>`
).join("")}
<div class="found">
  <h3>本轮验证发现并修复的问题</h3>
  <ol>
    <li><b>金额缺币种符号。</b> <code>formatMoney()</code> 只返回数字，调用处需自己拼 <code>S$</code>；4 个新页面共 15 处漏拼，出现「已到账 2.40」这种无币种文案。新增 <code>formatSgd()</code> 一次性修掉，并在注释里写明原因。</li>
    <li><b>规则型活动被误报「未挂券产品」。</b> 消费返与节日满赠按规则自动发放，本就不挂券产品，橙色告警会让商家以为配置没做完。改为「规则型活动 · 按规则自动发放，无需挂券」。</li>
    <li><b><code>cashback</code> 活动类型没有标签，</b>回退显示成「促销」。活动列表与详情页均已补上「消费返 + 抽奖」。</li>
  </ol>
</div>
</div></body></html>`;

fs.writeFileSync(REPORT, html);
console.log(`报告: ${REPORT}`);
console.log(`大小: ${(fs.statSync(REPORT).size / 1024 / 1024).toFixed(2)} MB`);
