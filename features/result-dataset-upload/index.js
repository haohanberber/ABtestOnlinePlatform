import { buildPreviewFromRows, buildPreviewFromTextFile } from "../common/preview.js";

function ensureXlsxReady() {
  return typeof window !== "undefined" && typeof window.XLSX !== "undefined";
}

function normalizeHeaders(rawHeaders) {
  return rawHeaders.map((header, idx) => {
    const value = String(header ?? "").trim();
    return value || `列${idx + 1}`;
  });
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
  if (!firstLine) return null;
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
  return { headers: normalizeHeaders(headers), rows };
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
      return { sourceType: "aggregated", ...totals };
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
    controlFlags,
    treatmentFlags
  };
}

export function initResultDatasetUpload(previewOverlay) {
  const fileInput = document.getElementById("result-file-input");
  const previewButton = document.getElementById("result-preview-btn");

  let latestPreview = { message: "请先上传结果数据集。" };

  async function handleResultFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

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
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = workbook.Sheets[firstSheetName];
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
          const matrix = toMatrixFromJson(text);
          if (matrix) {
            parsedHeaders = matrix.headers;
            parsedRows = matrix.rows;
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
      document.dispatchEvent(
        new CustomEvent("ab-result-dataset-invalid", {
          detail: { reason: "结果数据集暂不可用于自动生成A/B检验参数，请检查分组列与转化列。" }
        })
      );
    } finally {
      previewOverlay.close();
      fileInput.value = "";
    }
  }

  document.getElementById("upload-result-btn").addEventListener("click", () => {
    previewOverlay.close();
  });

  fileInput.addEventListener("change", handleResultFileChange);

  previewButton.addEventListener("click", () => {
    previewOverlay.render(latestPreview, "结果数据集预览（前10行）");
  });
}
