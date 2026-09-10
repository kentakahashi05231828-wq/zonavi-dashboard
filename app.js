import { firebaseConfig, isConfigured } from "./firebase-config.js";
import { TABS, APP_GROUP, EVENTS, BREAKDOWNS, lookupEvent, tabOf } from "./catalog.js";

// ─────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const nf = new Intl.NumberFormat("ja-JP");
const fmt = n => nf.format(Math.round(n || 0));
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : String(kid));
  return n;
};
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, v);
  return n;
};
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const tabColor = id => cssVar(`--tab-${id}`) || cssVar("--tab-app");

/** JST の日付キー（アプリ側と同じ基準） */
const dayKey = d => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
}).format(d);
const shiftDays = (key, n) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};
const listDays = (from, to) => {
  const out = [];
  for (let k = from; k <= to; k = shiftDays(k, 1)) out.push(k);
  return out;
};
const shortDay = key => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;

// ─────────────────────────────────────────────────────────────
// 状態
// ─────────────────────────────────────────────────────────────
const state = {
  rangeDays: 30,
  source: localStorage.getItem("zonavi.dash.source") || "analytics",  // analytics | analyticsDebug
  scope: "range",           // range | total  （機能ランキングの集計範囲）
  showAllEvents: false,
  daily: {},                // { "2026-09-05": {...} }
  totals: {},
  db: null,
};

// ─────────────────────────────────────────────────────────────
// テーマ
// ─────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem("zonavi.dash.theme");
  if (saved) document.documentElement.dataset.theme = saved;
  const apply = () => {
    const isDark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const btn = $("#theme-toggle");
    if (btn) { btn.textContent = isDark ? "☾" : "☀"; btn.title = isDark ? "ライトモードへ" : "ダークモードへ"; }
  };
  window.__applyThemeLabel = apply;
  apply();
}
function toggleTheme() {
  const isDark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  const next = isDark ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("zonavi.dash.theme", next);
  window.__applyThemeLabel?.();
  render();
}

// ─────────────────────────────────────────────────────────────
// ツールチップ
// ─────────────────────────────────────────────────────────────
const tip = { node: null };
function showTip(evt, title, rows) {
  if (!tip.node) { tip.node = el("div", { id: "tip" }); document.body.append(tip.node); }
  tip.node.innerHTML = "";
  tip.node.append(el("div", { class: "t" }, title));
  for (const [k, v] of rows) {
    tip.node.append(el("div", { class: "r" }, el("span", { class: "k" }, k), el("span", { class: "v" }, v)));
  }
  tip.node.style.opacity = "1";
  moveTip(evt);
}
function moveTip(evt) {
  if (!tip.node) return;
  const pad = 14, r = tip.node.getBoundingClientRect();
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + r.width  > innerWidth  - 8) x = evt.clientX - r.width  - pad;
  if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
  tip.node.style.left = `${Math.max(8, x)}px`;
  tip.node.style.top  = `${Math.max(8, y)}px`;
}
const hideTip = () => { if (tip.node) tip.node.style.opacity = "0"; };

// ─────────────────────────────────────────────────────────────
// データ取得
// ─────────────────────────────────────────────────────────────
async function loadData() {
  if (state.demo) { buildDemoData(); state.updatedAt = new Date(); return; }
  const { ref, query, orderByKey, startAt, get } = state.fb;
  const today = dayKey(new Date());
  // 前期間との比較のため、表示範囲の 2 倍さかのぼって取得する
  const from = shiftDays(today, -(state.rangeDays * 2 - 1));
  const dailySnap = await get(query(ref(state.db, `${state.source}/daily`), orderByKey(), startAt(from)));
  const totalSnap = await get(ref(state.db, `${state.source}/totals`));
  state.daily  = dailySnap.val() || {};
  state.totals = totalSnap.val() || {};
  state.updatedAt = new Date();
}

/** 期間内の日付キー一覧（新しい順ではなく古い順） */
const rangeDaysList = () => {
  const today = dayKey(new Date());
  return listDays(shiftDays(today, -(state.rangeDays - 1)), today);
};
const prevRangeDaysList = () => {
  const today = dayKey(new Date());
  const end = shiftDays(today, -state.rangeDays);
  return listDays(shiftDays(end, -(state.rangeDays - 1)), end);
};

