import { buildPreviewFromRows } from "../common/preview.js";
import { mmh3Hash128Signed } from "./murmurhash3.js";

const DEFAULT_SEED = 233;

function ensureXlsxReady() {
  return typeof window !== "undefined" && typeof window.XLSX !== "undefined";
}

function normalizeHeaders(rawHeaders) {
  const used = new Map();
  return rawHeaders.map((header, idx) => {
    const base = String(header ?? "").trim() || `列${idx + 1}`;
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
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

async function parseBucketFile(file) {
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
      throw new Error("empty-sheet");
    }

    const headers = normalizeHeaders(matrix[0]);
    const rows = matrix
      .slice(1)
      .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim().length > 0))
      .map((row) => headers.map((_, idx) => row[idx] ?? ""));

    return { headers, rows };
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

  return { headers, rows };
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

function pickDefaultIdColumn(headers) {
  const matcher = /(user.?id|uid|pharmacy.?id|store.?id|shop.?id|^id$)/i;
  const chineseMatcher = /(用户.?id|药店.?id|门店.?id)/;
  const idx = headers.findIndex((header) => matcher.test(header) || chineseMatcher.test(header));
  return idx >= 0 ? headers[idx] : headers[0];
}

function getGroupName(bucketId, bucketCount) {
  if (bucketCount === 4) {
    const groupMap = {
      0: "A0",
      1: "A1",
      2: "A2",
      3: "B"
    };
    return groupMap[bucketId];
  }
  return `G${bucketId}`;
}

function modForBucket(hashValue, bucketCount) {
  const divisor = BigInt(bucketCount);
  const remained = hashValue % divisor;
  const normalized = remained >= 0n ? remained : remained + divisor;
  return Number(normalized);
}

function buildExportFileName(sourceFileName, bucketCount, seed) {
  const baseName = sourceFileName.replace(/\.[^/.]+$/, "") || "bucket_input";
  return `${baseName}_分桶结果_seed${seed}_桶数${bucketCount}.xlsx`;
}

function updateSummary(summaryElement, lines, isMuted = false) {
  summaryElement.textContent = lines.join("\n");
  summaryElement.classList.toggle("muted", isMuted);
}

export function initHashBucketing(previewOverlay) {
  const fileInput = document.getElementById("bucket-file-input");
  const fileNameButton = document.getElementById("bucket-file-name-btn");
  const fileNameText = document.getElementById("bucket-file-name");
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

  async function handleFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    updateSummary(summary, ["正在解析文件，请稍候..."], true);

    try {
      const parsed = await parseBucketFile(file);
      const headers = parsed.headers;
      const rows = parsed.rows;

      if (rows.length === 0) {
        throw new Error("empty-rows");
      }

      state.sourceFileName = file.name;
      state.headers = headers;
      state.rows = rows;
      state.records = toRecords(headers, rows);
      state.preview = buildPreviewFromRows(headers, rows, "该分桶数据集没有可预览内容。");
      state.workbook = null;
      state.outputFileName = "";

      refreshIdColumns();
      fileNameText.textContent = file.name;
      fileNameButton.classList.remove("hidden");
      downloadButton.disabled = true;
      updateSummary(summary, [
        `已上传 ${rows.length.toLocaleString()} 条记录。`,
        `已识别字段：${headers.join("、")}`,
        "请选择ID列、分桶数和seed，然后点击“执行分桶”。"
      ]);
      previewOverlay.close();
    } catch (error) {
      state.sourceFileName = file.name;
      state.headers = [];
      state.rows = [];
      state.records = [];
      state.preview = { message: "读取失败：请确认上传的是有效的 Excel/CSV 文件，且第一行为表头。" };
      state.workbook = null;
      state.outputFileName = "";
      refreshIdColumns();
      fileNameText.textContent = file.name;
      fileNameButton.classList.remove("hidden");
      downloadButton.disabled = true;
      updateSummary(summary, ["读取失败：请确认上传的是有效的 Excel/CSV 文件，且第一行为表头。"]);
    } finally {
      fileInput.value = "";
    }
  }

  function runBucketing() {
    if (!ensureXlsxReady()) {
      updateSummary(summary, ["导出组件未加载成功，请刷新页面后重试。"]);
      return;
    }
    if (state.records.length === 0) {
      updateSummary(summary, ["请先上传分桶ID数据集。"], false);
      return;
    }

    const bucketCount = Number(bucketCountInput.value);
    const seed = Number(seedInput.value);
    const idColumn = idColumnSelect.value;

    if (!Number.isInteger(bucketCount) || bucketCount < 2 || bucketCount > 100) {
      updateSummary(summary, ["分桶数必须是 2~100 的整数。"]);
      return;
    }

    if (!Number.isInteger(seed)) {
      updateSummary(summary, ["seed 必须是整数。"]);
      return;
    }

    if (!idColumn) {
      updateSummary(summary, ["请先选择用于分桶的ID列。"]);
      return;
    }

    const counters = Array.from({ length: bucketCount }, () => 0);
    let emptyIdCount = 0;
    const groupedRecords = state.records.map((record) => {
      const idValue = String(record[idColumn] ?? "");
      if (idValue.trim().length === 0) {
        emptyIdCount += 1;
      }

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

    const exportHeaders = [...state.headers, "ab_group_id", "ab_group"];
    const sheet = window.XLSX.utils.json_to_sheet(groupedRecords, { header: exportHeaders });
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, sheet, "bucket_result");
    state.workbook = workbook;
    state.outputFileName = buildExportFileName(state.sourceFileName, bucketCount, seed);
    downloadButton.disabled = false;

    const summaryLines = [
      `分桶完成：共 ${groupedRecords.length.toLocaleString()} 条记录，桶数=${bucketCount}，seed=${seed}。`
    ];

    counters.forEach((count, bucketId) => {
      summaryLines.push(`${getGroupName(bucketId, bucketCount)}：${count.toLocaleString()} 人`);
    });

    if (emptyIdCount > 0) {
      summaryLines.push(`注意：有 ${emptyIdCount.toLocaleString()} 条记录ID为空，已按空字符串参与哈希。`);
    }

    updateSummary(summary, summaryLines);
  }

  function downloadResult() {
    if (!state.workbook) {
      updateSummary(summary, ["请先执行分桶，再下载Excel。"]);
      return;
    }
    window.XLSX.writeFile(state.workbook, state.outputFileName);
  }

  document.getElementById("upload-bucket-btn").addEventListener("click", () => {
    previewOverlay.close();
  });
  fileInput.addEventListener("change", handleFileChange);
  runButton.addEventListener("click", runBucketing);
  downloadButton.addEventListener("click", downloadResult);

  previewButton.addEventListener("click", () => {
    previewOverlay.render(state.preview, "分桶ID数据集预览（前10行）");
  });

  fileNameButton.addEventListener("click", () => {
    if (fileNameButton.classList.contains("hidden")) {
      return;
    }
    previewOverlay.render(state.preview, "分桶ID数据集预览（前10行）");
  });

  seedInput.value = String(DEFAULT_SEED);
}
