// File: app.js
const WORKER_URL = "https://personagrid.gmo-k-watanabe.workers.dev";

const SHARE_LEVELS = [
  { threshold: 73.9, name: "独占シェア", label: "上限目標値", color: "#f5c842", description: "市場を事実上支配。圧倒的優位状態" },
  { threshold: 41.7, name: "相対的安定シェア", label: "安定目標値", color: "#00d4ff", description: "市場リーダーとして安定" },
  { threshold: 26.1, name: "差別的優位シェア", label: "下限目標値", color: "#a855f7", description: "差別化戦略が明確" },
  { threshold: 19.3, name: "並列的上位シェア", label: "上位目標値", color: "#22c55e", description: "上位プレイヤーとして存在" },
  { threshold: 10.9, name: "市場的影響シェア", label: "影響目標値", color: "#f59e0b", description: "市場への影響力を持つ" },
  { threshold: 6.8, name: "競合的存在シェア", label: "存在目標値", color: "#ef4444", description: "競合として認識される" },
  { threshold: 2.8, name: "市場橋頭堡シェア", label: "拠点目標値", color: "#64748b", description: "市場参入初期フェーズ" },
];

// 業界別 標準市場規模（億円）。フロント側プレビュー用の簡易テーブル。
const INDUSTRY_MARKET_SIZE = {
  "saas": 1.4,
  "人材": 9.0,
  "製造dx": 2.0,
  "製造": 320.0,
  "ec": 22.0,
  "小売": 150.0,
  "飲食": 25.0,
  "不動産": 48.0,
  "建設": 60.0,
  "医療": 45.0,
  "介護": 13.0,
  "物流": 30.0,
  "広告": 7.0,
  "金融": 90.0,
  "教育": 9.0,
  "it": 14.0,
  "コンサル": 7.0,
};

// 業界別市場規模（億円）を取得。
function lookupMarketSize(industry = "") {
  const key = String(industry).toLowerCase().replace(/\s+/g, "");
  for (const name in INDUSTRY_MARKET_SIZE) {
    if (key.includes(name)) {
      return INDUSTRY_MARKET_SIZE[name] * 10000; // 億円 → 万円
    }
  }
  return null;
}

// 年商（万円）と市場規模（万円）から推定シェア(%)を算出
function calcShareFromSales(annualSalesManyen, marketSizeManyen) {
  const sales = parseFloat(annualSalesManyen);
  const market = parseFloat(marketSizeManyen);
  if (!sales || !market || market <= 0) return null;
  const share = (sales / market) * 100;
  return Math.min(share, 100);
}

// クライアント側の事前チェック
const SENSITIVE_PATTERNS = [
  /株式会社/g,
  /有限会社/g,
  /合同会社/g,
  /\bInc\.?\b/gi,
  /\bLLC\b/g,
  /\bCorporation\b/gi,
  /\bCorp\.?\b/gi,
  /\bLtd\.?\b/gi,
  /https?:\/\//gi,
  /www\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/gi,
  /\d{2,4}-\d{2,4}-\d{3,4}/g,
  /\b\d{10,11}\b/g,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
];

document.addEventListener("DOMContentLoaded", () => {
  renderShareLadder();
  bindShareInput();
  bindSalesPresets();
  bindForm();
  bindTabs();
  bindResultActions();
  injectPrivacyNotice();
  restoreSharedResult();
});

function injectPrivacyNotice() {
  const formSection = document.querySelector(".form-section");
  if (!formSection) return;

  const existing = document.getElementById("privacyNotice");
  if (existing) return;

  const notice = document.createElement("div");
  notice.id = "privacyNotice";
  notice.innerHTML = `
    <div style="
      margin-bottom:24px;
      padding:16px 18px;
      border-radius:14px;
      border:1px solid rgba(245, 158, 11, 0.25);
      background:rgba(245, 158, 11, 0.08);
      color:#f5c842;
      font-size:0.84rem;
      line-height:1.7;
    ">
      ⚠️ 本ツールは匿名市場分析専用です。<br>
      実在企業名・ブランド名・個人名・メールアドレス・電話番号・URLなどの入力は禁止しています。<br>
      「外資系SaaS」「製造DX系」など匿名カテゴリで入力してください。
    </div>
  `;

  const title = formSection.querySelector(".section-title");
  if (title) {
    title.insertAdjacentElement("afterend", notice);
  }
}

function containsSensitiveInfo(text = "") {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(text));
}

