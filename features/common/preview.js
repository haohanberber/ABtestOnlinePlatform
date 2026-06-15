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
    .filter((row) => row.some((cell) => String(cell).trim().length > 0));
}

function normalizeHeader(headers) {
  return headers.map((header, idx) => {
    const value = String(header ?? "").trim();
    return value || `列${idx + 1}`;
  });
}

function toTableFromJson(text) {
  const parsed = JSON.parse(text);

  if (Array.isArray(parsed)) {
    const topTen = parsed.slice(0, 10);
    if (topTen.length === 0) {
      return { message: "JSON 数组为空，暂无可预览数据。" };
    }

    const hasOnlyPrimitive = topTen.every((item) => item === null || typeof item !== "object");
    if (hasOnlyPrimitive) {
      return {
        headers: ["值"],
        rows: topTen.map((item) => [String(item ?? "")])
      };
    }

    const hasObjectItem = topTen.some((item) => item && typeof item === "object" && !Array.isArray(item));
    if (hasObjectItem) {
      const keys = [];
      topTen.forEach((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          Object.keys(item).forEach((key) => {
            if (!keys.includes(key)) {
              keys.push(key);
            }
          });
        }
      });
      return {
        headers: keys.length > 0 ? keys : ["值"],
        rows: topTen.map((item) => keys.map((key) => String((item && item[key]) ?? "")))
      };
    }

    const maxLength = topTen.reduce((max, item) => (Array.isArray(item) ? Math.max(max, item.length) : max), 0);
    const headers = Array.from({ length: maxLength || 1 }, (_, idx) => `列${idx + 1}`);
    return {
      headers,
      rows: topTen.map((item) => {
        if (Array.isArray(item)) {
          return headers.map((_, idx) => String(item[idx] ?? ""));
        }
        return headers.map(() => String(item ?? ""));
      })
    };
  }

  if (parsed && typeof parsed === "object") {
    const keys = Object.keys(parsed);
    if (keys.length === 0) {
      return { message: "JSON 对象为空，暂无可预览数据。" };
    }
    return {
      headers: keys,
      rows: [keys.map((key) => String(parsed[key] ?? ""))]
    };
  }

  return {
    headers: ["值"],
    rows: [[String(parsed ?? "")]]
  };
}

function toTableFromText(rawText) {
  const delimiter = detectDelimiter(rawText);

  if (!delimiter) {
    const lines = rawText.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 10);
    if (lines.length === 0) {
      return { message: "该数据集没有可预览的内容。" };
    }
    return {
      headers: ["行号", "内容"],
      rows: lines.map((line, idx) => [String(idx + 1), line])
    };
  }

  const rows = parseDelimitedText(rawText, delimiter);
  if (rows.length === 0) {
    return { message: "该数据集没有可预览的内容。" };
  }

  if (rows.length === 1) {
    const onlyRow = rows[0];
    return {
      headers: onlyRow.map((_, idx) => `列${idx + 1}`),
      rows: [onlyRow.map((cell) => String(cell ?? ""))]
    };
  }

  const headers = normalizeHeader(rows[0]);
  const topTenRows = rows.slice(1, 11).map((row) => headers.map((_, idx) => String(row[idx] ?? "")));
  if (topTenRows.length === 0) {
    return { message: "该数据集没有可预览的内容。" };
  }

  return {
    headers,
    rows: topTenRows
  };
}

export function buildPreviewFromTextFile(file, rawText) {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".json")) {
    return toTableFromJson(rawText);
  }
  return toTableFromText(rawText);
}

export function buildPreviewFromRows(headers, rows, emptyMessage = "该数据集没有可预览的内容。") {
  const safeHeaders = (headers || []).map((header, idx) => String(header || `列${idx + 1}`));
  const safeRows = (rows || [])
    .filter((row) => Array.isArray(row))
    .slice(0, 10)
    .map((row) => safeHeaders.map((_, idx) => String(row[idx] ?? "")));

  if (safeHeaders.length === 0 || safeRows.length === 0) {
    return { message: emptyMessage };
  }

  return { headers: safeHeaders, rows: safeRows };
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

function closeDatasetPreviewByBackdrop(event) {
  if (event.target && event.target.id === "dataset-preview-overlay") {
    setDatasetPreviewOverlayOpen(false);
  }
}

function closeDatasetPreviewByEsc(event) {
  if (event.key === "Escape") {
    setDatasetPreviewOverlayOpen(false);
  }
}

export function initDatasetPreviewOverlay() {
  document.getElementById("dataset-preview-close-btn").addEventListener("click", () => setDatasetPreviewOverlayOpen(false));
  document.getElementById("dataset-preview-overlay").addEventListener("click", closeDatasetPreviewByBackdrop);
  document.addEventListener("keydown", closeDatasetPreviewByEsc);

  return {
    open() {
      setDatasetPreviewOverlayOpen(true);
    },
    close() {
      setDatasetPreviewOverlayOpen(false);
    },
    setTitle(title) {
      document.getElementById("dataset-preview-title").textContent = title;
    },
    render(preview, title = "数据集预览（前10行）") {
      this.setTitle(title);
      if (preview.message) {
        renderPreviewMessage(preview.message);
      } else {
        renderPreviewTable(preview.headers, preview.rows);
      }
      this.open();
    }
  };
}
