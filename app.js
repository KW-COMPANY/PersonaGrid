/**
 * ============================================================
 * PersonaGrid - 完全統合版 app.js
 * ============================================================
 */

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

document.addEventListener("DOMContentLoaded", () => {
  renderShareLadder();
  bindShareInput();
  bindForm();
  bindTabs();
  bindResultActions();
});

function getShareLevel(percent) {
  const p = parseFloat(percent) || 0;
  for (const level of SHARE_LEVELS) {
    if (p >= level.threshold) return level;
  }
  return { threshold: 0, name: "市場参入前", label: "参入準備", color: "#374151", description: "市場参入準備フェーズ" };
}

function getNextLevel(percent) {
  const p = parseFloat(percent) || 0;
  for (let i = SHARE_LEVELS.length - 1; i >= 0; i--) {
    if (p < SHARE_LEVELS[i].threshold) return SHARE_LEVELS[i];
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
      <div class="ladder-tag" style="background:${hexToRgba(level.color,0.12)};color:${level.color};border:1px solid ${hexToRgba(level.color,0.25)};">${level.label}</div>
    </div>
  `).join("");
}

function bindShareInput() {
  const input = document.getElementById("currentShare");
  const preview = document.getElementById("sharePreview");
  if (!input || !preview) return;
  input.addEventListener("input", () => {
    const val = parseFloat(input.value);
    if (isNaN(val)) { preview.innerHTML = ""; return; }
    const current = getShareLevel(val);
    const next = getNextLevel(val);
    const gap = next ? (next.threshold - val).toFixed(1) : 0;
    preview.innerHTML = `
      <span style="color:${current.color};font-weight:700;">▶ ${current.name}</span>
      ${next
        ? `<span style="color:#7a8ca8;margin-left:8px;font-size:0.78rem;">次レベルまで +${gap}%</span>`
        : `<span style="color:#f5c842;margin-left:8px;font-size:0.78rem;">👑 最高レベル</span>`
      }
    `;
  });
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
  try {
    hideError();
    hideResult();
    analyzeBtn.disabled = true;
    showLoading(true);
    const loadingInterval = animateLoadingSteps();

    const payload = {
      market: document.getElementById("industry")?.value?.trim() || "",
      share: document.getElementById("currentShare")?.value?.trim() || "",
      competitor: document.getElementById("competitors")?.value?.trim() || "",
      companyName: document.getElementById("companyName")?.value?.trim() || "",
      industry: document.getElementById("industry")?.value?.trim() || "",
      productService: document.getElementById("productService")?.value?.trim() || "",
      currentShare: document.getElementById("currentShare")?.value?.trim() || "",
      marketSize: document.getElementById("marketSize")?.value?.trim() || "",
      competitors: document.getElementById("competitors")?.value?.trim() || "",
      targetSegment: document.getElementById("targetSegment")?.value?.trim() || "",
      salesGoal: document.getElementById("salesGoal")?.value?.trim() || "",
    };

    if (!payload.industry) throw new Error("業界・業種を入力してください");
    if (!payload.currentShare) throw new Error("市場シェアを入力してください");

    // ✅ 修正: /analyze → /api/analyze
    const response = await fetch(`${WORKER_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    clearInterval(loadingInterval);
    completeLoadingSteps();

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    showLoading(false);
    renderResult(data);

  } catch (error) {
    showLoading(false);
    showError(`
      分析エラーが発生しました<br><br>
      ${error.message}<br><br>
      ・Cloudflare Workers が起動しているか確認してください<br>
      ・APIエンドポイントが正しいか確認してください<br>
      ・ブラウザのF12コンソールも確認してください
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
  steps.forEach(step => { step.classList.remove("active"); step.classList.add("done"); });
}

function renderResult(data) {
  const personaResult = document.getElementById("personaResult");
  const strategyResult = document.getElementById("strategyResult");

  const currentShare = parseFloat(
    data.meta?.currentShare ||
    data.currentShare ||
    document.getElementById("currentShare")?.value ||
    0
  );

  const currentLevel = getShareLevel(currentShare);
  const nextLevel = getNextLevel(currentShare);
  const gap = nextLevel ? (nextLevel.threshold - currentShare).toFixed(1) : 0;

  renderGauge(currentShare, currentLevel, nextLevel, gap);
  renderClassificationBadges(data);

  const aiClass = data.meta?.aiClassification || {};

  const personaHTML = `
    <h2>シェア分類</h2>
    <p>${data.meta?.currentLevel?.name || currentLevel.name}</p>
    <h2>ペルソナ提案</h2>
    <div>${markdownToHTML(data.persona || "データなし")}</div>
    <h2>セグメント提案</h2>
    <div>${markdownToHTML(data.segment || "")}</div>
  `;

  const strategyHTML = `
    <h2>営業戦略プラン</h2>
    <div>${markdownToHTML(data.strategy || "データなし")}</div>
  `;

  if (personaResult) personaResult.innerHTML = personaHTML;
  if (strategyResult) strategyResult.innerHTML = strategyHTML;

  const meta = document.getElementById("resultMeta");
  if (meta) {
    meta.innerHTML = `Generated: ${new Date().toLocaleString("ja-JP")} ｜ PersonaGrid AI Agent`;
  }

  showResult();
  setTimeout(() => {
    document.getElementById("resultSection")?.scrollIntoView({ behavior: "smooth" });
  }, 100);
}

function renderGauge(shareNum, currentLevel, nextLevel, shareGap) {
  const gaugeFill = document.getElementById("gaugeFill");
  const gaugeInfo = document.getElementById("gaugeInfo");

  // ✅ 修正: getElementById("gaugeBar") → querySelector(".gauge-bar")
  const gaugeBar = document.querySelector(".gauge-bar");

  if (!gaugeFill || !gaugeInfo || !gaugeBar) return;

  gaugeFill.style.width = `${Math.min(shareNum, 100)}%`;
  gaugeFill.style.background = `linear-gradient(90deg, ${hexToRgba(currentLevel.color, 0.5)}, ${currentLevel.color})`;

  // マーカー除去・再生成
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

  gaugeInfo.innerHTML = `
    <div class="gauge-stat">
      <span class="gauge-stat-label">現在シェア</span>
      <span class="gauge-stat-value" style="color:${currentLevel.color}">${shareNum}%</span>
      <span style="font-size:0.78rem;">${currentLevel.name}</span>
    </div>
    <div class="gauge-stat">
      <span class="gauge-stat-label">次の目標</span>
      ${nextLevel
        ? `<span class="gauge-stat-value" style="color:${nextLevel.color}">${nextLevel.name}</span><span style="font-size:0.78rem;">+${shareGap}%</span>`
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
      <span class="class-badge-key">${item.key}</span>
      <span class="class-badge-val">${item.value}</span>
    </div>
  `).join("");
}

function markdownToHTML(text) {
  return marked.parse(text || "");
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/gim, "<em>$1</em>")
    .replace(/^\> (.*$)/gim, "<blockquote>$1</blockquote>")
    .replace(/^\- (.*$)/gim, "<li>$1</li>")
    .replace(/<\/li>\n<li>/g, "</li><li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n$/gim, "<br>");
}

function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const tabName = btn.dataset.tab;
      const target = document.getElementById(tabName === "persona" ? "tabPersona" : "tabStrategy");
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
    const text = `【ペルソナ分析】\n${persona}\n\n【営業戦略】\n${strategy}`;
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