/** 指定日リストのあるグループ（events / tabs / hours …）を合算する */
function sumGroup(days, group) {
  const out = {};
  for (const d of days) {
    const g = state.daily[d]?.[group];
    if (!g) continue;
    for (const [k, v] of Object.entries(g)) out[k] = (out[k] || 0) + (Number(v) || 0);
  }
  return out;
}
const sumSummary = (days, field) =>
  days.reduce((a, d) => a + (Number(state.daily[d]?.summary?.[field]) || 0), 0);

// ─────────────────────────────────────────────────────────────
// KPI タイル
// ─────────────────────────────────────────────────────────────
function renderKPIs() {
  const days = rangeDaysList(), prev = prevRangeDaysList();
  const metrics = [
    { key: "activeUsers", label: "アクティブ端末（延べ）", note: "1端末1日1カウント" },
    { key: "sessions",    label: "セッション数",           note: "30分以上あけて開いた回数" },
    { key: "newUsers",    label: "新規インストール",       note: "初回起動した端末数" },
    { key: "events",      label: "総操作回数",             note: "計測している操作の合計" },
  ];
  const host = $("#kpis"); host.innerHTML = "";
  for (const m of metrics) {
    const now = sumSummary(days, m.key), before = sumSummary(prev, m.key);
    const diff = before > 0 ? ((now - before) / before) * 100 : null;
    const dir = diff === null ? "flat" : diff > 0.5 ? "up" : diff < -0.5 ? "down" : "flat";
    const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "→";
    host.append(el("div", { class: "card kpi-tile" },
      el("div", { class: "label", title: m.note }, m.label),
      el("div", { class: "value num" }, fmt(now)),
      el("div", { class: `delta ${dir}` },
        diff === null ? el("span", { class: "jp" }, "前期間のデータなし")
                      : `${arrow} ${Math.abs(diff).toFixed(1)}% `,
        diff === null ? null : el("span", { class: "jp" }, "前の同期間比")),
    ));
  }
  // 1 端末あたりの操作回数（濃さの指標）
  const au = sumSummary(days, "activeUsers"), ev = sumSummary(days, "events");
  host.append(el("div", { class: "card kpi-tile" },
    el("div", { class: "label", title: "総操作回数 ÷ アクティブ端末（延べ）" }, "1端末あたりの操作"),
    el("div", { class: "value num" }, au > 0 ? (ev / au).toFixed(1) : "—",
      el("small", {}, "回/日")),
    el("div", { class: "delta flat" }, el("span", { class: "jp" }, "使い込み度の目安")),
  ));
}

