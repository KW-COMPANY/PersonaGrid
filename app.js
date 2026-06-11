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
// Worker側にも同等の正式テーブルを保持しており、最終算出はWorker側が正となる。
const INDUSTRY_MARKET_SIZE = {
  "saas": 1.4,
  "人材": 9.0,
  "製造": 320.0,
  "製造dx": 2.0,
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

// 業界別市場規模（億円）を取得。万円換算用に「億円」で返す。
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

// クライアント側の事前チェック（厳格すぎる検出を緩和）
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
  bindForm();
  bindTabs();
  bindResultActions();
  injectPrivacyNotice();
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

// 年商入力に応じて推定シェアをプレビュー表示
function bindShareInput() {
  const salesInput = document.getElementById("annualSales");
  const industryInput = document.getElementById("industry");
  const marketInput = document.getElementById("marketSize");
  const preview = document.getElementById("sharePreview");
  if (!salesInput || !preview) return;

  const updatePreview = () => {
    const sales = parseFloat(salesInput.value);
    if (isNaN(sales) || sales <= 0) {
      preview.innerHTML = "";
      return;
    }

    // 市場規模の決定：任意入力（億円→万円換算）優先、なければ業界テーブル参照
    let marketManyen = null;
    const manualMarket = parseFloat(marketInput?.value);
    if (!isNaN(manualMarket) && manualMarket > 0) {
      marketManyen = manualMarket * 10000; // 億円 → 万円
    } else {
      marketManyen = lookupMarketSize(industryInput?.value || "");
    }

    if (!marketManyen) {
      preview.innerHTML = `
        <span style="color:#7a8ca8;font-size:0.78rem;">
          市場規模が未特定です。任意欄に市場規模（億円）を入力すると立ち位置を即時プレビューできます。
        </span>
      `;
      return;
    }

    const share = calcShareFromSales(sales, marketManyen);
    if (share == null) {
      preview.innerHTML = "";
      return;
    }

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
  };

  salesInput.addEventListener("input", updatePreview);
  industryInput?.addEventListener("input", updatePreview);
  marketInput?.addEventListener("input", updatePreview);
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
  }, 2500);

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

  // シェアはWorker側で年商から算出された値を最優先
  const currentShare = parseFloat(
    data.meta?.currentShare ||
    data.currentShare ||
    0
  );

  const currentLevel = getShareLevel(currentShare);
  const nextLevel = getNextLevel(currentShare);
  const gap = nextLevel ? (nextLevel.threshold - currentShare).toFixed(1) : 0;

  renderGauge(currentShare, currentLevel, nextLevel, gap, data);
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

  const personaHTML = `
    <h2>シェア分類</h2>
    <p>${data.meta?.currentLevel?.name || currentLevel.name}</p>

    ${calcHTML}

    <h2>匿名市場ペルソナ分析</h2>
    <div>${markdownToHTML(data.persona || "データなし")}</div>

    <h2>推奨セグメント</h2>
    <div>${markdownToHTML(data.segment || "")}</div>

    ${externalPreview}
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
    meta.innerHTML = `
      Generated: ${new Date().toLocaleString("ja-JP")}
      ｜ PersonaGrid Anonymous AI Agent
    `;
  }

  showResult();

  setTimeout(() => {
    document.getElementById("resultSection")?.scrollIntoView({ behavior: "smooth" });
  }, 100);
}

function renderGauge(shareNum, currentLevel, nextLevel, shareGap, data) {
  const gaugeFill = document.getElementById("gaugeFill");
  const gaugeInfo = document.getElementById("gaugeInfo");
  const gaugeBar = document.querySelector(".gauge-bar");
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

  resetBtn?.addEventListener("click", () => {
    document.getElementById("analysisForm")?.reset();
    hideResult();
    hideError();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
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

  banner.innerHTML = `⚠️ ${html}`;
  banner.style.display = "block";
  banner.scrollIntoView({ behavior: "smooth", block: "center" });
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
