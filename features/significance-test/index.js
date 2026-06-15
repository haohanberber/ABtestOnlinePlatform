import { inverseNormalCdf, normalCdf, pct, pctWithPrecision, setResult } from "../common/stats.js";

const ABTEST_CASE = {
  caseName: "abtest",
  alpha: 0.05,
  rows: [
    { group: "control-old_page", visitors: 145274, conversions: 17489 },
    { group: "treatment-new_page", visitors: 145310, conversions: 17264 }
  ]
};

function buildCaseData(caseConfig) {
  const control = caseConfig.rows.find((row) => row.group === "control-old_page");
  const treatment = caseConfig.rows.find((row) => row.group === "treatment-new_page");
  if (!control || !treatment) {
    throw new Error("abtest案例配置缺少control或treatment数据。");
  }
  return {
    caseName: caseConfig.caseName,
    alpha: caseConfig.alpha,
    controlVisitors: control.visitors,
    controlConversions: control.conversions,
    treatmentVisitors: treatment.visitors,
    treatmentConversions: treatment.conversions
  };
}

const CASE_DATA = buildCaseData(ABTEST_CASE);

function createSeededRng(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return function nextRandom() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function sampleTrueCount(values, sampleSize, rng) {
  const copied = values.slice();
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copied[i];
    copied[i] = copied[j];
    copied[j] = tmp;
  }
  return copied.slice(0, sampleSize).filter(Boolean).length;
}

const state = {
  design: null,
  resultDataset: null,
  samplingMode: "full"
};

function setSigParamHint(text) {
  const hint = document.getElementById("sig-param-hint");
  if (hint) hint.textContent = text;
}

function setSigInputs(controlVisitors, controlConversions, treatmentVisitors, treatmentConversions) {
  document.getElementById("visitors-a").value = String(controlVisitors);
  document.getElementById("conversions-a").value = String(controlConversions);
  document.getElementById("visitors-b").value = String(treatmentVisitors);
  document.getElementById("conversions-b").value = String(treatmentConversions);
}

function syncSamplingUi() {
  const button = document.getElementById("sampling-mode-btn");
  const sampleSizeInput = document.getElementById("sample-size-per-group");
  const sampleSeedInput = document.getElementById("sample-seed");
  const sampleSizeLabel = sampleSizeInput ? sampleSizeInput.closest("label") : null;
  const sampleSeedLabel = sampleSeedInput ? sampleSeedInput.closest("label") : null;
  const isSampling = state.samplingMode === "sample";
  if (button) {
    button.textContent = isSampling ? "是否抽样：是（抽样）" : "是否抽样：否（全量）";
  }
  if (sampleSizeLabel) {
    sampleSizeLabel.classList.toggle("hidden", !isSampling);
  }
  if (sampleSeedLabel) {
    sampleSeedLabel.classList.toggle("hidden", !isSampling);
  }
  if (sampleSizeInput && state.design) {
    sampleSizeInput.min = String(state.design.minSamplePerGroup);
  }
}