// ─────────────────────────────────────────────────────────────
// 折れ線：日別のアクティブ端末とセッション
// ─────────────────────────────────────────────────────────────
function renderTrend() {
  const host = $("#trend"); host.innerHTML = "";
  const days = rangeDaysList();
  const series = [
    { key: "activeUsers", label: "アクティブ端末", color: tabColor("home") },
    { key: "sessions",    label: "セッション",     color: tabColor("schedule") },
  ];
  const data = series.map(s => ({ ...s, values: days.map(d => Number(state.daily[d]?.summary?.[s.key]) || 0) }));
  const max = Math.max(1, ...data.flatMap(s => s.values));
  if (max === 1 && data.every(s => s.values.every(v => v === 0))) {
    host.append(el("div", { class: "empty" }, "この期間のデータはまだありません"));
    return;
  }

  host.append(el("div", { class: "legend" }, data.map(s =>
    el("span", { class: "item" },
      el("span", { class: "swatch", style: `background:${s.color}` }), s.label))));

  const avail = Math.max(560, host.clientWidth || 900);
  const W = Math.max(avail, days.length * 16), H = 240;
  const pad = { t: 16, r: 54, b: 26, l: 44 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = i => pad.l + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const niceMax = niceCeil(max);
  const y = v => pad.t + ih - (v / niceMax) * ih;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
                             style: `max-width:100%;${W > avail ? "" : "width:100%;"}`,
                             "aria-label": "日別のアクティブ端末とセッション数の推移" });

  // グリッドと y 軸
  for (let i = 0; i <= 4; i++) {
    const v = (niceMax / 4) * i;
    svg.append(svgEl("line", { class: "tick-line", x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) }));
    const t = svgEl("text", { class: "axis-label", x: pad.l - 8, y: y(v) + 4, "text-anchor": "end" });
    t.textContent = fmt(v); svg.append(t);
  }
  // x 軸ラベル（詰まりすぎないよう間引く）
  const step = Math.ceil(days.length / 10);
  days.forEach((d, i) => {
    if (i % step && i !== days.length - 1) return;
    const t = svgEl("text", { class: "axis-label", x: x(i), y: H - 8, "text-anchor": "middle" });
    t.textContent = shortDay(d); svg.append(t);
  });
  svg.append(svgEl("line", { class: "baseline", x1: pad.l, x2: W - pad.r, y1: y(0), y2: y(0) }));

  for (const s of data) {
    const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    svg.append(svgEl("path", { d, fill: "none", stroke: s.color, "stroke-width": 2,
                               "stroke-linejoin": "round", "stroke-linecap": "round" }));
    // 直接ラベル（凡例に頼らず色の意味が分かるように末尾に置く）
    const last = s.values.length - 1;
    const lbl = svgEl("text", { x: x(last) + 8, y: y(s.values[last]) + 4, class: "axis-label", fill: s.color });
    lbl.textContent = fmt(s.values[last]); svg.append(lbl);
  }

  // クロスヘア + ホバー
  const cross = svgEl("line", { class: "baseline", y1: pad.t, y2: pad.t + ih, opacity: 0 });
  svg.append(cross);
  const dots = data.map(s => {
    const c = svgEl("circle", { r: 4.5, fill: s.color, stroke: cssVar("--surface"), "stroke-width": 2, opacity: 0 });
    svg.append(c); return c;
  });
  const hit = svgEl("rect", { x: pad.l, y: pad.t, width: iw, height: ih, fill: "transparent" });
  svg.append(hit);
  hit.addEventListener("pointermove", ev => {
    const box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(days.length - 1,
      Math.round(((px - pad.l) / iw) * (days.length - 1))));
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("opacity", 1);
    data.forEach((s, k) => {
      dots[k].setAttribute("cx", x(i)); dots[k].setAttribute("cy", y(s.values[i])); dots[k].setAttribute("opacity", 1);
    });
    showTip(ev, days[i], data.map(s => [s.label, fmt(s.values[i])]));
  });
  hit.addEventListener("pointerleave", () => {
    cross.setAttribute("opacity", 0); dots.forEach(d => d.setAttribute("opacity", 0)); hideTip();
  });

  host.append(el("div", { class: "chart" }, svg));
}
function niceCeil(v) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  return Math.ceil(v / (p / 2)) * (p / 2);
}

// ─────────────────────────────────────────────────────────────
// タブ別の使われ方
// ─────────────────────────────────────────────────────────────
function renderTabs() {
  const host = $("#tabs-chart"); host.innerHTML = "";
  const days = rangeDaysList();
  const counts = sumGroup(days, "tabs");
  const rows = TABS.map(t => ({ ...t, n: counts[t.id] || 0 })).sort((a, b) => b.n - a.n);
  const total = rows.reduce((a, r) => a + r.n, 0);
  if (!total) { host.append(el("div", { class: "empty" }, "この期間のタブ表示データはまだありません")); return; }

  // 100% 帯（構成比を一目で）— 各セグメントの間に 2px の面色ギャップを入れる
  const bar = el("div", { style: "display:flex;gap:2px;height:22px;margin-bottom:16px" });
  for (const r of rows) {
    if (!r.n) continue;
    const seg = el("div", {
      style: `flex:${r.n};background:${tabColor(r.id)};border-radius:4px;min-width:3px;cursor:default`,
      title: `${r.label} ${fmt(r.n)}回（${pct(r.n, total)}）`,
    });
    seg.addEventListener("pointerenter", ev => showTip(ev, r.label, [["表示回数", fmt(r.n)], ["構成比", pct(r.n, total)]]));
    seg.addEventListener("pointermove", moveTip);
    seg.addEventListener("pointerleave", hideTip);
    bar.append(seg);
  }
  host.append(bar);

  const max = Math.max(...rows.map(r => r.n));
  const rank = el("div", { class: "rank" });
  for (const r of rows) {
    rank.append(el("div", { class: "rank-row" },
      el("div", { class: "name" },
        el("span", { class: "dot", style: `background:${tabColor(r.id)}` }),
        el("span", { class: "txt" }, r.label)),
      el("div", { class: "track" },
        el("div", { class: "fill", style: `width:${(r.n / max) * 100}%;background:${tabColor(r.id)}` })),
      el("div", { class: "val num" }, fmt(r.n), el("span", { class: "share" }, pct(r.n, total))),
    ));
  }
  host.append(rank);
}

