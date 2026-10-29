// ShopSmart Analytics - dashboard front end
const $ = (id) => document.getElementById(id);
const has = (...ids) => ids.every((id) => $(id));
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const money = (v) => "$" + Math.round(v).toLocaleString();
const pct = (v) => (v * 100).toFixed(1) + "%";
const charts = {};
let DATA = null;

async function api(url, body) {
  const res = await fetch(url, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : undefined);
  return res.json();
}

function setBusy(button, busy, busyText, idleText) {
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

function setLoading(id, message) {
  const el = $(id);
  if (!el) return;
  el.className = "status";
  el.innerHTML = `<span class="spinner"></span>${message}`;
}

function setMessage(id, message, state = "") {
  const el = $(id);
  if (!el) return;
  el.className = "status" + (state ? " " + state : "");
  el.textContent = message;
}

// ---------- Chart.js defaults (recessive grid/axes, thin marks) ----------
function themeCharts() {
  if (typeof Chart === "undefined") return;
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = css("--muted");
  Chart.defaults.borderColor = css("--grid");
  Chart.defaults.plugins.legend.display = false;   // HTML legends above each chart
  Chart.defaults.plugins.tooltip.backgroundColor = css("--text");
  Chart.defaults.plugins.tooltip.titleColor = css("--surface");
  Chart.defaults.plugins.tooltip.bodyColor = css("--surface");
  Chart.defaults.maintainAspectRatio = false;
}

function draw(id, config) {
  const el = $(id);
  if (!el) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(el, config);
}

// history (solid) + forecast (dashed) line chart
function lineForecast(id, labels, hist, fut, fmt) {
  const c = css("--series-1");
  const histData = [...hist, ...fut.map(() => null)];
  const futData = [...hist.map(() => null), ...fut];
  futData[hist.length - 1] = hist[hist.length - 1]; // connect the two segments
  draw(id, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Actual", data: histData, borderColor: c, borderWidth: 2, pointRadius: 0, tension: 0.25 },
        { label: "Forecast", data: futData, borderColor: c, borderWidth: 2, borderDash: [6, 4],
          pointRadius: 3, pointBackgroundColor: c, tension: 0.25 },
      ],
    },
    options: {
      interaction: { mode: "index", intersect: false },
      plugins: { tooltip: { filter: (i) => i.raw !== null && !(i.datasetIndex === 1 && i.dataIndex === hist.length - 1),
                            callbacks: { label: (i) => `${i.dataset.label}: ${fmt(i.raw)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: { ticks: { callback: fmt }, beginAtZero: false },
      },
    },
  });
}

// ---------- KPIs ----------
function renderKpis(k, revenue) {
  if (!has("k-rev", "k-next", "k-delta", "k-pos", "k-buy", "k-buy-sub", "k-promo", "k-promo-sub", "k-ann")) return;
  $("k-rev").textContent = money(k.revenue_last_month);
  $("k-next").textContent = money(k.revenue_next_month);
  const d = (k.revenue_next_month - k.revenue_last_month) / k.revenue_last_month;
  $("k-delta").textContent = `${d >= 0 ? "▲" : "▼"} ${Math.abs(d * 100).toFixed(1)}% vs last month (${revenue.forecast[0].month})`;
  $("k-delta").className = "delta " + (d >= 0 ? "up" : "down");
  $("k-pos").textContent = k.positive_review_pct + "%";
  $("k-buy").textContent = k.likely_buyers.toLocaleString();
  $("k-buy-sub").textContent = `of ${k.customers.toLocaleString()} customers`;
  $("k-promo").textContent = k.promo_responders.toLocaleString();
  $("k-promo-sub").textContent = `${(k.promo_responders / k.customers * 100).toFixed(0)}% of customers to target`;
  $("k-ann").textContent = k.avg_purchase_prob + "%";
}

// ---------- landing-page summary ----------
function renderHero(k, metrics) {
  if (!has("hero-rev", "hero-customers", "hero-sentiment", "hero-accuracy")) return;
  $("hero-rev").textContent = money(k.revenue_last_month);
  $("hero-customers").textContent = k.customers.toLocaleString();
  $("hero-sentiment").textContent = k.positive_review_pct + "%";
  const accuracies = Object.values(metrics)
    .map((m) => m.accuracy)
    .filter((v) => typeof v === "number");
  const average = accuracies.reduce((sum, v) => sum + v, 0) / (accuracies.length || 1);
  $("hero-accuracy").textContent = pct(average);
}

// ---------- 1. Linear Regression ----------
function renderRevenue(r) {
  if (!has("revChart")) return;
  const labels = [...r.history.map((h) => h.month), ...r.forecast.map((f) => f.month)];
  lineForecast("revChart", labels, r.history.map((h) => h.revenue), r.forecast.map((f) => f.revenue), money);
}

async function loadForecast() {
  if (!has("productSel", "spendRange")) return;
  const pid = $("productSel").value;
  const spend = $("spendRange").value;
  const f = await api(`/api/forecast/${pid}?ad_spend=${spend}`);
  const labels = [...f.history.map((h) => h.month), ...f.forecast.map((x) => x.month)];
  lineForecast("unitChart", labels, f.history.map((h) => h.units), f.forecast.map((x) => x.units),
    (v) => Math.round(v).toLocaleString());
  const total = f.forecast.reduce((s, x) => s + x.units, 0);
  if ($("forecastTable")) {
    $("forecastTable").innerHTML =
      `<tr><th>Month</th>${f.forecast.map((x) => `<th>${x.month}</th>`).join("")}</tr>` +
      `<tr><td>Units</td>${f.forecast.map((x) => `<td>${x.units}</td>`).join("")}</tr>` +
      `<tr><td>Revenue</td>${f.forecast.map((x) => `<td>${money(x.revenue)}</td>`).join("")}</tr>`;
  }
  const c = f.coefficients;
  if ($("coefText")) {
    $("coefText").textContent =
      `Stock tip: plan ~${total.toLocaleString()} units for the next 6 months. ` +
      `Model: +${c.t} units/month trend, +${c.holiday} in Nov–Dec, +${(c.ad_spend * 1000).toFixed(1)} units per $1,000 ads.`;
  }
}

// ---------- 2. Naive Bayes ----------
function renderReviews(rv) {
  if (!has("sentChart", "posWords", "negWords", "recentReviews")) return;
  const cats = rv.by_category;
  const gap = css("--surface");
  draw("sentChart", {
    type: "bar",
    data: {
      labels: cats.map((c) => c.category),
      datasets: [
        { label: "Positive", data: cats.map((c) => c.positive), backgroundColor: css("--pos"),
          borderColor: gap, borderWidth: { right: 2 }, borderSkipped: false, borderRadius: 4 },
        { label: "Negative", data: cats.map((c) => c.negative), backgroundColor: css("--neg"),
          borderColor: gap, borderWidth: { left: 2 }, borderSkipped: false, borderRadius: 4 },
      ],
    },
    options: {
      indexAxis: "y",
      scales: { x: { stacked: true, title: { display: true, text: "Reviews" } },
                y: { stacked: true, grid: { display: false } } },
      plugins: { tooltip: { mode: "index", callbacks: {
        footer: (items) => { const t = items.reduce((s, i) => s + i.raw, 0);
                             return `${pct(items[0].raw / t)} positive`; } } } },
    },
  });
  $("posWords").innerHTML = rv.top_words.positive.map((w) => `<span class="chip">${w}</span>`).join("");
  $("negWords").innerHTML = rv.top_words.negative.map((w) => `<span class="chip">${w}</span>`).join("");
  $("recentReviews").innerHTML = rv.recent.map((r) =>
    `<li><span class="tag ${r.predicted}">${r.predicted}</span><span>${r.text}</span></li>`).join("");
}

async function classifyReview() {
  if (!has("reviewText", "reviewResult")) return;
  const r = await api("/api/review", { text: $("reviewText").value });
  if (r.error) { $("reviewResult").textContent = r.error; return; }
  const good = r.label === "positive";
  $("reviewResult").innerHTML =
    `<div class="verdict ${good ? "yes" : "no"}">${good ? "👍 Positive" : "👎 Negative"} review</div>
     <div class="small muted">Confidence ${pct(r.confidence)} · P(positive) ${pct(r.probabilities.positive)}</div>
     <div class="meter"><div style="width:${r.probabilities.positive * 100}%"></div></div>`;
}

// ---------- 3. KNN ----------
const productLine = (p, extra) =>
  `<li><b>${p.name}</b> <span class="meta">· ${p.category} · $${p.price.toFixed(2)}${extra ? " · " + extra : ""}</span></li>`;

async function loadRecs() {
  if (!has("customerSel", "ratedList", "recList", "neighList")) return;
  const r = await api(`/api/recommend/${$("customerSel").value}`);
  $("ratedList").innerHTML = r.rated.map((p) => `<span class="chip">${p.name} ${"★".repeat(p.rating)}</span>`).join("");
  $("recList").innerHTML = r.recommendations.map((p) => productLine(p, `predicted rating ${p.score}`)).join("");
  $("neighList").innerHTML = r.neighbors.map((n) =>
    `<span class="chip">#${n.customer_id} · ${(n.similarity * 100).toFixed(0)}% similar</span>`).join("");
}

async function loadSimilar() {
  if (!has("simProductSel", "simList")) return;
  const s = await api(`/api/similar/${$("simProductSel").value}`);
  $("simList").innerHTML = s.map((p) => productLine(p, `${(p.similarity * 100).toFixed(0)}% similar`)).join("");
}

// ---------- 4-6. SVM / Decision Tree / ANN forms ----------
const showSvm = (r) => `<div class="verdict ${r.will_purchase ? "yes" : "no"}">${r.will_purchase ? "✔" : "✖"} ${r.label}</div>
                        <div class="small muted">Distance from SVM boundary: ${r.margin}</div>`;
const showTree = (r) => `<div class="verdict ${r.will_respond ? "yes" : "no"}">${r.will_respond ? "✔ Send the promotion" : "✖ Unlikely to respond"}</div>
                         <div class="small muted">Response probability ${pct(r.probability)}</div>
                         <ol class="steps">${r.path.map((s) => `<li>${s}</li>`).join("")}</ol>`;
const showAnn = (r) => `<div class="verdict">${pct(r.probability)} · ${r.label}</div>
                        <div class="meter lg"><div style="width:${r.probability * 100}%"></div></div>`;

const FORMS = {
  svmForm: {
    url: "/api/predict/svm", out: "svmResult",
    fields: [["age", "Age", 29], ["income", "Income ($)", 52000], ["tenure_months", "Months as customer", 14],
             ["past_purchases", "Past purchases", 6], ["sessions_per_month", "Visits / month", 9],
             ["cart_adds", "Cart adds", 3], ["days_since_last_visit", "Days since visit", 4]],
    show: showSvm,
  },
  treeForm: {
    url: "/api/predict/tree", out: "treeResult",
    fields: [["age", "Age", 26], ["income", "Income ($)", 32000], ["email_open_rate", "Email open rate (0–1)", 0.6],
             ["used_coupon_before", "Used coupon (0/1)", 1], ["days_since_last_visit", "Days since visit", 6],
             ["past_purchases", "Past purchases", 3], ["tenure_months", "Months as customer", 10]],
    show: showTree,
  },
  annForm: {
    url: "/api/predict/ann", out: "annResult",
    fields: [["sessions_per_month", "Visits / month", 8], ["avg_session_min", "Avg minutes / visit", 9],
             ["pages_per_session", "Pages / visit", 7], ["cart_adds", "Cart adds", 3],
             ["wishlist_items", "Wishlist items", 2], ["days_since_last_visit", "Days since visit", 3],
             ["past_purchases", "Past purchases", 4], ["email_open_rate", "Email open rate (0–1)", 0.4]],
    show: showAnn,
  },
};

function buildForms() {
  for (const [id, f] of Object.entries(FORMS)) {
    const form = $(id);
    if (!form) continue;
    form.innerHTML = f.fields.map(([k, label, v]) =>
      `<label>${label}<input type="number" step="any" name="${k}" value="${v}"></label>`).join("");
    form.addEventListener("submit", (e) => { e.preventDefault(); submitForm(id); });
  }
  document.querySelectorAll("button[data-form]").forEach((b) =>
    b.addEventListener("click", () => submitForm(b.dataset.form)));
}

async function submitForm(id) {
  const f = FORMS[id];
  const form = $(id);
  const out = f && $(f.out);
  if (!form || !out) return;
  const body = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, Number(v)]));
  out.innerHTML = f.show(await api(f.url, body));
}

function renderInsights(d) {
  if (!has("impChart", "treeRules", "annChart", "topTable")) return;
  const imp = d.tree.importances;
  draw("impChart", {
    type: "bar",
    data: { labels: imp.map((i) => i.feature.replaceAll("_", " ")),
            datasets: [{ label: "Importance", data: imp.map((i) => i.importance),
                         backgroundColor: css("--series-1"), borderRadius: 4, barThickness: 16 }] },
    options: { indexAxis: "y", scales: { x: { max: 1, ticks: { callback: (v) => pct(v) } }, y: { grid: { display: false } } },
               plugins: { tooltip: { callbacks: { label: (i) => `Importance ${pct(i.raw)}` } } } },
  });
  $("treeRules").textContent = d.tree.rules;

  const h = d.ann.histogram;
  draw("annChart", {
    type: "bar",
    data: { labels: h.map((b) => b.bucket),
            datasets: [{ label: "Customers", data: h.map((b) => b.count), backgroundColor: css("--series-1"),
                         borderColor: css("--surface"), borderWidth: { left: 1, right: 1 }, borderSkipped: false,
                         borderRadius: { topLeft: 4, topRight: 4 } }] },
    options: { scales: { x: { grid: { display: false }, title: { display: true, text: "Purchase probability" } },
                         y: { title: { display: true, text: "Customers" } } },
               plugins: { tooltip: { callbacks: { label: (i) => `${i.raw} customers` } } } },
  });

  $("topTable").innerHTML =
    `<tr><th>Customer</th><th>Age</th><th>Favorite category</th><th>ANN purchase prob.</th>
         <th>SVM says</th><th>Promo response prob.</th><th>Action</th></tr>` +
    d.top_customers.map((c) => `<tr><td>#${c.customer_id}</td><td>${c.age}</td><td>${c.favorite_category}</td>
      <td>${pct(c.ann_prob)}</td><td>${c.svm_purchase ? "Will buy" : "Won't buy"}</td><td>${pct(c.promo_prob)}</td>
      <td>${c.promo_prob >= 0.5 ? "Send promo" : "Recommend products"}</td></tr>`).join("");
}

function renderMetrics(m) {
  if (!has("metricTable")) return;
  const cols = ["accuracy", "precision", "recall", "f1", "roc_auc"];
  const purpose = {
    "Linear Regression": "Predict future product sales",
    "Naive Bayes": "Classify reviews positive / negative",
    "SVM": "Classify customers likely to purchase",
    "Decision Tree": "Customers who respond to a promotion",
    "ANN": "Purchase probability from behavior",
  };
  const fmt = (v) => (v === undefined ? "—" : v.toFixed(3));
  let html = `<tr><th>Model</th><th>Used for</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th><th>ROC-AUC</th></tr>`;
  for (const [name, s] of Object.entries(m)) {
    if (name === "Linear Regression") {
      html += `<tr><td><b>${name}</b></td><td>${purpose[name]}</td><td colspan="5">R² = ${s.avg_r2} · mean abs. error = ${s.avg_mae_units} units / month</td></tr>`;
    } else {
      html += `<tr><td><b>${name}</b></td><td>${purpose[name]}</td>${cols.map((c) => `<td>${fmt(s[c])}</td>`).join("")}</tr>`;
    }
  }
  html += `<tr><td><b>KNN</b></td><td>Recommend similar products</td><td colspan="5">Unsupervised neighbor search (k = 10, cosine) — see recommendations above</td></tr>`;
  $("metricTable").innerHTML = html;
}

// ---------- tool pages ----------
async function loadSalesForecast() {
  if (!has("sfProduct", "sfAdSpend", "sfSubmit", "sfChart", "sfStatus", "sfCoefficients")) return;
  const pid = $("sfProduct").value;
  if (!pid) return;
  const spend = $("sfAdSpend").value || "0";
  setBusy($("sfSubmit"), true, "Forecasting…", "Run forecast");
  setLoading("sfStatus", "Running regression forecast…");
  try {
    const f = await api(`/api/forecast/${pid}?ad_spend=${encodeURIComponent(spend)}`);
    if (f.error) throw new Error(f.error);
    const labels = [...f.history.map((h) => h.month), ...f.forecast.map((x) => x.month)];
    lineForecast("sfChart", labels, f.history.map((h) => h.units), f.forecast.map((x) => x.units),
      (v) => Math.round(v).toLocaleString());
    const c = f.coefficients;
    const signed = (v) => (Number(v) >= 0 ? "+" : "") + v;
    $("sfCoefficients").innerHTML = [
      `<span class="chip">Trend ${signed(c.t)} units / month</span>`,
      `<span class="chip">Holiday ${signed(c.holiday)} units</span>`,
      `<span class="chip">Mid-year ${signed(c.midyear)} units</span>`,
      `<span class="chip">Ads ${signed((c.ad_spend * 1000).toFixed(1))} units / $1,000</span>`,
    ].join("");
    const total = f.forecast.reduce((sum, x) => sum + x.units, 0);
    setMessage("sfStatus", `Forecast ready: ~${Math.round(total).toLocaleString()} units over ${f.forecast.length} months.`, "success");
  } catch (e) {
    setMessage("sfStatus", e.message || "Forecast failed.", "error");
  } finally {
    setBusy($("sfSubmit"), false, "Forecasting…", "Run forecast");
  }
}

async function initSalesForecast() {
  if (!has("sfForm", "sfProduct", "sfAdSpend", "sfSubmit", "sfChart", "sfStatus", "sfCoefficients")) return;
  $("sfForm").addEventListener("submit", (e) => { e.preventDefault(); loadSalesForecast(); });
  themeCharts();
  setLoading("sfStatus", "Loading products…");
  try {
    const data = await api("/api/dashboard");
    $("sfProduct").innerHTML = data.products.map((p) =>
      `<option value="${p.product_id}">${p.name} (${p.category})</option>`).join("");
    await loadSalesForecast();
  } catch (e) {
    setMessage("sfStatus", "Could not load products.", "error");
  }
}

async function classifyToolReview() {
  if (!has("sentText", "sentSubmit", "sentResult", "sentStatus")) return;
  const text = $("sentText").value.trim();
  if (!text) { setMessage("sentStatus", "Type a review first.", "error"); return; }
  setBusy($("sentSubmit"), true, "Classifying…", "Classify review");
  setLoading("sentStatus", "Scoring review text…");
  try {
    const r = await api("/api/review", { text });
    if (r.error) throw new Error(r.error);
    const good = r.label === "positive";
    const row = (label, value) => {
      const width = Math.max(0, Math.min(100, value * 100));
      return `<div class="prob-row"><span>${label}</span><div class="prob-track"><div class="prob-fill ${label === "negative" ? "negative" : ""}" style="width:${width}%"></div></div><span>${pct(value)}</span></div>`;
    };
    $("sentResult").innerHTML = `
      <div class="verdict ${good ? "yes" : "no"}">${good ? "Positive" : "Negative"} review</div>
      <div class="small muted">Confidence ${pct(r.confidence)}</div>
      <div class="prob-list">${row("positive", r.probabilities.positive)}${row("negative", r.probabilities.negative)}</div>`;
    setMessage("sentStatus", "Classification complete.", "success");
  } catch (e) {
    $("sentResult").innerHTML = "";
    setMessage("sentStatus", e.message || "Classification failed.", "error");
  } finally {
    setBusy($("sentSubmit"), false, "Classifying…", "Classify review");
  }
}

function initSentiment() {
  if (!has("sentForm", "sentText", "sentSubmit", "sentResult", "sentStatus")) return;
  $("sentForm").addEventListener("submit", (e) => { e.preventDefault(); classifyToolReview(); });
}

async function loadToolRecommendations() {
  if (!has("recCustomer", "recRated", "recRecommendations", "recNeighbors", "recStatus")) return;
  const cid = $("recCustomer").value;
  if (!cid) return;
  setLoading("recStatus", `Finding products for customer #${cid}…`);
  try {
    const r = await api(`/api/recommend/${cid}`);
    if (r.error) throw new Error(r.error);
    $("recRated").innerHTML = r.rated.map((p) =>
      `<span class="chip">${p.name} ${"★".repeat(p.rating)}</span>`).join("");
    $("recRecommendations").innerHTML = r.recommendations.map((p) =>
      productLine(p, `predicted rating ${p.score}`)).join("");
    $("recNeighbors").innerHTML = r.neighbors.map((n) =>
      `<span class="chip">#${n.customer_id} · ${(n.similarity * 100).toFixed(0)}% similar</span>`).join("");
    setMessage("recStatus", `Recommendations ready for customer #${cid}.`, "success");
  } catch (e) {
    setMessage("recStatus", e.message || "Recommendation failed.", "error");
  }
}

async function loadToolSimilar() {
  if (!has("recProduct", "recSimilar", "simStatus")) return;
  const pid = $("recProduct").value;
  if (!pid) return;
  setLoading("simStatus", "Finding similar products…");
  try {
    const s = await api(`/api/similar/${pid}`);
    if (s.error) throw new Error(s.error);
    $("recSimilar").innerHTML = s.map((p) =>
      productLine(p, `${(p.similarity * 100).toFixed(0)}% similar`)).join("");
    setMessage("simStatus", `${s.length} similar products found.`, "success");
  } catch (e) {
    setMessage("simStatus", e.message || "Similarity search failed.", "error");
  }
}

async function initRecommendations() {
  if (!has("recCustomer", "recProduct", "recRated", "recRecommendations", "recNeighbors",
           "recSimilar", "recStatus", "simStatus")) return;
  setLoading("recStatus", "Loading customers…");
  try {
    const data = await api("/api/dashboard");
    $("recCustomer").innerHTML = data.knn_customers.map((c) =>
      `<option value="${c}">Customer #${c}</option>`).join("");
    $("recProduct").innerHTML = data.products.map((p) =>
      `<option value="${p.product_id}">${p.name} (${p.category})</option>`).join("");
    $("recCustomer").addEventListener("change", loadToolRecommendations);
    $("recProduct").addEventListener("change", loadToolSimilar);
    await Promise.all([loadToolRecommendations(), loadToolSimilar()]);
  } catch (e) {
    setMessage("recStatus", "Could not load selectors.", "error");
  }
}

async function submitPredictionForm(formId, url, resultId, statusId, buttonId, idleLabel, render) {
  const form = $(formId);
  const result = $(resultId);
  if (!form || !result) return;
  const button = $(buttonId);
  const body = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, Number(v)]));
  setBusy(button, true, "Working…", idleLabel);
  setLoading(statusId, "Running model…");
  try {
    const r = await api(url, body);
    if (r.error) throw new Error(r.error);
    result.innerHTML = render(r);
    setMessage(statusId, "Prediction complete.", "success");
  } catch (e) {
    result.innerHTML = "";
    setMessage(statusId, e.message || "Prediction failed.", "error");
  } finally {
    setBusy(button, false, "Working…", idleLabel);
  }
}

