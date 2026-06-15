(function () {
  const METRIC_LIMIT = 10;
  const GROUP_LIMIT = 10;
  const DEFAULT_METRICS = [
    {
      name: "加入购物车",
      description: "用户点击“加入购物车”按钮时生成",
      explanation: "衡量joinShoppingCart事件的计数",
      config: "度量类型：事件计数"
    },
    {
      name: "DAU(用户)",
      description: "每日活跃的用户数，或某一天活跃的用户数",
      explanation: "-",
      config: "度量类型：用户"
    },
    {
      name: "商详页浏览数",
      description: "-",
      explanation: "衡量productPage事件的计数",
      config: "度量类型：事件计数"
    }
  ];
  const DEFAULT_METRIC_MAP = DEFAULT_METRICS.reduce((map, metric) => {
    map[metric.name] = metric;
    return map;
  }, {});
  const RESULT_TABLE_HEADERS = ["指标名称", "分组", "用户数", "参与率", "平均值", "标准误差", "总计"];
  const DETAIL_CONFIG_STORAGE_KEY = "ab-online-experiment-detail-configs-v1";
  const PRIMARY_RESULT_TEMPLATE = {
    control: { userUnit: "103083", participationRate: "77.7%", mean: "2.818", stdErr: "0.008360", total: "290461" },
    treatment: { userUnit: "103191", participationRate: "79.4%", mean: "3.107", stdErr: "0.009054", total: "320580" },
    liftText: "+10.28% ±0.86%",
    llr: "5.452"
  };
  const SECONDARY_RESULT_TEMPLATES = [
    {
      control: { userUnit: "103083", participationRate: "98.6%", mean: "44.49", stdErr: "0.1064", total: "4586342" },
      treatment: { userUnit: "103191", participationRate: "98.8%", mean: "49.15", stdErr: "0.1170", total: "5070694" },
      liftText: "+10.47% ±0.7%",
      llr: "82.16"
    },
    {
      control: { userUnit: "103083", participationRate: "77.7%", mean: "105.7", stdErr: "0.3740", total: "10898050.49" },
      treatment: { userUnit: "103191", participationRate: "79.4%", mean: "116.5", stdErr: "0.4021", total: "12020844.29" },
      liftText: "+10.2% ±1.0%",
      llr: "32.99"
    }
  ];

  function buildDefaultExperiments() {
    return [
      { id: "exp-default-1", name: "产品页面改版测试", status: "进行中", durationText: "13天", tags: ["核心", "请勿删除"], creator: "军儿", analysisType: "转化分析" },
      { id: "exp-default-2", name: "分层定价策略V1", status: "进行中", durationText: "13天", tags: [], creator: "斯克", analysisType: "转化分析" },
      { id: "exp-default-3", name: "首页横幅测试", status: "进行中", durationText: "336天", tags: ["核心"], creator: "川普", analysisType: "转化分析" },
      { id: "exp-default-4", name: "蓝色按钮测试", status: "未开始", durationText: "-", tags: [], creator: "仁勋", analysisType: "转化分析" },
      { id: "exp-default-5", name: "红色按钮变更", status: "已完成", durationText: "40天", tags: [], creator: "泰相", analysisType: "转化分析" }
    ];
  }

  function createTagElement(tagText) {
    const tag = document.createElement("span");
    tag.className = "online-tag";
    tag.textContent = "【" + tagText + "】";
    return tag;
  }

  function createStatusElement(statusText) {
    const status = document.createElement("span");
    status.className = "online-status-badge";
    if (statusText === "进行中") status.classList.add("running");
    if (statusText === "未开始") status.classList.add("pending");
    if (statusText === "已暂停") status.classList.add("paused");
    if (statusText === "已结束" || statusText === "已完成") status.classList.add("done");
    status.textContent = statusText;
    return status;
  }

  function parseDurationText(durationText) {
    const text = String(durationText || "").trim();
    const match = text.match(/^(\d+)\s*(天|日|周|月)$/);
    if (!match) {
      return { value: 14, unit: "日" };
    }
    return {
      value: Number(match[1]),
      unit: match[2] === "天" ? "日" : match[2]
    };
  }

  function setHint(element, text, isWarn) {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("warn", !!isWarn);
  }

  function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    if (num < min) return min;
    if (num > max) return max;
    return num;
  }

  function initOnlineExperimentPage() {
    const navButton = document.getElementById("nav-ab-experiment-btn");
    const experimentPage = document.getElementById("online-experiment-page");
    const createPage = document.getElementById("online-experiment-create-page");
    const detailPage = document.getElementById("online-experiment-detail-page");
    const hero = document.querySelector(".hero");
    const container = document.querySelector(".container");
    const footer = document.querySelector(".footer");
    const createButton = document.getElementById("online-create-experiment-btn");
    const backHomeButton = document.getElementById("online-back-home-btn");
    const backListButton = document.getElementById("online-create-back-list-btn");
    const detailBackHomeButton = document.getElementById("online-detail-back-home-btn");
    const detailBreadcrumbRootButton = document.getElementById("online-detail-breadcrumb-root-btn");
    const detailBreadcrumbName = document.getElementById("online-detail-breadcrumb-name");
    const searchButton = document.getElementById("online-search-trigger-btn");
    const searchInput = document.getElementById("online-search-input");
    const creatorSearchInput = document.getElementById("online-creator-search-input");
    const statusFilter = document.getElementById("online-filter-status");
    const addFilterSelect = document.getElementById("online-add-filter-select");
    const addedFiltersContainer = document.getElementById("online-added-filters");
    const tableBody = document.getElementById("online-experiment-table-body");
    const emptyState = document.getElementById("online-empty-state");

    const detailTabButtons = Array.from(document.querySelectorAll(".online-detail-tab-btn"));
    const detailPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));
    const primaryMetricList = document.getElementById("online-primary-metric-list");
    const primaryMetricInput = document.getElementById("online-primary-metric-input");
    const primaryMetricPresetSelect = document.getElementById("online-primary-metric-preset-select");
    const primaryMetricAddButton = document.getElementById("online-primary-metric-add-btn");
    const primaryMetricHint = document.getElementById("online-primary-metric-hint");
    const secondaryMetricList = document.getElementById("online-secondary-metric-list");
    const secondaryMetricInput = document.getElementById("online-secondary-metric-input");
    const secondaryMetricPresetSelect = document.getElementById("online-secondary-metric-preset-select");
    const secondaryMetricAddButton = document.getElementById("online-secondary-metric-add-btn");
    const secondaryMetricHint = document.getElementById("online-secondary-metric-hint");
    const durationValueInput = document.getElementById("online-duration-value-input");
    const durationUnitSelect = document.getElementById("online-duration-unit-select");
    const trafficPercentInput = document.getElementById("online-traffic-percent-input");
    const targetRuleInput = document.getElementById("online-target-rule-input");
    const groupScroll = document.getElementById("online-group-scroll");
    const groupList = document.getElementById("online-group-list");
    const addGroupButton = document.getElementById("online-add-group-btn");
    const groupTotalHint = document.getElementById("online-group-total-hint");
    const hypothesisInput = document.getElementById("online-hypothesis-input");
    const resultHypothesis = document.getElementById("online-result-hypothesis");
    const resultPrimaryMetrics = document.getElementById("online-result-primary-metrics");
    const resultSecondaryMetrics = document.getElementById("online-result-secondary-metrics");
    const settingsSaveButton = document.getElementById("online-settings-save-btn");
    const settingsSaveHint = document.getElementById("online-settings-save-hint");

    if (
      !navButton ||
      !experimentPage ||
      !createPage ||
      !detailPage ||
      !hero ||
      !container ||
      !footer ||
      !createButton ||
      !backHomeButton ||
      !backListButton ||
      !detailBackHomeButton ||
      !detailBreadcrumbRootButton ||
      !detailBreadcrumbName ||
      !searchButton ||
      !searchInput ||
      !creatorSearchInput ||
      !statusFilter ||
      !addFilterSelect ||
      !addedFiltersContainer ||
      !tableBody ||
      !emptyState ||
      !detailTabButtons.length ||
      !detailPanels.length ||
      !primaryMetricList ||
      !primaryMetricInput ||
      !primaryMetricPresetSelect ||
      !primaryMetricAddButton ||
      !primaryMetricHint ||
      !secondaryMetricList ||
      !secondaryMetricInput ||
      !secondaryMetricPresetSelect ||
      !secondaryMetricAddButton ||
      !secondaryMetricHint ||
      !durationValueInput ||
      !durationUnitSelect ||
      !trafficPercentInput ||
      !targetRuleInput ||
      !groupScroll ||
      !groupList ||
      !addGroupButton ||
      !groupTotalHint ||
      !hypothesisInput ||
      !resultHypothesis ||
      !resultPrimaryMetrics ||
      !resultSecondaryMetrics ||
      !settingsSaveButton ||
      !settingsSaveHint
    ) {
      return;
    }

    if (experimentPage.dataset.initialized === "1") {
      return;
    }
    experimentPage.dataset.initialized = "1";

    const state = {
      experiments: buildDefaultExperiments(),
      optionalFilters: {
        analysisType: { enabled: false, value: "" },
        tag: { enabled: false, value: "" }
      },
      currentExperimentId: "",
      detailConfigs: {},
      nextGroupSeq: 1,
      restoredExperimentIds: {}
    };

    const optionalFilterMetas = {
      analysisType: { label: "分析类型", options: ["全部", "转化分析", "留存分析", "收入分析"] },
      tag: { label: "标签", options: ["全部", "核心", "请勿删除", "高优先级"] }
    };

    function toSafeText(value, fallback) {
      const text = String(value == null ? "" : value).trim();
      return text || (fallback || "");
    }

    function normalizeMetricList(value) {
      if (!Array.isArray(value)) return [];
      const unique = [];
      value.forEach((item) => {
        const metricName = toSafeText(item);
        if (!metricName || unique.includes(metricName)) return;
        unique.push(metricName);
      });
      return unique.slice(0, METRIC_LIMIT);
    }

    function normalizeGroups(value, fallbackGroups) {
      const fallback = Array.isArray(fallbackGroups) ? fallbackGroups : [];
      if (!Array.isArray(value)) {
        return fallback.slice(0, GROUP_LIMIT).map((group) => ({
          id: group.id,
          name: toSafeText(group.name, "未命名分组"),
          allocation: clampNumber(group.allocation, 0, 100, 0),
          description: String(group.description || "")
        }));
      }

      const normalized = value
        .slice(0, GROUP_LIMIT)
        .map((group, index) => {
          const source = group && typeof group === "object" ? group : {};
          return {
            id: toSafeText(source.id, "group-loaded-" + (index + 1)),
            name: toSafeText(source.name, "未命名分组"),
            allocation: clampNumber(source.allocation, 0, 100, 0),
            description: String(source.description || "")
          };
        });

      if (normalized.length >= 2) {
        return normalized;
      }

      const merged = normalized.concat(
        fallback
          .slice(normalized.length, 2)
          .map((group) => ({
            id: group.id,
            name: toSafeText(group.name, "未命名分组"),
            allocation: clampNumber(group.allocation, 0, 100, 0),
            description: String(group.description || "")
          }))
      );
      return merged;
    }

    function normalizeLoadedDetailConfig(rawConfig, experiment) {
      const defaultConfig = createDefaultDetailConfig(experiment);
      const source = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
      const activeTab = source.activeTab === "settings" || source.activeTab === "result" || source.activeTab === "summary"
        ? source.activeTab
        : "settings";
      const durationUnit = source.durationUnit === "日" || source.durationUnit === "周" || source.durationUnit === "月"
        ? source.durationUnit
        : defaultConfig.durationUnit;
      return {
        activeTab: activeTab,
        hypothesis: String(source.hypothesis || ""),
        primaryMetrics: normalizeMetricList(source.primaryMetrics),
        secondaryMetrics: normalizeMetricList(source.secondaryMetrics),
        durationValue: Math.round(clampNumber(source.durationValue, 1, 3650, defaultConfig.durationValue)),
        durationUnit: durationUnit,
        trafficPercent: Math.round(clampNumber(source.trafficPercent, 0, 100, defaultConfig.trafficPercent)),
        targetRule: toSafeText(source.targetRule, "所有环境"),
        groups: normalizeGroups(source.groups, defaultConfig.groups)
      };
    }

    function computeNextGroupSeq(baseValue) {
      let nextValue = Number.isInteger(baseValue) && baseValue > 0 ? baseValue : state.nextGroupSeq;
      Object.values(state.detailConfigs).forEach((config) => {
        if (!config || !Array.isArray(config.groups)) return;
        config.groups.forEach((group) => {
          const match = String(group.id || "").match(/^group-(\d+)$/);
          if (!match) return;
          const numericId = Number(match[1]);
          if (Number.isInteger(numericId) && numericId >= nextValue) {
            nextValue = numericId + 1;
          }
        });
      });
      return Math.max(nextValue, 1);
    }

    function restoreDetailConfigsFromStorage() {
      if (typeof window === "undefined" || !window.localStorage) {
        return;
      }
      try {
        const savedText = window.localStorage.getItem(DETAIL_CONFIG_STORAGE_KEY);
        if (!savedText) return;
        const parsed = JSON.parse(savedText);
        const savedConfigs = parsed && typeof parsed === "object" ? parsed.detailConfigs : null;
        if (!savedConfigs || typeof savedConfigs !== "object") return;

        state.experiments.forEach((experiment) => {
          if (!Object.prototype.hasOwnProperty.call(savedConfigs, experiment.id)) return;
          state.detailConfigs[experiment.id] = normalizeLoadedDetailConfig(savedConfigs[experiment.id], experiment);
          state.restoredExperimentIds[experiment.id] = true;
        });

        state.nextGroupSeq = computeNextGroupSeq(parsed.nextGroupSeq);
      } catch (error) {
        setHint(settingsSaveHint, "历史设置读取失败，已使用默认配置。", true);
      }
    }

    function persistDetailConfigsToStorage() {
      if (typeof window === "undefined" || !window.localStorage) {
        setHint(settingsSaveHint, "当前环境不支持本地保存。", true);
        return false;
      }
      try {
        const payload = {
          version: 1,
          nextGroupSeq: state.nextGroupSeq,
          detailConfigs: state.detailConfigs
        };
        window.localStorage.setItem(DETAIL_CONFIG_STORAGE_KEY, JSON.stringify(payload));
        return true;
      } catch (error) {
        setHint(settingsSaveHint, "保存失败，请检查浏览器本地存储权限。", true);
        return false;
      }
    }

    function resetMetricPreset(metricType) {
      if (metricType === "primary") {
        primaryMetricPresetSelect.value = "";
        return;
      }
      secondaryMetricPresetSelect.value = "";
    }

    function populateMetricPreset(selectElement) {
      selectElement.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "选择默认指标";
      selectElement.appendChild(placeholder);

      DEFAULT_METRICS.forEach((metric) => {
        const option = document.createElement("option");
        option.value = metric.name;
        option.textContent = metric.name;
        selectElement.appendChild(option);
      });
      selectElement.value = "";
    }

    function createPrimaryMetricTooltip(metricName) {
      const detail = DEFAULT_METRIC_MAP[metricName];
      if (!detail) return null;

      const tooltip = document.createElement("div");
      tooltip.className = "online-metric-tooltip";

      [
        ["描述", detail.description || "-"],
        ["解释", detail.explanation || "-"],
        ["配置", detail.config || "-"]
      ].forEach((item) => {
        const row = document.createElement("div");
        row.className = "online-metric-tooltip-row";

        const label = document.createElement("span");
        label.className = "online-metric-tooltip-label";
        label.textContent = item[0] + "：";

        const content = document.createElement("span");
        content.className = "online-metric-tooltip-content";
        content.textContent = item[1];

        row.appendChild(label);
        row.appendChild(content);
        tooltip.appendChild(row);
      });
      return tooltip;
    }

    populateMetricPreset(primaryMetricPresetSelect);
    populateMetricPreset(secondaryMetricPresetSelect);

    function createGroup(name, allocation) {
      const group = {
        id: "group-" + state.nextGroupSeq,
        name: name,
        allocation: allocation,
        description: ""
      };
      state.nextGroupSeq += 1;
      return group;
    }

    function createDefaultDetailConfig(experiment) {
      const duration = parseDurationText(experiment && experiment.durationText);
      return {
        activeTab: "settings",
        hypothesis: "",
        primaryMetrics: [],
        secondaryMetrics: [],
        durationValue: duration.value,
        durationUnit: duration.unit,
        trafficPercent: 100,
        targetRule: "所有环境",
        groups: [createGroup("对照组", 50), createGroup("实验组", 50)]
      };
    }

    restoreDetailConfigsFromStorage();

    function getExperimentById(experimentId) {
      return state.experiments.find((item) => item.id === experimentId) || null;
    }

    function ensureCurrentDetailConfig() {
      if (!state.currentExperimentId) return null;
      if (!state.detailConfigs[state.currentExperimentId]) {
        const experiment = getExperimentById(state.currentExperimentId);
        state.detailConfigs[state.currentExperimentId] = createDefaultDetailConfig(experiment);
      }
      return state.detailConfigs[state.currentExperimentId];
    }

    function syncCurrentExperimentDurationText() {
      const config = ensureCurrentDetailConfig();
      const experiment = getExperimentById(state.currentExperimentId);
      if (!config || !experiment) return;
      experiment.durationText = config.durationValue + config.durationUnit;
    }

    function buildSavedTimeText() {
      return new Date().toLocaleString("zh-CN", {
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }

    function getFilteredExperiments() {
      const keyword = String(searchInput.value || "").trim().toLowerCase();
      const creatorKeyword = String(creatorSearchInput.value || "").trim().toLowerCase();
      const statusValue = statusFilter.value;
      const analysisTypeValue = state.optionalFilters.analysisType.enabled ? state.optionalFilters.analysisType.value : "";
      const tagValue = state.optionalFilters.tag.enabled ? state.optionalFilters.tag.value : "";

      return state.experiments.filter((experiment) => {
        if (keyword && !experiment.name.toLowerCase().includes(keyword)) return false;
        if (creatorKeyword && !String(experiment.creator || "").toLowerCase().includes(creatorKeyword)) return false;
        if (statusValue && experiment.status !== statusValue) return false;
        if (analysisTypeValue && experiment.analysisType !== analysisTypeValue) return false;
        if (tagValue && !experiment.tags.includes(tagValue)) return false;
        return true;
      });
    }

    function getMetricResultTemplate(metricType, metricIndex) {
      if (metricType === "primary") {
        return PRIMARY_RESULT_TEMPLATE;
      }
      return SECONDARY_RESULT_TEMPLATES[metricIndex % SECONDARY_RESULT_TEMPLATES.length];
    }

    function getResultGroupNames(config) {
      const controlGroupName = (config.groups[0] && String(config.groups[0].name || "").trim()) || "对照组";
      const treatmentGroupName = (config.groups[1] && String(config.groups[1].name || "").trim()) || "实验组";
      return {
        controlGroupName: controlGroupName,
        treatmentGroupName: treatmentGroupName
      };
    }

    function buildConclusionText(metricName, template, groupNames) {
      return (
        groupNames.treatmentGroupName +
        "相较于" +
        groupNames.controlGroupName +
        metricName +
        "，提升" +
        template.liftText +
        "。这一数字具有统计学意义，LLR 为 " +
        template.llr +
        "，高于上限阈值 2.773。"
      );
    }

    function createResultMetricCard(metricName, metricType, metricIndex, config) {
      const template = getMetricResultTemplate(metricType, metricIndex);
      const groupNames = getResultGroupNames(config);

      const card = document.createElement("article");
      card.className = "online-result-metric-card";

      const title = document.createElement("h4");
      title.className = "online-result-metric-title";
      title.textContent = String(metricIndex + 1) + ". " + metricName;
      card.appendChild(title);

      const tableWrap = document.createElement("div");
      tableWrap.className = "online-result-table-wrap";
      const table = document.createElement("table");
      table.className = "online-result-table";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      RESULT_TABLE_HEADERS.forEach((header) => {
        const th = document.createElement("th");
        th.textContent = header;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);

      const tbody = document.createElement("tbody");
      [
        { groupName: groupNames.controlGroupName, data: template.control },
        { groupName: groupNames.treatmentGroupName, data: template.treatment }
      ].forEach((item) => {
        const tr = document.createElement("tr");
        const cells = [
          metricName,
          item.groupName,
          item.data.userUnit,
          item.data.participationRate,
          item.data.mean,
          item.data.stdErr,
          item.data.total
        ];
        cells.forEach((cellText) => {
          const td = document.createElement("td");
          td.textContent = String(cellText);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      table.appendChild(thead);
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      card.appendChild(tableWrap);

      const conclusion = document.createElement("div");
      conclusion.className = "online-result-conclusion";
      conclusion.textContent = "结论：" + buildConclusionText(metricName, template, groupNames);
      card.appendChild(conclusion);
      return card;
    }

    function renderResultMetrics(metricType) {
      const config = ensureCurrentDetailConfig();
      if (!config) return;

      const isPrimary = metricType === "primary";
      const metrics = isPrimary ? config.primaryMetrics : config.secondaryMetrics;
      const container = isPrimary ? resultPrimaryMetrics : resultSecondaryMetrics;
      const emptyText = isPrimary ? "暂未添加主要指标，请先到设置区补充。" : "暂未添加次要指标，请先到设置区补充。";
      container.replaceChildren();

      if (!metrics.length) {
        const emptyNode = document.createElement("div");
        emptyNode.className = "online-result-empty";
        emptyNode.textContent = emptyText;
        container.appendChild(emptyNode);
        return;
      }

      metrics.forEach((metricName, metricIndex) => {
        container.appendChild(createResultMetricCard(metricName, metricType, metricIndex, config));
      });
    }

    function renderResultPanel() {
      const config = ensureCurrentDetailConfig();
      if (!config) return;

      const hypothesisText = String(config.hypothesis || "").trim();
      if (hypothesisText) {
        resultHypothesis.textContent = hypothesisText;
        resultHypothesis.classList.remove("muted");
      } else {
        resultHypothesis.textContent = "暂未填写实验假说，请先在设置区补充。";
        resultHypothesis.classList.add("muted");
      }

      renderResultMetrics("primary");
      renderResultMetrics("secondary");
    }

    function renderDetailTabs() {
      const config = ensureCurrentDetailConfig();
      const activeTab = config ? config.activeTab : "settings";
      detailTabButtons.forEach((button) => {
        const isActive = button.dataset.tab === activeTab;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      detailPanels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.dataset.tabPanel !== activeTab);
      });
    }

    function renderMetricList(metricType) {
      const config = ensureCurrentDetailConfig();
      if (!config) return;

      const isPrimary = metricType === "primary";
      const metrics = isPrimary ? config.primaryMetrics : config.secondaryMetrics;
      const listElement = isPrimary ? primaryMetricList : secondaryMetricList;
      const hintElement = isPrimary ? primaryMetricHint : secondaryMetricHint;
      listElement.replaceChildren();

      if (!metrics.length) {
        const empty = document.createElement("span");
        empty.className = "online-empty-inline";
        empty.textContent = "暂未添加指标";
        listElement.appendChild(empty);
      } else {
        metrics.forEach((metric, index) => {
          const chip = document.createElement("span");
          chip.className = "online-metric-chip";
          const metricName = document.createElement("span");
          metricName.textContent = metric;
          chip.appendChild(metricName);

          if (isPrimary) {
            const tooltip = createPrimaryMetricTooltip(metric);
            if (tooltip) {
              chip.classList.add("online-metric-chip-with-tooltip");
              chip.appendChild(tooltip);
            }
          }

          const removeButton = document.createElement("button");
          removeButton.type = "button";
          removeButton.className = "online-chip-remove-btn";
          removeButton.textContent = "×";
          removeButton.setAttribute("aria-label", "删除指标");
          removeButton.addEventListener("click", () => {
            metrics.splice(index, 1);
            renderMetricList(metricType);
            renderResultPanel();
          });

          chip.appendChild(removeButton);
          listElement.appendChild(chip);
        });
      }

      setHint(hintElement, "已添加 " + metrics.length + "/" + METRIC_LIMIT + " 个", metrics.length >= METRIC_LIMIT);
    }

    function renderGroupTotalHint(config) {
      const total = config.groups.reduce((sum, group) => sum + Number(group.allocation || 0), 0);
      const isWarn = Math.abs(total - 100) > 0.001;
      const totalText = Number.isInteger(total) ? String(total) : total.toFixed(1);
      const suffix = config.groups.length >= GROUP_LIMIT ? "，已达分组上限" : "";
      setHint(groupTotalHint, "当前分组分流合计 " + totalText + "%" + (isWarn ? "（建议调整为 100%）" : "（已平衡）") + suffix, isWarn);
      addGroupButton.disabled = config.groups.length >= GROUP_LIMIT;
    }

    function renderGroupList() {
      const config = ensureCurrentDetailConfig();
      if (!config) return;

      groupList.replaceChildren();
      config.groups.forEach((group, index) => {
        const node = document.createElement("div");
        node.className = "online-group-node";

        if (index > 0) {
          const flow = document.createElement("div");
          flow.className = "online-group-flow";

          const flowLabel = document.createElement("span");
          flowLabel.textContent = "分流百分比";

          const flowArrow = document.createElement("span");
          flowArrow.className = "online-group-flow-arrow";
          flowArrow.textContent = "→";

          flow.appendChild(flowLabel);
          flow.appendChild(flowArrow);
          node.appendChild(flow);
        }

        const card = document.createElement("div");
        card.className = "online-group-card";

        const head = document.createElement("div");
        head.className = "online-group-card-head";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "online-short-input online-group-card-name";
        nameInput.value = group.name;
        nameInput.placeholder = "分组名称";
        nameInput.addEventListener("input", () => {
          const nextName = String(nameInput.value || "").trim();
          group.name = nextName || "未命名分组";
          renderResultPanel();
        });

        const ratioWrap = document.createElement("div");
        ratioWrap.className = "online-group-ratio-wrap";

        const ratioInput = document.createElement("input");
        ratioInput.type = "number";
        ratioInput.className = "online-short-input online-group-card-ratio";
        ratioInput.min = "0";
        ratioInput.max = "100";
        ratioInput.step = "0.1";
        ratioInput.value = String(group.allocation);
        ratioInput.addEventListener("change", () => {
          group.allocation = clampNumber(ratioInput.value, 0, 100, group.allocation);
          ratioInput.value = String(group.allocation);
          renderGroupTotalHint(config);
        });

        const ratioSuffix = document.createElement("span");
        ratioSuffix.textContent = "%";

        ratioWrap.appendChild(ratioInput);
        ratioWrap.appendChild(ratioSuffix);
        head.appendChild(nameInput);
        head.appendChild(ratioWrap);

        if (config.groups.length > 2) {
          const removeButton = document.createElement("button");
          removeButton.type = "button";
          removeButton.className = "online-group-remove-btn";
          removeButton.textContent = "删除";
          removeButton.addEventListener("click", () => {
            if (config.groups.length <= 2) return;
            config.groups = config.groups.filter((item) => item.id !== group.id);
            renderGroupList();
          });
          head.appendChild(removeButton);
        }

        const descriptionInput = document.createElement("textarea");
        descriptionInput.className = "online-group-desc";
        descriptionInput.placeholder = "分组描述（可选）";
        descriptionInput.value = group.description || "";
        descriptionInput.addEventListener("input", () => {
          group.description = descriptionInput.value;
        });

        card.appendChild(head);
        card.appendChild(descriptionInput);
        node.appendChild(card);
        groupList.appendChild(node);
      });

      renderGroupTotalHint(config);
      renderResultPanel();
    }

    function renderDetailSettings() {
      const config = ensureCurrentDetailConfig();
      if (!config) return;

      hypothesisInput.value = config.hypothesis || "";
      durationValueInput.value = String(config.durationValue);
      durationUnitSelect.value = config.durationUnit;
      trafficPercentInput.value = String(config.trafficPercent);
      targetRuleInput.value = config.targetRule;

      renderMetricList("primary");
      renderMetricList("secondary");
      renderGroupList();
    }

    function addMetric(metricType, rawValue) {
      const config = ensureCurrentDetailConfig();
      if (!config) return;

      const isPrimary = metricType === "primary";
      const list = isPrimary ? config.primaryMetrics : config.secondaryMetrics;
      const inputElement = isPrimary ? primaryMetricInput : secondaryMetricInput;
      const hintElement = isPrimary ? primaryMetricHint : secondaryMetricHint;
      const value = String(rawValue != null ? rawValue : inputElement.value || "").trim();

      if (!value) {
        setHint(hintElement, "请输入指标名称", true);
        return;
      }
      if (list.length >= METRIC_LIMIT) {
        setHint(hintElement, "最多添加 " + METRIC_LIMIT + " 个指标", true);
        return;
      }
      if (list.includes(value)) {
        setHint(hintElement, "该指标已存在，无需重复添加", true);
        return;
      }

      list.push(value);
      inputElement.value = "";
      resetMetricPreset(metricType);
      renderMetricList(metricType);
      renderResultPanel();
    }

    function renderExperimentTable() {
      const filteredExperiments = getFilteredExperiments();
      tableBody.replaceChildren();

      if (!filteredExperiments.length) {
        emptyState.classList.remove("hidden");
        return;
      }
      emptyState.classList.add("hidden");

      filteredExperiments.forEach((experiment) => {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        const nameButton = document.createElement("button");
        nameButton.type = "button";
        nameButton.className = "online-name-link";
        nameButton.textContent = experiment.name;
        nameButton.addEventListener("click", () => openDetailPage(experiment));
        nameCell.appendChild(nameButton);

        const statusCell = document.createElement("td");
        statusCell.appendChild(createStatusElement(experiment.status));

        const durationCell = document.createElement("td");
        durationCell.textContent = experiment.durationText || "--";

        const tagsCell = document.createElement("td");
        if (experiment.tags.length > 0) {
          const tagWrap = document.createElement("div");
          tagWrap.className = "online-tag-wrap";
          experiment.tags.forEach((tagText) => tagWrap.appendChild(createTagElement(tagText)));
          tagsCell.appendChild(tagWrap);
        } else {
          tagsCell.textContent = "--";
        }

        const creatorCell = document.createElement("td");
        creatorCell.textContent = experiment.creator || "--";

        row.appendChild(nameCell);
        row.appendChild(statusCell);
        row.appendChild(durationCell);
        row.appendChild(tagsCell);
        row.appendChild(creatorCell);
        tableBody.appendChild(row);
      });
    }

    function renderAddedFilters() {
      addedFiltersContainer.replaceChildren();
      const activeKeys = Object.keys(state.optionalFilters).filter((key) => state.optionalFilters[key].enabled);
      if (activeKeys.length === 0) {
        addedFiltersContainer.classList.add("hidden");
        return;
      }

      addedFiltersContainer.classList.remove("hidden");
      activeKeys.forEach((key) => {
        const config = optionalFilterMetas[key];
        if (!config) return;

        const item = document.createElement("div");
        item.className = "online-added-filter-item";

        const label = document.createElement("label");
        label.className = "online-filter-item";
        label.textContent = config.label;

        const select = document.createElement("select");
        config.options.forEach((optionText, index) => {
          const option = document.createElement("option");
          option.value = index === 0 ? "" : optionText;
          option.textContent = optionText;
          if (option.value === state.optionalFilters[key].value) {
            option.selected = true;
          }
          select.appendChild(option);
        });
        select.addEventListener("change", () => {
          state.optionalFilters[key].value = select.value;
          renderExperimentTable();
        });
        label.appendChild(select);

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "online-filter-remove-btn";
        removeButton.textContent = "移除";
        removeButton.addEventListener("click", () => {
          state.optionalFilters[key].enabled = false;
          state.optionalFilters[key].value = "";
          renderAddedFilters();
          renderExperimentTable();
        });

        item.appendChild(label);
        item.appendChild(removeButton);
        addedFiltersContainer.appendChild(item);
      });
    }

    function showOnlineShell() {
      hero.classList.add("hidden");
      container.classList.add("hidden");
      footer.classList.add("hidden");
      document.body.classList.add("online-page-open");
      navButton.classList.add("active");
    }

    function hideAllOnlinePages() {
      experimentPage.classList.add("hidden");
      createPage.classList.add("hidden");
      detailPage.classList.add("hidden");
    }

    function openExperimentListPage() {
      showOnlineShell();
      hideAllOnlinePages();
      experimentPage.classList.remove("hidden");
      renderExperimentTable();
    }

    function openCreatePage() {
      showOnlineShell();
      hideAllOnlinePages();
      createPage.classList.remove("hidden");
    }

    function openDetailPage(experiment) {
      showOnlineShell();
      hideAllOnlinePages();
      state.currentExperimentId = experiment.id;
      detailBreadcrumbName.textContent = experiment.name;
      ensureCurrentDetailConfig();
      renderDetailTabs();
      renderDetailSettings();
      if (state.restoredExperimentIds[state.currentExperimentId]) {
        setHint(settingsSaveHint, "已加载上次保存的设置，可继续修改后再次保存。", false);
      } else {
        setHint(settingsSaveHint, "修改后点击保存，下次进入可恢复当前实验配置。", false);
      }
      detailPage.classList.remove("hidden");
    }

    function goBackHomePage() {
      hideAllOnlinePages();
      hero.classList.remove("hidden");
      container.classList.remove("hidden");
      footer.classList.remove("hidden");
      document.body.classList.remove("online-page-open");
      navButton.classList.remove("active");
    }

    function handleAddFilterSelectChange() {
      const key = addFilterSelect.value;
      addFilterSelect.value = "";
      if (!key || !state.optionalFilters[key] || state.optionalFilters[key].enabled) {
        return;
      }
      state.optionalFilters[key].enabled = true;
      state.optionalFilters[key].value = "";
      renderAddedFilters();
      renderExperimentTable();
    }

    detailTabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const config = ensureCurrentDetailConfig();
        if (!config) return;
        const tabName = String(button.dataset.tab || "");
        if (!tabName) return;
        config.activeTab = tabName;
        renderDetailTabs();
        if (tabName === "result") {
          renderResultPanel();
        }
      });
    });

    hypothesisInput.addEventListener("input", () => {
      const config = ensureCurrentDetailConfig();
      if (!config) return;
      config.hypothesis = String(hypothesisInput.value || "").trim();
      renderResultPanel();
    });

    primaryMetricAddButton.addEventListener("click", () => addMetric("primary"));
    secondaryMetricAddButton.addEventListener("click", () => addMetric("secondary"));
    primaryMetricPresetSelect.addEventListener("change", () => {
      const value = String(primaryMetricPresetSelect.value || "").trim();
      if (!value) return;
      addMetric("primary", value);
    });
    secondaryMetricPresetSelect.addEventListener("change", () => {
      const value = String(secondaryMetricPresetSelect.value || "").trim();
      if (!value) return;
      addMetric("secondary", value);
    });
    primaryMetricInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addMetric("primary");
      }
    });
    secondaryMetricInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addMetric("secondary");
      }
    });

    durationValueInput.addEventListener("change", () => {
      const config = ensureCurrentDetailConfig();
      if (!config) return;
      config.durationValue = Math.round(clampNumber(durationValueInput.value, 1, 3650, config.durationValue));
      durationValueInput.value = String(config.durationValue);
      syncCurrentExperimentDurationText();
    });
    durationUnitSelect.addEventListener("change", () => {
      const config = ensureCurrentDetailConfig();
      if (!config) return;
      const unit = durationUnitSelect.value;
      if (unit === "日" || unit === "周" || unit === "月") {
        config.durationUnit = unit;
        syncCurrentExperimentDurationText();
      }
    });
    trafficPercentInput.addEventListener("change", () => {
      const config = ensureCurrentDetailConfig();
      if (!config) return;
      config.trafficPercent = Math.round(clampNumber(trafficPercentInput.value, 0, 100, config.trafficPercent));
      trafficPercentInput.value = String(config.trafficPercent);
    });
    targetRuleInput.addEventListener("blur", () => {
      const config = ensureCurrentDetailConfig();
      if (!config) return;
      config.targetRule = String(targetRuleInput.value || "").trim() || "所有环境";
      targetRuleInput.value = config.targetRule;
    });
    addGroupButton.addEventListener("click", () => {
      const config = ensureCurrentDetailConfig();
      if (!config) return;
      if (config.groups.length >= GROUP_LIMIT) {
        renderGroupTotalHint(config);
        return;
      }
      const groupName = "实验组" + (config.groups.length + 1);
      config.groups.push(createGroup(groupName, 0));
      renderGroupList();
      requestAnimationFrame(() => {
        groupScroll.scrollLeft = groupScroll.scrollWidth;
      });
    });
    settingsSaveButton.addEventListener("click", () => {
      const config = ensureCurrentDetailConfig();
      if (!config || !state.currentExperimentId) {
        setHint(settingsSaveHint, "请先进入一个实验详情后再保存。", true);
        return;
      }
      syncCurrentExperimentDurationText();
      state.restoredExperimentIds[state.currentExperimentId] = true;
      const saved = persistDetailConfigsToStorage();
      if (saved) {
        setHint(settingsSaveHint, "保存成功：" + buildSavedTimeText(), false);
      }
    });

    navButton.addEventListener("click", openExperimentListPage);
    backHomeButton.addEventListener("click", goBackHomePage);
    backListButton.addEventListener("click", openExperimentListPage);
    detailBackHomeButton.addEventListener("click", goBackHomePage);
    detailBreadcrumbRootButton.addEventListener("click", openExperimentListPage);
    createButton.addEventListener("click", openCreatePage);
    addFilterSelect.addEventListener("change", handleAddFilterSelectChange);
    searchButton.addEventListener("click", renderExperimentTable);
    searchInput.addEventListener("input", renderExperimentTable);
    creatorSearchInput.addEventListener("input", renderExperimentTable);
    statusFilter.addEventListener("change", renderExperimentTable);

    renderAddedFilters();
    renderDetailTabs();
  }

  window.AbOnlineExperiment = {
    init: initOnlineExperimentPage
  };
})();
