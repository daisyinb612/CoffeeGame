import { checkpoints } from "./story.js?v=hannahl-integration";
import { showCleanup } from "./cleanup-game.js?v=cloth-hq-3";
import { showCleanupDiscovery } from "./cleanup-discovery.js?v=discovery-toolbar-2";
import { showServiceTray } from "./service-tray.js?v=physical-serving-2";
import { showHandlePractice } from "./handle-practice.js?v=distribution-flow";

const get = (id) => document.getElementById(id);
const stage = get("stage");
const film = get("film");
const loading = get("loading");
const loadingTitle = get("loading-title");
const loadingBar = get("loading-bar");
const loadingPercent = get("loading-percent");
const loadingDetail = get("loading-detail");
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
const phaseRows = [...get("overview-phases").children];
const chapterTitles = new Map(phaseRows.map(row => [Number(row.dataset.phase), row.textContent]));
get("overview-count").textContent = `共 ${checkpoints.length} 关`;
for (const row of phaseRows) {
  const first = checkpoints.findIndex(level => level.phase === Number(row.dataset.phase));
  const count = checkpoints.filter(level => level.phase === Number(row.dataset.phase)).length;
  const range = document.createElement("span");
  range.className = "level-range";
  range.textContent = count === 1 ? `第 ${first + 1} 关` : `第 ${first + 1}–${first + count} 关`;
  row.append(range);
}
let next = 0;
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
  loading.hidden = value !== "ready";
  get("overview-welcome").hidden = value !== "ready";
  if (value === "ready") {
    loadingTitle.textContent = "开播缓冲";
    updateBufferProgress();
  }
  stage.dataset.mode = value === "playing" ? "playing" : "dialogue";
  delete stage.dataset.activity;
  pause.hidden = sound.hidden = value !== "playing";
  updateCaptions();
}

function updateBufferProgress() {
  if (loading.hidden) return;
  const position = state === "ready" ? lessonStart : film.currentTime;
  const target = Math.min(5, film.duration - position);
  if (!(target > 0)) {
    loadingBar.removeAttribute("value");
    loadingPercent.textContent = "";
    loadingDetail.textContent = "正在连接视频…";
    return;
  }

  let seconds = 0;
  const ranges = film.buffered;
  for (let i = 0; i < ranges.length; i++) {
    if (ranges.start(i) <= position && ranges.end(i) > position) {
      seconds = Math.min(target, ranges.end(i) - position);
      break;
    }
  }
  const percent = Math.floor(100 * seconds / target);
  loadingBar.value = percent;
  loadingPercent.textContent = `${percent}%`;
  loadingDetail.textContent = "";
}

function showBuffering() {
  if (state !== "playing" || settings.open || film.paused) return;
  const upcoming = checkpoints[next];
  for (const row of phaseRows) {
    if (Number(row.dataset.phase) === upcoming?.phase) row.setAttribute("aria-current", "step");
    else row.removeAttribute("aria-current");
  }
  loadingTitle.textContent = upcoming
    ? `正在缓冲 · 接下来是第 ${next + 1} 关「${upcoming.title}」`
    : "正在缓冲课程结尾";
  loading.hidden = false;
  updateBufferProgress();
}

film.addEventListener("waiting", showBuffering);
for (const event of ["progress", "loadedmetadata", "seeked", "canplay"]) {
  film.addEventListener(event, updateBufferProgress);
}
for (const event of ["playing", "pause", "ended"]) {
  film.addEventListener(event, () => { if (state !== "ready") loading.hidden = true; });
}

function play() {
  applySoundPreference();
  mode("playing");
  speaker.textContent = "";
  line.textContent = "";
  feedback.textContent = "";
  actions.replaceChildren();
  pause.textContent = "暂停";
  pause.focus({ preventScroll: true });
  const started = film.play();
  if (film.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) showBuffering();
  started.catch(error => {
    if (state !== "playing" || settings.open || error.name === "AbortError") return;
    loading.hidden = true;
    if (film.error || error.name === "NotSupportedError") {
      showVideoError();
      return;
    }
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
    grid.className = round.choices.some(choice => choice[2]) ? "preparation-choices" : "text-choices";
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
      if (description) control.setAttribute("aria-label", `${label}，${description}`);
      if (photo) {
        const image = document.createElement("img");
        image.src = `assets/${photo}.jpg?v=preparation-course`;
        image.alt = "";
        if (round.illustrated) control.dataset.iceExample = photo.split("/").at(-1);
        control.prepend(image);
      }
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
  import("./ice-scoop-game.js?v=water-guide").catch(fallback);
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
    import("./service-speech.js?v=recording-oral-fallback").catch(() => {
      if (!practice.isConnected) return;
      actions.replaceChildren(button("我说完了，看示范", pass, "primary"));
      feedback.textContent = "录音练习未能加载，可以先口头练习，再看示范。";
    });
  } else if (checkpoint.game?.startsWith("handle-")) {
    showHandlePractice(checkpoint.game.slice("handle-".length), { actions, feedback, button, pass });
  } else if (checkpoint.rounds) {
    showPreparationRounds(checkpoint);
  } else if (checkpoint.gesture) {
    actions.replaceChildren(...swipeControl());
  } else {
    const choices = checkpoint.choices.map(([label, hint]) => button(label, () => {
      if (hint === null) pass();
      else feedback.textContent = `提示　${hint}`;
    }));
    if (checkpoint.photo) {
      const photo = document.createElement("img");
      photo.className = "question-photo";
      photo.src = `assets/${checkpoint.photo.path}.jpg`;
      photo.alt = checkpoint.photo.alt;
      choices.unshift(photo);
    }
    actions.replaceChildren(...choices);
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

function seekToLessonStart() {
  // Assigning currentTime a second time can restart an in-flight seek.
  if (Math.abs(film.currentTime - lessonStart) > 0.03) film.currentTime = lessonStart;
}

function start() {
  next = 0;
  film.preload = "auto";
  seekToLessonStart();
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
function showVideoError() {
  if (state !== "playing") return;
  mode("error");
  line.textContent = "视频暂时无法播放，请检查网络，并确认浏览器支持 HEVC 高清视频。";
  actions.replaceChildren(button("重新载入视频", () => {
    const elapsed = film.currentTime || lessonStart;
    film.load();
    film.currentTime = elapsed;
    play();
  }));
}
film.addEventListener("error", showVideoError);
pause.onclick = () => {
  if (film.paused) play();
  else {
    film.pause();
    pause.textContent = "继续播放";
  }
};
function applySoundPreference() {
  // Keep the HTML default and the live media state in sync across seeks and reloads.
  film.defaultMuted = muted;
  film.muted = muted;
  updateSoundButton();
}
function updateSoundButton() {
  const audible = !film.muted && film.volume > 0;
  sound.setAttribute("aria-pressed", String(audible));
  sound.textContent = audible ? "原声 · 开" : "原声 · 关";
}
film.addEventListener("volumechange", updateSoundButton);
sound.onclick = () => {
  muted = !film.muted && film.volume > 0;
  if (!muted && film.volume === 0) film.volume = 1;
  applySoundPreference();
  if (!muted && state === "playing" && film.paused) play();
};
applySoundPreference();
mode("ready");
get("overview-start").onclick = start;

// Keep the user gesture for play(), but prepare the opening frames while the welcome screen is open.
if (!navigator.connection?.saveData) {
  film.preload = "auto";
  if (film.readyState >= HTMLMediaElement.HAVE_METADATA) {
    seekToLessonStart();
  } else {
    film.addEventListener("loadedmetadata", () => {
      if (state === "ready") seekToLessonStart();
    }, { once: true });
  }
}