// ─────────────────────────────────────────────────────────────
// 機能別ランキング（タブごとにグループ化）
// ─────────────────────────────────────────────────────────────
function renderFeatures() {
  const host = $("#features"); host.innerHTML = "";
  const days = rangeDaysList();
  const counts = state.scope === "total"
    ? (state.totals.events || {})
    : sumGroup(days, "events");

  const items = Object.entries(counts)
    .map(([key, n]) => ({ ...lookupEvent(key), n: Number(n) || 0 }))
    .filter(x => x.n > 0);
  if (!items.length) { host.append(el("div", { class: "empty" }, "この期間の操作データはまだありません")); return; }

  const q = ($("#feature-search")?.value || "").trim().toLowerCase();
  const filtered = q
    ? items.filter(x => x.label.toLowerCase().includes(q) || x.key.toLowerCase().includes(q))
    : items;
  if (!filtered.length) { host.append(el("div", { class: "empty" }, "一致する機能がありません")); return; }

  const max = Math.max(...filtered.map(x => x.n));
  const groups = [...TABS, APP_GROUP]
    .map(g => ({ g, list: filtered.filter(x => x.tab === g.id).sort((a, b) => b.n - a.n) }))
    .filter(x => x.list.length)
    .sort((a, b) => b.list.reduce((s, x) => s + x.n, 0) - a.list.reduce((s, x) => s + x.n, 0));

  for (const { g, list } of groups) {
    const subtotal = list.reduce((s, x) => s + x.n, 0);
    host.append(el("div", { class: "rank-group" },
      el("span", { class: "bar", style: `background:${tabColor(g.id)}` }),
      `${g.label}`,
      el("span", { style: "font-weight:400;letter-spacing:0" }, `　計 ${fmt(subtotal)} 回`)));
    const shown = state.showAllEvents ? list : list.slice(0, 6);
    const rank = el("div", { class: "rank" });
    for (const x of shown) {
      const row = el("div", { class: "rank-row" },
        el("div", { class: "name", title: x.note || x.key },
          el("span", { class: "dot", style: `background:${tabColor(g.id)}` }),
          el("span", { class: "txt" }, x.label)),
        el("div", { class: "track" },
          el("div", { class: "fill", style: `width:${(x.n / max) * 100}%;background:${tabColor(g.id)}` })),
        el("div", { class: "val num" }, fmt(x.n)));
      row.addEventListener("pointerenter", ev =>
        showTip(ev, x.label, [["回数", fmt(x.n)], ["キー", x.key], ["タブ内比", pct(x.n, subtotal)]]));
      row.addEventListener("pointermove", moveTip);
      row.addEventListener("pointerleave", hideTip);
      rank.append(row);
    }
    if (!state.showAllEvents && list.length > 6) {
      rank.append(el("div", { class: "hint", style: "font-size:12px;color:var(--ink-muted);padding-left:2px" },
        `ほか ${list.length - 6} 件`));
    }
    host.append(rank);
  }
}

