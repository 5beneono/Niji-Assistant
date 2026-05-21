const STORAGE_KEY = "prompt-sketchbook-state-v1";
const API_ENDPOINT_KEY = "prompt-sketchbook-api-endpoint";
const DATA_SCHEMA_VERSION = 2;

const LABELS = {
  ORIGINAL: "原文対応",
  COMPLEMENT: "翻訳補完",
  ENHANCE: "表現強化",
  INTERPRET: "解釈追加",
  BRANCH: "分岐語",
  REVIEW: "要確認",
};

const SAMPLE_SEED = `青いタイルが張られた壁に寄りかかって足を伸ばして座る萌えアニメ少女。
少女は猫耳で白い長い髪。
だらんとした腕、無表情。
白い床には青い魚が落ちている。
白いシャツワンピース、華奢な身体。`;

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const seedProject = {
  id: createId(),
  title: "青いタイルと白髪猫耳少女",
  originalJa: SAMPLE_SEED,
  stylePrompt: "thick painterly brushwork, strong contrast, beautiful light and shadow, large dark horizontal eyes, round face",
  favoriteWords: [
    "thick painterly brushwork",
    "strong contrast",
    "beautiful light and shadow",
    "large dark horizontal eyes",
    "round face",
  ],
  promptVersions: [],
  revisionTimeline: [
    createActivity({
      type: "seed",
      title: "v1 アイデアノート",
      body: "青いタイル、白髪猫耳少女、青い魚、無表情を原文として保存。",
    }),
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let state = loadState();
let activeProjectId = state.activeProjectId;
let phraseFilter = "all";
let lastDiff = [];

const USER_API_KEY_STORAGE_KEY = "prompt-sketchbook-user-gemini-api-key";

const els = {
  projectList: document.querySelector("#projectList"),
  projectCount: document.querySelector("#projectCount"),
  projectTitle: document.querySelector("#projectTitle"),
  originalJa: document.querySelector("#originalJa"),
  favoriteWordInput: document.querySelector("#favoriteWordInput"),
  addFavoriteWordButton: document.querySelector("#addFavoriteWordButton"),
  favoriteWordList: document.querySelector("#favoriteWordList"),
  analyzeButton: document.querySelector("#analyzeButton"),
  reviseButton: document.querySelector("#reviseButton"),
  generationStatus: document.querySelector("#generationStatus"),
  promptEn: document.querySelector("#promptEn"),
  copyPromptButton: document.querySelector("#copyPromptButton"),
  phraseList: document.querySelector("#phraseList"),
  timeline: document.querySelector("#timeline"),
  timelineCount: document.querySelector("#timelineCount"),
  versionLabel: document.querySelector("#versionLabel"),
  phraseSummary: document.querySelector("#phraseSummary"),
  savedStatus: document.querySelector("#savedStatus"),
  revisionInput: document.querySelector("#revisionInput"),
  diffView: document.querySelector("#diffView"),
  diffStatus: document.querySelector("#diffStatus"),

  // Help Modal Setup
  helpButton: document.querySelector("#helpButton"),
  helpModal: document.querySelector("#helpModal"),
  closeHelpBtn: document.querySelector("#closeHelpBtn"),
};

document.querySelector("#newProjectButton").addEventListener("click", createProject);
document.querySelector("#saveSeedButton").addEventListener("click", saveSeed);
document.querySelector("#analyzeButton").addEventListener("click", analyzePrompt);
document.querySelector("#addFavoriteWordButton").addEventListener("click", addFavoriteWordsFromInput);
document.querySelector("#copyPromptButton").addEventListener("click", copyPrompt);
document.querySelector("#reviseButton").addEventListener("click", revisePrompt);
document.querySelector("#exportButton").addEventListener("click", exportJson);
document.querySelector("#importInput").addEventListener("change", importJson);
document.querySelector("#showAllButton").addEventListener("click", () => setPhraseFilter("all"));
document.querySelector("#showReviewButton").addEventListener("click", () => setPhraseFilter("review"));

["projectTitle", "originalJa"].forEach((id) => {
  document.querySelector(`#${id}`).addEventListener("input", () => {
    els.savedStatus.textContent = "未保存";
  });
});

els.favoriteWordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addFavoriteWordsFromInput();
  }
});

// Bind Help Modal events
if (els.helpButton && els.helpModal && els.closeHelpBtn) {
  els.helpButton.addEventListener("click", () => {
    els.helpModal.style.display = "flex";
  });

  els.closeHelpBtn.addEventListener("click", () => {
    els.helpModal.style.display = "none";
  });

  // Close when clicking empty overlay space
  els.helpModal.addEventListener("click", (e) => {
    if (e.target === els.helpModal) {
      els.helpModal.style.display = "none";
    }
  });
}

render();

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return normalizeState({
      schemaVersion: DATA_SCHEMA_VERSION,
      activeProjectId: seedProject.id,
      projects: [seedProject],
    });
  }

  try {
    const parsed = JSON.parse(stored);
    if (!parsed.projects?.length) throw new Error("empty state");
    return normalizeState(parsed);
  } catch {
    return normalizeState({
      schemaVersion: DATA_SCHEMA_VERSION,
      activeProjectId: seedProject.id,
      projects: [seedProject],
    });
  }
}

function normalizeState(nextState) {
  const projects = (nextState.projects ?? []).map(normalizeProject);
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    activeProjectId: nextState.activeProjectId ?? projects[0]?.id,
    projects,
  };
}

