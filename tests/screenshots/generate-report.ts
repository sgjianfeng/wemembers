/**
 * Generates a single HTML review report from screenshots + metadata.json
 *
 * Run: npx tsx tests/screenshots/generate-report.ts
 * Output: tests/screenshots/output/review-report.html
 */
import fs from "fs";
import path from "path";

const OUTPUT_DIR = path.resolve("tests/screenshots/output");
const METADATA_PATH = path.join(OUTPUT_DIR, "metadata.json");
const REPORT_PATH = path.join(OUTPUT_DIR, "review-report.html");

interface PageMeta {
  id: string;
  group: string;
  url: string;
  title: string;
  description: string;
  role: string;
}

const GROUPS: { key: string; label: string; emoji: string }[] = [
  { key: "Public", label: "Public — 未登录页面", emoji: "🌐" },
  { key: "Customer", label: "Customer — 用户端", emoji: "👤" },
  { key: "Business", label: "Business — 商戶端", emoji: "🏪" },
  { key: "Staff", label: "Staff — 店员端", emoji: "🧑‍💼" },
  { key: "Admin", label: "Admin — 管理后台", emoji: "⚙️" },
];

function generate() {
  const meta: PageMeta[] = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8"));
  const grouped = new Map<string, PageMeta[]>();
  for (const m of meta) {
    if (!grouped.has(m.group)) grouped.set(m.group, []);
    grouped.get(m.group)!.push(m);
  }

  let navHtml = "";
  let contentHtml = "";

  for (const g of GROUPS) {
    const pages = grouped.get(g.key);
    if (!pages || pages.length === 0) continue;

    navHtml += `<li class="nav-group">
      <div class="nav-group-title">${g.emoji} ${g.label}</div>
      <ul>`;
    for (const p of pages) {
      navHtml += `<li><a href="#${p.id}">${p.id} · ${p.description}</a></li>`;
    }
    navHtml += `</ul></li>`;

    contentHtml += `<section id="grp-${g.key}" class="group-section">
      <h2 class="group-title">${g.emoji} ${g.label} <span class="group-count">${pages.length} 页</span></h2>`;

    for (const p of pages) {
      contentHtml += `
      <div class="page-card" id="${p.id}">
        <div class="page-header">
          <span class="page-id">${p.id}</span>
          <h3>${p.description}</h3>
        </div>
        <div class="page-meta">
          <span class="url-badge">${p.url}</span>
          <span class="role-badge">${p.role}</span>
        </div>
        <div class="screenshot-container">
          <img src="${p.id}.png" alt="${p.description}" loading="lazy" onclick="this.classList.toggle('zoomed')" />
        </div>
        <div class="review-section">
          <div class="review-score">
            <label>体验评分：
              <span class="stars" data-page="${p.id}">
                <button onclick="rate('${p.id}', 1, this)">☆</button>
                <button onclick="rate('${p.id}', 2, this)">☆</button>
                <button onclick="rate('${p.id}', 3, this)">☆</button>
                <button onclick="rate('${p.id}', 4, this)">☆</button>
                <button onclick="rate('${p.id}', 5, this)">☆</button>
              </span>
            </label>
            <select class="status-select" onchange="markStatus('${p.id}', this.value)">
              <option value="">📋 待审查</option>
              <option value="approved">✅ 通过</option>
              <option value="needs-work">🔧 需要修改</option>
              <option value="blocked">🚫 有问题</option>
            </select>
          </div>
          <textarea class="review-notes" placeholder="审查意见、建议、问题..." onchange="saveNote('${p.id}', this.value)"></textarea>
        </div>
      </div>`;
    }
    contentHtml += `</section>`;
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WeMembers 全页面截图审查 · ${new Date().toISOString().slice(0, 10)}</title>
  <style>
    :root {
      --bg: #f8f9fa;
      --card-bg: #fff;
      --text: #1a1a2e;
      --muted: #6c757d;
      --border: #e9ecef;
      --accent: #4f46e5;
      --accent-light: #eef2ff;
      --nav-width: 280px;
      --radius: 10px;
      --shadow: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.6;
    }
    /* ── Layout ── */
    .layout { display: flex; min-height: 100vh; }
    nav {
      position: fixed; top: 0; left: 0; width: var(--nav-width); height: 100vh;
      background: #1e1b4b; color: #e0e0f0; overflow-y: auto; z-index: 10;
      padding: 20px 0;
    }
    nav h1 { font-size: 18px; padding: 0 20px 16px; border-bottom: 1px solid rgba(255,255,255,.1); margin-bottom: 8px; color: #fff; }
    nav .subtitle { font-size: 12px; padding: 0 20px 12px; color: #9ca3af; }
    nav ul { list-style: none; }
    nav .nav-group { margin-top: 4px; }
    nav .nav-group-title { padding: 8px 20px; font-size: 13px; font-weight: 600; color: #a5b4fc; }
    nav .nav-group ul a {
      display: block; padding: 5px 20px 5px 32px; font-size: 12px; color: #c7d2fe;
      text-decoration: none; transition: background .15s;
    }
    nav .nav-group ul a:hover { background: rgba(255,255,255,.08); color: #fff; }
    main {
      margin-left: var(--nav-width); flex: 1; padding: 32px 40px;
      max-width: calc(100% - var(--nav-width));
    }
    /* ── Group header ── */
    .group-title { font-size: 22px; margin: 40px 0 20px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }
    .group-title:first-child { margin-top: 0; }
    .group-count { font-size: 14px; color: var(--muted); font-weight: 400; margin-left: 8px; }
    /* ── Page card ── */
    .page-card {
      background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow);
      margin-bottom: 24px; overflow: hidden; border: 1px solid var(--border);
    }
    .page-header { padding: 16px 20px 8px; display: flex; align-items: center; gap: 12px; }
    .page-id { background: var(--accent); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .page-header h3 { font-size: 16px; }
    .page-meta { padding: 0 20px 12px; display: flex; gap: 8px; align-items: center; }
    .url-badge { background: #f1f5f9; padding: 2px 10px; border-radius: 4px; font-size: 12px; color: var(--muted); font-family: monospace; }
    .role-badge { background: var(--accent-light); color: var(--accent); padding: 2px 10px; border-radius: 4px; font-size: 12px; }
    /* ── Screenshot ── */
    .screenshot-container {
      background: #f1f1f1; text-align: center; padding: 12px;
      max-height: 600px; overflow-y: auto; cursor: pointer;
    }
    .screenshot-container img {
      max-width: 100%; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,.1);
      transition: transform .2s;
    }
    .screenshot-container img.zoomed {
      transform: scale(1.5); cursor: zoom-out;
    }
    /* ── Review section ── */
    .review-section { padding: 16px 20px; border-top: 1px solid var(--border); background: #fafbfc; }
    .review-score { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; flex-wrap: wrap; }
    .review-score label { font-size: 13px; color: var(--muted); }
    .stars button {
      background: none; border: none; font-size: 20px; cursor: pointer; color: #d1d5db;
      padding: 0 2px; transition: color .15s;
    }
    .stars button.active { color: #f59e0b; }
    .stars button:hover { color: #fbbf24; }
    .status-select { padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border); font-size: 13px; }
    .review-notes {
      width: 100%; min-height: 60px; padding: 10px; border: 1px solid var(--border);
      border-radius: 6px; font-size: 13px; font-family: inherit; resize: vertical;
    }
    .review-notes:focus { outline: none; border-color: var(--accent); }
    /* ── Print ── */
    @media print {
      nav { display: none; }
      main { margin-left: 0; max-width: 100%; padding: 0; }
      .page-card { break-inside: avoid; margin-bottom: 12px; box-shadow: none; border: 1px solid #ccc; }
      .review-section { display: none; }
      .screenshot-container { max-height: none; overflow: visible; }
    }
  </style>
</head>
<body>
<div class="layout">
  <nav>
    <h1>📸 WeMembers 截图审查</h1>
    <div class="subtitle">${new Date().toISOString().slice(0, 10)} · ${meta.length} 页</div>
    <ul>${navHtml}</ul>
  </nav>
  <main>${contentHtml}
    <div style="text-align:center; padding:40px; color:var(--muted); font-size:13px;">
      ✅ 审查完成 · 共 ${meta.length} 页 · 可直接打印为纸质手册
    </div>
  </main>
</div>
<script>
  // ── Persist review state to localStorage ──
  const KEY = "wem_review";
  function loadState() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
  }
  function saveState(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

  window.rate = function(pageId, score, btn) {
    const state = loadState(); state[pageId] = state[pageId] || {};
    state[pageId].score = score; saveState(state);
    const btns = btn.parentElement.querySelectorAll("button");
    btns.forEach((b, i) => b.classList.toggle("active", i < score));
  };
  window.markStatus = function(pageId, status) {
    const state = loadState(); state[pageId] = state[pageId] || {};
    state[pageId].status = status; saveState(state);
  };
  window.saveNote = function(pageId, text) {
    const state = loadState(); state[pageId] = state[pageId] || {};
    state[pageId].note = text; saveState(state);
  };

  // Restore on load
  (function() {
    const state = loadState();
    for (const [pageId, data] of Object.entries(state)) {
      // Restore stars
      if (data.score) {
        const starContainer = document.querySelector('.stars[data-page="' + pageId + '"]');
        if (starContainer) {
          starContainer.querySelectorAll("button").forEach((b, i) => b.classList.toggle("active", i < data.score));
        }
      }
      // Restore status
      if (data.status) {
        const sel = document.querySelector('.status-select[onchange*="' + pageId + '"]');
        if (sel) sel.value = data.status;
      }
      // Restore notes
      if (data.note) {
        const ta = document.querySelector('textarea[onchange*="' + pageId + '"]');
        if (ta) ta.value = data.note;
      }
    }
  })();
</script>
</body>
</html>`;

  fs.writeFileSync(REPORT_PATH, html);
  console.log(`✅ Report generated: ${REPORT_PATH}`);
  console.log(`   Pages: ${meta.length}`);
  for (const g of GROUPS) {
    const pages = grouped.get(g.key);
    if (pages) console.log(`   ${g.emoji} ${g.label}: ${pages.length} pages`);
  }
}

generate();