// ─────────────────────────────────────────────────────────────
// 時間帯別
// ─────────────────────────────────────────────────────────────
function renderHours() {
  const host = $("#hours"); host.innerHTML = "";
  const counts = sumGroup(rangeDaysList(), "hours");
  const vals = Array.from({ length: 24 }, (_, h) => counts[String(h).padStart(2, "0")] || 0);
  const max = Math.max(...vals);
  if (!max) { host.append(el("div", { class: "empty" }, "この期間のデータはまだありません")); return; }

  const seq = [1, 2, 3, 4, 5, 6, 7].map(i => cssVar(`--seq-${i}`));
  const W = Math.max(560, host.clientWidth || 720), H = 170, pad = { t: 10, r: 8, b: 26, l: 36 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const bw = iw / 24;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
                             style: "width:100%;max-width:100%", "aria-label": "時間帯別の操作回数" });
  const niceMax = niceCeil(max);
  for (let i = 0; i <= 2; i++) {
    const v = (niceMax / 2) * i, yy = pad.t + ih - (v / niceMax) * ih;
    svg.append(svgEl("line", { class: "tick-line", x1: pad.l, x2: W - pad.r, y1: yy, y2: yy }));
    const t = svgEl("text", { class: "axis-label", x: pad.l - 8, y: yy + 4, "text-anchor": "end" });
    t.textContent = fmt(v); svg.append(t);
  }
  vals.forEach((v, h) => {
    const hgt = (v / niceMax) * ih;
    const step = v === 0 ? 0 : Math.min(6, Math.max(0, Math.ceil((v / max) * 7) - 1));
    const r = svgEl("rect", {
      x: pad.l + bw * h + 1.5, y: pad.t + ih - hgt, width: Math.max(1, bw - 3),
      height: Math.max(v > 0 ? 2 : 0, hgt), rx: 4, fill: v === 0 ? cssVar("--grid") : seq[step],
    });
    r.addEventListener("pointerenter", ev => showTip(ev, `${h}時台`, [["操作回数", fmt(v)], ["全体比", pct(v, vals.reduce((a, b) => a + b, 0))]]));
    r.addEventListener("pointermove", moveTip);
    r.addEventListener("pointerleave", hideTip);
    svg.append(r);
    if (h % 3 === 0) {
      const t = svgEl("text", { class: "axis-label", x: pad.l + bw * h + bw / 2, y: H - 8, "text-anchor": "middle" });
      t.textContent = h; svg.append(t);
    }
  });
  svg.append(svgEl("line", { class: "baseline", x1: pad.l, x2: W - pad.r, y1: pad.t + ih, y2: pad.t + ih }));
  host.append(el("div", { class: "chart" }, svg));

  const peak = vals.indexOf(max);
  host.append(el("div", { style: "font-size:12px;color:var(--ink-muted);margin-top:8px" },
    `ピークは ${peak}時台（${fmt(max)}回）／横軸は時刻（JST）`));
}

// ─────────────────────────────────────────────────────────────
// 内訳（バージョン・OS・端末・言語・テーマ・継続日数）
// ─────────────────────────────────────────────────────────────
function renderBreakdowns() {
  const host = $("#breakdowns"); host.innerHTML = "";
  const days = rangeDaysList();
  for (const b of BREAKDOWNS) {
    const counts = sumGroup(days, b.key);
    let rows = Object.entries(counts).map(([k, v]) => ({ k, v: Number(v) || 0 })).filter(r => r.v > 0);
    if (b.order) rows.sort((a, x) => b.order.indexOf(a.k) - b.order.indexOf(x.k));
    else rows.sort((a, x) => x.v - a.v);
    const total = rows.reduce((a, r) => a + r.v, 0);
    const card = el("div", { class: "card" },
      el("h3", { style: "font-size:13px;margin-bottom:12px" }, b.label));
    if (!rows.length) card.append(el("div", { class: "empty" }, "データなし"));
    else {
      const max = Math.max(...rows.map(r => r.v));
      const rank = el("div", { class: "rank" });
      for (const r of rows.slice(0, 6)) {
        rank.append(el("div", { class: "rank-row", style: "grid-template-columns:minmax(88px,120px) 1fr auto" },
          el("div", { class: "name" }, el("span", { class: "txt" }, b.format(r.k))),
          el("div", { class: "track" },
            el("div", { class: "fill", style: `width:${(r.v / max) * 100}%;background:${tabColor("home")}` })),
          el("div", { class: "val num" }, fmt(r.v), el("span", { class: "share" }, pct(r.v, total)))));
      }
      card.append(rank);
    }
    host.append(card);
  }
}

