import { checkpoints } from "./story.js?v=cloth-match-2";
import { showCleanup } from "./cleanup-game.js?v=return-assets-3";
import { showCleanupDiscovery } from "./cleanup-discovery.js?v=discovery-toolbar-2";
import { showExtraction, createExtractionRun } from "./extraction-game.js";
import { showServiceTray } from "./service-tray.js?v=physical-serving-2";
import { showHandlePractice } from "./handle-practice.js?v=brush-gesture";

const get = (id) => document.getElementById(id);
const stage = get("stage");
const film = get("film");
const speaker = get("speaker");
const line = get("line");
const actions = get("actions");
const title = get("scene-title");
const feedback = get("feedback");
const pause = get("pause");
const sound = get("sound");
const settings = get("settings");
const settingsTitle = get("settings-title");
const settingsMenu = get("settings-menu");
const settingsLevels = get("settings-levels");
const levelList = get("level-list");
const captions = get("captions");
const captionTrack = get("caption-track").track;
const lessonStart = 7.5;
const chapterTitles = new Map([
  [0, "准备及个人卫生"],
  [1, "冰杯预处理"],
  [2, "手柄处理"],
  [6, "咖啡机萃取操作"],
  [3, "调配与搅拌操作"],
  [4, "出品与服务"],
  [5, "清洁与工作台复位"],
]);
let next = 0;
let extractionRun = createExtractionRun();
let state = "ready";
let muted = true;
let resumeAfterSettings = false;

function button(label, activate, className = "") {
  const control = document.createElement("button");
  control.type = "button";
  control.textContent = label;
  control.className = className;
  control.onclick = activate;
  return control;
}

function updateCaptions() {
  const text = state === "playing"
    ? Array.from(captionTrack.activeCues ?? [], cue => cue.text).join("\n")
    : "";
  captions.firstElementChild.textContent = text;
  captions.hidden = !text;
}

function mode(value) {
  state = value;
  stage.dataset.mode = value === "playing" ? "playing" : "dialogue";
  delete stage.dataset.activity;
  pause.hidden = sound.hidden = value !== "playing";
  updateCaptions();
}

function play() {
  mode("playing");
  speaker.textContent = "";
  line.textContent = "";
  feedback.textContent = "";
  actions.replaceChildren();
  pause.textContent = "暂停";
  pause.focus({ preventScroll: true });
  film.play().catch(() => {
    if (state !== "playing" || settings.open) return;
    pause.textContent = "继续播放";
    line.textContent = "点击「继续播放」重试。";
  });
}

function pass() {
  next++;
  play();
}

function swipeControl() {
  const swipe = document.createElement("div");
  swipe.className = "swipe-control";
  swipe.textContent = "← 左右滑动 →";
  swipe.setAttribute("aria-hidden", "true");
  let pointer = null;
  let start = 0;
  swipe.onpointerdown = (event) => {
    if (pointer !== null) return;
    pointer = event.pointerId;
    start = event.clientX;
    swipe.setPointerCapture(pointer);
  };
  swipe.onpointermove = (event) => {
    if (event.pointerId !== pointer) return;
    const distance = event.clientX - start;
    swipe.style.setProperty("--swipe", Math.min(1, Math.abs(distance) / 60));
    if (Math.abs(distance) >= 60) {
      pointer = null;
      pass();
    }
  };
  swipe.onpointerup = swipe.onpointercancel = () => {
    pointer = null;
    swipe.style.removeProperty("--swipe");
  };
  return [swipe, button("点按搅拌", pass, "alternative")];
}