function normalizeProject(project) {
  const favoriteWords = normalizeFavoriteWords(project.favoriteWords ?? splitPromptPhrases(project.stylePrompt));
  return {
    id: project.id ?? createId(),
    title: project.title ?? "無題",
    originalJa: project.originalJa ?? "",
    stylePrompt: favoriteWords.join(", "),
    favoriteWords,
    
    // Nijijourney parameters setup
    aspectRatio: project.aspectRatio ?? "1:1",
    nijiVersion: project.nijiVersion ?? "--niji 6",
    styleType: project.styleType ?? "None",
    chaos: project.chaos ?? "0",
    stylize: project.stylize ?? "100",
    weird: project.weird ?? "0",
    sref: project.sref ?? "",
    styleWeight: project.styleWeight ?? "",
    cref: project.cref ?? "",
    crefWeight: project.crefWeight ?? "",
    negativePrompt: project.negativePrompt ?? "",

    promptVersions: (project.promptVersions ?? []).map((version, index) =>
      normalizePromptVersion(version, project, index),
    ),
    revisionTimeline: (project.revisionTimeline ?? []).map(normalizeActivity),
    createdAt: project.createdAt ?? new Date().toISOString(),
    updatedAt: project.updatedAt ?? project.createdAt ?? new Date().toISOString(),
  };
}

function normalizePromptVersion(version, project, index) {
  return {
    id: version.id ?? createId(),
    version: Number(version.version ?? index + 1),
    kind: version.kind ?? (version.instruction ? "revision" : "generation"),
    originalJa: version.originalJa ?? project.originalJa ?? "",
    promptEn: version.promptEn ?? "",
    phrases: (version.phrases ?? []).map(normalizePhrase),
    stylePrompt: version.stylePrompt ?? project.stylePrompt ?? "",
    favoriteWords: normalizeFavoriteWords(version.favoriteWords ?? project.favoriteWords ?? []),
    instruction: version.instruction ?? "",
    diff: Array.isArray(version.diff) ? version.diff : [],
    summary: version.summary ?? "",
    niji_suggestions: version.niji_suggestions ?? null, // preserve suggestions!
    createdAt: version.createdAt ?? new Date().toISOString(),
    updatedAt: version.updatedAt ?? version.createdAt ?? new Date().toISOString(),
  };
}

function normalizePhrase(phrase) {
  return {
    phrase: String(phrase.phrase ?? ""),
    ja: String(phrase.ja ?? ""),
    labels: normalizeLabels(phrase.labels),
    effect: String(phrase.effect ?? ""),
    note: String(phrase.note ?? ""),
    alternatives: Array.isArray(phrase.alternatives) ? phrase.alternatives.map(String) : [],
    adopted: phrase.adopted !== false,
  };
}

function normalizeActivity(activity) {
  return {
    id: activity.id ?? createId(),
    type: activity.type ?? "note",
    title: activity.title ?? "",
    body: activity.body ?? "",
    createdAt: activity.createdAt ?? new Date().toISOString(),
  };
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
}

function getActiveProject() {
  return state.projects.find((project) => project.id === activeProjectId) ?? state.projects[0];
}

function getLatestVersion(project = getActiveProject()) {
  return project.promptVersions.at(-1);
}

function render() {
  const project = getActiveProject();
  activeProjectId = project.id;
  state.activeProjectId = project.id;
  renderProjectList(project);
  renderEditor(project);
  renderFavoriteWords(project);
  renderPhrases(project);
  renderTimeline(project);
  renderDiff();
  persist();
}

function renderProjectList(activeProject) {
  els.projectList.innerHTML = "";
  els.projectCount.textContent = String(state.projects.length);

  state.projects.forEach((project) => {
    const template = document.querySelector("#projectTemplate").content.cloneNode(true);
    const button = template.querySelector(".project-card");
    const latest = getLatestVersion(project);
    button.classList.toggle("active", project.id === activeProject.id);
    button.querySelector("strong").textContent = project.title || "無題";
    button.querySelector(".project-card-meta").textContent = `${project.promptVersions.length} versions / ${
      latest?.phrases?.filter(isReviewPhrase).length ?? 0
    } review`;
    button.addEventListener("click", () => {
      activeProjectId = project.id;
      lastDiff = [];
      render();
    });
    els.projectList.appendChild(template);
  });
}

function renderEditor(project) {
  const latest = getLatestVersion(project);
  els.projectTitle.value = project.title;
  els.originalJa.value = project.originalJa;
  els.promptEn.value = latest?.promptEn ?? "";
  els.versionLabel.textContent = latest ? `v${latest.version}` : "v0";
  els.phraseSummary.textContent = `${latest?.phrases?.length ?? 0} phrases`;
  els.savedStatus.textContent = "保存済み";
}

function renderFavoriteWords(project) {
  els.favoriteWordList.innerHTML = "";

  if (!project.favoriteWords.length) {
    els.favoriteWordList.innerHTML = `<div class="empty-state compact">登録なし</div>`;
    return;
  }

  project.favoriteWords.forEach((word) => {
    const chip = document.createElement("span");
    chip.className = "word-chip";
    chip.textContent = word;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `${word}を削除`);
    removeButton.addEventListener("click", () => {
      project.favoriteWords = project.favoriteWords.filter((item) => item !== word);
      project.stylePrompt = buildFavoritePrompt(project);
      project.updatedAt = new Date().toISOString();
      els.savedStatus.textContent = "未保存";
      render();
    });

    chip.appendChild(removeButton);
    els.favoriteWordList.appendChild(chip);
  });
}