// ─────────────────────────────────────────────────────────────
// 表（色に頼らない読み方 & CSV 出力）
// ─────────────────────────────────────────────────────────────
function renderTable() {
  const host = $("#table"); host.innerHTML = "";
  const days = rangeDaysList();
  const inRange = sumGroup(days, "events");
  const totals = state.totals.events || {};
  const keys = [...new Set([...Object.keys(inRange), ...Object.keys(totals)])];
  if (!keys.length) { host.append(el("div", { class: "empty" }, "データはまだありません")); return; }

  const rows = keys.map(k => {
    const e = lookupEvent(k);
    return { ...e, group: tabOf(e.tab).label, range: Number(inRange[k]) || 0, total: Number(totals[k]) || 0 };
  }).sort((a, b) => b.range - a.range || b.total - a.total);

  const table = el("table", {},
    el("thead", {}, el("tr", {},
      el("th", {}, "区分"), el("th", {}, "機能"),
      el("th", { class: "n" }, `期間内（${state.rangeDays}日）`),
      el("th", { class: "n" }, "累計"), el("th", {}, "イベントキー"))),
    el("tbody", {}, rows.map(r => el("tr", {},
      el("td", {}, r.group), el("td", {}, r.label),
      el("td", { class: "n" }, fmt(r.range)), el("td", { class: "n" }, fmt(r.total)),
      el("td", { style: "color:var(--ink-muted);font-family:var(--font-en);font-size:12px" }, r.key)))));
  host.append(el("div", { class: "table-wrap" }, table));
  state.csvRows = rows;
}