function validateInputs(payload) {
  const targets = [
    payload.analysisCategory,
    payload.productService,
    payload.competitors,
    payload.targetSegment,
    payload.salesGoal,
  ];

  for (const text of targets) {
    if (containsSensitiveInfo(text || "")) {
      throw new Error(
        "企業名・個人情報・メールアドレス・URLなどの入力は禁止されています。匿名カテゴリのみ入力してください。"
      );
    }
  }
}

function sanitizeText(text = "") {
  return text
    .replace(/株式会社/g, "")
    .replace(/有限会社/g, "")
    .replace(/合同会社/g, "")
    .replace(/\bInc\.?\b/gi, "")
    .replace(/\bLLC\b/g, "")
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .trim();
}

function getShareLevel(percent) {
  const p = parseFloat(percent) || 0;
  for (const level of SHARE_LEVELS) {
    if (p >= level.threshold) return level;
  }
  return {
    threshold: 0,
    name: "市場参入前",
    label: "参入準備",
    color: "#374151",
    description: "市場参入準備フェーズ"
  };
}

function getNextLevel(percent) {
  const p = parseFloat(percent) || 0;
  for (let i = SHARE_LEVELS.length - 1; i >= 0; i--) {
    if (p < SHARE_LEVELS[i].threshold) {
      return SHARE_LEVELS[i];
    }
  }
  return null;
}

function formatManyen(manyen) {
  const v = parseFloat(manyen);
  if (isNaN(v)) return "—";
  if (v >= 10000) {
    const oku = v / 10000;
    return `${(Math.round(oku * 10) / 10).toLocaleString()}億円`;
  }
  return `${Math.round(v).toLocaleString()}万円`;
}

function renderShareLadder() {
  const container = document.getElementById("shareLadder");
  if (!container) return;

  container.innerHTML = SHARE_LEVELS.map(level => `
    <div class="ladder-item" style="border-left:4px solid ${level.color}">
      <div class="ladder-threshold" style="color:${level.color}">${level.threshold}%〜</div>
      <div class="ladder-info">
        <div class="ladder-name" style="color:${level.color}">${level.name}</div>
        <div class="ladder-desc">${level.description}</div>
      </div>
      <div
        class="ladder-tag"
        style="
          background:${hexToRgba(level.color,0.12)};
          color:${level.color};
          border:1px solid ${hexToRgba(level.color,0.25)};
        "
      >${level.label}</div>
    </div>
  `).join("");
}