function initPurchaseLikelihood() {
  if (!has("plForm", "plResult", "plStatus", "plSubmit")) return;
  $("plForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitPredictionForm("plForm", "/api/predict/svm", "plResult", "plStatus", "plSubmit", "Predict likelihood", showSvm);
  });
}

function initPromoResponse() {
  if (!has("prForm", "prResult", "prStatus", "prSubmit")) return;
  $("prForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitPredictionForm("prForm", "/api/predict/tree", "prResult", "prStatus", "prSubmit", "Predict response", showTree);
  });
}

function initPurchaseProbability() {
  if (!has("cpForm", "cpResult", "cpStatus", "cpSubmit")) return;
  $("cpForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitPredictionForm("cpForm", "/api/predict/ann", "cpResult", "cpStatus", "cpSubmit", "Predict probability", showAnn);
  });
}

// ---------- boot ----------
async function init() {
  if (!has("kpis", "revChart", "productSel", "spendRange", "spendVal",
           "customerSel", "simProductSel", "reviewBtn")) return;
  themeCharts();
  DATA = await api("/api/dashboard");
  renderHero(DATA.kpis, DATA.metrics);
  renderKpis(DATA.kpis, DATA.revenue);
  renderRevenue(DATA.revenue);
  renderReviews(DATA.reviews);
  renderInsights(DATA);
  renderMetrics(DATA.metrics);

  const opts = DATA.products.map((p) => `<option value="${p.product_id}">${p.name} (${p.category})</option>`).join("");
  $("productSel").innerHTML = opts;
  $("simProductSel").innerHTML = opts;
  $("customerSel").innerHTML = DATA.knn_customers.map((c) => `<option value="${c}">Customer #${c}</option>`).join("");

  $("productSel").addEventListener("change", loadForecast);
  $("spendRange").addEventListener("input", () => { $("spendVal").textContent = money($("spendRange").value); });
  $("spendRange").addEventListener("change", loadForecast);
  $("customerSel").addEventListener("change", loadRecs);
  $("simProductSel").addEventListener("change", loadSimilar);
  $("reviewBtn").addEventListener("click", classifyReview);
  buildForms();

  loadForecast(); loadRecs(); loadSimilar(); classifyReview();
  Object.keys(FORMS).forEach(submitForm);
}

init();
initSalesForecast();
initSentiment();
initRecommendations();
initPurchaseLikelihood();
initPromoResponse();
initPurchaseProbability();