function exportCSV() {
  const days = rangeDaysList();
  const lines = [["区分", "機能", `期間内(${state.rangeDays}日)`, "累計", "イベントキー"]];
  for (const r of state.csvRows || []) lines.push([r.group, r.label, r.range, r.total, r.key]);
  lines.push([]);
  lines.push(["日付", "アクティブ端末", "セッション", "新規", "操作回数"]);
  for (const d of days) {
    const s = state.daily[d]?.summary || {};
    lines.push([d, s.activeUsers || 0, s.sessions || 0, s.newUsers || 0, s.events || 0]);
  }
  const csv = "﻿" + lines.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = el("a", { href: url, download: `zonavi-analytics_${dayKey(new Date())}.csv` });
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
// 描画
// ─────────────────────────────────────────────────────────────
function render() {
  renderKPIs(); renderTrend(); renderTabs(); renderFeatures(); renderHours();
  renderBreakdowns(); renderTable();
  const t = state.updatedAt;
  $("#updated").textContent = t
    ? `最終更新 ${t.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
    : "";
  $("#range-note").textContent =
    `${rangeDaysList()[0]} 〜 ${rangeDaysList().at(-1)}（JST）`;
}

async function refresh() {
  $("#refresh").disabled = true;
  try {
    await loadData();
    $("#load-error").hidden = true;
    render();
  } catch (e) {
    console.error(e);
    showLoadError(e);
  } finally {
    $("#refresh").disabled = false;
  }
}

/** 読み込みに失敗した理由と、その場でできる直し方を出す */
function showLoadError(e) {
  const denied = /permission|PERMISSION_DENIED/i.test(e?.message ?? String(e));
  const box = $("#load-error");
  box.hidden = false;
  box.replaceChildren(
    el("strong", {}, denied ? "このアカウントには閲覧権限がありません" : "データを読み込めませんでした"),
    el("p", { style: "margin:8px 0 0" }, denied
      ? "Realtime Database のルールで許可されたアカウントだけが閲覧できます。次のどちらかで解決できます。"
      : (e?.message ?? String(e))),
    denied ? el("ol", { style: "margin:8px 0 0;padding-left:20px" },
      el("li", {}, "いま許可されているメールアドレスでログインし直す"),
      el("li", {}, "または Firebase コンソール → Realtime Database で ",
        el("code", {}, `analyticsViewers/${state.uid} = true`),
        " を追加する（下の UID をコピーして使えます）")) : null,
    denied ? el("div", { style: "margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap" },
      el("code", { style: "user-select:all" }, state.uid ?? "—"),
      el("button", { class: "btn", onclick: () => navigator.clipboard?.writeText(state.uid ?? "") }, "UID をコピー")) : null,
  );
}

// ─────────────────────────────────────────────────────────────
// 起動
// ─────────────────────────────────────────────────────────────
function wireControls() {
  $$("#range-seg button").forEach(b => b.addEventListener("click", () => {
    state.rangeDays = Number(b.dataset.days);
    $$("#range-seg button").forEach(x => x.setAttribute("aria-pressed", x === b));
    render();
  }));
  $$("#scope-seg button").forEach(b => b.addEventListener("click", () => {
    state.scope = b.dataset.scope;
    $$("#scope-seg button").forEach(x => x.setAttribute("aria-pressed", x === b));
    renderFeatures();
  }));
  $$("#source-seg button").forEach(b => b.addEventListener("click", () => {
    state.source = b.dataset.source;
    localStorage.setItem("zonavi.dash.source", state.source);
    $$("#source-seg button").forEach(x => x.setAttribute("aria-pressed", x === b));
    refresh();
  }));
  $("#refresh").addEventListener("click", refresh);
  $("#theme-toggle").addEventListener("click", toggleTheme);
  $("#export").addEventListener("click", exportCSV);
  $("#feature-search").addEventListener("input", renderFeatures);
  $("#toggle-all").addEventListener("click", ev => {
    state.showAllEvents = !state.showAllEvents;
    ev.currentTarget.textContent = state.showAllEvents ? "上位のみ表示" : "すべて表示";
    renderFeatures();
  });
  $$("#source-seg button").forEach(x => x.setAttribute("aria-pressed", x.dataset.source === state.source));
}

function showGate(content) {
  $("#app").hidden = true;
  const gate = $("#gate");
  gate.hidden = false;
  $("#gate-body").replaceChildren(...content);
}

async function main() {
  initTheme();
  state.demo = new URLSearchParams(location.search).has("demo");

  // デモモード：Firebase に接続せず、生成したサンプルデータで画面を確認する
  if (state.demo) {
    $("#gate").hidden = true;
    $("#app").hidden = false;
    $("#who").textContent = "デモ表示（サンプルデータ）";
    $("#signout").hidden = true;
    $("#source-seg").hidden = true;
    wireControls();
    await refresh();
    return;
  }

  if (!isConfigured()) {
    showGate([
      el("p", {}, "ダッシュボードを使う前に、Firebase のウェブ設定を 1 回だけ入力してください。"),
      el("div", { class: "steps" },
        el("ol", { style: "margin:0;padding-left:20px" },
          el("li", {}, "Firebase コンソール → プロジェクトの設定 → マイアプリ → ", el("code", {}, "</>"), " ウェブアプリを追加"),
          el("li", {}, "表示された ", el("code", {}, "apiKey"), " と ", el("code", {}, "appId"), " をコピー"),
          el("li", {}, el("code", {}, "web/dashboard/firebase-config.js"), " の該当箇所に貼り付けて保存"),
          el("li", {}, "このページを再読み込み"))),
      el("p", { style: "margin-top:16px" },
        "設定前に見た目を確認したいときは ",
        el("a", { href: "?demo=1" }, "デモ表示"), " をどうぞ。"),
    ]);
    return;
  }

  const SDK = "https://www.gstatic.com/firebasejs/10.14.1";
  const [appMod, authMod, dbMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-database.js`),
  ]);
  state.fb = dbMod;

  const app  = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  state.db   = dbMod.getDatabase(app);

  authMod.onAuthStateChanged(auth, async user => {
    if (!user) {
      showGate([
        el("p", {}, "利用状況を見るには、管理者アカウントでログインしてください。"),
        el("button", { class: "btn primary", style: "margin-top:18px",
          onclick: async () => {
            try { await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider()); }
            catch (e) { $("#gate-error").textContent = e?.message ?? String(e); }
          } }, "Google でログイン"),
        el("div", { id: "gate-error", class: "err" }),
      ]);
      return;
    }
    $("#gate").hidden = true;
    $("#app").hidden = false;
    $("#who").textContent = user.email ?? "";
    state.uid = user.uid;
    $("#signout").onclick = () => authMod.signOut(auth);
    wireControls();
    await refresh();
  });
}