function inventoryControls(items, onComplete) {
  let index = 0;
  const row = document.createElement("div");
  row.className = "inventory-card";
  row.setAttribute("role", "group");
  row.setAttribute("aria-labelledby", "inventory-name");
  const figure = document.createElement("figure");
  const visual = document.createElement("div");
  visual.className = "inventory-visual";
  const image = document.createElement("img");
  const modelHint = document.createElement("span");
  modelHint.className = "inventory-model-hint";
  modelHint.textContent = "可拖动查看";
  const label = document.createElement("figcaption");
  label.id = "inventory-name";
  label.tabIndex = -1;
  visual.append(image, modelHint);
  figure.append(visual, label);
  const progress = document.createElement("p");
  progress.className = "inventory-progress";
  progress.setAttribute("aria-live", "polite");
  const steps = document.createElement("div");
  steps.className = "inventory-steps";
  steps.setAttribute("aria-hidden", "true");
  const marks = items.map(() => document.createElement("span"));
  steps.append(...marks);
  const meter = document.createElement("div");
  meter.className = "inventory-meter";
  meter.append(steps, progress);

  const itemFeedback = document.createElement("p");
  itemFeedback.className = "inventory-feedback";
  itemFeedback.setAttribute("role", "status");

  function showItem() {
    const item = items[index];
    line.textContent = "刚才准备时，有拿出或摆好这件物品吗？";
    answers.querySelectorAll("button").forEach(control => control.setAttribute("aria-pressed", "false"));
    visual.querySelector("coffee-object")?.remove();
    image.hidden = false;
    image.src = `assets/inventory/${item.photo}.jpg?v=video-models`;
    image.alt = item.name;
    const model = document.createElement("coffee-object");
    model.dataset.model = item.photo;
    model.hidden = true;
    visual.insertBefore(model, modelHint);
    import("./inventory-preview.js?v=ice-3d").catch(() => { /* Keep the photo if 3D fails to load. */ });
    label.textContent = item.name;
    progress.textContent = `${index + 1} / ${items.length}`;
    progress.setAttribute("aria-label", `第 ${index + 1} 张，共 ${items.length} 张`);
    marks.forEach((mark, position) => {
      mark.dataset.state = position < index ? "complete" : position === index ? "current" : "upcoming";
    });
  }

  function answer(present, control) {
    const item = items[index];
    answers.querySelectorAll("button").forEach(option => {
      option.setAttribute("aria-pressed", String(option === control));
    });
    answers.querySelector("[data-retry]")?.removeAttribute("data-retry");
    if (present !== item.needed) {
      control.dataset.retry = "";
      itemFeedback.textContent = item.hint;
      return;
    }
    itemFeedback.textContent = "";
    index++;
    if (index === items.length) {
      onComplete();
      return;
    }
    feedback.textContent = "";
    showItem();
    label.focus({ preventScroll: true });
  }

  function answerButton(text, present) {
    const control = button(text, () => answer(present, control), "inventory-answer");
    control.setAttribute("aria-pressed", "false");
    return control;
  }

  const answers = document.createElement("div");
  answers.className = "inventory-answers";
  answers.append(answerButton("没有", false), answerButton("有", true));
  row.append(meter, itemFeedback, figure, answers);
  showItem();
  return row;
}

function showPreparationRounds(checkpoint) {
  let index = 0;
  stage.dataset.activity = "preparation";

  function showRound() {
    const round = checkpoint.rounds[index];
    feedback.textContent = "";
    if (!round) {
      pass();
      return;
    }

    line.textContent = round.prompt;
    const grid = document.createElement("div");
    grid.className = "preparation-choices";
    if (round.illustrated) grid.classList.add("illustrated-choices");
    for (const [label, hint, photo, description] of round.choices) {
      const control = button(label, () => {
        grid.querySelector("[data-retry]")?.removeAttribute("data-retry");
        if (hint === null) {
          index++;
          showRound();
          if (state === "question") line.focus({ preventScroll: true });
        } else {
          control.dataset.retry = "";
          feedback.textContent = hint;
        }
      });
      const image = document.createElement("img");
      image.src = `assets/${photo}.jpg?v=preparation-course`;
      image.alt = "";
      if (description) control.setAttribute("aria-label", `${label}，${description}`);
      if (round.illustrated) control.dataset.iceExample = photo.split("/").at(-1);
      control.prepend(image);
      grid.append(control);
    }
    if (round.illustrated) {
      const note = document.createElement("p");
      note.className = "practice-image-note";
      note.textContent = "练习示意";
      const preview = document.createElement("ice-choices-preview");
      preview.append(note, grid);
      actions.replaceChildren(preview);
      import("./ice-choices-preview.js?v=ice-scoop").catch(() => { /* Keep the illustrated choices. */ });
    } else {
      actions.replaceChildren(grid);
    }
  }

  showRound();
}