function tryGenerateSigInputs(showWarn) {
  const result = document.getElementById("sig-result");
  const sampleSizeInput = document.getElementById("sample-size-per-group");
  const sampleSeedInput = document.getElementById("sample-seed");

  if (!state.design) {
    setSigParamHint("请先在实验设计助手点击“设置完成”，再生成A/B检验参数。");
    return false;
  }
  if (!state.resultDataset) {
    setSigParamHint("请先上传可识别分组与转化列的结果数据集，再生成A/B检验参数。");
    return false;
  }

  if (state.samplingMode === "full") {
    setSigInputs(
      state.resultDataset.controlVisitors,
      state.resultDataset.controlConversions,
      state.resultDataset.treatmentVisitors,
      state.resultDataset.treatmentConversions
    );
    setSigParamHint("已基于全量结果数据集自动生成A/B检验参数。");
    return true;
  }

  if (state.resultDataset.sourceType !== "row-level") {
    const msg = "当前结果数据集为汇总数据，无法执行抽样，请切换为全量检验。";
    setSigParamHint(msg);
    if (showWarn) setResult(result, msg, "warn");
    return false;
  }

  const requiredMin = state.design.minSamplePerGroup;
  const sampleSize = Number(sampleSizeInput && sampleSizeInput.value);
  const sampleSeed = Number(sampleSeedInput && sampleSeedInput.value);
  if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
    const msg = "抽样模式下请填写每组抽样数量（正整数）。";
    setSigParamHint(msg);
    if (showWarn) setResult(result, msg, "warn");
    return false;
  }
  if (!Number.isInteger(sampleSeed)) {
    const msg = "抽样模式下请填写整数类型的抽样 Seed。";
    setSigParamHint(msg);
    if (showWarn) setResult(result, msg, "warn");
    return false;
  }
  if (sampleSize < requiredMin) {
    const msg = `每组抽样数量不得低于实验设计助手计算的最小样本量（向上取整）： ${requiredMin}。`;
    setSigParamHint(msg);
    if (showWarn) setResult(result, msg, "warn");
    return false;
  }
  if (sampleSize > state.resultDataset.controlVisitors || sampleSize > state.resultDataset.treatmentVisitors) {
    const msg = "抽样数量超过数据集中某一组的可用样本数，请调小后重试。";
    setSigParamHint(msg);
    if (showWarn) setResult(result, msg, "warn");
    return false;
  }

  const controlRng = createSeededRng(sampleSeed);
  const treatmentRng = createSeededRng(sampleSeed + 1);
  const controlConversions = sampleTrueCount(state.resultDataset.controlFlags, sampleSize, controlRng);
  const treatmentConversions = sampleTrueCount(state.resultDataset.treatmentFlags, sampleSize, treatmentRng);
  setSigInputs(sampleSize, controlConversions, sampleSize, treatmentConversions);
  setSigParamHint(`已基于抽样数据自动生成A/B检验参数（每组 ${sampleSize}，Seed=${sampleSeed}）。`);
  return true;
}

function handleSignificanceSubmit(event) {
  event.preventDefault();

  const hasAnyEmpty =
    !String(document.getElementById("visitors-a").value).trim() ||
    !String(document.getElementById("conversions-a").value).trim() ||
    !String(document.getElementById("visitors-b").value).trim() ||
    !String(document.getElementById("conversions-b").value).trim();
  if (hasAnyEmpty) {
    tryGenerateSigInputs(false);
  }

  const nA = Number(document.getElementById("visitors-a").value);
  const xA = Number(document.getElementById("conversions-a").value);
  const nB = Number(document.getElementById("visitors-b").value);
  const xB = Number(document.getElementById("conversions-b").value);
  const alpha = state.design ? Number(state.design.alpha) : NaN;
  const result = document.getElementById("sig-result");
  const isCaseData =
    nA === CASE_DATA.controlVisitors &&
    xA === CASE_DATA.controlConversions &&
    nB === CASE_DATA.treatmentVisitors &&
    xB === CASE_DATA.treatmentConversions;

  if (!Number.isFinite(alpha)) {
    setResult(result, "请先在实验设计助手点击“设置完成”，显著性水平 α 将沿用实验设计助手参数。", "warn");
    return;
  }

  if (nA <= 0 || nB <= 0 || xA < 0 || xB < 0 || xA > nA || xB > nB || alpha <= 0 || alpha >= 1) {
    setResult(result, "参数非法：请确认访问与转化人数关系正确，且实验设计助手中的 alpha 在(0,1)之间。", "warn");
    return;
  }

  const pA = xA / nA;
  const pB = xB / nB;
  const diff = pB - pA;

  const pooled = (xA + xB) / (nA + nB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));

  if (!Number.isFinite(se) || se === 0) {
    setResult(result, "标准误差为0，无法完成检验。请检查输入数据是否合理。", "warn");
    return;
  }

  const z = diff / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  const zCritical = inverseNormalCdf(1 - alpha / 2);
  const z95 = inverseNormalCdf(0.975);
  const ciSe = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
  const ciLower = diff - zCritical * ciSe;
  const ciUpper = diff + zCritical * ciSe;
  const ciALower95 = pA - z95 * Math.sqrt((pA * (1 - pA)) / nA);
  const ciAUpper95 = pA + z95 * Math.sqrt((pA * (1 - pA)) / nA);
  const ciBLower95 = pB - z95 * Math.sqrt((pB * (1 - pB)) / nB);
  const ciBUpper95 = pB + z95 * Math.sqrt((pB * (1 - pB)) / nB);
  const significant = pValue < alpha;

  const tone = significant ? "success" : "warn";
  const verdict = significant ? "差异达到统计显著，可认为改动存在真实效果。" : "差异未达统计显著，可能由随机波动造成。";

  const msgLines = [
    `A组转化率：${pct(pA)}，B组转化率：${pct(pB)}`,
    `绝对提升：${pct(diff)}（B - A）`,
    `Z统计量：${z.toFixed(6)}，P值：${pValue.toFixed(6)}`,
    `控制组95%置信区间：${pctWithPrecision(ciALower95)} ~ ${pctWithPrecision(ciAUpper95)}`,
    `实验组95%置信区间：${pctWithPrecision(ciBLower95)} ~ ${pctWithPrecision(ciBUpper95)}`,
    `${(1 - alpha) * 100}% 置信区间：${pct(ciLower)} ~ ${pct(ciUpper)}`,
    `结论：${verdict}`
  ];

  if (isCaseData) {
    msgLines.push("案例说明：已载入 abtest 案例（仅保留 control-old_page / treatment-new_page，并按 user_id 去重后汇总）。");
  }

  setResult(result, msgLines.join("\n"), tone);
}

