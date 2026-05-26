const analyzeBtn = document.getElementById("analyzeBtn");

analyzeBtn.addEventListener("click", async () => {

  const market = document.getElementById("market").value;
  const share = document.getElementById("share").value;
  const competitor = document.getElementById("competitor").value;

  const output = document.getElementById("output");

  output.innerHTML = "分析中...";

  try {

    const response = await fetch("https://personagrid.gmo-k-watanabe.workers.dev/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        market,
        share,
        competitor
      })
    });

    const data = await response.json();

    output.innerHTML = `
      <h3>シェア分類</h3>
      ${data.shareType}

      <h3>ペルソナ提案</h3>
      ${data.persona}

      <h3>セグメント提案</h3>
      ${data.segment}

      <h3>営業提案</h3>
      ${data.strategy}
    `;

  } catch (error) {

    output.innerHTML = "エラーが発生しました";

  }

});