function showIceScoopGame(checkpoint) {
  stage.dataset.activity = "preparation";
  const game = document.createElement("ice-scoop-game");
  game.hidden = true;
  function fallback() {
    if (game.isConnected) showPreparationRounds(checkpoint);
  }
  game.addEventListener("ice-game-complete", pass, { once: true });
  game.addEventListener("ice-game-prompt", event => { line.textContent = event.detail; });
  game.addEventListener("ice-game-unavailable", fallback, { once: true });
  actions.replaceChildren(game);
  import("./ice-scoop-game.js?v=faucet-flow").catch(fallback);
}

function showMixStirGame(checkpoint) {
  stage.dataset.activity = "mixing";
  const game = document.createElement("mix-stir-game");
  game.hidden = true;
  function fallback() {
    if (game.isConnected) showPreparationRounds(checkpoint);
  }
  game.addEventListener("mix-game-complete", pass, { once: true });
  game.addEventListener("mix-game-prompt", event => { line.textContent = event.detail; });
  actions.replaceChildren(game);
  import("./mix-stir-game.js?v=serving-1").catch(fallback);
}

function showCheckpoint(checkpoint) {
  mode("question");
  film.pause();
  title.textContent = checkpoint.title ? `第 ${next + 1} 关 · ${checkpoint.title}` : `第 ${next + 1} 关`;
  speaker.textContent = checkpoint.title ? title.textContent : `${title.textContent} · 共 ${checkpoints.length} 关`;
  line.textContent = checkpoint.prompt;
  feedback.textContent = "";
  if (checkpoint.inventory) {
    stage.dataset.activity = "inventory";
    actions.replaceChildren(inventoryControls(checkpoint.inventory, () => {
      showPreparationRounds(checkpoint);
      line.focus({ preventScroll: true });
    }));
  } else if (checkpoint.game === "ice-scoop") {
    showIceScoopGame(checkpoint);
  } else if (checkpoint.game === "mix-stir") {
    showMixStirGame(checkpoint);
  } else if (checkpoint.game === "service-tray") {
    showServiceTray({ actions, line, button, pass });
  } else if (checkpoint.game === "cleanup-discovery") {
    stage.dataset.activity = "cleanup-discovery";
    showCleanupDiscovery({ actions, button, pass: () => selectLevel(next + 1) });
  } else if (checkpoint.game?.startsWith("cleanup-")) {
    showCleanup(checkpoint.game, { actions, feedback, button, pass });
  } else if (checkpoint.game === "service-speech") {
    stage.dataset.activity = "speech";
    line.textContent = "把冰美式递给顾客，你会怎么说？";
    const practice = document.createElement("service-speech");
    practice.addEventListener("speech-complete", pass, { once: true });
    actions.replaceChildren(practice);
    import("./service-speech.js?v=recording-simple-1").catch(() => {
      if (!practice.isConnected) return;
      actions.replaceChildren(button("我说完了，看示范", pass, "primary"));
      feedback.textContent = "录音练习未能加载，可以先口头练习，再看示范。";
    });
  } else if (checkpoint.game?.startsWith("extract-")) {
    showExtraction(checkpoint.game, {
      actions, line, feedback, button, pass, run: extractionRun,
      retryPrep: () => selectLevel(checkpoints.findIndex(level => level.game === "extract-flush")),
    });
  } else if (checkpoint.game?.startsWith("handle-")) {
    showHandlePractice(checkpoint.game.slice("handle-".length), { actions, feedback, button, pass });
  } else if (checkpoint.rounds) {
    showPreparationRounds(checkpoint);
  } else if (checkpoint.gesture) {
    actions.replaceChildren(...swipeControl());
  } else {
    actions.replaceChildren(...checkpoint.choices.map(([label, hint]) => button(label, () => {
      if (hint === null) pass();
      else feedback.textContent = `提示　${hint}`;
    })));
  }
  // Focus the prompt so keyboard and screen reader users hear the question first.
  title.focus({ preventScroll: true });
}

function checkTime(seconds) {
  const checkpoint = checkpoints[next];
  if (state !== "playing" || settings.open || film.seeking || !checkpoint) return;
  if (seconds < checkpoint.at || film.currentTime + .1 < checkpoint.at) return;
  showCheckpoint(checkpoint);
}

