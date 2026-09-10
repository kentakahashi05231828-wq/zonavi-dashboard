import { firebaseConfig, isConfigured } from "./firebase-config.js";
import {
  TABS, APP_GROUP, EVENTS, BREAKDOWNS, DOW_LABELS, lookupEvent, tabOf,
  FEATURES, lookupFeature, WIDGETS, lookupWidget,
  WIDGET_FAMILY_LABELS, WIDGET_FAMILY_ORDER, WIDGET_COUNT_LABELS,
} from "./catalog.js";

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

/**
 * ISO 8601 の週キー（月曜はじまり）。例: "2026-09-10" → "2026-W37"
 * アプリ側 AnalyticsService.weekKey と同じ規則。ここがずれると実人数が合わなくなる。
 */
function isoWeekKey(dayStr) {
  const [y, m, d] = dayStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7;          // 月=0 … 日=6
  dt.setUTCDate(dt.getUTCDate() - dow + 3);      // その週の木曜に寄せる
  const isoYear = dt.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4dow = (jan4.getUTCDay() + 6) % 7;
  const week = 1 + Math.round((dt - jan4) / 86400000 / 7 + (jan4dow - 3) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
const monthKeyOf = dayStr => dayStr.slice(0, 7);

/** 週キーの月曜日（ラベル用） */
function weekStartDay(weekKey) {
  const [y, w] = weekKey.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4dow = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4.getTime() + ((w - 1) * 7 - jan4dow) * 86400000);
  return monday.toISOString().slice(0, 10);
}
/** 直近 n 週・n ヶ月のキー（古い順） */
function lastWeekKeys(n) {
  const out = []; let d = dayKey(new Date());
  for (let i = 0; i < n; i++) { out.unshift(isoWeekKey(d)); d = shiftDays(d, -7); }
  return out;
}
function lastMonthKeys(n) {
  const [y, m] = dayKey(new Date()).split("-").map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return out;
}

// ─────────────────────────────────────────────────────────────
// 状態
// ─────────────────────────────────────────────────────────────
const state = {
  rangeDays: 30,
  source: localStorage.getItem("zonavi.dash.source") || "analytics",  // analytics | analyticsDebug
  scope: "range",           // range | total  （機能ランキングの集計範囲）
  reportWindow: localStorage.getItem("zonavi.dash.reportWindow") || "week",  // week | month
  report: null,
  showAllEvents: false,
  daily: {},                // { "2026-09-05": {...} }
  weekly: {},               // { "2026-W37": { activeUsers, newUsers } } 実人数
  monthly: {},              // { "2026-09":   { activeUsers, newUsers } } 実人数
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
  // 前期間との比較（表示範囲の 2 倍）と、レポートの月次比較（28日×2）の両方に足りる分をとる
  const from = shiftDays(today, -(Math.max(state.rangeDays * 2, 56) - 1));
  // 週次・月次は 1 期間 1 レコードなので、まるごと読んでも軽い
  const [dailySnap, totalSnap, weekSnap, monthSnap] = await Promise.all([
    get(query(ref(state.db, `${state.source}/daily`), orderByKey(), startAt(from))),
    get(ref(state.db, `${state.source}/totals`)),
    get(ref(state.db, `${state.source}/weekly`)),
    get(ref(state.db, `${state.source}/monthly`)),
  ]);
  state.daily   = dailySnap.val() || {};
  state.totals  = totalSnap.val() || {};
  state.weekly  = weekSnap.val() || {};
  state.monthly = monthSnap.val() || {};
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
// ユーザー数（実人数）
//
// 日別の activeUsers は「延べ」で、同じ端末が週に5日開けば 5 になる。
// 実人数を出すにはアプリ側で「その週・その月で最初に開いたときだけ 1」を
// 数える必要があり、その結果が weekly / monthly ノードに入っている。
// ─────────────────────────────────────────────────────────────
const WEEKS_SHOWN = 12, MONTHS_SHOWN = 6;

/** 期間の棒グラフ。進行中の期間は薄く塗って「まだ増える」ことを示す */
function renderPeriodBars(host, rows, ariaLabel) {
  const max = Math.max(1, ...rows.map(r => r.value));
  const avail = Math.max(520, host.clientWidth || 760);
  const W = Math.max(avail, rows.length * 54), H = 200;
  const pad = { t: 14, r: 10, b: 40, l: 46 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const bw = iw / rows.length;
  const niceMax = niceCeil(max);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
                             style: `max-width:100%;${W > avail ? "" : "width:100%;"}`,
                             "aria-label": ariaLabel });
  for (let i = 0; i <= 2; i++) {
    const v = (niceMax / 2) * i, yy = pad.t + ih - (v / niceMax) * ih;
    svg.append(svgEl("line", { class: "tick-line", x1: pad.l, x2: W - pad.r, y1: yy, y2: yy }));
    const t = svgEl("text", { class: "axis-label", x: pad.l - 8, y: yy + 4, "text-anchor": "end" });
    t.textContent = fmt(v); svg.append(t);
  }
  rows.forEach((r, i) => {
    const h = (r.value / niceMax) * ih;
    const x = pad.l + bw * i + bw * 0.16;
    const rect = svgEl("rect", {
      x, y: pad.t + ih - h, width: bw * 0.68, height: Math.max(r.value > 0 ? 2 : 0, h), rx: 4,
      fill: tabColor("home"), opacity: r.inProgress ? 0.42 : 1,
    });
    rect.addEventListener("pointerenter", ev => showTip(ev, r.tipTitle ?? r.label, [
      ["実人数", fmt(r.value)],
      ["うち新規", fmt(r.newUsers)],
      ...(r.inProgress ? [["状態", "集計中（まだ増えます）"]] : []),
    ]));
    rect.addEventListener("pointermove", moveTip);
    rect.addEventListener("pointerleave", hideTip);
    svg.append(rect);

    const lbl = svgEl("text", { class: "axis-label", x: pad.l + bw * i + bw / 2, y: H - 22, "text-anchor": "middle" });
    lbl.textContent = r.label; svg.append(lbl);
    if (r.value > 0) {
      const v = svgEl("text", { class: "axis-label", x: pad.l + bw * i + bw / 2,
                                y: pad.t + ih - h - 6, "text-anchor": "middle", fill: cssVar("--ink-2") });
      v.textContent = fmt(r.value); svg.append(v);
    }
    if (r.inProgress) {
      const t = svgEl("text", { class: "axis-label", x: pad.l + bw * i + bw / 2, y: H - 8, "text-anchor": "middle" });
      t.textContent = "集計中"; svg.append(t);
    }
  });
  svg.append(svgEl("line", { class: "baseline", x1: pad.l, x2: W - pad.r, y1: pad.t + ih, y2: pad.t + ih }));
  host.append(el("div", { class: "chart" }, svg));
}

function renderUsers() {
  const host = $("#users"); host.innerHTML = "";
  const today = dayKey(new Date());
  const curWeek = isoWeekKey(today), curMonth = monthKeyOf(today);
  const installs = Number(state.totals?.summary?.installs) || 0;

  const weekRows = lastWeekKeys(WEEKS_SHOWN).map(k => {
    const start = weekStartDay(k);
    return {
      key: k, label: `${Number(start.slice(5, 7))}/${Number(start.slice(8, 10))}`,
      tipTitle: `${k}（${start} の週）`,
      value: Number(state.weekly[k]?.activeUsers) || 0,
      newUsers: Number(state.weekly[k]?.newUsers) || 0,
      inProgress: k === curWeek,
    };
  });
  const monthRows = lastMonthKeys(MONTHS_SHOWN).map(k => ({
    key: k, label: `${Number(k.slice(5, 7))}月`, tipTitle: k,
    value: Number(state.monthly[k]?.activeUsers) || 0,
    newUsers: Number(state.monthly[k]?.newUsers) || 0,
    inProgress: k === curMonth,
  }));

  // 完了した期間だけを比較に使う（進行中の週・月と比べると必ず減って見える）
  const doneWeeks  = weekRows.filter(r => !r.inProgress);
  const doneMonths = monthRows.filter(r => !r.inProgress);
  const lastWeek = doneWeeks.at(-1), prevWeek = doneWeeks.at(-2);
  const lastMonth = doneMonths.at(-1), prevMonth = doneMonths.at(-2);

  // 粘着度：完了した直近の週の「1日あたり平均利用者 ÷ その週の実人数」
  let stickiness = null;
  if (lastWeek && lastWeek.value > 0) {
    const start = weekStartDay(lastWeek.key);
    const days = listDays(start, shiftDays(start, 6));
    const dauSum = days.reduce((a, d) => a + (Number(state.daily[d]?.summary?.activeUsers) || 0), 0);
    stickiness = dauSum / 7 / lastWeek.value;
  }

  const tile = (label, value, sub, note) => el("div", { class: "card kpi-tile" },
    el("div", { class: "label", title: note ?? "" }, label),
    el("div", { class: "value num" }, value),
    el("div", { class: "delta flat" }, el("span", { class: "jp" }, sub)));
  const deltaLine = (now, before) => {
    if (!before || !before.value) return "前の期間と比較できません";
    const r = ((now.value - before.value) / before.value) * 100;
    return `前の期間比 ${r > 0 ? "+" : ""}${r.toFixed(1)}%`;
  };

  host.append(el("div", { class: "grid kpi" },
    tile("累計ダウンロード", fmt(installs), "初回起動した端末の累計",
         "App Store の実ダウンロード数ではなく、アプリを一度でも開いた端末の数です"),
    tile("週間ユーザー（WAU）", lastWeek ? fmt(lastWeek.value) : "—",
         lastWeek ? `${weekStartDay(lastWeek.key)} の週 ／ ${deltaLine(lastWeek, prevWeek)}` : "データなし",
         "その週に一度でもアプリを開いた実人数。週に5回開いても1人"),
    tile("月間ユーザー（MAU）", lastMonth ? fmt(lastMonth.value) : "—",
         lastMonth ? `${lastMonth.key} ／ ${deltaLine(lastMonth, prevMonth)}` : "データなし",
         "その月に一度でもアプリを開いた実人数"),
    tile("粘着度（DAU/WAU）", stickiness === null ? "—" : `${(stickiness * 100).toFixed(0)}%`,
         stickiness === null ? "データなし" : `週 ${(stickiness * 7).toFixed(1)} 日ペースで使われている`,
         "1日あたりの平均利用者 ÷ その週の実人数。高いほど毎日使われている"),
  ));

  if (!weekRows.some(r => r.value > 0) && !monthRows.some(r => r.value > 0)) {
    host.append(el("div", { class: "card", style: "margin-top:14px" },
      el("div", { class: "empty" }, "実人数はアプリのアップデート後に届きます")));
    host.append(el("p", { class: "hint", style: "margin-top:10px" },
      "累計ダウンロードは既存のデータから出しています。WAU / MAU は「その週・その月で最初に開いたときだけ数える」処理がアプリ側に要るため、次回リリース以降に貯まり始めます。"));
    return;
  }

  const card = (title, hint, rows, aria) => {
    const c = el("div", { class: "card" },
      el("h3", { style: "font-size:13px;margin-bottom:4px" }, title),
      el("p", { class: "hint", style: "margin:0 0 12px" }, hint));
    const box = el("div", {});
    c.append(box);
    renderPeriodBars(box, rows, aria);
    return c;
  };
  host.append(el("div", { class: "grid", style: "margin-top:14px;gap:14px" },
    card(`週間ユーザー数（直近${WEEKS_SHOWN}週）`,
         "同じ人がその週に何回開いても1人。横軸はその週の月曜日。", weekRows, "週ごとの実利用者数"),
    card(`月間ユーザー数（直近${MONTHS_SHOWN}ヶ月）`,
         "同じ人がその月に何回開いても1人。", monthRows, "月ごとの実利用者数"),
  ));
  host.append(el("p", { class: "hint", style: "margin-top:12px" },
    "「サマリー」のアクティブ端末は延べ（1端末1日1カウント）なので、ここの実人数より大きくなります。どちらも正しく、意味が違います。"));
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
// 機能の利用率（人数ベース）
//
// 「回数」では 1 人が何度も押したのか、多くの人が 1 回ずつ押したのかが分からない。
// featureUsers は 1端末1日1カウントなので、アクティブ端末で割ると
// 「アプリを開いた人のうち何%がその機能を使ったか」として読める。
// ─────────────────────────────────────────────────────────────
function renderFeatureUsers() {
  const host = $("#feature-users"); host.innerHTML = "";
  const days = rangeDaysList();
  const counts = sumGroup(days, "featureUsers");
  const active = sumSummary(days, "activeUsers");
  const rows = FEATURES.map(f => ({ ...f, n: Number(counts[f.key]) || 0 }));
  // カタログにない機能（アプリ側だけ先に追加された場合）も拾う
  for (const k of Object.keys(counts)) {
    if (!rows.some(r => r.key === k)) rows.push({ ...lookupFeature(k), n: Number(counts[k]) || 0 });
  }
  if (!rows.some(r => r.n > 0)) {
    host.append(el("div", { class: "empty" }, "アプリのアップデート後に届きます"));
    return;
  }
  rows.sort((a, b) => b.n - a.n);
  const max = Math.max(...rows.map(r => r.n));

  const rank = el("div", { class: "rank" });
  for (const r of rows) {
    const share = active > 0 ? r.n / active : 0;
    const row = el("div", { class: "rank-row" },
      el("div", { class: "name", title: r.key },
        el("span", { class: "dot", style: `background:${tabColor(r.tab)}` }),
        el("span", { class: "txt" }, r.label)),
      el("div", { class: "track" },
        el("div", { class: "fill", style: `width:${max ? (r.n / max) * 100 : 0}%;background:${tabColor(r.tab)}` })),
      el("div", { class: "val num" }, fmt(r.n),
        el("span", { class: "share" }, active > 0 ? `${(share * 100).toFixed(1)}%` : "—")));
    row.addEventListener("pointerenter", ev => showTip(ev, r.label, [
      ["使った端末（延べ）", fmt(r.n)],
      ["アクティブ端末比", active > 0 ? `${(share * 100).toFixed(1)}%` : "—"],
    ]));
    row.addEventListener("pointermove", moveTip);
    row.addEventListener("pointerleave", hideTip);
    rank.append(row);
  }
  host.append(rank);
  host.append(el("div", { style: "font-size:12px;color:var(--ink-muted);margin-top:12px" },
    `右の％は、この期間のアクティブ端末（延べ ${fmt(active)}）に対する割合です。`));
}

// ─────────────────────────────────────────────────────────────
// ウィジェット（追加している人と、その内訳）
// ─────────────────────────────────────────────────────────────
function renderWidgets() {
  const host = $("#widgets"); host.innerHTML = "";
  const days = rangeDaysList();
  const users  = sumGroup(days, "widgetUsers");
  const kinds  = sumGroup(days, "widgets");
  const family = sumGroup(days, "widgetFamily");
  const count  = sumGroup(days, "widgetCount");

  const installed = Number(users.installed) || 0;
  const none      = Number(users.none) || 0;
  const measured  = installed + none;
  if (!measured) {
    host.append(el("div", { class: "empty" }, "アプリのアップデート後に届きます"));
    return;
  }

  // 追加率
  host.append(el("div", { class: "grid kpi", style: "margin-bottom:18px" },
    el("div", { class: "card kpi-tile" },
      el("div", { class: "label", title: "ウィジェットを1つ以上置いている端末 ÷ 計測できた端末" }, "ウィジェット追加率"),
      el("div", { class: "value num" }, pct(installed, measured)),
      el("div", { class: "delta flat" }, el("span", { class: "jp" },
        `${fmt(installed)} / ${fmt(measured)} 端末（延べ）`))),
    el("div", { class: "card kpi-tile" },
      el("div", { class: "label" }, "置いていない端末"),
      el("div", { class: "value num" }, fmt(none)),
      el("div", { class: "delta flat" }, el("span", { class: "jp" }, pct(none, measured)))),
  ));

  const listCard = (title, rows, note) => {
    const card = el("div", { class: "card" },
      el("h3", { style: "font-size:13px;margin-bottom:12px" }, title));
    if (!rows.length) { card.append(el("div", { class: "empty" }, "データなし")); return card; }
    const max = Math.max(...rows.map(r => r.n));
    const rank = el("div", { class: "rank" });
    for (const r of rows) {
      const row = el("div", { class: "rank-row", style: "grid-template-columns:minmax(120px,1fr) 1fr auto" },
        el("div", { class: "name", title: r.key ?? "" }, el("span", { class: "txt" }, r.label)),
        el("div", { class: "track" },
          el("div", { class: "fill", style: `width:${(r.n / max) * 100}%;background:${tabColor("home")}` })),
        el("div", { class: "val num" }, fmt(r.n),
          el("span", { class: "share" }, pct(r.n, installed))));
      row.addEventListener("pointerenter", ev => showTip(ev, r.label,
        [["端末（延べ）", fmt(r.n)], ["追加している人の中での割合", pct(r.n, installed)]]));
      row.addEventListener("pointermove", moveTip);
      row.addEventListener("pointerleave", hideTip);
      rank.append(row);
    }
    card.append(rank);
    if (note) card.append(el("div", { style: "font-size:12px;color:var(--ink-muted);margin-top:10px" }, note));
    return card;
  };

  const kindRows = Object.entries(kinds)
    .map(([k, v]) => ({ ...lookupWidget(k), n: Number(v) || 0 }))
    .filter(r => r.n > 0).sort((a, b) => b.n - a.n);
  const famRows = WIDGET_FAMILY_ORDER
    .map(k => ({ key: k, label: WIDGET_FAMILY_LABELS[k], n: Number(family[k]) || 0 }))
    .filter(r => r.n > 0);
  const cntRows = Object.keys(WIDGET_COUNT_LABELS)
    .map(k => ({ key: k, label: WIDGET_COUNT_LABELS[k], n: Number(count[k]) || 0 }))
    .filter(r => r.n > 0);

  host.append(el("div", { class: "grid two" },
    listCard("どのウィジェットを追加しているか", kindRows,
             "％は「ウィジェットを追加している端末」に対する割合。複数種類を置いている人はそれぞれで数えます。"),
    el("div", { class: "grid", style: "gap:14px;align-content:start" },
      listCard("設置場所とサイズ", famRows),
      listCard("1端末あたりの設置数", cntRows)),
  ));

  const unused = WIDGETS.filter(w => !(Number(kinds[w.key]) > 0));
  if (unused.length) {
    host.append(el("div", { style: "font-size:12px;color:var(--ink-muted);margin-top:14px" },
      `この期間に一度も置かれていないウィジェット: ${unused.map(w => w.label).join("、")}`));
  }
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
    if (!rows.length) {
      // アプリ側の対応が要る軸は「不具合ではない」と分かる文言にする
      card.append(el("div", { class: "empty" }, b.since
        ? "アプリのアップデート後に届きます"
        : "データなし"));
    } else {
      const max = Math.max(...rows.map(r => r.v));
      const rank = el("div", { class: "rank" });
      for (const r of rows.slice(0, b.limit ?? 6)) {
        rank.append(el("div", { class: "rank-row", style: "grid-template-columns:minmax(88px,120px) 1fr auto" },
          el("div", { class: "name" }, el("span", { class: "txt" }, b.format(r.k))),
          el("div", { class: "track" },
            el("div", { class: "fill", style: `width:${(r.v / max) * 100}%;background:${tabColor("home")}` })),
          el("div", { class: "val num" }, fmt(r.v), el("span", { class: "share" }, pct(r.v, total)))));
      }
      card.append(rank);
      const hidden = rows.length - (b.limit ?? 6);
      if (hidden > 0) {
        card.append(el("div", { style: "font-size:12px;color:var(--ink-muted);margin-top:8px" },
          `ほか ${hidden} 種類`));
      }
    }
    host.append(card);
  }
}

// ─────────────────────────────────────────────────────────────
// 曜日別（授業のある平日と休日で使われ方が変わるので独立させる）
// ─────────────────────────────────────────────────────────────
function renderWeekdays() {
  const host = $("#weekdays"); host.innerHTML = "";
  const counts = sumGroup(rangeDaysList(), "dow");
  const vals = DOW_LABELS.map((_, i) => Number(counts[String(i)]) || 0);
  const total = vals.reduce((a, b) => a + b, 0);
  if (!total) {
    host.append(el("div", { class: "empty" }, "アプリのアップデート後に届きます"));
    return;
  }
  const max = Math.max(...vals);
  const rank = el("div", { class: "rank" });
  vals.forEach((v, i) => {
    const weekend = i === 0 || i === 6;
    const color = weekend ? cssVar("--ink-muted") : tabColor("schedule");
    const row = el("div", { class: "rank-row", style: "grid-template-columns:44px 1fr auto" },
      el("div", { class: "name" }, el("span", { class: "txt" }, `${DOW_LABELS[i]}曜`)),
      el("div", { class: "track" },
        el("div", { class: "fill", style: `width:${(v / max) * 100}%;background:${color}` })),
      el("div", { class: "val num" }, fmt(v), el("span", { class: "share" }, pct(v, total))));
    row.addEventListener("pointerenter", ev => showTip(ev, `${DOW_LABELS[i]}曜日`,
      [["アクティブ端末", fmt(v)], ["全体比", pct(v, total)]]));
    row.addEventListener("pointermove", moveTip);
    row.addEventListener("pointerleave", hideTip);
    rank.append(row);
  });
  host.append(rank);

  const wk = vals[0] + vals[6], wd = total - wk;
  host.append(el("div", { style: "font-size:12px;color:var(--ink-muted);margin-top:10px" },
    `平日 ${fmt(wd)}（${pct(wd, total)}）／土日 ${fmt(wk)}（${pct(wk, total)}）`));
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
  const wk2 = lastWeekKeys(WEEKS_SHOWN);
  if (wk2.some(k => state.weekly[k])) {
    lines.push([]);
    lines.push(["週", "開始日(月)", "実人数", "うち新規"]);
    for (const k of wk2) {
      const v = state.weekly[k]; if (!v) continue;
      lines.push([k, weekStartDay(k), v.activeUsers ?? 0, v.newUsers ?? 0]);
    }
  }
  const mo2 = lastMonthKeys(MONTHS_SHOWN);
  if (mo2.some(k => state.monthly[k])) {
    lines.push([]);
    lines.push(["月", "実人数", "うち新規"]);
    for (const k of mo2) {
      const v = state.monthly[k]; if (!v) continue;
      lines.push([k, v.activeUsers ?? 0, v.newUsers ?? 0]);
    }
  }
  const fu = sumGroup(days, "featureUsers");
  if (Object.keys(fu).length) {
    const active = sumSummary(days, "activeUsers");
    lines.push([]);
    lines.push(["機能（人数ベース）", "キー", "使った端末（延べ）", "アクティブ端末比"]);
    for (const f of FEATURES) {
      const n = Number(fu[f.key]) || 0;
      if (n > 0) lines.push([f.label, f.key, n, active > 0 ? `${((n / active) * 100).toFixed(1)}%` : ""]);
    }
  }
  const wk = sumGroup(days, "widgets");
  if (Object.keys(wk).length) {
    const wu = sumGroup(days, "widgetUsers");
    const inst = Number(wu.installed) || 0;
    lines.push([]);
    lines.push(["ウィジェット", "kind", "設置端末（延べ）", "追加者に対する割合"]);
    for (const [k, v] of Object.entries(wk).sort((a, x) => x[1] - a[1])) {
      lines.push([lookupWidget(k).label, k, v, inst > 0 ? `${((v / inst) * 100).toFixed(1)}%` : ""]);
    }
  }
  for (const b of BREAKDOWNS) {
    const counts = sumGroup(days, b.key);
    const rows = Object.entries(counts).map(([k, v]) => [k, Number(v) || 0]).filter(r => r[1] > 0);
    if (!rows.length) continue;
    rows.sort((a, x) => x[1] - a[1]);
    lines.push([]);
    lines.push([b.label, "キー", `期間内(${state.rangeDays}日)`]);
    for (const [k, v] of rows) lines.push([b.format(k), k, v]);
  }
  const csv = "﻿" + lines.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = el("a", { href: url, download: `zonavi-analytics_${dayKey(new Date())}.csv` });
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
// 自動分析レポート
//
// 「数字は出ているが、どう読めばいいか分からない」を埋めるためのセクション。
// 直近の期間と、その前の同じ長さの期間を比べ、動いた指標・機能と、
// そこから言えること／次の一手を日本語の文章に組み立てる。
//
// LLM は使わず、しきい値と条件分岐だけで書いている。理由は 3 つ:
//  - 同じデータなら必ず同じ文章になる（卒制の考察に引用しても再現できる）
//  - API キーが要らないので、公開リポジトリのまま動く
//  - ?demo=1 のサンプルデータでもそのまま成立する
//
// 比較する期間を「今週（暦週）」ではなく「直近7日」にしているのは、
// 途中までの週を丸ごとの週と比べると、必ず減ったように見えてしまうため。
// ─────────────────────────────────────────────────────────────

const REPORT_WINDOWS = [
  { key: "week",  days: 7,  label: "週次", now: "直近7日",  before: "その前の7日" },
  { key: "month", days: 28, label: "月次", now: "直近28日", before: "その前の28日" },
];

const sumOf   = obj => Object.values(obj || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const shareOf = (obj, key) => { const t = sumOf(obj); return t > 0 ? (Number(obj?.[key]) || 0) / t : 0; };
/** 変化率(%)。前期間が 0 のときは比較不能として null を返す */
const rate   = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null);
const signed = r => `${r > 0 ? "+" : ""}${r.toFixed(1)}%`;
const pctText = x => `${(x * 100).toFixed(0)}%`;

/** offset=0 で直近 n 日、1 でその前の n 日（JST 基準） */
function windowDays(n, offset = 0) {
  const today = dayKey(new Date());
  const end = shiftDays(today, -offset * n);
  return listDays(shiftDays(end, -(n - 1)), end);
}

function collectWindow(days) {
  const g = k => sumGroup(days, k);
  return {
    days, from: days[0], to: days.at(-1),
    activeUsers: sumSummary(days, "activeUsers"),
    sessions:    sumSummary(days, "sessions"),
    newUsers:    sumSummary(days, "newUsers"),
    events:      sumSummary(days, "events"),
    tabs: g("tabs"), feats: g("events"), hours: g("hours"),
    tenure: g("tenure"), notif: g("notif"), dow: g("dow"), versions: g("versions"),
    featureUsers: g("featureUsers"), widgetUsers: g("widgetUsers"), widgets: g("widgets"),
  };
}

/** バージョンキー "1_4_0" を比較できる数値にする */
const verNum = k => String(k).split("_").reduce((a, n) => a * 1000 + (Number(n) || 0), 0);

function buildReport(win) {
  const cur = collectWindow(windowDays(win.days, 0));
  const prv = collectWindow(windowDays(win.days, 1));

  // ── 主要指標の期間比較 ──
  const metrics = [
    { key: "activeUsers", label: "アクティブ端末",     note: "1端末1日1カウントの延べ数" },
    { key: "sessions",    label: "セッション",         note: "30分以上あけて開いた回数" },
    { key: "newUsers",    label: "新規インストール",   note: "初回起動した端末数" },
    { key: "events",      label: "総操作回数",         note: "計測対象の操作の合計" },
  ].map(m => ({ ...m, now: cur[m.key], before: prv[m.key], rate: rate(cur[m.key], prv[m.key]) }));

  const depthNow = cur.activeUsers > 0 ? cur.events / cur.activeUsers : 0;
  const depthPrv = prv.activeUsers > 0 ? prv.events / prv.activeUsers : 0;
  metrics.push({ key: "depth", label: "1端末あたりの操作", note: "総操作回数 ÷ アクティブ端末",
                 now: depthNow, before: depthPrv, rate: rate(depthNow, depthPrv), decimals: 1 });

  // ── 機能ごとの増減 ──
  const featKeys = [...new Set([...Object.keys(cur.feats), ...Object.keys(prv.feats)])];
  const moves = featKeys.map(k => {
    const a = Number(cur.feats[k]) || 0, b = Number(prv.feats[k]) || 0;
    return { ...lookupEvent(k), now: a, before: b, diff: a - b, rate: rate(a, b) };
  });
  // ノイズを避けるため、片側が 5 回未満の小さな動きは拾わない
  const risers  = moves.filter(m => m.diff > 0 && m.now    >= 5).sort((a, b) => b.diff - a.diff).slice(0, 5);
  const fallers = moves.filter(m => m.diff < 0 && m.before >= 5).sort((a, b) => a.diff - b.diff).slice(0, 5);

  // ── 気づき ──
  const insights = [];
  const add = (level, title, body, action = null) => insights.push({ level, title, body, action });
  const au = metrics[0], nu = metrics[2];

  if (cur.activeUsers === 0) {
    add("info", "この期間のデータがまだ届いていません",
        "アプリが計測を送るのは、端末で ZONAVI が開かれたときです。公開直後や開発中は空になります。",
        "画面右上で「開発」データソースに切り替えると、Xcode 実行中の操作を確認できます");
  }

  if (au.rate !== null) {
    if (au.rate >= 10) {
      add("good", `アクティブ端末が ${signed(au.rate)} 伸びました`,
          `${win.before}の ${fmt(au.before)} から ${win.now}は ${fmt(au.now)} に増えています。`,
          "伸びた要因を特定できるよう、この期間に何を告知したか（授業・SNS・口コミ）を記録に残す");
    } else if (au.rate <= -10) {
      add("warn", `アクティブ端末が ${signed(au.rate)} 落ちています`,
          `${win.before}の ${fmt(au.before)} から ${win.now}は ${fmt(au.now)} に減っています。長期休暇や試験期間など、大学の予定と重なっていないか確認してください。`,
          "学事日程と重ねて見て、季節要因か、機能side の問題かを切り分ける");
    }
  }

  if (nu.rate !== null && au.rate !== null && nu.rate > 10 && au.rate < 0) {
    add("warn", "新規インストールは増えたのに、使われる量は減っています",
        `新規は ${signed(nu.rate)}、アクティブ端末は ${signed(au.rate)}。入れてはもらえるが、使い続けてもらえていない状態です。`,
        "インストール直後 1〜3 日で戻ってくる理由をつくる（翌朝のバス通知をオンボーディング中に設定させる等）");
  }

  const depth = metrics[4];
  if (depth.rate !== null && depth.before > 0) {
    if (depth.rate >= 15) {
      add("good", `1端末あたりの操作が ${signed(depth.rate)} 増えました`,
          `${depth.before.toFixed(1)} 回 → ${depth.now.toFixed(1)} 回。同じ人がより深く使うようになっています。`);
    } else if (depth.rate <= -15) {
      add("warn", `1端末あたりの操作が ${signed(depth.rate)} 減りました`,
          `${depth.before.toFixed(1)} 回 → ${depth.now.toFixed(1)} 回。開いてはいるが、以前ほど触られていません。`,
          "起動直後に見えるホームの情報だけで用事が済んでいないか確認する（それ自体は悪いことではない）");
    }
  }

  // 定着
  if (sumOf(cur.tenure) > 0) {
    const long = shareOf(cur.tenure, "d30plus");
    const fresh = shareOf(cur.tenure, "d0") + shareOf(cur.tenure, "d1_6");
    if (long >= 0.5) {
      add("good", `30日以上使い続けている端末が ${pctText(long)} を占めています`,
          "生活の中に定着している状態です。卒制の成果としてはここが一番強い数字になります。");
    } else if (long < 0.25 && fresh > 0.5) {
      add("warn", `利用の ${pctText(fresh)} がインストール1週間以内の端末です`,
          `30日以上の継続は ${pctText(long)} にとどまっています。新規で数字が持っている状態で、定着は弱めです。`,
          "1週間後に価値が出る機能（時間割・年間予定）へ、初週のうちに触れてもらう導線をつくる");
    }
  }

  // 通知許可
  if (sumOf(cur.notif) > 0) {
    const granted = shareOf(cur.notif, "granted");
    const undecided = shareOf(cur.notif, "notDetermined");
    if (granted < 0.5) {
      add("warn", `通知を許可している端末は ${pctText(granted)} です`,
          `バス通知は ZONAVI の中心機能なので、許可率がそのまま届く価値の上限になります。未選択が ${pctText(undecided)} 残っています。`,
          "許可ダイアログを出す前に「何時のバスに間に合うか前もって知らせます」と用途を先に見せる");
    } else {
      add("good", `通知の許可率は ${pctText(granted)} です`,
          "バス通知やお知らせが届く土台はできています。");
    }
  }

  // タブの偏り
  if (sumOf(cur.tabs) > 0) {
    const total = sumOf(cur.tabs);
    const ranked = TABS.map(t => ({ t, n: Number(cur.tabs[t.id]) || 0 })).sort((a, b) => a.n - b.n);
    const weakest = ranked[0], strongest = ranked.at(-1);
    if (weakest.n / total < 0.08) {
      add("info", `${weakest.t.label}タブはほとんど開かれていません（${pct(weakest.n, total)}）`,
          `一番見られているのは${strongest.t.label}タブ（${pct(strongest.n, total)}）です。`,
          `${weakest.t.label}の中身をホームに出すか、タブ自体を畳んで4本を3本にする判断材料にする`);
    }
  }

  // 時間帯
  if (sumOf(cur.hours) > 0) {
    const total = sumOf(cur.hours);
    const band = (a, b) => { let n = 0; for (let h = a; h <= b; h++) n += Number(cur.hours[String(h).padStart(2, "0")]) || 0; return n; };
    const morning = band(7, 9), noon = band(11, 13), night = band(21, 23);
    const peakHour = Array.from({ length: 24 }, (_, h) => [h, Number(cur.hours[String(h).padStart(2, "0")]) || 0])
      .sort((a, b) => b[1] - a[1])[0][0];
    if (morning / total >= 0.22) {
      add("info", `朝の通学時間（7〜9時）に利用の ${pct(morning, total)} が集中しています`,
          `ピークは ${peakHour}時台。昼（11〜13時）は ${pct(noon, total)}、夜（21〜23時）は ${pct(night, total)} です。`,
          "朝に見る情報（バス・1限の教室）をウィジェットとロック画面に寄せて、アプリを開かなくても済むようにする");
    } else {
      add("info", `利用のピークは ${peakHour}時台です`,
          `朝（7〜9時）${pct(morning, total)}／昼（11〜13時）${pct(noon, total)}／夜（21〜23時）${pct(night, total)}。`);
    }
  }

  // 曜日
  if (sumOf(cur.dow) > 0) {
    const total = sumOf(cur.dow);
    const weekend = (Number(cur.dow["0"]) || 0) + (Number(cur.dow["6"]) || 0);
    if (weekend / total < 0.12) {
      add("info", `土日の利用は全体の ${pct(weekend, total)} だけです`,
          "完全に平日・通学中心のアプリとして使われています。休日に開く理由は今のところありません。",
          "休日に使わせようとするより、平日の朝に強くする方が費用対効果が高い");
    }
  }

  // ログイン失敗
  const ok = Number(cur.feats["login_success"]) || 0, ng = Number(cur.feats["login_failed"]) || 0;
  if (ok + ng >= 10 && ng / (ok + ng) > 0.15) {
    add("warn", `ログインの ${pct(ng, ok + ng)} が失敗しています`,
        `成功 ${fmt(ok)} 回に対して失敗 ${fmt(ng)} 回。認証で人が詰まっています。`,
        "失敗理由ごとにメッセージを出し分け、その場で再試行できる導線を置く");
  }

  // オンボーディング完了率
  const obStart = Number(cur.feats["onboarding_start"]) || 0;
  const obDone  = Number(cur.feats["onboarding_complete"]) || 0;
  if (obStart >= 5) {
    const r = obDone / obStart;
    if (r < 0.7) {
      add("warn", `オンボーディングの完了率は ${pctText(r)} です`,
          `${fmt(obStart)} 件始まって、完了したのは ${fmt(obDone)} 件。最初の説明で離脱しています。`,
          "手順を減らし、あとから設定できるものはスキップ可能にする");
    } else {
      add("good", `オンボーディングの完了率は ${pctText(r)} です`,
          "最初の説明はきちんと通過できています。");
    }
  }

  // AIチャットの送信転換
  const aiOpen = Number(cur.feats["home_hanako_open"]) || 0;
  const aiSend = Number(cur.feats["home_hanako_message_sent"]) || 0;
  if (aiOpen >= 5 && aiSend / aiOpen < 0.5) {
    add("info", `AIチャットは開かれても ${pct(aiSend, aiOpen)} しか送信に至っていません`,
        `${fmt(aiOpen)} 回開かれて、送信は ${fmt(aiSend)} 回。開いたが何を聞けばいいか分からず閉じている可能性があります。`,
        "「何を聞けるか」の例文を最初から並べて、タップだけで送れるようにする");
  }

  // ウィジェット
  const wIn = Number(cur.widgetUsers.installed) || 0, wNo = Number(cur.widgetUsers.none) || 0;
  if (wIn + wNo > 0) {
    const r = wIn / (wIn + wNo);
    const top = Object.entries(cur.widgets).sort((a, b) => b[1] - a[1])[0];
    const topLabel = top ? lookupWidget(top[0]).label : null;
    if (r < 0.3) {
      add("warn", `ウィジェットを追加しているのは ${pctText(r)} だけです`,
          `ウィジェットは「アプリを開かなくてもバスの時刻が分かる」という ZONAVI の一番の強みですが、${pctText(1 - r)} の端末には置かれていません。`
          + (topLabel ? `置かれている中では「${topLabel}」が最多です。` : ""),
          "設定やオンボーディングで、追加手順を画像つきで案内する（iOS のウィジェット追加は導線が深く、知られていない）");
    } else {
      add("good", `ウィジェットの追加率は ${pctText(r)} です`,
          (topLabel ? `一番置かれているのは「${topLabel}」。` : "") + "アプリを開かずに使われている分は、セッション数には表れません。");
    }
  }

  // 実人数（週次）と、ダウンロードに対する生存率
  const installsTotal = Number(state.totals?.summary?.installs) || 0;
  const doneWeekKeys = lastWeekKeys(WEEKS_SHOWN).filter(k => k !== isoWeekKey(dayKey(new Date())));
  const wNow  = Number(state.weekly[doneWeekKeys.at(-1)]?.activeUsers) || 0;
  const wPrev = Number(state.weekly[doneWeekKeys.at(-2)]?.activeUsers) || 0;
  if (wNow > 0) {
    const r = rate(wNow, wPrev);
    if (r !== null && Math.abs(r) >= 8) {
      add(r > 0 ? "good" : "warn", `週間ユーザー（実人数）が ${signed(r)}`,
          `${fmt(wPrev)} 人 → ${fmt(wNow)} 人。延べではなく、実際に何人が使ったかの変化です。`);
    }
    if (installsTotal > 0) {
      const alive = wNow / installsTotal;
      add(alive >= 0.25 ? "good" : "info",
          `ダウンロードした端末のうち、先週使ったのは ${pctText(alive)} です`,
          `累計 ${fmt(installsTotal)} 台に対して、先週の実利用は ${fmt(wNow)} 人。`
          + (alive < 0.15 ? "入れたまま使われていない端末が多い状態です。" : ""),
          alive < 0.15 ? "「インストールからの経過」と合わせて、離脱が起きる時期を特定する" : null);
    }
  }

  // 機能の利用率（人数ベース）
  if (sumOf(cur.featureUsers) > 0 && cur.activeUsers > 0) {
    const rows = FEATURES.map(f => ({ ...f, n: Number(cur.featureUsers[f.key]) || 0 }));
    const ranked = [...rows].sort((a, b) => b.n - a.n);
    const top = ranked[0];
    if (top && top.n > 0) {
      add("info", `一番多くの人が使った機能は「${top.label}」です`,
          `この期間のアクティブ端末の ${pct(top.n, cur.activeUsers)} が触っています。次点は「${ranked[1]?.label ?? "—"}」（${pct(ranked[1]?.n ?? 0, cur.activeUsers)}）。`);
    }
    const zero = rows.filter(r => r.n === 0);
    const weak = rows.filter(r => r.n > 0 && r.n / cur.activeUsers < 0.05);
    if (zero.length) {
      add("warn", `この期間に誰も使わなかった機能が ${zero.length} 件あります`,
          zero.map(r => `「${r.label}」`).join("、") + "。回数が 0 ではなく、使った人が 0 です。",
          "存在に気づかれていないのか、要らないのかを切り分ける。前者なら入口を、後者なら畳む判断を");
    } else if (weak.length) {
      add("info", `使う人が5%未満の機能が ${weak.length} 件あります`,
          weak.map(r => `「${r.label}」${pct(r.n, cur.activeUsers)}`).join("、"),
          "一部の人にだけ深く刺さっているのか、単に気づかれていないのかを、回数と合わせて確認する");
    }
  }

  // 使われていない機能
  const unused = EVENTS.filter(e => !(Number(cur.feats[e.key]) > 0));
  if (cur.events > 0 && unused.length) {
    add("info", `この期間に一度も使われていない機能が ${unused.length} 件あります`,
        unused.slice(0, 5).map(e => `「${e.label}」`).join("、") + (unused.length > 5 ? " ほか" : ""),
        "気づかれていないのか、要らないのかを切り分ける。前者なら入口を見直し、後者なら畳んで画面を軽くする");
  }

  // バージョンの滞留
  if (sumOf(cur.versions) > 0) {
    const keys = Object.keys(cur.versions).sort((a, b) => verNum(b) - verNum(a));
    const latest = keys[0], share = shareOf(cur.versions, latest);
    if (keys.length > 1 && share < 0.6) {
      add("info", `最新版 ${latest.replace(/_/g, ".")} は ${pctText(share)} にしか行き渡っていません`,
          `${keys.length} 種類のバージョンが混在しています。新機能の数字は、この割合で割り引いて読む必要があります。`,
          "自動アップデートが効くまで待つか、アプリ内で更新を促す");
    }
  }

  // 重要な順に並べる：対処が要るもの → 良い兆候 → 参考
  const order = { warn: 0, good: 1, info: 2 };
  insights.sort((a, b) => order[a.level] - order[b.level]);

  // ── 総括の一文 ──
  let headline;
  if (cur.activeUsers === 0) {
    headline = `${win.now}（${cur.from} 〜 ${cur.to}）はまだデータが届いていません。`;
  } else if (au.rate === null) {
    headline = `${win.now}はアクティブ端末 ${fmt(cur.activeUsers)}、総操作 ${fmt(cur.events)} 回。比較できる前期間のデータがまだないため、増減は次回から出ます。`;
  } else {
    const word = au.rate > 3 ? "伸びています" : au.rate < -3 ? "落ちています" : "ほぼ横ばいです";
    headline = `${win.now}のアクティブ端末は ${fmt(cur.activeUsers)}（${win.before}比 ${signed(au.rate)}）で ${word}。`;
    if (risers.length) {
      headline += `伸びの中心は「${risers[0].label}」（${fmt(risers[0].before)} → ${fmt(risers[0].now)} 回）です。`;
    } else if (fallers.length) {
      headline += `落ち込みが大きいのは「${fallers[0].label}」（${fmt(fallers[0].before)} → ${fmt(fallers[0].now)} 回）です。`;
    }
  }

  const actions = insights.filter(i => i.action).slice(0, 5);
  return { win, cur, prv, metrics, risers, fallers, insights, actions, headline };
}

const LEVEL_BADGE = { warn: "要対応", good: "良い兆候", info: "参考" };

function renderReport() {
  const host = $("#report"); host.innerHTML = "";
  const win = REPORT_WINDOWS.find(w => w.key === state.reportWindow) ?? REPORT_WINDOWS[0];
  const rep = buildReport(win);
  state.report = rep;

  host.append(el("p", { class: "headline" }, rep.headline));
  host.append(el("div", { class: "hint", style: "margin-bottom:18px" },
    `${rep.cur.from} 〜 ${rep.cur.to} と、${rep.prv.from} 〜 ${rep.prv.to} の比較（JST）`));

  // 指標の比較表
  const table = el("table", {},
    el("thead", {}, el("tr", {},
      el("th", {}, "指標"),
      el("th", { class: "n" }, win.now),
      el("th", { class: "n" }, win.before),
      el("th", { class: "n" }, "変化"))),
    el("tbody", {}, rep.metrics.map(m => {
      const d = m.decimals ?? 0;
      const dir = m.rate === null ? "flat" : m.rate > 0.5 ? "up" : m.rate < -0.5 ? "down" : "flat";
      const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "→";
      return el("tr", {},
        el("td", { title: m.note }, m.label),
        el("td", { class: "n" }, d ? m.now.toFixed(d) : fmt(m.now)),
        el("td", { class: "n" }, d ? m.before.toFixed(d) : fmt(m.before)),
        el("td", { class: `n delta ${dir}` }, m.rate === null ? "—" : `${arrow} ${signed(m.rate)}`));
    })));
  host.append(el("div", { class: "table-wrap", style: "margin-bottom:22px" }, table));

  // 伸びた機能／落ちた機能
  const movesWrap = el("div", { class: "grid two" });
  const movesCard = (title, list, tone) => {
    const card = el("div", { class: "card" }, el("h3", { style: "font-size:13px;margin-bottom:12px" }, title));
    if (!list.length) card.append(el("div", { class: "empty" }, "目立った動きはありません"));
    else {
      const max = Math.max(...list.map(x => Math.abs(x.diff)));
      const rank = el("div", { class: "rank" });
      for (const x of list) {
        rank.append(el("div", { class: "rank-row", style: "grid-template-columns:minmax(96px,1fr) 1fr auto" },
          el("div", { class: "name" },
            el("span", { class: "dot", style: `background:${tabColor(x.tab)}` }),
            el("span", { class: "txt" }, x.label)),
          el("div", { class: "track" },
            el("div", { class: "fill", style: `width:${(Math.abs(x.diff) / max) * 100}%;background:${tone}` })),
          el("div", { class: "val num" }, `${x.diff > 0 ? "+" : ""}${fmt(x.diff)}`,
            el("span", { class: "share" }, `${fmt(x.before)}→${fmt(x.now)}`))));
      }
      card.append(rank);
    }
    return card;
  };
  movesWrap.append(movesCard("伸びた機能", rep.risers, cssVar("--good")));
  movesWrap.append(movesCard("落ちた機能", rep.fallers, cssVar("--critical")));
  host.append(movesWrap);

  // 気づき
  host.append(el("h3", { class: "report-h" }, "読み取れること"));
  if (!rep.insights.length) {
    host.append(el("div", { class: "empty" }, "特筆すべき変化は見つかりませんでした"));
  } else {
    for (const i of rep.insights) {
      host.append(el("div", { class: `insight ${i.level}` },
        el("div", { class: "ttl" }, el("span", { class: "badge" }, LEVEL_BADGE[i.level]), i.title),
        el("p", { class: "body" }, i.body),
        i.action ? el("p", { class: "act" }, el("span", {}, "次の一手"), i.action) : null));
    }
  }

  // 次にやるとよいこと
  if (rep.actions.length) {
    host.append(el("h3", { class: "report-h" }, "次にやるとよいこと"));
    host.append(el("ol", { class: "actions" },
      rep.actions.map(i => el("li", {}, el("strong", {}, i.title), el("span", {}, i.action)))));
  }

  host.append(el("p", { class: "hint", style: "margin-top:22px" },
    "この文章は、期間比較の結果を決まった条件で組み立てたものです（生成 AI は使っていません）。同じデータなら毎回同じ文章になります。"));
}

/** レポートをそのまま資料に貼れるプレーンテキストにする */
function reportAsText() {
  const rep = state.report;
  if (!rep) return "";
  const L = [];
  L.push(`ZONAVI 利用状況レポート（${rep.win.label}）`);
  L.push(`対象: ${rep.cur.from} 〜 ${rep.cur.to}（比較: ${rep.prv.from} 〜 ${rep.prv.to}）`);
  L.push("");
  L.push(rep.headline);
  L.push("");
  L.push("■ 主要指標");
  for (const m of rep.metrics) {
    const d = m.decimals ?? 0;
    const now = d ? m.now.toFixed(d) : fmt(m.now);
    const before = d ? m.before.toFixed(d) : fmt(m.before);
    L.push(`- ${m.label}: ${now}（前期間 ${before}／${m.rate === null ? "比較不能" : signed(m.rate)}）`);
  }
  if (rep.risers.length) {
    L.push("");
    L.push("■ 伸びた機能");
    for (const x of rep.risers) L.push(`- ${x.label}: ${fmt(x.before)} → ${fmt(x.now)}（+${fmt(x.diff)}）`);
  }
  if (rep.fallers.length) {
    L.push("");
    L.push("■ 落ちた機能");
    for (const x of rep.fallers) L.push(`- ${x.label}: ${fmt(x.before)} → ${fmt(x.now)}（${fmt(x.diff)}）`);
  }
  L.push("");
  L.push("■ 読み取れること");
  for (const i of rep.insights) {
    L.push(`- [${LEVEL_BADGE[i.level]}] ${i.title}`);
    L.push(`  ${i.body}`);
    if (i.action) L.push(`  → ${i.action}`);
  }
  return L.join("\n");
}

// ─────────────────────────────────────────────────────────────
// 描画
// ─────────────────────────────────────────────────────────────
function render() {
  renderKPIs(); renderUsers(); renderTrend(); renderTabs(); renderFeatures(); renderFeatureUsers();
  renderWidgets(); renderHours(); renderWeekdays(); renderBreakdowns(); renderTable();
  renderReport();   // まとめなので最後に置く
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
  $$("#report-seg button").forEach(b => b.addEventListener("click", () => {
    state.reportWindow = b.dataset.window;
    localStorage.setItem("zonavi.dash.reportWindow", state.reportWindow);
    $$("#report-seg button").forEach(x => x.setAttribute("aria-pressed", x === b));
    renderReport();
  }));
  $$("#report-seg button").forEach(x => x.setAttribute("aria-pressed", x.dataset.window === state.reportWindow));
  $("#report-copy").addEventListener("click", async ev => {
    const btn = ev.currentTarget;
    try {
      await navigator.clipboard.writeText(reportAsText());
      btn.textContent = "コピーしました";
    } catch {
      btn.textContent = "コピーできませんでした";
    }
    setTimeout(() => { btn.textContent = "レポートをコピー"; }, 1800);
  });
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
/** デモ用の機種分布。学生の手元にありそうな構成を、合計がアクティブ端末数に合うよう配る */
function demoModels(users) {
  const mix = [
    ["iPhone18_3", 0.13], ["iPhone18_1", 0.06], ["iPhone17_3", 0.17], ["iPhone17_1", 0.08],
    ["iPhone16_1", 0.07], ["iPhone15_4", 0.12], ["iPhone15_2", 0.05], ["iPhone14_5", 0.11],
    ["iPhone14_6", 0.06], ["iPhone13_2", 0.05], ["iPhone12_1", 0.04], ["iPad13_18", 0.06],
  ];
  const out = {};
  let assigned = 0;
  mix.forEach(([k, w], i) => {
    const n = i === mix.length - 1 ? Math.max(0, users - assigned) : Math.round(users * w);
    if (n > 0) { out[k] = n; assigned += n; }
  });
  return out;
}

/** デモ用：機能ごとの利用端末数。アクティブ端末に対する現実的な利用率で配る */
function demoFeatureUsers(users, rnd) {
  const share = {
    bus_time: 0.72, timetable: 0.46, bus_notif: 0.31, cafeteria: 0.28, ext_links: 0.19,
    notice: 0.14, ai_chat: 0.11, annual: 0.09, memo: 0.07, credits: 0.06,
    appbar: 0.05, timetable_ocr: 0.03, share: 0.02, feedback: 0.015,
  };
  const out = {};
  for (const f of FEATURES) {
    const n = Math.round(users * (share[f.key] ?? 0.02) * (0.85 + rnd() * 0.3));
    if (n > 0) out[f.key] = Math.min(n, users);
  }
  return out;
}

/** デモ用：ウィジェットの設置状況。1端末が複数種類を置くので kind の合計は installed を超える */
function demoWidgets(users, rnd) {
  const installed = Math.round(users * 0.38 * (0.9 + rnd() * 0.2));
  const none = Math.max(0, users - installed);
  const kindShare = {
    BusToUniWidget: 0.44, BusToStaWidget: 0.31, BusTimetableWidget: 0.29,
    TodayScheduleWidget: 0.22, BusCountdownCircularWidget: 0.18, CafeteriaMenuWidget: 0.13,
    SmallCafeteriaWidget: 0.11, BusAutoRectangularWidget: 0.09,
    FullScheduleWidget: 0.08, BusPlusMenuWidget: 0.06,
  };
  const widgets = {};
  for (const w of WIDGETS) {
    const n = Math.round(installed * (kindShare[w.key] ?? 0.05) * (0.85 + rnd() * 0.3));
    if (n > 0) widgets[w.key] = n;
  }
  const famShare = { systemSmall: 0.58, systemMedium: 0.45, systemLarge: 0.12,
                     accessoryCircular: 0.18, accessoryRectangular: 0.09 };
  const widgetFamily = {};
  for (const [k, v] of Object.entries(famShare)) {
    const n = Math.round(installed * v);
    if (n > 0) widgetFamily[k] = n;
  }
  const cnt = { w1: 0.52, w2: 0.29, w3_4: 0.15, w5plus: 0.04 };
  const widgetCount = {};
  let left = installed;
  const cntKeys = Object.keys(cnt);
  cntKeys.forEach((k, i) => {
    const n = i === cntKeys.length - 1 ? Math.max(0, left) : Math.round(installed * cnt[k]);
    if (n > 0) widgetCount[k] = n;
    left -= n;
  });
  return { widgetUsers: { installed, none }, widgets, widgetFamily, widgetCount };
}

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
      if (n) events[e.key] = n;
    }
    // 実際のアプリでは必ず成り立つ関係（起動＝セッション、完了≦開始 など）を反映させる。
    // ここが乱数のままだと、レポートが「ログイン失敗が半分」のような有り得ない指摘を出してしまう。
    events.app_open                 = sessions;
    events.onboarding_start         = newUsers;
    events.consent_agree            = Math.round(newUsers * 0.96);
    events.onboarding_complete      = Math.round(newUsers * 0.81);
    events.login_success            = Math.round(users * 0.34);
    events.login_failed             = Math.max(0, Math.round(events.login_success * 0.06));
    events.home_hanako_message_sent = Math.round((events.home_hanako_open || 0) * 0.55);
    for (const [k, n] of Object.entries(events)) {
      if (!n) { delete events[k]; continue; }
      evTotal += n;
      totalEvents[k] = (totalEvents[k] || 0) + n;
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
      model: demoModels(users),
      osFull: { "18_5": Math.round(users * 0.41), "18_4": Math.round(users * 0.19),
                "18_1": Math.round(users * 0.06), "17_6": Math.round(users * 0.20),
                "17_4": Math.round(users * 0.08), "16_7": Math.round(users * 0.06) },
      dow: { [String(dow)]: users },
      notif: { granted: Math.round(users * 0.61), denied: Math.round(users * 0.22),
               notDetermined: Math.round(users * 0.17) },
      display: { standard: Math.round(users * 0.55), large: Math.round(users * 0.24),
                 small: Math.round(users * 0.15), tablet: Math.round(users * 0.06) },
      featureUsers: demoFeatureUsers(users, rnd),
      ...demoWidgets(users, rnd),
      lang: { ja: Math.round(users * 0.93), en: Math.round(users * 0.07) },
      theme: { light: Math.round(users * 0.71), dark: Math.round(users * 0.29) },
      tenure: { d0: newUsers, d1_6: Math.round(users * 0.18),
                d7_29: Math.round(users * 0.34), d30plus: Math.round(users * 0.44) },
    };
  }
  state.daily = daily;
  state.totals = { events: totalEvents, tabs: totalTabs,
                   summary: { sessions: totalSessions, events: totalEventCount, installs } };

  // 実人数は日別の合計より小さくなる（同じ人が週に何日も開くため）。
  // 1人あたり 週3.5日・月9.5日 使う想定で逆算する。
  const weekly = {}, monthly = {};
  for (const [d, v] of Object.entries(daily)) {
    const wk = isoWeekKey(d), mo = monthKeyOf(d);
    (weekly[wk] ??= { dau: 0, newUsers: 0 });
    (monthly[mo] ??= { dau: 0, newUsers: 0 });
    weekly[wk].dau += v.summary.activeUsers;
    weekly[wk].newUsers += v.summary.newUsers;
    monthly[mo].dau += v.summary.activeUsers;
    monthly[mo].newUsers += v.summary.newUsers;
  }
  state.weekly = Object.fromEntries(Object.entries(weekly).map(([k, v]) =>
    [k, { activeUsers: Math.round(v.dau / 3.5), newUsers: v.newUsers }]));
  state.monthly = Object.fromEntries(Object.entries(monthly).map(([k, v]) =>
    [k, { activeUsers: Math.round(v.dau / 9.5), newUsers: v.newUsers }]));
}

let resizeTimer;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!$("#app").hidden) { renderUsers(); renderTrend(); renderHours(); }
  }, 180);
});

main();
