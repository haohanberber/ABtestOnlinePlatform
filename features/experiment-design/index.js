import { inverseNormalCdf, pct, setResult } from "../common/stats.js";

function handleDesignSubmit(event) {
  event.preventDefault();

  const baseline = Number(document.getElementById("baseline-rate").value) / 100;
  const expected = Number(document.getElementById("expected-rate").value) / 100;
  const alpha = Number(document.getElementById("alpha").value);
  const isTwoSided = document.getElementById("two-sided-test").checked;
  const power = Number(document.getElementById("power").value);
  const controlToTreatmentRatio = Number(document.getElementById("group-ratio").value);
  const result = document.getElementById("design-result");

  if (
    baseline <= 0 ||
    baseline >= 1 ||
    expected <= 0 ||
    expected >= 1 ||
    alpha <= 0 ||
    alpha >= 1 ||
    power <= 0 ||
    power >= 1 ||
    controlToTreatmentRatio <= 0
  ) {
    setResult(result, "参数非法：请确认转化率、显著性水平、功效与组间比例均在合理范围。", "warn");
    return;
  }

  if (expected === baseline) {
    setResult(result, "期望转化率与基准转化率相同，效果量为0，无法估算最小样本量。", "warn");
    return;
  }

  const p1 = baseline;
  const p2 = expected;
  const effectAbs = p2 - p1;
  const effectAbsPctPoint = effectAbs * 100;
  const effectRel = effectAbs / p1;
  const effectH = 2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p2));

  const pBar = (controlToTreatmentRatio * p1 + p2) / (controlToTreatmentRatio + 1);
  const zAlpha = inverseNormalCdf(isTwoSided ? 1 - alpha / 2 : 1 - alpha);
  const zBeta = inverseNormalCdf(power);
  const numerator = Math.pow(
    zAlpha * Math.sqrt(pBar * (1 - pBar) * (1 + controlToTreatmentRatio)) +
      zBeta * Math.sqrt(p1 * (1 - p1) + controlToTreatmentRatio * p2 * (1 - p2)),
    2
  );
  const denominator = Math.pow(Math.abs(effectAbs), 2);
  const minControlSample = Math.ceil(numerator / denominator);
  const minTreatmentSample = Math.ceil(minControlSample / controlToTreatmentRatio);
  const totalSampleNeeded = minControlSample + minTreatmentSample;
  const minSamplePerGroup = Math.ceil(Math.max(minControlSample, minTreatmentSample));
  const trendText = effectAbs >= 0 ? "提升" : "下降";
  const relPrefix = effectRel >= 0 ? "+" : "";
  const testTypeText = isTwoSided ? "双侧检验" : "单侧检验";

  const msg = [
    `效果量（绝对差，${trendText}）：${effectAbsPctPoint.toFixed(2)} 个百分点`,
    `效果量（相对变化）：${relPrefix}${(effectRel * 100).toFixed(2)}%`,
    `效果量（Cohen's h，statsmodels口径）：${effectH.toFixed(4)}`,
    `最小样本量：控制组 ${minControlSample.toLocaleString()} 人，处理组 ${minTreatmentSample.toLocaleString()} 人`,
    `最小总样本量：${totalSampleNeeded.toLocaleString()} 人`,
    `参数：基准=${pct(p1)}，期望=${pct(p2)}，alpha=${alpha}，power=${power}，Control:Treatment=${controlToTreatmentRatio}:1，${testTypeText}`,
    "说明：该估算基于两比例检验的正态近似，并根据单侧/双侧设置调整临界值。"
  ].join("\n");

  setResult(result, msg, "success");
  document.dispatchEvent(
    new CustomEvent("ab-design-ready", {
      detail: {
        alpha,
        minControlSample,
        minTreatmentSample,
        minSamplePerGroup
      }
    })
  );
}

function syncTestTypeText() {
  const checkbox = document.getElementById("two-sided-test");
  const text = document.getElementById("test-type-text");
  text.textContent = checkbox.checked ? "双侧检验" : "单侧检验";
}

export function initExperimentDesign() {
  document.getElementById("design-form").addEventListener("submit", handleDesignSubmit);
  document.getElementById("two-sided-test").addEventListener("change", syncTestTypeText);
  syncTestTypeText();
}