function renderPhrases(project) {
  const latest = getLatestVersion(project);
  const phrases = latest?.phrases ?? [];
  const visible = phraseFilter === "review" ? phrases.filter(isReviewPhrase) : phrases;
  els.phraseList.innerHTML = "";

  if (!visible.length) {
    els.phraseList.innerHTML = `<div class="empty-state">表示する句がありません</div>`;
    return;
  }

  visible.forEach((phrase) => {
    const template = document.querySelector("#phraseTemplate").content.cloneNode(true);
    const card = template.querySelector(".phrase-card");
    card.querySelector(".phrase-en").textContent = phrase.phrase;
    card.querySelector(".phrase-ja").textContent = phrase.ja;
    card.querySelector(".phrase-effect").textContent = phrase.effect;
    card.querySelector(".phrase-note").textContent = phrase.note;

    const switchInput = card.querySelector(".switch input");
    switchInput.checked = phrase.adopted;
    switchInput.addEventListener("change", () => {
      phrase.adopted = switchInput.checked;
      const latest = getLatestVersion(project);
      latest.promptEn = buildPromptFromPhrases(latest.phrases);
      latest.updatedAt = new Date().toISOString();
      project.updatedAt = new Date().toISOString();
      project.revisionTimeline.push(
        createActivity({
          type: "choice",
          title: switchInput.checked ? "表現を採用" : "表現を保留",
          body: phrase.phrase,
        }),
      );
      persist();
      render();
    });

    const tags = card.querySelector(".phrase-tags");
    phrase.labels.forEach((label) => {
      const tag = document.createElement("span");
      tag.className = `tag ${getLabelClass(label)}`;
      tag.textContent = label;
      tags.appendChild(tag);
    });

    const alternatives = card.querySelector(".alternatives");
    phrase.alternatives.forEach((alt) => {
      const chip = document.createElement("span");
      chip.className = "alt-chip";
      chip.textContent = alt;
      alternatives.appendChild(chip);
    });

    els.phraseList.appendChild(template);
  });
}

function renderTimeline(project) {
  els.timeline.innerHTML = "";
  const versions = project.promptVersions ?? [];
  els.timelineCount.textContent = String(versions.length);

  if (!versions.length) {
    els.timeline.innerHTML = `<div class="empty-state">履歴はまだありません</div>`;
    return;
  }

  versions
    .slice()
    .reverse()
    .forEach((version) => {
      const node = document.createElement("article");
      node.className = "timeline-item timeline-version";
      const instruction = version.instruction ? `<p><b>修正指示</b>${escapeHtml(version.instruction)}</p>` : "";
      node.innerHTML = `
        <strong>v${version.version}</strong>
        <p><b>アイデアノート</b>${escapeHtml(compactText(version.originalJa ?? project.originalJa))}</p>
        <p><b>英語プロンプト</b>${escapeHtml(compactText(version.promptEn))}</p>
        ${instruction}
      `;
      els.timeline.appendChild(node);
    });
}

function renderDiff() {
  const latest = getLatestVersion();
  const diffLines = lastDiff.length ? lastDiff : latest?.diff ?? [];
  els.diffView.innerHTML = "";
  els.diffStatus.textContent = diffLines.length ? `${diffLines.length / 2} changes` : "変更なし";

  if (!diffLines.length) {
    els.diffView.innerHTML = `<span>変更差分はまだありません</span>`;
    return;
  }

  diffLines.forEach((line) => {
    const span = document.createElement("span");
    span.className = `diff-line ${line.type}`;
    span.textContent = `${line.type === "add" ? "+" : "-"} ${line.text}`;
    els.diffView.appendChild(span);
  });
}