// ─────────────────────────────────────────────────────────────
// デモ用サンプルデータ（?demo=1 のときだけ使う）
// ─────────────────────────────────────────────────────────────
function buildDemoData() {
  let seed = 20260905;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const weightsTab = { home: 1.0, schedule: 0.62, links: 0.28, settings: 0.16 };
  const weightsEvent = Object.fromEntries(EVENTS.map((e, i) => [e.key, 0.08 + 0.92 / (1 + i * 0.22)]));
  const hourShape = [.2,.1,.05,.05,.05,.1,.5,1.6,2.4,1.2,.9,1.1,2.0,1.3,.9,.9,1.2,1.7,1.4,1.0,.9,.8,.6,.4];

  const today = dayKey(new Date());
  const daily = {}, totalEvents = {}, totalTabs = {};
  let totalSessions = 0, totalEventCount = 0, installs = 0;

  for (let i = 199; i >= 0; i--) {
    const d = shiftDays(today, -i);
    const dow = new Date(`${d}T00:00:00+09:00`).getDay();
    const weekend = dow === 0 || dow === 6 ? 0.35 : 1;
    const growth = 0.45 + (200 - i) / 200 * 0.85;                 // ゆるやかな成長
    const users = Math.round((70 + rnd() * 30) * weekend * growth);
    const sessions = Math.round(users * (1.6 + rnd() * 0.7));
    const newUsers = Math.max(0, Math.round((3 + rnd() * 5) * growth * weekend));
    installs += newUsers;
    totalSessions += sessions;

    const tabs = {}, events = {}, hours = {};
    let evTotal = 0;
    for (const [t, w] of Object.entries(weightsTab)) {
      const n = Math.round(sessions * w * (0.8 + rnd() * 0.4));
      tabs[t] = n; totalTabs[t] = (totalTabs[t] || 0) + n;
    }
    for (const e of EVENTS) {
      const base = sessions * weightsEvent[e.key] * 0.20;
      const n = Math.max(0, Math.round(base * (0.6 + rnd() * 0.8)));
      if (!n) continue;
      events[e.key] = n; evTotal += n;
      totalEvents[e.key] = (totalEvents[e.key] || 0) + n;
    }
    const shapeSum = hourShape.reduce((a, b) => a + b, 0);
    hourShape.forEach((w, h) => {
      const n = Math.round((evTotal * w) / shapeSum);
      if (n) hours[String(h).padStart(2, "0")] = n;
    });
    totalEventCount += evTotal;

    daily[d] = {
      summary: { activeUsers: users, sessions, newUsers, events: evTotal },
      tabs, events, hours,
      screens: { home: tabs.home, schedule: tabs.schedule, links: tabs.links, settings: tabs.settings },
      versions: { "1_3_0": Math.round(users * 0.72), "1_2_1": Math.round(users * 0.21), "1_1_0": Math.round(users * 0.07) },
      os: { "18": Math.round(users * 0.66), "17": Math.round(users * 0.28), "16": Math.round(users * 0.06) },
      device: { iPhone: Math.round(users * 0.94), iPad: Math.round(users * 0.06) },
      lang: { ja: Math.round(users * 0.93), en: Math.round(users * 0.07) },
      theme: { light: Math.round(users * 0.71), dark: Math.round(users * 0.29) },
      tenure: { d0: newUsers, d1_6: Math.round(users * 0.18),
                d7_29: Math.round(users * 0.34), d30plus: Math.round(users * 0.44) },
    };
  }
  state.daily = daily;
  state.totals = { events: totalEvents, tabs: totalTabs,
                   summary: { sessions: totalSessions, events: totalEventCount, installs } };
}

let resizeTimer;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (!$("#app").hidden) { renderTrend(); renderHours(); } }, 180);
});

main();