// B-1: プリセットボタン
function bindSalesPresets() {
  const presets = document.getElementById("salesPresets");
  const salesInput = document.getElementById("annualSales");
  if (!presets || !salesInput) return;

  presets.querySelectorAll(".sales-preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      salesInput.value = btn.dataset.sales;
      salesInput.dispatchEvent(new Event("input", { bubbles: true }));
      presets.querySelectorAll(".sales-preset-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

// 入力からプレビュー用シェアを計算（市場規模ソースも返す）
function computePreviewShare() {
  const salesInput = document.getElementById("annualSales");
  const industryInput = document.getElementById("industry");
  const marketInput = document.getElementById("marketSize");

  const sales = parseFloat(salesInput?.value);
  if (isNaN(sales) || sales <= 0) return null;

  let marketManyen = null;
  let source = "";
  const manualMarket = parseFloat(marketInput?.value);
  if (!isNaN(manualMarket) && manualMarket > 0) {
    marketManyen = manualMarket * 10000;
    source = "manual";
  } else {
    marketManyen = lookupMarketSize(industryInput?.value || "");
    if (marketManyen) source = "kb";
  }

  if (!marketManyen) return { share: null, sales, marketManyen: null, source: "none" };

  const share = calcShareFromSales(sales, marketManyen);
  return { share, sales, marketManyen, source };
}

// B-2: リアルタイムゲージ + プレビューテキスト
function bindShareInput() {
  const salesInput = document.getElementById("annualSales");
  const industryInput = document.getElementById("industry");
  const marketInput = document.getElementById("marketSize");
  const preview = document.getElementById("sharePreview");
  if (!salesInput || !preview) return;

  const updatePreview = () => {
    const result = computePreviewShare();

    if (!result) {
      preview.innerHTML = "";
      hideLiveGauge();
      return;
    }

    if (result.share == null) {
      preview.innerHTML = `
        <span style="color:#7a8ca8;font-size:0.78rem;">
          市場規模が未特定です。任意欄に市場規模（億円）を入力すると立ち位置を即時プレビューできます。
        </span>
      `;
      hideLiveGauge();
      return;
    }

    const share = result.share;
    const current = getShareLevel(share);
    const next = getNextLevel(share);
    const gap = next ? (next.threshold - share).toFixed(1) : 0;

    preview.innerHTML = `
      <span style="color:${current.color};font-weight:700;">
        ▶ 推定シェア ${share.toFixed(1)}%（${current.name}）
      </span>
      ${
        next
          ? `<span style="color:#7a8ca8;margin-left:8px;font-size:0.78rem;">次レベルまで +${gap}%</span>`
          : `<span style="color:#f5c842;margin-left:8px;font-size:0.78rem;">👑 最高レベル</span>`
      }
    `;

    renderLiveGauge(share, current, next, gap);
  };

  salesInput.addEventListener("input", updatePreview);
  industryInput?.addEventListener("input", updatePreview);
  marketInput?.addEventListener("input", updatePreview);
}

// B-2: リアルタイムゲージ描画
function renderLiveGauge(share, current, next, gap) {
  const card = document.getElementById("liveGaugeCard");
  const fill = document.getElementById("liveGaugeFill");
  const info = document.getElementById("liveGaugeInfo");
  if (!card || !fill || !info) return;

  card.style.display = "block";
  fill.style.width = `${Math.min(share, 100)}%`;
  fill.style.background = `linear-gradient(90deg, ${hexToRgba(current.color, 0.5)}, ${current.color})`;

  info.innerHTML = `
    <span style="color:${current.color};font-weight:700;font-size:0.95rem;">
      推定シェア ${share.toFixed(1)}%
    </span>
    <span style="color:${current.color};font-size:0.8rem;margin-left:8px;">${current.name}</span>
    ${
      next
        ? `<span style="color:#7a8ca8;font-size:0.78rem;margin-left:10px;">次レベル ${next.name} まで +${gap}%</span>`
        : `<span style="color:#f5c842;font-size:0.78rem;margin-left:10px;">👑 最高レベル</span>`
    }
  `;
}

function hideLiveGauge() {
  const card = document.getElementById("liveGaugeCard");
  if (card) card.style.display = "none";
}

function bindForm() {
  const form = document.getElementById("analysisForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await runAnalysis();
  });
}

async function runAnalysis() {
  const analyzeBtn = document.getElementById("analyzeBtn");
  let loadingInterval = null;

  try {
    hideError();
    hideResult();

    analyzeBtn.disabled = true;
    showLoading(true);

    loadingInterval = animateLoadingSteps();

    const payload = {
      analysisCategory: sanitizeText(document.getElementById("analysisCategory")?.value?.trim() || ""),
      industry: sanitizeText(document.getElementById("industry")?.value?.trim() || ""),
      productService: sanitizeText(document.getElementById("productService")?.value?.trim() || ""),
      annualSales: sanitizeText(document.getElementById("annualSales")?.value?.trim() || ""),
      marketSize: sanitizeText(document.getElementById("marketSize")?.value?.trim() || ""),
      growthRate: sanitizeText(document.getElementById("growthRate")?.value?.trim() || ""),
      competitors: sanitizeText(document.getElementById("competitors")?.value?.trim() || ""),
      targetSegment: sanitizeText(document.getElementById("targetSegment")?.value?.trim() || ""),
      salesGoal: sanitizeText(document.getElementById("salesGoal")?.value?.trim() || ""),
    };

    validateInputs(payload);

    if (!payload.industry) {
      throw new Error("業界・業種を入力してください");
    }

    if (!payload.annualSales) {
      throw new Error("年商を入力してください");
    }

    const response = await fetch(`${WORKER_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (loadingInterval) clearInterval(loadingInterval);
    completeLoadingSteps();

    // レスポンス本文の安全なパース（JSON以外でも落ちないように）
    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (parseErr) {
      console.error("JSON parse error", parseErr, rawText);
      throw new Error("サーバー応答の解析に失敗しました。時間をおいて再試行してください。");
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    showLoading(false);
    renderResult(data);

  } catch (error) {
    if (loadingInterval) clearInterval(loadingInterval);
    showLoading(false);

    showError(`
      分析エラーが発生しました<br><br>
      ${error.message}<br><br>
      ・匿名カテゴリのみ入力してください<br>
      ・実在企業名や個人情報は禁止されています<br>
    `);

  } finally {
    analyzeBtn.disabled = false;
  }
}

function animateLoadingSteps() {
  const steps = document.querySelectorAll(".loading-step");
  let current = 0;

  steps.forEach(step => step.classList.remove("active", "done"));
  if (steps[0]) steps[0].classList.add("active");

  const interval = setInterval(() => {
    if (current < steps.length - 1) {
      steps[current].classList.remove("active");
      steps[current].classList.add("done");
      current++;
      steps[current].classList.add("active");
    }
  }, 2000);

  return interval;
}

function completeLoadingSteps() {
  const steps = document.querySelectorAll(".loading-step");
  steps.forEach(step => {
    step.classList.remove("active");
    step.classList.add("done");
  });
}

function renderResult(data) {
  const personaResult = document.getElementById("personaResult");
  const strategyResult = document.getElementById("strategyResult");

  const currentShare = parseFloat(
    data.meta?.currentShare ||
    data.currentShare ||
    0
  );

  const currentLevel = getShareLevel(currentShare);
  const nextLevel = getNextLevel(currentShare);
  const gap = nextLevel ? (nextLevel.threshold - currentShare).toFixed(1) : 0;

  // B-3: サマリーヒーロー
  renderSummaryHero(currentShare, currentLevel, nextLevel, gap, data);

  // A-3: やるべきことTOP3
  renderActionTop3(data);

  renderGauge(currentShare, currentLevel, nextLevel, gap, data);

  // A-1 / A-2: 目標年商逆算・業界内順位
  renderInsightRow(data, currentLevel, nextLevel);

  // A-5: 3年シミュレーション
  renderSimulation(data);

  // A-4: 匿名ベンチマーク
  renderBenchmark(data, currentShare);

  renderClassificationBadges(data);

  const pipeline = Array.isArray(data.meta?.agentPipeline)
    ? data.meta.agentPipeline
    : [];

  const pipelineHTML = pipeline.length
    ? `
      <h2>エージェント処理パイプライン</h2>
      <ul>
        ${pipeline.map(p => `<li>${escapeHtml(p)}</li>`).join("")}
      </ul>
    `
    : "";

  const externalPreview = data.meta?.externalKnowledgePreview
    ? `
      <h2>外部ナレッジ参照プレビュー</h2>
      <blockquote>${escapeHtml(data.meta.externalKnowledgePreview)}…</blockquote>
    `
    : "";

  // 年商・市場規模・推定シェアの算出根拠を表示
  const calcHTML = data.meta?.shareCalc
    ? `
      <h2>年商ベースの立ち位置算出</h2>
      <blockquote>
        年商: ${escapeHtml(String(data.meta.shareCalc.annualSales))}万円<br>
        参照市場規模: ${escapeHtml(String(data.meta.shareCalc.marketSize))}億円
        （${escapeHtml(data.meta.shareCalc.marketSizeSource)}）<br>
        推定シェア: <strong>${escapeHtml(String(data.meta.shareCalc.share))}%</strong>
      </blockquote>
    `
    : "";

  // [Closed Loop] 学習状況の可視化（何件の高評価から学習したか）
  const cl = data.meta?.closedLoop;
  const closedLoopHTML = cl
    ? `
      <h2>Closed Loop 学習状況</h2>
      <blockquote>
        この分析は同業界の蓄積データ <strong>${escapeHtml(String(cl.totalCasesInIndustry))}件</strong> を参照し、
        うち高評価 <strong>${escapeHtml(String(cl.learnedFromUpvoted))}件</strong> のパターンを優先学習しました。${
          cl.appliedLearningHint ? "<br>過去の低評価フィードバックを踏まえた改善も反映しています。" : ""
        }<br>
        <span style="font-size:0.78rem;color:#7a8ca8;">※ 結果へのフィードバックを送るほど、次回以降の精度が向上します。</span>
      </blockquote>
    `
    : "";

  const personaHTML = `
    <h2>シェア分類</h2>
    <p>${data.meta?.currentLevel?.name || currentLevel.name}</p>

    ${calcHTML}

    <h2>匿名市場ペルソナ分析</h2>
    <div>${markdownToHTML(data.persona || "データなし")}</div>

    <h2>推奨セグメント</h2>
    <div>${markdownToHTML(data.segment || "")}</div>

    ${externalPreview}
    ${closedLoopHTML}
    ${pipelineHTML}
  `;

  const strategyHTML = `
    <h2>匿名営業戦略プラン</h2>
    <div>${markdownToHTML(data.strategy || "データなし")}</div>
  `;

  if (personaResult) personaResult.innerHTML = personaHTML;
  if (strategyResult) strategyResult.innerHTML = strategyHTML;

  const meta = document.getElementById("resultMeta");
  if (meta) {
    const idNote = data.meta?.resultId
      ? `｜ ID: ${escapeHtml(data.meta.resultId)}`
      : "";
    meta.innerHTML = `
      Generated: ${new Date().toLocaleString("ja-JP")}
      ｜ PersonaGrid Anonymous AI Agent ${idNote}
    `;
  }

  // 共有用に結果IDを保持
  window.__lastResultId = data.meta?.resultId || "";

  // [Closed Loop] フィードバックUIを描画（Evaluateの入口）
  renderFeedback(data);

  showResult();

  setTimeout(() => {
    document.getElementById("resultSection")?.scrollIntoView({ behavior: "smooth" });
  }, 100);
}

// [Closed Loop] フィードバックUI描画
function renderFeedback(data) {
  let box = document.getElementById("feedbackCard");

  // index.html を変更しないため、コンテナが無ければ動的生成する
  if (!box) {
    const actions = document.querySelector("#resultSection .result-actions");
    if (!actions) return;
    box = document.createElement("div");
    box.id = "feedbackCard";
    box.className = "feedback-card";
    box.style.display = "none";
    actions.insertAdjacentElement("beforebegin", box);
  }

  const resultId = data.meta?.resultId || "";
  const existing = data.meta?.feedback;

  if (!resultId) {
    box.style.display = "none";
    return;
  }

  box.style.display = "block";

  if (existing && existing.rating) {
    const label = existing.rating === "up" ? "👍 役立った" : "👎 いまいち";
    box.innerHTML = `
      <div class="feedback-title">この分析へのフィードバック</div>
      <div class="feedback-done">✅ 評価済み：${escapeHtml(label)}${
        existing.comment ? `（${escapeHtml(existing.comment)}）` : ""
      }</div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="feedback-title">📝 この分析は役に立ちましたか？</div>
    <div class="feedback-sub">評価いただくと、同業界の次回分析の精度が継続的に向上します（Closed Loop）。</div>
    <div class="feedback-btns">
      <button type="button" class="feedback-btn" id="fbUp" data-rating="up">👍 役立った</button>
      <button type="button" class="feedback-btn" id="fbDown" data-rating="down">👎 いまいち</button>
    </div>
    <textarea
      id="feedbackComment"
      class="feedback-comment"
      placeholder="改善点・良かった点があれば匿名で記入（任意・企業名やURLは入力不可）"
      maxlength="500"
    ></textarea>
    <div class="feedback-status" id="feedbackStatus"></div>
  `;

  const upBtn = document.getElementById("fbUp");
  const downBtn = document.getElementById("fbDown");
  let selectedRating = null;

  const selectRating = (rating) => {
    selectedRating = rating;
    upBtn.classList.toggle("active", rating === "up");
    downBtn.classList.toggle("active", rating === "down");
    submitFeedback(resultId, selectedRating);
  };

  upBtn?.addEventListener("click", () => selectRating("up"));
  downBtn?.addEventListener("click", () => selectRating("down"));
}

// [Closed Loop] フィードバック送信
async function submitFeedback(resultId, rating) {
  const status = document.getElementById("feedbackStatus");
  const comment = document.getElementById("feedbackComment")?.value?.trim() || "";

  if (comment && containsSensitiveInfo(comment)) {
    if (status) {
      status.style.color = "#ff8f8f";
      status.textContent = "⚠️ コメントに企業名・個人情報・URL等は入力できません。";
    }
    return;
  }

  if (status) {
    status.style.color = "#7a8ca8";
    status.textContent = "送信中…";
  }

  try {
    const res = await fetch(`${WORKER_URL}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultId, rating, comment }),
    });

    const rawText = await res.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (e) {
      data = {};
    }

    if (res.ok && data.success) {
      if (status) {
        status.style.color = "#22c55e";
        status.textContent = "✅ フィードバックを反映しました。次回以降の分析精度に活用されます。";
      }
    } else {
      if (status) {
        status.style.color = "#ff8f8f";
        status.textContent = `⚠️ ${data.error || "送信に失敗しました。"}`;
      }
    }
  } catch (err) {
    if (status) {
      status.style.color = "#ff8f8f";
      status.textContent = "⚠️ 送信に失敗しました。時間をおいて再試行してください。";
    }
  }
}