function loadCaseDataAndRun() {
  document.getElementById("visitors-a").value = CASE_DATA.controlVisitors;
  document.getElementById("conversions-a").value = CASE_DATA.controlConversions;
  document.getElementById("visitors-b").value = CASE_DATA.treatmentVisitors;
  document.getElementById("conversions-b").value = CASE_DATA.treatmentConversions;
  setSigParamHint("已载入 abtest 案例数据。");
  document.getElementById("sig-form").requestSubmit();
}

export function initSignificanceTest() {
  const visitorsA = document.getElementById("visitors-a");
  const conversionsA = document.getElementById("conversions-a");
  const visitorsB = document.getElementById("visitors-b");
  const conversionsB = document.getElementById("conversions-b");
  const sampleSizeInput = document.getElementById("sample-size-per-group");
  const sampleSeedInput = document.getElementById("sample-seed");
  const samplingModeButton = document.getElementById("sampling-mode-btn");

  visitorsA.value = "";
  conversionsA.value = "";
  visitorsB.value = "";
  conversionsB.value = "";
  if (sampleSizeInput) sampleSizeInput.value = "";
  if (sampleSeedInput && !sampleSeedInput.value) sampleSeedInput.value = "233";
  setSigParamHint("请先上传结果数据集并在实验设计助手点击“设置完成”，再生成A/B检验参数。");
  syncSamplingUi();

  document.getElementById("sig-form").addEventListener("submit", handleSignificanceSubmit);
  document.getElementById("load-case-data").addEventListener("click", loadCaseDataAndRun);
  document.addEventListener("ab-design-ready", (event) => {
    state.design = event.detail || null;
    syncSamplingUi();
    if (
      sampleSizeInput &&
      state.samplingMode === "sample" &&
      state.design &&
      (!sampleSizeInput.value || Number(sampleSizeInput.value) < state.design.minSamplePerGroup)
    ) {
      sampleSizeInput.value = String(state.design.minSamplePerGroup);
    }
    tryGenerateSigInputs(false);
  });
  document.addEventListener("ab-result-dataset-ready", (event) => {
    state.resultDataset = event.detail || null;
    tryGenerateSigInputs(false);
  });
  document.addEventListener("ab-result-dataset-invalid", () => {
    state.resultDataset = null;
  });
  if (samplingModeButton) {
    samplingModeButton.addEventListener("click", () => {
      state.samplingMode = state.samplingMode === "full" ? "sample" : "full";
      syncSamplingUi();
      if (state.samplingMode === "sample" && sampleSizeInput && state.design && !sampleSizeInput.value) {
        sampleSizeInput.value = String(state.design.minSamplePerGroup);
      }
      tryGenerateSigInputs(false);
    });
  }
  if (sampleSizeInput) {
    sampleSizeInput.addEventListener("change", () => {
      if (state.samplingMode === "sample") tryGenerateSigInputs(false);
    });
  }
  if (sampleSeedInput) {
    sampleSeedInput.addEventListener("change", () => {
      if (state.samplingMode === "sample") tryGenerateSigInputs(false);
    });
  }
}