function showSettingsMenu() {
  settingsTitle.textContent = "设置";
  settingsMenu.hidden = false;
  settingsLevels.hidden = true;
}

function selectLevel(index) {
  const checkpoint = checkpoints[index];
  extractionRun = createExtractionRun(checkpoint.game);
  resumeAfterSettings = false;
  next = index;
  settings.close();
  film.currentTime = checkpoint.at;
  showCheckpoint(checkpoint);
}

function showLevelPicker() {
  settingsTitle.textContent = "关卡选择";
  settingsMenu.hidden = true;
  settingsLevels.hidden = false;
  levelList.replaceChildren();

  for (const [phase, name] of chapterTitles) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = name;
    const grid = document.createElement("div");
    grid.className = "level-grid";
    for (const [index, checkpoint] of checkpoints.entries()) {
      if (checkpoint.phase !== phase) continue;
      const control = button(String(index + 1), () => selectLevel(index));
      const description = checkpoint.title ?? checkpoint.prompt;
      control.setAttribute("aria-label", `第 ${index + 1} 关，${description}`);
      control.title = description;
      if (index === next && state === "question") control.setAttribute("aria-current", "step");
      grid.append(control);
    }
    section.append(heading, grid);
    levelList.append(section);
  }
  levelList.scrollTop = 0;
  settingsTitle.focus();
}

get("settings-button").onclick = () => {
  actions.querySelector("ice-scoop-game")?.dispatchEvent(new Event("ice-game-pause"));
  actions.querySelector("handle-scale-bench")?.dispatchEvent(new Event("scale-bench-pause"));
  resumeAfterSettings = state === "playing" && !film.paused;
  showSettingsMenu();
  settings.showModal();
  film.pause();
  get("choose-level").focus();
};
get("choose-level").onclick = showLevelPicker;
get("close-settings").onclick = () => settings.close();
get("back-to-settings").onclick = () => {
  showSettingsMenu();
  get("choose-level").focus();
};
settings.addEventListener("close", () => {
  if (!settings.open && resumeAfterSettings) {
    resumeAfterSettings = false;
    play();
  }
});

function start() {
  extractionRun = createExtractionRun();
  next = 0;
  film.currentTime = lessonStart;
  play();
}

captionTrack.mode = "hidden";
captionTrack.addEventListener("cuechange", updateCaptions);
film.ontimeupdate = () => checkTime(film.currentTime);
if (typeof film.requestVideoFrameCallback === "function") {
  function checkFrame(_, frame) {
    checkTime(frame.mediaTime);
    film.requestVideoFrameCallback(checkFrame);
  }
  film.requestVideoFrameCallback(checkFrame);
}
film.onended = () => {
  if (state !== "playing") return;
  if (checkpoints[next]) {
    showCheckpoint(checkpoints[next]);
    return;
  }
  finishLesson();
};

function finishLesson() {
  mode("done");
  title.textContent = "课程完成";
  speaker.textContent = "课程完成";
  line.textContent = "你已完成从准备器具、制作冰美式到清洁吧台的学习。";
  actions.replaceChildren(button("再学一遍", start, "primary"));
  actions.firstChild.focus({ preventScroll: true });
}
film.onerror = () => {
  if (state !== "playing") return;
  line.textContent = "视频暂时无法播放。";
  actions.replaceChildren(button("重新载入视频", () => {
    const elapsed = film.currentTime;
    film.addEventListener("loadedmetadata", () => {
      film.currentTime = elapsed;
      play();
    }, { once: true });
    film.load();
  }));
};
pause.onclick = () => {
  if (film.paused) play();
  else {
    film.pause();
    pause.textContent = "继续播放";
  }
};
sound.onclick = () => {
  muted = !muted;
  film.muted = muted;
  sound.setAttribute("aria-pressed", String(!muted));
  sound.textContent = muted ? "原声 · 关" : "原声 · 开";
};
film.muted = muted;
mode("ready");
speaker.textContent = "做一杯冰美式";
line.textContent = "先看看做冰美式要准备什么，再一起做一杯。";
actions.replaceChildren(button("开始学习", start, "primary"));