// B-3: サマリーヒーロー描画
function renderSummaryHero(share, currentLevel, nextLevel, gap, data) {
  const hero = document.getElementById("summaryHero");
  if (!hero) return;

  const rankText = data.meta?.industryRank?.label || "—";

  hero.innerHTML = `
    <div class="summary-hero-item">
      <div class="summary-hero-key">推定市場シェア</div>
      <div class="summary-hero-val" style="color:${currentLevel.color}">${share}%</div>
    </div>
    <div class="summary-hero-divider"></div>
    <div class="summary-hero-item">
      <div class="summary-hero-key">シェア分類</div>
      <div class="summary-hero-val" style="color:${currentLevel.color};font-size:1.1rem;">${currentLevel.name}</div>
    </div>
    <div class="summary-hero-divider"></div>
    <div class="summary-hero-item">
      <div class="summary-hero-key">${nextLevel ? "次レベルまで" : "到達状態"}</div>
      <div class="summary-hero-val" style="color:${nextLevel ? nextLevel.color : "#f5c842"};font-size:1.3rem;">
        ${nextLevel ? "+" + gap + "%" : "👑 MAX"}
      </div>
    </div>
    <div class="summary-hero-divider"></div>
    <div class="summary-hero-item">
      <div class="summary-hero-key">業界内ポジション</div>
      <div class="summary-hero-val" style="font-size:1rem;">${escapeHtml(rankText)}</div>
    </div>
  `;
}

