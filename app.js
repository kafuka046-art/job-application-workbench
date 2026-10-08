(function () {
  "use strict";

  const STORAGE_KEY = "resume-workflow-tool-v1";
  const defaultRules = [
    "不得编造经历、数字、岗位职责或成果",
    "参与、负责、主导必须符合真实边界",
    "先输出选材方案和未收录项，用户确认后再生成简历",
    "简历中的作品链接按岗位裁剪，附件按平台规则准备",
    "所有重要数字和成果必须能够解释来源",
    "投递前检查公司名、岗位名、日期、链接和残留文本"
  ].join("；\n");

  const state = loadState();
  let activeFilter = "all";

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed && typeof parsed === "object") return normalize(parsed);
    } catch (_) {}
    return normalize({ profile: { rules: defaultRules }, experiences: [], job: {}, selected: [], applications: [], checks: {} });
  }

  function normalize(data) {
    return {
      profile: { name: "", direction: "", education: "", rules: defaultRules, ...(data.profile || {}) },
      experiences: Array.isArray(data.experiences) ? data.experiences : [],
      job: data.job || {},
      selected: Array.isArray(data.selected) ? data.selected : [],
      applications: Array.isArray(data.applications) ? data.applications : [],
      checks: data.checks || {}
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateHealth();
    updatePrompt();
  }

  function toast(message) {
    const node = $("toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 1800);
  }

  function switchView(name) {
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindProfile() {
    const map = { candidateName: "name", targetDirection: "direction", education: "education", rules: "rules" };
    Object.entries(map).forEach(([id, key]) => {
      $(id).value = state.profile[key] || "";
      $(id).addEventListener("input", (event) => {
        state.profile[key] = event.target.value;
        saveState();
      });
    });
  }

  function updateHealth() {
    let score = 0;
    const notes = [];
    if (state.profile.name && state.profile.direction && state.profile.education) score += 20;
    else notes.push("补齐姓名、方向和教育背景");
    if (state.profile.rules.trim()) score += 10;
    else notes.push("写下不可突破的简历规则");
    score += Math.min(state.experiences.length * 10, 30);
    if (state.experiences.length < 3) notes.push("建议至少录入3段可用经历");
    const withResults = state.experiences.filter((item) => item.results && item.results.trim()).length;
    const withEvidence = state.experiences.filter((item) => item.evidence && item.evidence.trim()).length;
    const withBoundary = state.experiences.filter((item) => item.boundary && item.boundary.trim()).length;
    if (state.experiences.length) {
      score += Math.round(15 * withResults / state.experiences.length);
      score += Math.round(15 * withEvidence / state.experiences.length);
      score += Math.round(10 * withBoundary / state.experiences.length);
    }
    if (withResults < state.experiences.length) notes.push("为缺少结果的经历补充产出或数据");
    if (withEvidence < state.experiences.length) notes.push("为关键经历补充作品或证据");
    if (withBoundary < state.experiences.length) notes.push("标明主导、负责或参与的边界");
    score = Math.min(100, score);
    $("healthScore").textContent = score;
    $("healthBar").style.width = `${score}%`;
    $("healthList").innerHTML = (notes.length ? notes.slice(0, 4) : ["事实库已具备基础可用性"]).map((note) => `<li>${escapeHtml(note)}</li>`).join("");
    const complete = state.profile.name && state.profile.direction && state.profile.education;
    $("profileStatus").textContent = complete ? "已建立" : "待完善";
    $("profileStatus").classList.toggle("ready", Boolean(complete));
  }

  function renderExperiences() {
    const list = state.experiences.filter((item) => activeFilter === "all" || item.type === activeFilter);
    if (!list.length) {
      $("experienceList").innerHTML = `<div class="panel empty-state">${state.experiences.length ? "这个分类还没有经历。" : "还没有经历。先新增一段实习、项目或校园实践。"}</div>`;
      return;
    }
    $("experienceList").innerHTML = list.map((item) => {
      const tags = splitTags(item.tags).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
      return `<article class="experience-card">
        <div class="experience-top">
          <div><h3><span class="type-tag">${escapeHtml(item.type)}</span>${escapeHtml(item.title)}</h3><div class="meta">${escapeHtml(item.role || "未填写角色")} · ${escapeHtml(item.time || "未填写时间")}</div></div>
          <div class="card-actions"><button class="button ghost small" data-edit="${item.id}">编辑</button><button class="button danger small" data-delete="${item.id}">删除</button></div>
        </div>
        <div class="experience-body"><div><p><strong>动作</strong>\n${escapeHtml(item.actions)}</p></div><div><p><strong>结果</strong>\n${escapeHtml(item.results || "暂无结果数据")}</p></div></div>
        <div class="tags">${tags}</div>
      </article>`;
    }).join("");
  }

  function splitTags(tags) {
    return String(tags || "").split(/[，,、\s]+/).map((x) => x.trim()).filter(Boolean);
  }

  function openExperience(id) {
    const item = state.experiences.find((entry) => entry.id === id) || {};
    $("dialogTitle").textContent = id ? "编辑经历" : "新增经历";
    $("experienceId").value = item.id || "";
    $("experienceType").value = item.type || "实习";
    $("experienceTime").value = item.time || "";
    $("experienceTitle").value = item.title || "";
    $("experienceRole").value = item.role || "";
    $("experienceActions").value = item.actions || "";
    $("experienceResults").value = item.results || "";
    $("experienceTags").value = item.tags || "";
    $("experienceEvidence").value = item.evidence || "";
    $("experienceBoundary").value = item.boundary || "";
    $("experienceDialog").showModal();
  }

  function saveExperience(event) {
    event.preventDefault();
    const id = $("experienceId").value || `exp_${Date.now()}`;
    const item = {
      id,
      type: $("experienceType").value,
      time: $("experienceTime").value.trim(),
      title: $("experienceTitle").value.trim(),
      role: $("experienceRole").value.trim(),
      actions: $("experienceActions").value.trim(),
      results: $("experienceResults").value.trim(),
      tags: $("experienceTags").value.trim(),
      evidence: $("experienceEvidence").value.trim(),
      boundary: $("experienceBoundary").value.trim()
    };
    if (!item.title || !item.actions) return toast("请填写经历名称和具体动作");
    const index = state.experiences.findIndex((entry) => entry.id === id);
    if (index >= 0) state.experiences[index] = item;
    else state.experiences.push(item);
    if (!state.selected.includes(id)) state.selected.push(id);
    saveState();
    renderExperiences();
    renderMatches();
    $("experienceDialog").close();
    toast("经历已保存");
  }

  function bindJob() {
    const map = { jobCompany: "company", jobTitle: "title", jobCity: "city", jobCode: "code", jobDescription: "description" };
    Object.entries(map).forEach(([id, key]) => {
      $(id).value = state.job[key] || "";
      $(id).addEventListener("input", (event) => { state.job[key] = event.target.value; saveState(); });
    });
  }

  const keywordGroups = {
    "内容": ["内容", "选题", "文案", "编辑", "审核", "推荐", "热点", "专题", "创作者", "视频", "社区"],
    "数据": ["数据", "分析", "指标", "复盘", "转化", "留存", "增长", "ROI", "CTR", "效果"],
    "产品": ["产品", "需求", "用户", "功能", "策略", "迭代", "PRD", "原型", "体验"],
    "市场": ["市场", "品牌", "营销", "传播", "竞品", "洞察", "GTM", "商业"],
    "活动": ["活动", "策划", "执行", "资源", "流程", "项目", "协调", "KOL"],
    "AI": ["AI", "人工智能", "大模型", "AIGC", "Agent", "多模态", "模型", "Prompt"],
    "协作": ["沟通", "协作", "跨部门", "推进", "责任心", "执行力", "表达", "主动性"]
  };

  function extractKeywords(text) {
    const found = [];
    Object.entries(keywordGroups).forEach(([group, words]) => {
      words.forEach((word) => {
        const count = (String(text).toLowerCase().match(new RegExp(word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
        if (count) found.push({ word, group, count });
      });
    });
    return found.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, "zh-CN"));
  }

  function scoreExperience(item, keywords) {
    const haystack = [item.title, item.role, item.actions, item.results, item.tags].join(" ").toLowerCase();
    const matches = keywords.filter((entry) => haystack.includes(entry.word.toLowerCase()));
    const groups = [...new Set(matches.map((entry) => entry.group))];
    const resultBonus = item.results ? 10 : 0;
    const evidenceBonus = item.evidence ? 5 : 0;
    const score = Math.min(100, matches.length * 8 + groups.length * 6 + resultBonus + evidenceBonus);
    return { score, matches: matches.map((entry) => entry.word).slice(0, 8), groups };
  }

  function analyzeJob() {
    if (!state.job.title.trim() || !state.job.description.trim()) return toast("请先填写岗位名称和完整JD");
    const keywords = extractKeywords(state.job.description);
    $("keywordCloud").classList.remove("empty-state");
    $("keywordCloud").innerHTML = keywords.length ? keywords.slice(0, 28).map((entry, index) => `<span class="${index < 8 ? "hot" : ""}">${escapeHtml(entry.word)} · ${entry.count}</span>`).join("") : "未识别出常见关键词，请人工阅读JD。";
    const risks = [];
    if (state.experiences.length < 3) risks.push("经历库不足3段，选材空间有限。");
    if (!keywords.length) risks.push("JD关键词较少或格式特殊，需要人工拆解。");
    const jd = state.job.description;
    if (/必须|要求|本科|硕士|英语|证书|专业/.test(jd)) risks.push("JD含硬性要求，请逐项确认学历、专业、语言或证书条件。");
    if (/作品|作品集|链接|附件/.test(jd)) risks.push("岗位可能要求作品或附件，投递前检查链接和上传规则。");
    risks.push("匹配分只代表文本重合度，不代表真实胜任度或录用概率。");
    $("riskList").innerHTML = risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("");
    renderMatches();
    updatePrompt();
    toast("选材建议已生成");
  }

  function renderMatches() {
    const keywords = extractKeywords(state.job.description || "");
    if (!state.experiences.length) {
      $("matchList").innerHTML = '<div class="panel empty-state">先在经历库中录入素材。</div>';
      return;
    }
    const ranked = state.experiences.map((item) => ({ item, ...scoreExperience(item, keywords) })).sort((a, b) => b.score - a.score);
    $("matchList").innerHTML = ranked.map(({ item, score, matches, groups }) => {
      const reason = matches.length ? `命中：${matches.join("、")}。覆盖方向：${groups.join("、") || "待人工判断"}。` : "未识别出直接关键词，但可能仍有迁移价值，需要人工判断。";
      return `<article class="match-card">
        <div class="match-top"><div><h3>${escapeHtml(item.title)}</h3><div class="meta">${escapeHtml(item.type)} · ${escapeHtml(item.role || "未填写角色")}</div></div><div class="match-score"><strong>${score}</strong>粗匹配</div></div>
        <p class="match-reason">${escapeHtml(reason)}</p>
        <label class="select-line"><input type="checkbox" data-select="${item.id}" ${state.selected.includes(item.id) ? "checked" : ""}>带入分析包</label>
      </article>`;
    }).join("");
  }

  function updatePrompt() {
    const selected = state.experiences.filter((item) => state.selected.includes(item.id));
    const lines = [
      "你是一名严谨的求职材料顾问。请根据以下真实资料完成岗位分析和简历选材，不得自行补充事实。",
      "",
      "# 工作顺序",
      "1. 拆解JD：核心任务、硬性要求、加分项、业务方向、风险。",
      "2. 将经历分为：强证据、弱证据、缺口。解释为什么。",
      "3. 先给出拟收录、可选、未收录经历及理由，不要直接生成简历。",
      "4. 等我确认后，再按岗位要求改写；不得编造数字或扩大职责。",
      "5. 输出时标出需要我补充确认的信息。",
      "",
      "# 候选人信息",
      `姓名：${state.profile.name || "未填写"}`,
      `求职方向：${state.profile.direction || "未填写"}`,
      `教育背景：${state.profile.education || "未填写"}`,
      "",
      "# 硬规则",
      state.profile.rules || "无",
      "",
      "# 目标岗位",
      `公司：${state.job.company || "未填写"}`,
      `岗位：${state.job.title || "未填写"}`,
      `城市：${state.job.city || "未填写"}`,
      `岗位编号：${state.job.code || "未填写"}`,
      "JD：",
      state.job.description || "未填写",
      "",
      "# 已选择的经历"
    ];
    if (!selected.length) lines.push("尚未选择经历。");
    selected.forEach((item, index) => {
      lines.push(
        "",
        `## ${index + 1}. ${item.title}`,
        `类型：${item.type}`,
        `角色：${item.role || "未填写"}`,
        `时间：${item.time || "未填写"}`,
        `具体动作：${item.actions || "未填写"}`,
        `结果数据：${item.results || "未填写"}`,
        `能力标签：${item.tags || "未填写"}`,
        `证据/链接：${item.evidence || "未填写"}`,
        `真实性边界：${item.boundary || "未填写"}`
      );
    });
    $("promptOutput").value = lines.join("\n");
    const ready = Boolean(state.job.title && state.job.description && selected.length);
    $("promptStatus").textContent = ready ? `已选${selected.length}段经历` : "信息未齐";
    $("promptStatus").classList.toggle("ready", ready);
  }

  function renderChecks() {
    document.querySelectorAll("[data-check]").forEach((box) => {
      box.checked = Boolean(state.checks[box.dataset.check]);
    });
    updateReadiness();
  }

  function updateReadiness() {
    const count = Object.values(state.checks).filter(Boolean).length;
    $("readinessText").textContent = `${count} / 5`;
  }

  function renderApplications() {
    $("applicationEmpty").style.display = state.applications.length ? "none" : "block";
    $("applicationTable").innerHTML = state.applications.map((app) => `<tr>
      <td><strong>${escapeHtml(app.company || "未填写公司")}</strong>${escapeHtml(app.title || "未填写岗位")}${app.code ? ` · ${escapeHtml(app.code)}` : ""}</td>
      <td>${escapeHtml(app.date)}</td>
      <td><select class="status-select" data-status="${app.id}">${["待投递","已投递","测评","笔试","面试","挂起","拒绝","Offer"].map((status) => `<option ${status === app.status ? "selected" : ""}>${status}</option>`).join("")}</select></td>
      <td contenteditable="true" data-note="${app.id}">${escapeHtml(app.note || "点击填写使用的简历和附件")}</td>
      <td><button class="button danger small" data-remove-app="${app.id}">删除</button></td>
    </tr>`).join("");
  }

  function addApplication() {
    if (!state.job.company || !state.job.title) return toast("请先在JD匹配页填写公司和岗位");
    state.applications.unshift({ id: `app_${Date.now()}`, company: state.job.company, title: state.job.title, code: state.job.code || "", date: new Date().toISOString().slice(0, 10), status: "待投递", note: "" });
    saveState();
    renderApplications();
    toast("已登记当前岗位");
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `简历投递工作台备份_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast("备份已导出");
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = normalize(JSON.parse(reader.result));
        Object.assign(state, imported);
        saveState();
        hydrateAll();
        toast("数据已导入");
      } catch (_) { toast("导入失败：文件格式不正确"); }
    };
    reader.readAsText(file, "utf-8");
  }

  function copyPrompt() {
    if (!$("promptOutput").value.trim()) return toast("还没有可复制的分析包");
    navigator.clipboard.writeText($("promptOutput").value).then(() => toast("分析包已复制")).catch(() => {
      $("promptOutput").select();
      document.execCommand("copy");
      toast("分析包已复制");
    });
  }

  function registerWebMCP() {
    const context = document.modelContext;
    if (!context || typeof context.registerTool !== "function") return;
    try {
      context.registerTool({
        name: "read_resume_workspace_summary",
        title: "读取求职工作台摘要",
        description: "读取当前候选人、经历、岗位和投递记录的数量摘要，不修改数据。",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute() {
          return { candidate: state.profile.name || null, targetDirection: state.profile.direction || null, experienceCount: state.experiences.length, selectedCount: state.selected.length, currentJob: state.job.title || null, applicationCount: state.applications.length };
        }
      });
    } catch (_) {}
  }

  function hydrateAll() {
    $("candidateName").value = state.profile.name || "";
    $("targetDirection").value = state.profile.direction || "";
    $("education").value = state.profile.education || "";
    $("rules").value = state.profile.rules || "";
    $("jobCompany").value = state.job.company || "";
    $("jobTitle").value = state.job.title || "";
    $("jobCity").value = state.job.city || "";
    $("jobCode").value = state.job.code || "";
    $("jobDescription").value = state.job.description || "";
    updateHealth(); renderExperiences(); renderMatches(); updatePrompt(); renderChecks(); renderApplications();
  }

  function bindEvents() {
    document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
    document.querySelectorAll(".chip").forEach((button) => button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      document.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("active", chip === button));
      renderExperiences();
    }));
    $("newExperienceButton").addEventListener("click", () => openExperience());
    $("experienceForm").addEventListener("submit", saveExperience);
    $("experienceList").addEventListener("click", (event) => {
      const edit = event.target.closest("[data-edit]");
      const del = event.target.closest("[data-delete]");
      if (edit) openExperience(edit.dataset.edit);
      if (del && confirm("确定删除这段经历？")) {
        state.experiences = state.experiences.filter((item) => item.id !== del.dataset.delete);
        state.selected = state.selected.filter((id) => id !== del.dataset.delete);
        saveState(); renderExperiences(); renderMatches(); toast("经历已删除");
      }
    });
    $("analyzeButton").addEventListener("click", analyzeJob);
    $("matchList").addEventListener("change", (event) => {
      if (!event.target.dataset.select) return;
      const id = event.target.dataset.select;
      state.selected = event.target.checked ? [...new Set([...state.selected, id])] : state.selected.filter((item) => item !== id);
      saveState();
    });
    document.querySelectorAll("[data-check]").forEach((box) => box.addEventListener("change", () => {
      state.checks[box.dataset.check] = box.checked;
      saveState(); updateReadiness();
    }));
    $("copyPromptButton").addEventListener("click", copyPrompt);
    $("addApplicationButton").addEventListener("click", addApplication);
    $("applicationTable").addEventListener("change", (event) => {
      if (!event.target.dataset.status) return;
      const app = state.applications.find((item) => item.id === event.target.dataset.status);
      if (app) { app.status = event.target.value; saveState(); }
    });
    $("applicationTable").addEventListener("focusout", (event) => {
      if (!event.target.dataset.note) return;
      const app = state.applications.find((item) => item.id === event.target.dataset.note);
      if (app) { app.note = event.target.textContent.trim(); saveState(); }
    });
    $("applicationTable").addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-app]");
      if (remove && confirm("确定删除这条投递记录？")) {
        state.applications = state.applications.filter((item) => item.id !== remove.dataset.removeApp);
        saveState(); renderApplications();
      }
    });
    $("exportButton").addEventListener("click", exportData);
    $("importButton").addEventListener("click", () => $("importFile").click());
    $("importFile").addEventListener("change", (event) => event.target.files[0] && importData(event.target.files[0]));
  }

  bindProfile();
  bindJob();
  bindEvents();
  hydrateAll();
  registerWebMCP();
})();