function createProject() {
  const project = {
    id: createId(),
    title: "新しい制作テーマ",
    originalJa: "",
    stylePrompt: "",
    favoriteWords: [],
    promptVersions: [],
    revisionTimeline: [
      createActivity({
        type: "seed",
        title: "制作テーマを作成",
        body: "アイデアノートを入力する準備ができました。",
      }),
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.projects.unshift(project);
  activeProjectId = project.id;
  lastDiff = [];
  render();
}

function saveSeed() {
  const project = getActiveProject();
  project.title = els.projectTitle.value.trim() || "無題";
  project.originalJa = els.originalJa.value.trim();
  project.stylePrompt = buildFavoritePrompt(project);
  project.updatedAt = new Date().toISOString();
  project.revisionTimeline.push(
    createActivity({
      type: "seed",
      title: "アイデアノートを保存",
      body: summarizeSeed(project),
    }),
  );
  render();
}

async function analyzePrompt() {
  if (els.analyzeButton.disabled) return;
  setBusy("generation", true);
  saveSeed();
  const project = getActiveProject();
  try {
    const analysis = await generatePromptAnalysis(project).catch((error) => {
      console.warn(error);
      return buildPromptAnalysis(project);
    });
    const version = createPromptVersion(project, {
      kind: "generation",
      promptEn: analysis.promptEn,
      phrases: analysis.phrases,
      summary: analysis.summary,
      niji_suggestions: analysis.niji_suggestions, // propagate the suggestions!
    });
    project.promptVersions.push(version);
    project.revisionTimeline.push(
      createActivity({
        type: "generation",
        title: `v${version.version} 英語化と句分解`,
        body: analysis.summary,
      }),
    );
    project.updatedAt = new Date().toISOString();
    lastDiff = [];
    render();
  } finally {
    setBusy("generation", false);
  }
}

async function generatePromptAnalysis(project) {
  const endpoint = getApiEndpoint();
  if (!endpoint) return buildPromptAnalysis(project);

  const headers = {
    "Content-Type": "application/json",
  };
  const key = localStorage.getItem(USER_API_KEY_STORAGE_KEY);
  if (key) {
    headers["x-gemini-api-key"] = key;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(buildLlmRequest(project)),
  });

  if (!response.ok) {
    throw new Error(`Prompt API failed: ${response.status}`);
  }

  const data = await response.json();
  return normalizePromptAnalysis(data);
}

function buildLlmRequest(project) {
  return {
    task: "niji_prompt_phrase_audit",
    original_ja: project.originalJa,
    instructions: [
      "あなたは、にじじゃーにー向け英語プロンプトの編集者です。",
      "ユーザーのアイデアノートを英語プロンプトへ変換してください。",
      "最初に、短い映像を頭の中で再生するように、画面内の世界を探索してください。",
      "探索では、空間、温度、湿度、光、身体の接地、姿勢、衣服の状態、髪や肌の質感、小物の象徴性、画面外から起きていそうな出来事を考えてください。",
      "物語性や象徴性は読み取って構いません。例: 床に落ちた魚は死、違和感、取り残された生命感のイメージになりうる。",
      "ただし、年齢感、性的ニュアンス、宗教性、暴力性は勝手に強めないでください。",
      "ユーザーが後で削れるように、追加ワードはやや多めに出してください。",
      "アイデアノートに明示されていないが世界に自然に存在しそうな視覚要素も提案してください。例: wet tiled floor, humid air, bare feet, damp cotton fabric, steam haze, cold reflected light, trembling shoulders。",
      "追加ワードは phrases に含め、labels に 表現強化 または 解釈追加 を入れてください。絵の意味を大きく変えるものは 要確認 も付けてください。",
      "固定画風プロンプトがある場合は、英語プロンプトの末尾に自然に統合し、句としても分解してください。",
      "英語プロンプトに含めた表現を句ごとに分解し、対訳、分類、絵への効果、注意点、代替表現を返してください。",
      "避けたい要素を no ... のような否定プロンプトへ機械的に変換しないでください。",
      "出力はJSONのみとしてください。",
    ],
    fixed_style_prompt: project.stylePrompt,
    requirements: {
      output_language: "json",
      prompt_language: "english",
      labels: Object.values(LABELS),
      avoid_negative_prompt: true,
      world_exploration_first: true,
      add_many_candidates: true,
      allow_symbolic_story_reading: true,
      avoid_over_deciding_age_sexual_religion_violence: true,
      enhancement_policy: {
        purpose: "にじじゃーにーが曖昧にしやすい世界の物理、質感、象徴性を補う",
        count: "多め",
        labels: ["表現強化", "解釈追加", "要確認"],
        focus: [
          "temperature",
          "humidity",
          "body contact",
          "bare feet or footwear",
          "skin texture",
          "hair texture",
          "eyelashes",
          "fabric state",
          "floor",
          "wall",
          "lighting",
          "symbolic object reading",
        ],
      },
    },
    schema: {
      prompt_en: "string",
      phrases: [
        {
          phrase: "string",
          ja: "string",
          labels: ["原文対応"],
          effect: "string",
          note: "string",
          alternatives: ["string"],
          adopted: true,
        },
      ],
      summary: "string",
      niji_suggestions: {
        aspectRatio: "string",
        styleType: "string",
        chaos: "string",
        stylize: "string",
        negativePrompt: "string",
        mood_storyboard: "string"
      }
    },
  };
}

function normalizePromptAnalysis(data) {
  const phrases = Array.isArray(data.phrases)
    ? data.phrases.map(normalizePhrase)
    : [];

  const promptEn = String(data.prompt_en ?? data.promptEn ?? buildPromptFromPhrases(phrases));
  const reviewCount = phrases.filter(isReviewPhrase).length;

  return {
    promptEn,
    phrases,
    summary: String(data.summary ?? `${phrases.length}個の句に分解。要確認は${reviewCount}個。`),
    niji_suggestions: data.niji_suggestions ?? {
      aspectRatio: "1:1",
      styleType: "None",
      chaos: "0",
      stylize: "100",
      negativePrompt: "",
      mood_storyboard: ""
    }
  };
}

function normalizeLabels(labels) {
  const allowed = new Set(Object.values(LABELS));
  const values = Array.isArray(labels) ? labels : [labels];
  const normalized = values.map(String).filter((label) => allowed.has(label));
  return normalized.length ? normalized : [LABELS.REVIEW];
}

function createPromptVersion(project, options) {
  return normalizePromptVersion(
    {
      id: createId(),
      version: project.promptVersions.length + 1,
      kind: options.kind,
      originalJa: project.originalJa,
      promptEn: options.promptEn,
      phrases: options.phrases,
      stylePrompt: project.stylePrompt ?? "",
      favoriteWords: project.favoriteWords ?? [],
      instruction: options.instruction ?? "",
      diff: options.diff ?? [],
      summary: options.summary ?? "",
      niji_suggestions: options.niji_suggestions ?? null, // pass suggestions!
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    project,
    project.promptVersions.length,
  );
}

function createActivity(options) {
  return normalizeActivity({
    id: createId(),
    type: options.type,
    title: options.title,
    body: options.body,
    createdAt: new Date().toISOString(),
  });
}

async function revisePrompt() {
  if (els.reviseButton.disabled) return;
  const project = getActiveProject();
  const latest = getLatestVersion(project);
  const instruction = els.revisionInput.value.trim();
  if (!latest || !instruction) return;

  setBusy("revision", true);
  try {
    const revision = await generatePromptRevision(project, latest, instruction).catch((error) => {
      console.warn(error);
      return buildRevision(latest, instruction);
    });
    const version = createPromptVersion(project, {
      kind: "revision",
      promptEn: revision.promptEn,
      phrases: revision.phrases,
      instruction,
      diff: revision.diff,
      summary: revision.summary,
    });
    project.promptVersions.push(version);
    project.revisionTimeline.push(
      createActivity({
        type: "revision",
        title: `v${version.version} 修正`,
        body: instruction,
      }),
    );
    project.updatedAt = new Date().toISOString();
    lastDiff = revision.diff;
    els.revisionInput.value = "";
    render();
  } finally {
    setBusy("revision", false);
  }
}

async function generatePromptRevision(project, previousVersion, instruction) {
  const endpoint = getApiEndpoint();
  if (!endpoint) return buildRevision(previousVersion, instruction);

  const headers = {
    "Content-Type": "application/json",
  };
  const key = localStorage.getItem(USER_API_KEY_STORAGE_KEY);
  if (key) {
    headers["x-gemini-api-key"] = key;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(buildRevisionLlmRequest(project, previousVersion, instruction)),
  });

  if (!response.ok) {
    throw new Error(`Revision API failed: ${response.status}`);
  }

  const data = await response.json();
  return normalizePromptRevision(data, previousVersion);
}

function buildRevisionLlmRequest(project, previousVersion, instruction) {
  return {
    task: "niji_prompt_revision",
    original_ja: project.originalJa,
    fixed_style_prompt: project.stylePrompt,
    revision_instruction: instruction,
    previous_version: {
      version: previousVersion.version,
      prompt_en: previousVersion.promptEn,
      phrases: previousVersion.phrases.map((phrase) => ({
        phrase: phrase.phrase,
        ja: phrase.ja,
        labels: phrase.labels,
        effect: phrase.effect,
        note: phrase.note,
        alternatives: phrase.alternatives,
        adopted: phrase.adopted,
      })),
    },
    instructions: [
      "あなたは、にじじゃーにー向け英語プロンプトの編集者です。",
      "ユーザーの修正指示を、直前の英語プロンプトと句分解に反映してください。",
      "修正対象ではない表現はできるだけ維持してください。",
      "previous_version.phrases の adopted が false の句は、ユーザーが保留した句です。修正指示で明示されない限り復活させないでください。",
      "previous_version.phrases の adopted が true の句は、同じ意味のまま残す場合 adopted: true を維持してください。",
      "既存句を言い換える場合も、元句の adopted 状態を引き継いでください。",
      "修正後も、短い映像を想像し直して、世界に自然に存在しそうな追加ワードを多めに維持または更新してください。",
      "温度、湿度、光、身体の接地、衣服の状態、髪や肌の質感、小物の象徴性などの補完は labels に 表現強化 または 解釈追加 を入れてください。",
      "絵の意味を大きく変える補完には 要確認 も付けてください。",
      "固定画風プロンプトがある場合は維持してください。",
      "no ... のような否定プロンプトへ機械的に変換しないでください。",
      "修正後の英語プロンプト、更新後の句分解、差分、要約をJSONのみで返してください。",
    ],
    schema: {
      prompt_en: "string",
      phrases: [
        {
          phrase: "string",
          ja: "string",
          labels: ["原文対応"],
          effect: "string",
          note: "string",
          alternatives: ["string"],
          adopted: true,
        },
      ],
      diff: [
        {
          type: "remove",
          text: "string",
        },
        {
          type: "add",
          text: "string",
        },
      ],
      summary: "string",
    },
  };
}

function normalizePromptRevision(data, previousVersion) {
  const rawPhrases = Array.isArray(data.phrases)
    ? data.phrases.map(normalizePhrase)
    : previousVersion.phrases.map(clonePhrase);
  const phrases = mergePhraseAdoptionState(previousVersion.phrases, rawPhrases);
  const responsePrompt = String(data.prompt_en ?? data.promptEn ?? "");
  const promptEn = buildPromptFromPhrases(phrases) || responsePrompt || previousVersion.promptEn;
  const diff = normalizeDiff(data.diff ?? data.diff_lines ?? data.replacements, previousVersion.promptEn, promptEn);

  return {
    promptEn,
    phrases,
    diff,
    summary: String(data.summary ?? `${diff.length / 2}件の差分を作成。`),
  };
}

function mergePhraseAdoptionState(previousPhrases, nextPhrases) {
  const previousByKey = new Map(previousPhrases.map((phrase) => [normalizePhraseKey(phrase.phrase), phrase]));
  const previousByJa = new Map(previousPhrases.map((phrase) => [normalizePhraseKey(phrase.ja), phrase]));
  const keptPhrases = [];
  const nextKeys = new Set();

  const merged = nextPhrases.map((phrase) => {
    const key = normalizePhraseKey(phrase.phrase);
    const jaKey = normalizePhraseKey(phrase.ja);
    nextKeys.add(key);
    const previous = previousByKey.get(key) ?? previousByJa.get(jaKey);
    return previous ? { ...phrase, adopted: previous.adopted } : phrase;
  });

  previousPhrases.forEach((phrase) => {
    const key = normalizePhraseKey(phrase.phrase);
    if (phrase.adopted === false && !nextKeys.has(key)) {
      keptPhrases.push({ ...clonePhrase(phrase), adopted: false });
    }
  });

  return [...merged, ...keptPhrases];
}

function clonePhrase(phrase) {
  return {
    ...phrase,
    labels: [...phrase.labels],
    alternatives: [...phrase.alternatives],
  };
}

function normalizePhraseKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeDiff(value, beforePrompt, afterPrompt) {
  if (Array.isArray(value)) {
    return value
      .map((line) => ({
        type: line.type === "add" ? "add" : "remove",
        text: String(line.text ?? ""),
      }))
      .filter((line) => line.text);
  }

  if (beforePrompt !== afterPrompt) {
    return [
      { type: "remove", text: beforePrompt },
      { type: "add", text: afterPrompt },
    ];
  }

  return [];
}

function buildPromptAnalysis(project) {
  const text = project.originalJa;
  const phrases = [];
  const addPhrase = (phrase) => phrases.push({ adopted: true, alternatives: [], ...phrase });

  if (matches(text, ["猫耳", "ねこ耳"])) {
    addPhrase({
      phrase: "a moe anime girl with cat ears",
      ja: "猫耳の萌えアニメ少女",
      labels: [LABELS.ORIGINAL],
      effect: "人物指定をにじじゃーにー向けのアニメ文脈に寄せる。",
      note: "年齢感や性的な強調は足していない。",
      alternatives: ["anime girl with cat ears", "cat-eared anime character"],
    });
  }

  if (matches(text, ["肌", "白い", "白髪", "無表情", "冷たい", "静か", "青いタイル"])) {
    addPhrase({
      phrase: "pale gray skin with a cool undertone",
      ja: "冷たい含みのあるペールグレーの肌",
      labels: [LABELS.ENHANCE, LABELS.REVIEW],
      effect: "肌の色味を曖昧にせず、冷たい画面全体のトーンに合わせる。",
      note: "人外感や病的さに寄る場合があるため、必要に応じて pale skin に弱める。",
      alternatives: ["pale skin with a cool undertone", "soft porcelain skin"],
    });
  }

  if (matches(text, ["白い長い髪", "白髪", "白い髪"])) {
    addPhrase({
      phrase: "long white hair",
      ja: "長い白髪",
      labels: [LABELS.ORIGINAL],
      effect: "人物の視覚的特徴を固定する。",
      note: "銀髪寄りにしたい場合は silver hair に変えられる。",
      alternatives: ["silver-white hair", "pale silver hair"],
    });
    addPhrase({
      phrase: "silky fine hair strands",
      ja: "サラサラした細い髪の束",
      labels: [LABELS.ENHANCE],
      effect: "髪をただの白い塊にせず、線の細さと手触りを出す。",
      note: "髪の密度を上げたい場合に有効。",
      alternatives: ["soft fine hair strands", "smooth thin hair"],
    });
  }

  if (matches(text, ["少女", "無表情", "顔", "白髪", "猫耳"])) {
    addPhrase({
      phrase: "long delicate eyelashes",
      ja: "長く繊細なまつ毛",
      labels: [LABELS.ENHANCE],
      effect: "表情を大きく変えずに、顔まわりの描写密度を上げる。",
      note: "かわいさを強めすぎたくない場合は delicate を残して控えめにする。",
      alternatives: ["subtle long eyelashes", "fine delicate eyelashes"],
    });
  }

  if (matches(text, ["青いタイル", "タイル"])) {
    addPhrase({
      phrase: "leaning against a blue tiled wall",
      ja: "青いタイル壁に寄りかかる",
      labels: [LABELS.ORIGINAL, LABELS.COMPLEMENT],
      effect: "背景と姿勢を一つの構図としてまとめる。",
      note: "bathroom や hospital までは指定しない。",
      alternatives: ["beside a blue tiled wall", "against blue ceramic tiles"],
    });
    addPhrase({
      phrase: "matte blue ceramic tiles with faint grout lines",
      ja: "目地がうっすら見えるマットな青い陶器タイル",
      labels: [LABELS.ENHANCE],
      effect: "背景の素材感とスケールを安定させる。",
      note: "浴室や病院までは指定しないまま、壁の質感だけを補う。",
      alternatives: ["glazed blue ceramic tiles", "smooth blue tiled wall"],
    });
  }

  if (matches(text, ["水", "濡", "湿", "湯気", "タイル"])) {
    addPhrase({
      phrase: "cool humid air in a tiled room",
      ja: "タイルの空間にこもる冷たく湿った空気",
      labels: [LABELS.ENHANCE, LABELS.INTERPRET],
      effect: "空間の温度と湿度を補い、画面の空気を具体化する。",
      note: "水気のある場所として読み取るため、乾いた空間にしたい場合は外す。",
      alternatives: ["damp cool atmosphere", "humid air with cold reflected light"],
    });
  }

  if (matches(text, ["水", "濡", "湿", "タイル", "床"])) {
    addPhrase({
      phrase: "bare feet on the cold white floor",
      ja: "冷たい白い床に触れる裸足",
      labels: [LABELS.INTERPRET, LABELS.REVIEW],
      effect: "濡れたタイル空間との身体の接地感を強める。",
      note: "原文に靴の指定がない場合の推論。服装や年齢感を変えすぎるなら保留する。",
      alternatives: ["feet resting on the cold floor", "bare toes touching the wet floor"],
    });
  }

  if (matches(text, ["足を伸ば", "座る"])) {
    addPhrase({
      phrase: "sitting on a white floor with her legs stretched out",
      ja: "白い床に足を伸ばして座る",
      labels: [LABELS.ORIGINAL],
      effect: "床との接地感と脱力した構図を作る。",
      note: "ポーズ指定が強いため、構図が固定されやすい。",
      alternatives: ["sitting loosely on a white floor", "resting on a white floor"],
    });
  }

  if (matches(text, ["無表情"])) {
    addPhrase({
      phrase: "vacant expression",
      ja: "虚ろな表情",
      labels: [LABELS.BRANCH, LABELS.REVIEW],
      effect: "無表情を空虚で不穏な方向へ強める。",
      note: "病的、焦点が合っていない印象に寄る可能性がある。",
      alternatives: ["calm emotionless expression", "neutral expression", "blank expression"],
    });
  }

  if (matches(text, ["だらん", "腕"])) {
    addPhrase({
      phrase: "limp relaxed arms",
      ja: "だらんとした腕",
      labels: [LABELS.ORIGINAL, LABELS.BRANCH],
      effect: "脱力感を出すが、弱っている印象にも寄りうる。",
      note: "病的さを避けるなら relaxed arms が軽い。",
      alternatives: ["relaxed arms", "loosely resting arms"],
    });
  }

  if (matches(text, ["青い魚", "魚"])) {
    addPhrase({
      phrase: "a blue fish lying on the white floor",
      ja: "白い床に落ちている青い魚",
      labels: [LABELS.ORIGINAL, LABELS.REVIEW],
      effect: "象徴にも小物にも見える余白を残す。",
      note: "象徴性を強めたい場合は symbolic を加える。",
      alternatives: ["a symbolic blue fish on the white floor", "an unnatural blue fish on the floor"],
    });
    addPhrase({
      phrase: "a quiet symbol of death and displaced life",
      ja: "死と、場違いな生命の静かな象徴",
      labels: [LABELS.INTERPRET, LABELS.REVIEW],
      effect: "床に落ちた魚を単なる小物ではなく、絵の意味を持つ要素として扱う。",
      note: "象徴性が強くなるため、説明的に見える場合は外す。",
      alternatives: ["an unsettling symbolic blue fish", "a small sign of lost life"],
    });
  }

  if (matches(text, ["白いシャツワンピース", "シャツワンピ"])) {
    addPhrase({
      phrase: "wearing a loose white shirt dress",
      ja: "ゆるい白いシャツワンピース",
      labels: [LABELS.ORIGINAL, LABELS.COMPLEMENT],
      effect: "服装の白さと柔らかいシルエットを固定する。",
      note: "loose は補完だが、華奢さとの相性がよい。",
      alternatives: ["plain white shirt dress", "oversized white shirt dress"],
    });
    addPhrase({
      phrase: "soft cotton fabric with subtle wrinkles",
      ja: "かすかな皺のある柔らかいコットン生地",
      labels: [LABELS.ENHANCE],
      effect: "服を白い面として処理されにくくし、布の手触りを足す。",
      note: "汚れやダメージ表現は足していない。",
      alternatives: ["soft white cotton fabric", "thin cotton fabric with gentle folds"],
    });
  }

  if (matches(text, ["華奢"])) {
    addPhrase({
      phrase: "delicate slender body",
      ja: "華奢な身体",
      labels: [LABELS.ORIGINAL, LABELS.REVIEW],
      effect: "線の細い印象を出す。",
      note: "弱々しさや幼さに寄りすぎる場合がある。",
      alternatives: ["slender figure", "delicate silhouette"],
    });
  }

  if (matches(text, ["不穏", "静か", "冷たい"])) {
    addPhrase({
      phrase: "quiet uneasy atmosphere with cold sterile lighting",
      ja: "静かで不穏、冷たく無菌的な光",
      labels: [LABELS.ENHANCE, LABELS.INTERPRET, LABELS.BRANCH],
      effect: "画面全体を冷たく緊張した方向へ寄せる。",
      note: "sterile は病院的な印象を足すため要注意。",
      alternatives: ["soft cool ambient lighting", "quiet uneasy atmosphere with cool light"],
    });
  }

  addStylePromptPhrases(project.stylePrompt, addPhrase);

  if (!phrases.length) {
    addPhrase({
      phrase: "an anime illustration based on the Japanese visual note",
      ja: "日本語の視覚メモをもとにしたアニメイラスト",
      labels: [LABELS.COMPLEMENT, LABELS.REVIEW],
      effect: "未分類の日本語メモをまず画像生成向けの英語にする。",
      note: "具体語が少ないため、手動で句を追加すると精度が上がる。",
      alternatives: ["a niji style anime illustration", "a concise anime prompt"],
    });
  }

  const promptEn = buildPromptFromPhrases(phrases);

  const reviewCount = phrases.filter(isReviewPhrase).length;
  return {
    promptEn,
    phrases,
    summary: `${phrases.length}個の句に分解。要確認は${reviewCount}個。`,
  };
}

function addStylePromptPhrases(stylePrompt, addPhrase) {
  splitPromptPhrases(stylePrompt).forEach((phrase) => {
    addPhrase({
      phrase,
      ja: "固定画風プロンプト",
      labels: [LABELS.ENHANCE],
      effect: "毎回使う画風や顔立ち、光の方向性を安定させる。",
      note: "プロジェクト側で登録された固定要素。",
      alternatives: [],
    });
  });
}

function buildFavoritePrompt(project) {
  return normalizeFavoriteWords(project.favoriteWords).join(", ");
}

function normalizeFavoriteWords(words) {
  const seen = new Set();
  return (Array.isArray(words) ? words : [words])
    .flatMap(splitPromptPhrases)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => {
      const key = word.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function splitPromptPhrases(value) {
  return String(value ?? "")
    .split(/[\n,、]+/)
    .map((phrase) => phrase.trim())
    .filter(Boolean);
}

function buildRevision(version, instruction) {
  const replacements = [];
  const addReplacement = (from, to) => {
    if (version.promptEn.includes(from)) replacements.push([from, to]);
  };

  if (matches(instruction, ["病的", "虚ろ", "うつろ"])) {
    addReplacement("vacant expression", "calm emotionless expression");
    addReplacement("limp relaxed arms", "loosely resting arms");
  }

  if (matches(instruction, ["病院", "無菌", "sterile"])) {
    addReplacement("cold sterile lighting", "soft cool ambient lighting");
  }

  if (matches(instruction, ["魚", "象徴", "小物"])) {
    addReplacement("a blue fish lying on the white floor", "a symbolic blue fish lying unnaturally on the white floor");
  }

  if (matches(instruction, ["かわい", "萌え"])) {
    addReplacement("quiet uneasy atmosphere", "quiet uneasy atmosphere with a faint cute softness");
  }

  let promptEn = version.promptEn;
  const phrases = version.phrases.map((phrase) => ({ ...phrase, alternatives: [...phrase.alternatives] }));
  const diff = [];
  replacements.forEach(([from, to]) => {
    promptEn = promptEn.replace(from, to);
    phrases.forEach((phrase) => {
      if (phrase.phrase.includes(from)) {
        phrase.phrase = phrase.phrase.replace(from, to);
      }
    });
    diff.push({ type: "remove", text: from }, { type: "add", text: to });
  });

  if (!diff.length) {
    const addition = `revision note: ${instruction}`;
    promptEn = `${promptEn}, ${addition}`;
    diff.push({ type: "remove", text: "(no direct phrase matched)" }, { type: "add", text: addition });
  }

  return {
    promptEn,
    phrases,
    diff,
    summary: `${diff.length / 2}件の差分を作成。`,
  };
}

function buildPromptFromPhrases(phrases) {
  return phrases
    .filter((phrase) => phrase.adopted)
    .map((phrase) => phrase.phrase)
    .join(", ");
}

function copyPrompt() {
  navigator.clipboard.writeText(els.promptEn.value).then(() => {
    els.copyPromptButton.textContent = "コピー済み";
    window.setTimeout(() => {
      els.copyPromptButton.textContent = "コピー";
    }, 1200);
  });
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "prompt-sketchbook.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!parsed.projects?.length) throw new Error("invalid file");
      state = normalizeState(parsed);
      activeProjectId = state.activeProjectId ?? state.projects[0].id;
      lastDiff = [];
      render();
    } catch {
      alert("読み込めないJSONです。");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function setPhraseFilter(nextFilter) {
  phraseFilter = nextFilter;
  document.querySelector("#showAllButton").classList.toggle("active", nextFilter === "all");
  document.querySelector("#showReviewButton").classList.toggle("active", nextFilter === "review");
  renderPhrases(getActiveProject());
}

function addFavoriteWordsFromInput() {
  const project = getActiveProject();
  project.favoriteWords = normalizeFavoriteWords([
    ...project.favoriteWords,
    ...splitPromptPhrases(els.favoriteWordInput.value),
  ]);
  project.stylePrompt = buildFavoritePrompt(project);
  project.updatedAt = new Date().toISOString();
  els.favoriteWordInput.value = "";
  els.savedStatus.textContent = "未保存";
  render();
}

function setBusy(kind, isBusy) {
  els.analyzeButton.disabled = isBusy;
  els.reviseButton.disabled = isBusy;
  els.generationStatus.textContent = isBusy
    ? kind === "revision"
      ? "修正案を作成中..."
      : "生成中..."
    : "";
  els.analyzeButton.textContent = isBusy && kind === "generation" ? "生成中..." : "プロンプト作成";
  els.reviseButton.textContent = isBusy && kind === "revision" ? "作成中..." : "修正案を作る";
}

function getApiEndpoint() {
  const storedEndpoint = localStorage.getItem(API_ENDPOINT_KEY)?.trim();
  if (storedEndpoint) return storedEndpoint;
  if (location.protocol === "http:" || location.protocol === "https:") return "/api/generate-prompt";
  return "";
}

function summarizeSeed(project) {
  return project.originalJa.slice(0, 80) || "空のアイデアノート";
}

function compactText(value, maxLength = 180) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function matches(text, words) {
  return words.some((word) => text.includes(word));
}

function isReviewPhrase(phrase) {
  return phrase.labels.includes(LABELS.REVIEW) || phrase.labels.includes(LABELS.BRANCH);
}

function getLabelClass(label) {
  if (label === LABELS.REVIEW) return "review";
  if (label === LABELS.BRANCH) return "branch";
  if (label === LABELS.ORIGINAL) return "original";
  return "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