// A-3: やるべきことTOP3
function renderActionTop3(data) {
  const box = document.getElementById("actionTop3");
  if (!box) return;

  const actions = Array.isArray(data.meta?.actionTop3) ? data.meta.actionTop3 : [];
  if (!actions.length) {
    box.innerHTML = "";
    return;
  }

  box.innerHTML = `
    <div class="action-top3-title">📌 今すぐ着手すべきアクション TOP3</div>
    <div class="action-top3-grid">
      ${actions.map((a, i) => `
        <div class="action-top3-item">
          <div class="action-top3-num">${i + 1}</div>
          <div class="action-top3-text">${escapeHtml(a)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

// A-1 / A-2: 目標年商逆算・業界内順位
function renderInsightRow(data, currentLevel, nextLevel) {
  const row = document.getElementById("insightRow");
  if (!row) return;

  const calc = data.meta?.shareCalc || {};
  const rank = data.meta?.industryRank || {};

  const cards = [];

  // A-1: 次レベルまでの目標年商
  if (data.meta?.nextLevelTarget && nextLevel) {
    const t = data.meta.nextLevelTarget;
    cards.push(`
      <div class="insight-card">
        <div class="insight-card-label">次レベル「${escapeHtml(nextLevel.name)}」到達に必要な年商</div>
        <div class="insight-card-value" style="color:${nextLevel.color}">${escapeHtml(formatManyen(t.requiredSales))}</div>
        <div class="insight-card-sub">現在からあと <strong>${escapeHtml(formatManyen(t.salesGap))}</strong> の上積みが必要</div>
      </div>
    `);
  }

  // A-2: 業界内推定順位
  if (rank.label) {
    cards.push(`
      <div class="insight-card">
        <div class="insight-card-label">業界内 推定ポジション</div>
        <div class="insight-card-value" style="color:${currentLevel.color}">${escapeHtml(rank.label)}</div>
        <div class="insight-card-sub">${escapeHtml(rank.note || "")}</div>
      </div>
    `);
  }

  if (!cards.length) {
    row.innerHTML = "";
    return;
  }

  row.innerHTML = cards.join("");
}

// A-5: 3年シミュレーション
function renderSimulation(data) {
  const card = document.getElementById("simulationCard");
  if (!card) return;

  const sim = data.meta?.simulation;
  if (!sim || !Array.isArray(sim.years) || !sim.years.length) {
    card.style.display = "none";
    return;
  }

  card.style.display = "block";

  const rows = sim.years.map(y => {
    const lv = getShareLevel(y.share);
    return `
      <div class="sim-row">
        <div class="sim-row-year">${escapeHtml(String(y.label))}</div>
        <div class="sim-row-bar-wrap">
          <div class="sim-row-bar" style="width:${Math.min(y.share, 100)}%;background:linear-gradient(90deg,${hexToRgba(lv.color,0.5)},${lv.color});"></div>
        </div>
        <div class="sim-row-meta">
          <span style="color:${lv.color};font-weight:700;">${y.share}%</span>
          <span class="sim-row-level">${lv.name}</span>
          <span class="sim-row-sales">${escapeHtml(formatManyen(y.sales))}</span>
        </div>
      </div>
    `;
  }).join("");

  card.innerHTML = `
    <div class="sim-title">📈 3年後までのシェア成長シミュレーション</div>
    <div class="sim-note">想定年成長率 ${escapeHtml(String(sim.growthRate))}% で試算（市場規模は一定と仮定した簡易予測）</div>
    <div class="sim-body">${rows}</div>
  `;
}

// A-4: 匿名ベンチマーク
function renderBenchmark(data, currentShare) {
  const card = document.getElementById("benchmarkCard");
  if (!card) return;

  const bm = data.meta?.benchmark;
  if (!bm || bm.sampleCount == null || bm.sampleCount <= 0) {
    card.style.display = "none";
    return;
  }

  card.style.display = "block";

  const diff = (currentShare - bm.avgShare).toFixed(1);
  const isAbove = currentShare >= bm.avgShare;
  const diffColor = isAbove ? "#22c55e" : "#f59e0b";
  const diffText = isAbove
    ? `業界平均より <strong>+${diff}%</strong> 上位`
    : `業界平均より <strong>${diff}%</strong> 下位`;

  card.innerHTML = `
    <div class="benchmark-title">📊 匿名ベンチマーク（同業界分析データ）</div>
    <div class="benchmark-grid">
      <div class="benchmark-item">
        <div class="benchmark-key">あなたの推定シェア</div>
        <div class="benchmark-val" style="color:#00d4ff;">${currentShare}%</div>
      </div>
      <div class="benchmark-item">
        <div class="benchmark-key">業界内 匿名平均シェア</div>
        <div class="benchmark-val">${escapeHtml(String(bm.avgShare))}%</div>
      </div>
      <div class="benchmark-item">
        <div class="benchmark-key">比較サンプル数</div>
        <div class="benchmark-val">${escapeHtml(String(bm.sampleCount))}件</div>
      </div>
      <div class="benchmark-item">
        <div class="benchmark-key">相対評価</div>
        <div class="benchmark-val" style="color:${diffColor};font-size:0.95rem;">${diffText}</div>
      </div>
    </div>
    <div class="benchmark-note">※ 本ツールで匿名分析された同業界データの集計値です（個社特定不可）</div>
  `;
}

function renderGauge(shareNum, currentLevel, nextLevel, shareGap, data) {
  const gaugeFill = document.getElementById("gaugeFill");
  const gaugeInfo = document.getElementById("gaugeInfo");
  const gaugeBar = document.querySelector("#shareGaugeCard .gauge-bar");
  if (!gaugeFill || !gaugeInfo || !gaugeBar) return;

  gaugeFill.style.width = `${Math.min(shareNum, 100)}%`;
  gaugeFill.style.background = `
    linear-gradient(
      90deg,
      ${hexToRgba(currentLevel.color, 0.5)},
      ${currentLevel.color}
    )
  `;

  gaugeBar.querySelectorAll(".gauge-markers").forEach(el => el.remove());

  const markers = document.createElement("div");
  markers.className = "gauge-markers";

  SHARE_LEVELS.forEach(level => {
    const marker = document.createElement("div");
    marker.className = "gauge-marker";
    marker.style.left = `${level.threshold}%`;

    const label = document.createElement("span");
    label.className = "gauge-marker-label";
    label.style.left = `${level.threshold}%`;
    label.innerText = `${level.threshold}%`;

    markers.appendChild(marker);
    markers.appendChild(label);
  });

  gaugeBar.appendChild(markers);

  const salesLabel = data?.meta?.shareCalc?.annualSales
    ? `年商${data.meta.shareCalc.annualSales}万円`
    : "";

  gaugeInfo.innerHTML = `
    <div class="gauge-stat">
      <span class="gauge-stat-label">推定シェア${salesLabel ? "（" + salesLabel + "）" : ""}</span>
      <span class="gauge-stat-value" style="color:${currentLevel.color}">${shareNum}%</span>
      <span style="font-size:0.78rem;">${currentLevel.name}</span>
    </div>
    <div class="gauge-stat">
      <span class="gauge-stat-label">次の目標</span>
      ${
        nextLevel
          ? `
            <span class="gauge-stat-value" style="color:${nextLevel.color}">${nextLevel.name}</span>
            <span style="font-size:0.78rem;">+${shareGap}%</span>
          `
          : `<span class="gauge-stat-value" style="color:#f5c842">👑 MAX</span>`
      }
    </div>
  `;
}

function renderClassificationBadges(data) {
  const row = document.getElementById("classificationRow");
  if (!row) return;

  const aiClass = data.meta?.aiClassification || {};

  const badges = [
    { key: "業界", value: data.meta?.industry || aiClass.industryCategory || "未分類" },
    { key: "シェア分類", value: data.meta?.currentLevel?.name || "未分析" },
    { key: "競合レベル", value: aiClass.competitionLevel || "未設定" },
    { key: "成長フェーズ", value: aiClass.growthPhase || "未設定" },
  ];

  row.innerHTML = badges.map(item => `
    <div class="class-badge">
      <span class="class-badge-key">${escapeHtml(item.key)}</span>
      <span class="class-badge-val">${escapeHtml(item.value)}</span>
    </div>
  `).join("");
}

function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownToHTML(text) {
  try {
    const raw = marked.parse(text || "");
    if (window.DOMPurify) {
      return DOMPurify.sanitize(raw);
    }
    return raw;
  } catch (err) {
    console.error(err);
    return `<p>表示エラーが発生しました</p>`;
  }
}

function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");

      const tabName = btn.dataset.tab;
      const target = document.getElementById(
        tabName === "persona" ? "tabPersona" : "tabStrategy"
      );
      target?.classList.add("active");
    });
  });
}

