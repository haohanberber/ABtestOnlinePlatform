(function () {
  function erf(x) {
    const sign = x >= 0 ? 1 : -1;
    const absX = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1 / (1 + p * absX);
    const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
    return sign * y;
  }

  function normalCdf(x) {
    return 0.5 * (1 + erf(x / Math.sqrt(2)));
  }

  function inverseNormalCdf(p) {
    if (p <= 0 || p >= 1) {
      throw new Error("概率p必须在(0, 1)之间");
    }

    const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    const plow = 0.02425;
    const phigh = 1 - plow;

    let q;
    let r;

    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }

    if (p > phigh) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }

    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function pct(v) {
    return (v * 100).toFixed(2) + "%";
  }

  function pctWithPrecision(v, digits) {
    return (v * 100).toFixed(digits || 4) + "%";
  }

  function setResult(element, text, tone) {
    element.textContent = text;
    element.classList.remove("success", "warn", "muted");
    if (tone) {
      element.classList.add(tone);
    }
  }

  function parseDelimitedLine(line, delimiter) {
    const cells = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === "\"") {
        if (inQuotes && next === "\"") {
          current += "\"";
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === delimiter && !inQuotes) {
        cells.push(current);
        current = "";
        continue;
      }

      current += ch;
    }

    cells.push(current);
    return cells;
  }

  function detectDelimiter(rawText) {
    const firstLine = rawText
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0);

    if (!firstLine) {
      return null;
    }

    const candidates = [",", "\t", ";", "|"];
    let bestDelimiter = null;
    let bestCount = 0;

    candidates.forEach((delimiter) => {
      const count = parseDelimitedLine(firstLine, delimiter).length;
      if (count > bestCount) {
        bestCount = count;
        bestDelimiter = delimiter;
      }
    });

    return bestCount > 1 ? bestDelimiter : null;
  }

  function parseDelimitedText(rawText, delimiter) {
    return rawText
      .split(/\r?\n/)
      .map((line) => parseDelimitedLine(line, delimiter))
      .filter((row) => row.some((cell) => String(cell ?? "").trim().length > 0));
  }

  function normalizeHeaders(rawHeaders) {
    const used = new Map();
    return rawHeaders.map((header, idx) => {
      const base = String(header ?? "").trim() || ("列" + (idx + 1));
      const count = (used.get(base) || 0) + 1;
      used.set(base, count);
      return count === 1 ? base : (base + "_" + count);
    });
  }

  function buildPreviewFromRows(headers, rows, emptyMessage) {
    const safeHeaders = (headers || []).map((header, idx) => String(header || ("列" + (idx + 1))));
    const safeRows = (rows || [])
      .filter((row) => Array.isArray(row))
      .slice(0, 10)
      .map((row) => safeHeaders.map((_, idx) => String(row[idx] ?? "")));

    if (safeHeaders.length === 0 || safeRows.length === 0) {
      return { message: emptyMessage || "该数据集没有可预览的内容。" };
    }

    return { headers: safeHeaders, rows: safeRows };
  }

  function buildPreviewFromTextFile(file, rawText) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".json")) {
      try {
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed)) {
          const topTen = parsed.slice(0, 10);
          if (topTen.length === 0) {
            return { message: "JSON 数组为空，暂无可预览数据。" };
          }
          const keys = [];
          topTen.forEach((item) => {
            if (item && typeof item === "object" && !Array.isArray(item)) {
              Object.keys(item).forEach((key) => {
                if (!keys.includes(key)) keys.push(key);
              });
            }
          });
          if (keys.length > 0) {
            return {
              headers: keys,
              rows: topTen.map((item) => keys.map((key) => String((item && item[key]) ?? "")))
            };
          }
          return {
            headers: ["值"],
            rows: topTen.map((item) => [String(item ?? "")])
          };
        }
        if (parsed && typeof parsed === "object") {
          const keys = Object.keys(parsed);
          return {
            headers: keys.length ? keys : ["值"],
            rows: [keys.length ? keys.map((key) => String(parsed[key] ?? "")) : [String(parsed)]]
          };
        }
        return { headers: ["值"], rows: [[String(parsed ?? "")]] };
      } catch (error) {
        return { message: "JSON 解析失败，请确认格式正确。" };
      }
    }

    const delimiter = detectDelimiter(rawText);
    if (!delimiter) {
      const lines = rawText.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 10);
      if (lines.length === 0) {
        return { message: "该数据集没有可预览内容。" };
      }
      return {
        headers: ["行号", "内容"],
        rows: lines.map((line, idx) => [String(idx + 1), line])
      };
    }

    const matrix = parseDelimitedText(rawText, delimiter);
    if (!matrix.length) {
      return { message: "该数据集没有可预览内容。" };
    }
    if (matrix.length === 1) {
      return { headers: matrix[0].map((_, idx) => "列" + (idx + 1)), rows: [matrix[0].map((x) => String(x ?? ""))] };
    }

    const headers = normalizeHeaders(matrix[0]);
    const rows = matrix.slice(1).map((row) => headers.map((_, idx) => String(row[idx] ?? "")));
    return buildPreviewFromRows(headers, rows, "该数据集没有可预览内容。");
  }

  function renderPreviewMessage(message) {
    const emptyElement = document.getElementById("dataset-preview-empty");
    const tableWrapElement = document.getElementById("dataset-preview-table-wrap");
    const tableElement = document.getElementById("dataset-preview-table");
    tableElement.replaceChildren();
    emptyElement.textContent = message;
    emptyElement.classList.remove("hidden");
    tableWrapElement.classList.add("hidden");
  }

  function renderPreviewTable(headers, rows) {
    const emptyElement = document.getElementById("dataset-preview-empty");
    const tableWrapElement = document.getElementById("dataset-preview-table-wrap");
    const tableElement = document.getElementById("dataset-preview-table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headers.forEach((header) => {
      const th = document.createElement("th");
      th.textContent = header;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = String(cell ?? "");
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    tableElement.replaceChildren(thead, tbody);
    emptyElement.classList.add("hidden");
    tableWrapElement.classList.remove("hidden");
  }

  function setDatasetPreviewOverlayOpen(isOpen) {
    const overlay = document.getElementById("dataset-preview-overlay");
    overlay.classList.toggle("hidden", !isOpen);
    document.body.classList.toggle("dataset-preview-open", isOpen);
  }

  function renderPreview(preview, title) {
    document.getElementById("dataset-preview-title").textContent = title || "数据集预览（前10行）";
    if (preview && preview.message) {
      renderPreviewMessage(preview.message);
    } else if (preview && Array.isArray(preview.headers) && Array.isArray(preview.rows)) {
      renderPreviewTable(preview.headers, preview.rows);
    } else {
      renderPreviewMessage("暂无可预览数据。");
    }
    setDatasetPreviewOverlayOpen(true);
  }

  function closePreviewOverlay() {
    setDatasetPreviewOverlayOpen(false);
  }

  function ensureXlsxReady() {
    return typeof window !== "undefined" && typeof window.XLSX !== "undefined";
  }

  const MASK_64 = (1n << 64n) - 1n;
  const MASK_128 = (1n << 128n) - 1n;
  const C1 = 0x87c37b91114253d5n;
  const C2 = 0x4cf5ad432745937fn;

  function toUint64(value) {
    return value & MASK_64;
  }

  function mul64(a, b) {
    return toUint64(a * b);
  }

  function add64(a, b) {
    return toUint64(a + b);
  }

  function rotl64(value, bits) {
    const shift = BigInt(bits);
    return toUint64((value << shift) | (value >> (64n - shift)));
  }

  function fmix64(value) {
    let x = value;
    x ^= x >> 33n;
    x = mul64(x, 0xff51afd7ed558ccdn);
    x ^= x >> 33n;
    x = mul64(x, 0xc4ceb9fe1a85ec53n);
    x ^= x >> 33n;
    return x;
  }

  function readBlock64LE(bytes, start) {
    let out = 0n;
    for (let i = 0; i < 8; i += 1) {
      out |= BigInt(bytes[start + i]) << BigInt(i * 8);
    }
    return out;
  }

  function x64MurmurHash128Unsigned(input, seed) {
    const bytes = new TextEncoder().encode(String(input));
    const totalLength = bytes.length;
    const blockCount = Math.floor(totalLength / 16);

    let h1 = BigInt((seed || 233) >>> 0);
    let h2 = BigInt((seed || 233) >>> 0);

    for (let i = 0; i < blockCount; i += 1) {
      const offset = i * 16;
      let k1 = readBlock64LE(bytes, offset);
      let k2 = readBlock64LE(bytes, offset + 8);

      k1 = mul64(k1, C1);
      k1 = rotl64(k1, 31);
      k1 = mul64(k1, C2);
      h1 ^= k1;
      h1 = rotl64(h1, 27);
      h1 = add64(h1, h2);
      h1 = add64(mul64(h1, 5n), 0x52dce729n);

      k2 = mul64(k2, C2);
      k2 = rotl64(k2, 33);
      k2 = mul64(k2, C1);
      h2 ^= k2;
      h2 = rotl64(h2, 31);
      h2 = add64(h2, h1);
      h2 = add64(mul64(h2, 5n), 0x38495ab5n);
    }

    let k1 = 0n;
    let k2 = 0n;
    const tailOffset = blockCount * 16;
    const tailLength = totalLength & 15;

    if (tailLength >= 15) k2 ^= BigInt(bytes[tailOffset + 14]) << 48n;
    if (tailLength >= 14) k2 ^= BigInt(bytes[tailOffset + 13]) << 40n;
    if (tailLength >= 13) k2 ^= BigInt(bytes[tailOffset + 12]) << 32n;
    if (tailLength >= 12) k2 ^= BigInt(bytes[tailOffset + 11]) << 24n;
    if (tailLength >= 11) k2 ^= BigInt(bytes[tailOffset + 10]) << 16n;
    if (tailLength >= 10) k2 ^= BigInt(bytes[tailOffset + 9]) << 8n;
    if (tailLength >= 9) {
      k2 ^= BigInt(bytes[tailOffset + 8]);
      k2 = mul64(k2, C2);
      k2 = rotl64(k2, 33);
      k2 = mul64(k2, C1);
      h2 ^= k2;
    }

    if (tailLength >= 8) k1 ^= BigInt(bytes[tailOffset + 7]) << 56n;
    if (tailLength >= 7) k1 ^= BigInt(bytes[tailOffset + 6]) << 48n;
    if (tailLength >= 6) k1 ^= BigInt(bytes[tailOffset + 5]) << 40n;
    if (tailLength >= 5) k1 ^= BigInt(bytes[tailOffset + 4]) << 32n;
    if (tailLength >= 4) k1 ^= BigInt(bytes[tailOffset + 3]) << 24n;
    if (tailLength >= 3) k1 ^= BigInt(bytes[tailOffset + 2]) << 16n;
    if (tailLength >= 2) k1 ^= BigInt(bytes[tailOffset + 1]) << 8n;
    if (tailLength >= 1) {
      k1 ^= BigInt(bytes[tailOffset]);
      k1 = mul64(k1, C1);
      k1 = rotl64(k1, 31);
      k1 = mul64(k1, C2);
      h1 ^= k1;
    }

    const len = BigInt(totalLength);
    h1 ^= len;
    h2 ^= len;
    h1 = add64(h1, h2);
    h2 = add64(h2, h1);
    h1 = fmix64(h1);
    h2 = fmix64(h2);
    h1 = add64(h1, h2);
    h2 = add64(h2, h1);
    return ((h2 << 64n) | h1) & MASK_128;
  }

  function mmh3Hash128Signed(input, seed) {
    const unsigned = x64MurmurHash128Unsigned(input, seed);
    if (unsigned >= (1n << 127n)) {
      return unsigned - (1n << 128n);
    }
    return unsigned;
  }

  function pickDefaultIdColumn(headers) {
    const matcher = /(user.?id|uid|pharmacy.?id|store.?id|shop.?id|^id$)/i;
    const chineseMatcher = /(用户.?id|药店.?id|门店.?id)/;
    const idx = headers.findIndex((header) => matcher.test(header) || chineseMatcher.test(header));
    return idx >= 0 ? headers[idx] : headers[0];
  }

  function modForBucket(hashValue, bucketCount) {
    const divisor = BigInt(bucketCount);
    const remained = hashValue % divisor;
    const normalized = remained >= 0n ? remained : remained + divisor;
    return Number(normalized);
  }

  function getGroupName(bucketId, bucketCount) {
    if (bucketCount === 4) {
      const groupMap = { 0: "A0", 1: "A1", 2: "A2", 3: "B" };
      return groupMap[bucketId];
    }
    return "G" + bucketId;
  }

  function buildExportFileName(sourceFileName, bucketCount, seed) {
    const baseName = sourceFileName.replace(/\.[^/.]+$/, "") || "bucket_input";
    return baseName + "_分桶结果_seed" + seed + "_桶数" + bucketCount + ".xlsx";
  }

  function normalizeToken(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function findColumnIndex(headers, patterns) {
    return headers.findIndex((header) => patterns.some((pattern) => pattern.test(String(header ?? "").trim())));
  }

  function toNumberOrNull(value) {
    const normalized = String(value ?? "").replace(/,/g, "").trim();
    if (!normalized) return null;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  }

  function toBinaryOrNull(value) {
    const token = normalizeToken(value);
    if (!token) return null;
    if (["1", "true", "yes", "y", "是", "已转化", "转化", "converted", "success"].includes(token)) return 1;
    if (["0", "false", "no", "n", "否", "未转化", "未购买", "not_converted", "fail"].includes(token)) return 0;
    const num = Number(token);
    if (Number.isFinite(num)) {
      if (num === 0) return 0;
      if (num === 1) return 1;
    }
    return null;
  }

  function toGroupKind(value) {
    const compact = normalizeToken(value).replace(/[\s_-]+/g, "");
    if (!compact) return null;
    if (
      compact === "0" ||
      compact === "a" ||
      compact === "control" ||
      compact === "old" ||
      compact === "oldpage" ||
      compact === "controloldpage" ||
      compact.includes("对照") ||
      compact.includes("旧版") ||
      compact.includes("原版")
    ) {
      return "control";
    }
    if (
      compact === "1" ||
      compact === "b" ||
      compact === "treatment" ||
      compact === "new" ||
      compact === "newpage" ||
      compact === "treatmentnewpage" ||
      compact.includes("实验") ||
      compact.includes("新版")
    ) {
      return "treatment";
    }
    return null;
  }

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

  function toMatrixFromJson(rawText) {
    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    const objectRows = parsed.filter((item) => item && typeof item === "object" && !Array.isArray(item));
    if (!objectRows.length) {
      return null;
    }
    const headers = [];
    objectRows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!headers.includes(key)) headers.push(key);
      });
    });
    if (!headers.length) {
      return null;
    }
    const rows = objectRows.map((row) => headers.map((header) => row[header] ?? ""));
    return { headers: normalizeHeaders(headers), rows: rows };
  }

  function buildResultDatasetStats(headers, rows) {
    const safeHeaders = headers.map((header) => String(header ?? "").trim());
    const safeRows = rows.filter((row) => Array.isArray(row));
    if (!safeHeaders.length || !safeRows.length) {
      throw new Error("结果数据集为空，无法生成A/B检验参数。");
    }

    const groupHeaderPatterns = [/^group$/i, /ab.?group/i, /variant/i, /treatment/i, /实验组/i, /对照组/i, /版本/i, /page/i, /分组/i];
    const visitorsHeaderPatterns = [/visitors?/i, /uv/i, /样本量/i, /访问人数/i, /人数/i];
    const conversionCountPatterns = [/conversion.*count/i, /conversions?/i, /converted.*count/i, /转化人数/i, /转化数/i, /下单人数/i];
    const conversionFlagPatterns = [/is.?converted/i, /^converted$/i, /is.?conversion/i, /conversion/i, /purchase/i, /ordered/i, /转化/i, /是否下单/i, /是否转化/i];

    const groupIdx = findColumnIndex(safeHeaders, groupHeaderPatterns);
    const visitorsIdx = findColumnIndex(safeHeaders, visitorsHeaderPatterns);
    const conversionCountIdx = findColumnIndex(safeHeaders, conversionCountPatterns);

    if (groupIdx >= 0 && visitorsIdx >= 0 && conversionCountIdx >= 0) {
      const totals = {
        controlVisitors: 0,
        controlConversions: 0,
        treatmentVisitors: 0,
        treatmentConversions: 0
      };
      safeRows.forEach((row) => {
        const groupKind = toGroupKind(row[groupIdx]);
        if (!groupKind) return;
        const visitors = toNumberOrNull(row[visitorsIdx]);
        const conversions = toNumberOrNull(row[conversionCountIdx]);
        if (visitors === null || conversions === null) return;
        if (groupKind === "control") {
          totals.controlVisitors += visitors;
          totals.controlConversions += conversions;
        } else {
          totals.treatmentVisitors += visitors;
          totals.treatmentConversions += conversions;
        }
      });
      if (
        totals.controlVisitors > 0 &&
        totals.treatmentVisitors > 0 &&
        totals.controlConversions >= 0 &&
        totals.treatmentConversions >= 0 &&
        totals.controlConversions <= totals.controlVisitors &&
        totals.treatmentConversions <= totals.treatmentVisitors
      ) {
        return {
          sourceType: "aggregated",
          ...totals
        };
      }
    }

    const conversionFlagIdx = findColumnIndex(safeHeaders, conversionFlagPatterns);
    if (groupIdx < 0 || conversionFlagIdx < 0) {
      throw new Error("未识别到分组列与转化列，请确保结果数据集包含组别和转化标记。");
    }

    const controlFlags = [];
    const treatmentFlags = [];
    safeRows.forEach((row) => {
      const groupKind = toGroupKind(row[groupIdx]);
      if (!groupKind) return;
      const binary = toBinaryOrNull(row[conversionFlagIdx]);
      if (binary === null) return;
      if (groupKind === "control") controlFlags.push(binary === 1);
      if (groupKind === "treatment") treatmentFlags.push(binary === 1);
    });

    if (!controlFlags.length || !treatmentFlags.length) {
      throw new Error("未识别到足够的A/B分组记录，请检查组别值是否为control/old_page与treatment/new_page。");
    }

    return {
      sourceType: "row-level",
      controlVisitors: controlFlags.length,
      controlConversions: controlFlags.filter(Boolean).length,
      treatmentVisitors: treatmentFlags.length,
      treatmentConversions: treatmentFlags.filter(Boolean).length,
      controlFlags: controlFlags,
      treatmentFlags: treatmentFlags
    };
  }

  function initDesignAndSignificance() {
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

    const state = {
      design: null,
      resultDataset: null,
      samplingMode: "full"
    };

    const visitorsAInput = document.getElementById("visitors-a");
    const conversionsAInput = document.getElementById("conversions-a");
    const visitorsBInput = document.getElementById("visitors-b");
    const conversionsBInput = document.getElementById("conversions-b");
    const sampleSizeInput = document.getElementById("sample-size-per-group");
    const sampleSeedInput = document.getElementById("sample-seed");
    const sampleSizeLabel = sampleSizeInput ? sampleSizeInput.closest("label") : null;
    const sampleSeedLabel = sampleSeedInput ? sampleSeedInput.closest("label") : null;
    const samplingModeButton = document.getElementById("sampling-mode-btn");
    const sigParamHint = document.getElementById("sig-param-hint");

    function syncTestTypeText() {
      const checkbox = document.getElementById("two-sided-test");
      const text = document.getElementById("test-type-text");
      text.textContent = checkbox.checked ? "双侧检验" : "单侧检验";
    }

    function setSigParamHint(text) {
      if (sigParamHint) sigParamHint.textContent = text;
    }

    function setSigInputs(controlVisitors, controlConversions, treatmentVisitors, treatmentConversions) {
      visitorsAInput.value = String(controlVisitors);
      conversionsAInput.value = String(controlConversions);
      visitorsBInput.value = String(treatmentVisitors);
      conversionsBInput.value = String(treatmentConversions);
    }

    function syncSamplingUi() {
      const isSampling = state.samplingMode === "sample";
      if (samplingModeButton) {
        samplingModeButton.textContent = isSampling ? "是否抽样：是（抽样）" : "是否抽样：否（全量）";
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
        if (showWarn) setResult(document.getElementById("sig-result"), msg, "warn");
        return false;
      }

      const requiredMin = state.design.minSamplePerGroup;
      const sampleSize = Number(sampleSizeInput && sampleSizeInput.value);
      const sampleSeed = Number(sampleSeedInput && sampleSeedInput.value);
      if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
        const msg = "抽样模式下请填写每组抽样数量（正整数）。";
        setSigParamHint(msg);
        if (showWarn) setResult(document.getElementById("sig-result"), msg, "warn");
        return false;
      }
      if (!Number.isInteger(sampleSeed)) {
        const msg = "抽样模式下请填写整数类型的抽样 Seed。";
        setSigParamHint(msg);
        if (showWarn) setResult(document.getElementById("sig-result"), msg, "warn");
        return false;
      }
      if (sampleSize < requiredMin) {
        const msg = "每组抽样数量不得低于实验设计助手计算的最小样本量（向上取整）： " + requiredMin + "。";
        setSigParamHint(msg);
        if (showWarn) setResult(document.getElementById("sig-result"), msg, "warn");
        return false;
      }
      if (sampleSize > state.resultDataset.controlVisitors || sampleSize > state.resultDataset.treatmentVisitors) {
        const msg = "抽样数量超过数据集中某一组的可用样本数，请调小后重试。";
        setSigParamHint(msg);
        if (showWarn) setResult(document.getElementById("sig-result"), msg, "warn");
        return false;
      }

      const controlRng = createSeededRng(sampleSeed);
      const treatmentRng = createSeededRng(sampleSeed + 1);
      const controlConversions = sampleTrueCount(state.resultDataset.controlFlags, sampleSize, controlRng);
      const treatmentConversions = sampleTrueCount(state.resultDataset.treatmentFlags, sampleSize, treatmentRng);
      setSigInputs(sampleSize, controlConversions, sampleSize, treatmentConversions);
      setSigParamHint("已基于抽样数据自动生成A/B检验参数（每组 " + sampleSize + "，Seed=" + sampleSeed + "）。");
      return true;
    }

    function handleDesignSubmit(event) {
      event.preventDefault();
      const baseline = Number(document.getElementById("baseline-rate").value) / 100;
      const expected = Number(document.getElementById("expected-rate").value) / 100;
      const alpha = Number(document.getElementById("alpha").value);
      const isTwoSided = document.getElementById("two-sided-test").checked;
      const power = Number(document.getElementById("power").value);
      const ratio = Number(document.getElementById("group-ratio").value);
      const result = document.getElementById("design-result");

      if (baseline <= 0 || baseline >= 1 || expected <= 0 || expected >= 1 || alpha <= 0 || alpha >= 1 || power <= 0 || power >= 1 || ratio <= 0) {
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
      const effectH = 2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p2));
      const pBar = (ratio * p1 + p2) / (ratio + 1);
      const zAlpha = inverseNormalCdf(isTwoSided ? 1 - alpha / 2 : 1 - alpha);
      const zBeta = inverseNormalCdf(power);
      const numerator = Math.pow(
        zAlpha * Math.sqrt(pBar * (1 - pBar) * (1 + ratio)) + zBeta * Math.sqrt(p1 * (1 - p1) + ratio * p2 * (1 - p2)),
        2
      );
      const denominator = Math.pow(Math.abs(effectAbs), 2);
      const minControlSample = Math.ceil(numerator / denominator);
      const minTreatmentSample = Math.ceil(minControlSample / ratio);
      const total = minControlSample + minTreatmentSample;
      const rel = effectAbs / p1;
      const minSamplePerGroup = Math.ceil(Math.max(minControlSample, minTreatmentSample));
      const msg = [
        "效果量（绝对差）：" + (effectAbs * 100).toFixed(2) + " 个百分点",
        "效果量（相对变化）：" + (rel >= 0 ? "+" : "") + (rel * 100).toFixed(2) + "%",
        "效果量（Cohen's h）：" + effectH.toFixed(4),
        "最小样本量：控制组 " + minControlSample.toLocaleString() + " 人，处理组 " + minTreatmentSample.toLocaleString() + " 人",
        "最小总样本量：" + total.toLocaleString() + " 人"
      ].join("\n");
      setResult(result, msg, "success");

      state.design = {
        alpha: alpha,
        minControlSample: minControlSample,
        minTreatmentSample: minTreatmentSample,
        minSamplePerGroup: minSamplePerGroup
      };
      document.dispatchEvent(new CustomEvent("ab-design-ready", { detail: state.design }));
      syncSamplingUi();
      if (sampleSizeInput && state.samplingMode === "sample" && (!sampleSizeInput.value || Number(sampleSizeInput.value) < minSamplePerGroup)) {
        sampleSizeInput.value = String(minSamplePerGroup);
      }
      tryGenerateSigInputs(false);
    }

    function handleSignificanceSubmit(event) {
      event.preventDefault();
      const result = document.getElementById("sig-result");
      const hasAnyEmpty =
        !String(visitorsAInput.value).trim() ||
        !String(conversionsAInput.value).trim() ||
        !String(visitorsBInput.value).trim() ||
        !String(conversionsBInput.value).trim();
      if (hasAnyEmpty) {
        tryGenerateSigInputs(false);
      }

      if (!state.design || !Number.isFinite(state.design.alpha)) {
        setResult(result, "请先在实验设计助手点击“设置完成”，显著性水平 α 将沿用实验设计助手参数。", "warn");
        return;
      }

      const nA = Number(visitorsAInput.value);
      const xA = Number(conversionsAInput.value);
      const nB = Number(visitorsBInput.value);
      const xB = Number(conversionsBInput.value);
      const alpha = state.design.alpha;
      const isCaseData =
        nA === CASE_DATA.controlVisitors &&
        xA === CASE_DATA.controlConversions &&
        nB === CASE_DATA.treatmentVisitors &&
        xB === CASE_DATA.treatmentConversions;

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
        setResult(result, "标准误差为0，无法完成检验。", "warn");
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
      const msgLines = [
        "A组转化率：" + pct(pA) + "，B组转化率：" + pct(pB),
        "绝对提升：" + pct(diff) + "（B - A）",
        "Z统计量：" + z.toFixed(6) + "，P值：" + pValue.toFixed(6),
        "控制组95%置信区间：" + pctWithPrecision(ciALower95) + " ~ " + pctWithPrecision(ciAUpper95),
        "实验组95%置信区间：" + pctWithPrecision(ciBLower95) + " ~ " + pctWithPrecision(ciBUpper95),
        (1 - alpha) * 100 + "% 置信区间：" + pct(ciLower) + " ~ " + pct(ciUpper),
        "结论：" + (significant ? "差异达到统计显著。" : "差异未达统计显著。")
      ];
      if (isCaseData) {
        msgLines.push("案例说明：已载入 abtest 案例（仅保留 control-old_page / treatment-new_page，并按 user_id 去重后汇总）。");
      }
      setResult(result, msgLines.join("\n"), significant ? "success" : "warn");
    }

    function loadCaseDataAndRun() {
      setSigInputs(
        CASE_DATA.controlVisitors,
        CASE_DATA.controlConversions,
        CASE_DATA.treatmentVisitors,
        CASE_DATA.treatmentConversions
      );
      setSigParamHint("已载入 abtest 案例数据。");
      document.getElementById("sig-form").requestSubmit();
    }

    visitorsAInput.value = "";
    conversionsAInput.value = "";
    visitorsBInput.value = "";
    conversionsBInput.value = "";
    if (sampleSizeInput) sampleSizeInput.value = "";
    if (sampleSeedInput && !sampleSeedInput.value) sampleSeedInput.value = "233";
    setSigParamHint("请先上传结果数据集并在实验设计助手点击“设置完成”，再生成A/B检验参数。");
    syncSamplingUi();

    document.addEventListener("ab-result-dataset-ready", (event) => {
      state.resultDataset = event.detail;
      tryGenerateSigInputs(false);
    });
    document.addEventListener("ab-result-dataset-invalid", (event) => {
      state.resultDataset = null;
      const reason = event.detail && event.detail.reason ? event.detail.reason : "结果数据集暂不可用于自动生成A/B检验参数。";
      setSigParamHint(reason);
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
        if (state.samplingMode === "sample") {
          tryGenerateSigInputs(false);
        }
      });
    }
    if (sampleSeedInput) {
      sampleSeedInput.addEventListener("change", () => {
        if (state.samplingMode === "sample") {
          tryGenerateSigInputs(false);
        }
      });
    }

    document.getElementById("design-form").addEventListener("submit", handleDesignSubmit);
    document.getElementById("sig-form").addEventListener("submit", handleSignificanceSubmit);
    document.getElementById("load-case-data").addEventListener("click", loadCaseDataAndRun);
    document.getElementById("two-sided-test").addEventListener("change", syncTestTypeText);
    syncTestTypeText();
  }

  function initBucketUpload() {
    const fileInput = document.getElementById("bucket-file-input");
    const previewButton = document.getElementById("bucket-preview-btn");
    const bucketCountInput = document.getElementById("bucket-count");
    const seedInput = document.getElementById("bucket-seed");
    const idColumnSelect = document.getElementById("bucket-id-column");
    const runButton = document.getElementById("run-bucket-btn");
    const downloadButton = document.getElementById("download-bucket-btn");
    const summary = document.getElementById("bucket-result-summary");

    const state = {
      sourceFileName: "",
      headers: [],
      rows: [],
      records: [],
      preview: { message: "请先上传分桶ID数据集。" },
      workbook: null,
      outputFileName: ""
    };

    function refreshIdColumns() {
      idColumnSelect.replaceChildren();
      state.headers.forEach((header) => {
        const option = document.createElement("option");
        option.value = header;
        option.textContent = header;
        idColumnSelect.appendChild(option);
      });
      if (state.headers.length > 0) {
        idColumnSelect.value = pickDefaultIdColumn(state.headers);
      }
    }

    function updateSummary(lines, isMuted) {
      summary.textContent = lines.join("\n");
      summary.classList.toggle("muted", !!isMuted);
    }

    function toRecords(headers, rawRows) {
      return rawRows.map((row) => {
        const record = {};
        headers.forEach((header, idx) => {
          record[header] = row[idx] ?? "";
        });
        return record;
      });
    }

    async function parseBucketFile(file) {
      const lowerName = file.name.toLowerCase();
      const isExcel = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");

      if (isExcel) {
        if (!ensureXlsxReady()) {
          throw new Error("xlsx-unavailable");
        }
        const arrayBuffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(arrayBuffer, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const matrix = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
        if (!Array.isArray(matrix) || matrix.length === 0) {
          throw new Error("empty-sheet");
        }
        const headers = normalizeHeaders(matrix[0]);
        const rows = matrix
          .slice(1)
          .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim().length > 0))
          .map((row) => headers.map((_, idx) => row[idx] ?? ""));
        return { headers: headers, rows: rows };
      }

      const text = await file.text();
      const delimiter = detectDelimiter(text);
      if (!delimiter) {
        throw new Error("cannot-detect-delimiter");
      }
      const matrix = parseDelimitedText(text, delimiter);
      if (!Array.isArray(matrix) || matrix.length === 0) {
        throw new Error("empty-sheet");
      }
      const headers = normalizeHeaders(matrix[0]);
      const rows = matrix
        .slice(1)
        .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim().length > 0))
        .map((row) => headers.map((_, idx) => row[idx] ?? ""));
      return { headers: headers, rows: rows };
    }

    async function handleBucketFileChange(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      updateSummary(["正在解析文件，请稍候..."], true);

      try {
        const parsed = await parseBucketFile(file);
        const headers = parsed.headers;
        const rows = parsed.rows;
        if (rows.length === 0) throw new Error("empty-rows");

        state.sourceFileName = file.name;
        state.headers = headers;
        state.rows = rows;
        state.records = toRecords(headers, rows);
        state.preview = buildPreviewFromRows(headers, rows, "该分桶数据集没有可预览内容。");
        state.workbook = null;
        state.outputFileName = "";

        refreshIdColumns();
        downloadButton.disabled = true;
        updateSummary([
          "已上传 " + rows.length.toLocaleString() + " 条记录。",
          "已识别字段：" + headers.join("、"),
          "请选择ID列、分桶数和seed，然后点击“执行分桶”。"
        ]);
      } catch (error) {
        state.preview = { message: "读取失败：请确认上传的是有效的 Excel/CSV 文件，且第一行为表头。" };
        state.records = [];
        state.headers = [];
        state.rows = [];
        refreshIdColumns();
        downloadButton.disabled = true;
        updateSummary(["读取失败：请确认上传的是有效的 Excel/CSV 文件，且第一行为表头。"]);
      } finally {
        fileInput.value = "";
      }
    }

    function runBucketing() {
      if (!state.records.length) {
        updateSummary(["请先上传分桶ID数据集。"]);
        return;
      }

      const bucketCount = Number(bucketCountInput.value);
      const seed = Number(seedInput.value);
      const idColumn = idColumnSelect.value;

      if (!Number.isInteger(bucketCount) || bucketCount < 2 || bucketCount > 100) {
        updateSummary(["分桶数必须是 2~100 的整数。"]);
        return;
      }
      if (!Number.isInteger(seed)) {
        updateSummary(["seed 必须是整数。"]);
        return;
      }
      if (!idColumn) {
        updateSummary(["请先选择用于分桶的ID列。"]);
        return;
      }
      if (!ensureXlsxReady()) {
        updateSummary(["导出组件未加载成功，请刷新页面后重试。"]);
        return;
      }

      const counters = Array.from({ length: bucketCount }, () => 0);
      let emptyIdCount = 0;
      const groupedRecords = state.records.map((record) => {
        const idValue = String(record[idColumn] ?? "");
        if (idValue.trim().length === 0) emptyIdCount += 1;
        const hashValue = mmh3Hash128Signed(idValue, seed);
        const bucketId = modForBucket(hashValue, bucketCount);
        const abGroup = getGroupName(bucketId, bucketCount);
        counters[bucketId] += 1;
        return {
          ...record,
          ab_group_id: bucketId,
          ab_group: abGroup
        };
      });

      const exportHeaders = state.headers.concat(["ab_group_id", "ab_group"]);
      const sheet = window.XLSX.utils.json_to_sheet(groupedRecords, { header: exportHeaders });
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, sheet, "bucket_result");
      state.workbook = workbook;
      state.outputFileName = buildExportFileName(state.sourceFileName, bucketCount, seed);
      downloadButton.disabled = false;

      const lines = ["分桶完成：共 " + groupedRecords.length.toLocaleString() + " 条记录，桶数=" + bucketCount + "，seed=" + seed + "。"];
      counters.forEach((count, bucketId) => {
        lines.push(getGroupName(bucketId, bucketCount) + "：" + count.toLocaleString() + " 人");
      });
      if (emptyIdCount > 0) {
        lines.push("注意：有 " + emptyIdCount.toLocaleString() + " 条记录ID为空，已按空字符串参与哈希。");
      }
      updateSummary(lines);
    }

    function downloadResult() {
      if (!state.workbook) {
        updateSummary(["请先执行分桶，再下载Excel。"]);
        return;
      }
      window.XLSX.writeFile(state.workbook, state.outputFileName);
    }

    document.getElementById("upload-bucket-btn").addEventListener("click", closePreviewOverlay);
    fileInput.addEventListener("change", handleBucketFileChange);
    previewButton.addEventListener("click", () => renderPreview(state.preview, "分桶ID数据集预览（前10行）"));
    runButton.addEventListener("click", runBucketing);
    downloadButton.addEventListener("click", downloadResult);

    seedInput.value = "233";
  }

  function initResultUpload() {
    const fileInput = document.getElementById("result-file-input");
    const previewButton = document.getElementById("result-preview-btn");
    let latestPreview = { message: "请先上传结果数据集。" };

    async function handleResultFileChange(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      try {
        let parsedHeaders = [];
        let parsedRows = [];
        const lowerName = file.name.toLowerCase();
        const isExcel = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");
        if (isExcel) {
          if (!ensureXlsxReady()) {
            throw new Error("xlsx-unavailable");
          }
          const arrayBuffer = await file.arrayBuffer();
          const workbook = window.XLSX.read(arrayBuffer, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const matrix = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
          if (!Array.isArray(matrix) || matrix.length === 0) {
            latestPreview = { message: "该数据集没有可预览内容。" };
            throw new Error("empty-sheet");
          } else {
            const headers = normalizeHeaders(matrix[0] || []);
            const rows = matrix
              .slice(1)
              .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim().length > 0))
              .map((row) => headers.map((_, idx) => row[idx] ?? ""));
            latestPreview = buildPreviewFromRows(headers, rows, "该数据集没有可预览内容。");
            parsedHeaders = headers;
            parsedRows = rows;
          }
        } else {
          const text = await file.text();
          latestPreview = buildPreviewFromTextFile(file, text);
          if (lowerName.endsWith(".json")) {
            const matrixFromJson = toMatrixFromJson(text);
            if (matrixFromJson) {
              parsedHeaders = matrixFromJson.headers;
              parsedRows = matrixFromJson.rows;
            }
          } else {
            const delimiter = detectDelimiter(text);
            if (delimiter) {
              const matrix = parseDelimitedText(text, delimiter);
              if (Array.isArray(matrix) && matrix.length > 1) {
                const headers = normalizeHeaders(matrix[0] || []);
                const rows = matrix
                  .slice(1)
                  .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim().length > 0))
                  .map((row) => headers.map((_, idx) => row[idx] ?? ""));
                parsedHeaders = headers;
                parsedRows = rows;
              }
            }
          }
        }

        if (!parsedRows.length) {
          throw new Error("no-usable-analysis-rows");
        }

        const stats = buildResultDatasetStats(parsedHeaders, parsedRows);
        document.dispatchEvent(new CustomEvent("ab-result-dataset-ready", { detail: stats }));
      } catch (error) {
        if (!latestPreview || !latestPreview.message) {
          latestPreview = { message: "读取失败：请确认文件格式正确。" };
        }
        document.dispatchEvent(new CustomEvent("ab-result-dataset-invalid", { detail: { reason: "结果数据集暂不可用于自动生成A/B检验参数，请检查分组列与转化列。" } }));
      } finally {
        fileInput.value = "";
      }
    }

    document.getElementById("upload-result-btn").addEventListener("click", closePreviewOverlay);
    fileInput.addEventListener("change", handleResultFileChange);
    previewButton.addEventListener("click", () => renderPreview(latestPreview, "结果数据集预览（前10行）"));
  }

  function initPreviewOverlay() {
    document.getElementById("dataset-preview-close-btn").addEventListener("click", closePreviewOverlay);
    document.getElementById("dataset-preview-overlay").addEventListener("click", (event) => {
      if (event.target && event.target.id === "dataset-preview-overlay") {
        closePreviewOverlay();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closePreviewOverlay();
      }
    });
  }

  initPreviewOverlay();
  initDesignAndSignificance();
  initResultUpload();
  initBucketUpload();
  if (window.AbOnlineExperiment && typeof window.AbOnlineExperiment.init === "function") {
    window.AbOnlineExperiment.init();
  }
})();