function bindResultActions() {
  const copyBtn = document.getElementById("copyBtn");
  const resetBtn = document.getElementById("resetBtn");
  const printBtn = document.getElementById("printBtn");
  const shareBtn = document.getElementById("shareBtn");

  copyBtn?.addEventListener("click", async () => {
    const persona = document.getElementById("personaResult")?.innerText || "";
    const strategy = document.getElementById("strategyResult")?.innerText || "";

    const text = `
【匿名市場ペルソナ分析】
${persona}

【匿名営業戦略】
${strategy}
`;

    try {
      await navigator.clipboard.writeText(text);
      const original = copyBtn.innerHTML;
      copyBtn.innerHTML = "✅ コピー完了";
      setTimeout(() => { copyBtn.innerHTML = original; }, 2000);
    } catch {
      alert("コピーに失敗しました");
    }
  });

  // B-5: 印刷 / PDF保存
  printBtn?.addEventListener("click", () => {
    window.print();
  });

  // B-6: 共有リンク発行
  shareBtn?.addEventListener("click", async () => {
    const id = window.__lastResultId;
    if (!id) {
      alert("共有リンクを発行できる結果がありません。再分析してください。");
      return;
    }
    const shareUrl = `${location.origin}${location.pathname}?result=${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      const original = shareBtn.innerHTML;
      shareBtn.innerHTML = "✅ リンクをコピー（30日間有効）";
      setTimeout(() => { shareBtn.innerHTML = original; }, 2500);
    } catch {
      prompt("以下のリンクをコピーしてください（30日間有効です）", shareUrl);
    }
  });

  resetBtn?.addEventListener("click", () => {
    document.getElementById("analysisForm")?.reset();
    hideResult();
    hideError();
    hideLiveGauge();
    document.getElementById("sharePreview").innerHTML = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// B-6: 共有URLからの結果復元
async function restoreSharedResult() {
  const params = new URLSearchParams(location.search);
  const id = params.get("result");
  if (!id) return;

  try {
    showLoading(true);
    const res = await fetch(`${WORKER_URL}/api/result/${encodeURIComponent(id)}`);
    const rawText = await res.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (e) {
      data = {};
    }
    showLoading(false);

    if (res.ok && data.success) {
      renderResult(data);
    } else {
      showError("共有された分析結果が見つかりませんでした（有効期限切れの可能性があります）。");
    }
  } catch (err) {
    showLoading(false);
    showError("共有結果の読み込みに失敗しました。");
  }
}

function showLoading(show) {
  const section = document.getElementById("loadingSection");
  if (section) section.style.display = show ? "block" : "none";
}

function showResult() {
  const section = document.getElementById("resultSection");
  if (section) section.style.display = "block";
}

function hideResult() {
  const section = document.getElementById("resultSection");
  if (section) section.style.display = "none";
}

function showError(html) {
  const banner = document.getElementById("errorBanner");
  if (!banner) return;

  banner.innerHTML = `
    ⚠️ ${html}
    <div style="margin-top:6px;">
      <button type="button" class="btn-retry" id="errorRetryBtn">🔄 再試行する</button>
    </div>
  `;
  banner.style.display = "block";
  banner.scrollIntoView({ behavior: "smooth", block: "center" });

  const retryBtn = document.getElementById("errorRetryBtn");
  retryBtn?.addEventListener("click", () => {
    hideError();
    document.getElementById("analyzeBtn")?.click();
  });
}

function hideError() {
  const banner = document.getElementById("errorBanner");
  if (banner) banner.style.display = "none";
}

function hexToRgba(hex, alpha = 1) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
