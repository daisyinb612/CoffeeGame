import { stations, renderWorkbench } from "./game.js";

const byId = (id) => document.getElementById(id);
const video = byId("video");
const still = byId("still");
const instruction = byId("instruction");
const feedback = byId("feedback");
const choices = byId("choices");
const next = byId("next");
const watch = byId("watch");
const sound = byId("sound");
const speed = byId("speed");
const title = byId("step-title");

let steps;
let index = 0;
let unlocked = 0;
let muted = true;
const stationProgress = new Map();
const workbench = byId("workbench");
const screen = byId("screen");
const skip = byId("skip");

function message(value = "") {
  feedback.hidden = !value;
  feedback.textContent = value;
}

function showDemo(play) {
  const step = steps[index];
  workbench.hidden = true;
  screen.hidden = false;
  if (step.ranges && video.hidden) {
    video.poster = still.src;
    video.src = `media/${step.id}.mp4`;
    video.hidden = false;
    still.hidden = true;
    byId("media-options").hidden = false;
    video.muted = muted;
    video.playbackRate = Number(speed.value);
  }
  choices.hidden = true;
  instruction.textContent = step.observe;
  watch.hidden = !step.ranges;
  watch.textContent = stations[step.id] ? "回到操作台" : play ? "重看视频" : "播放示范";
  next.hidden = stations[step.id] ? !isCleared(step.id) : false;
  if (play && step.ranges) {
    video.play().catch(() => message("请使用视频上的播放按钮。"));
  }
}

function isCleared(id) {
  const progress = stationProgress.get(id);
  return Boolean(progress?.done || progress?.skipped);
}

function showStation() {
  const step = steps[index];
  const station = stations[step.id];
  if (!stationProgress.has(step.id)) stationProgress.set(step.id, { counts: {} });
  const progress = stationProgress.get(step.id);
  video.pause();
  screen.hidden = true;
  workbench.hidden = false;
  byId("media-options").hidden = true;
  instruction.textContent = station.instruction;
  watch.hidden = false;
  watch.textContent = "看实拍示范";

  progress.done = renderWorkbench(workbench, station, progress, (hint, actionId) => {
    if (hint) {
      message(hint);
      return;
    }
    message();
    showStation();
    const tool = workbench.querySelector(`[data-tool="${actionId}"]`);
    if (!tool.disabled) tool.focus();
    else if (progress.done) next.focus();
    else workbench.querySelector(".tool:not(:disabled)")?.focus();
  });
  next.hidden = !isCleared(step.id);
  skip.hidden = isCleared(step.id);
  if (progress.done) message(`${step.short}。可以进入下一步。`);
}

function updateNavigation() {
  const done = index === steps.length;
  byId("progress").textContent = done ? "流程完成" : `第 ${index + 1} 步 / 共 ${steps.length} 步`;
  for (const phase of byId("phases").children) {
    if (phase.textContent === steps[index]?.phase) phase.setAttribute("aria-current", "step");
    else phase.removeAttribute("aria-current");
  }
  byId("back").disabled = index === 0;
  [...byId("step-list").children].forEach((item, i) => {
    const button = item.firstElementChild;
    button.disabled = i > unlocked;
    if (i === index) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
}

function render(focus = true) {
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.hidden = true;
  still.hidden = false;
  workbench.hidden = true;
  screen.hidden = false;
  skip.hidden = true;
  byId("media-options").hidden = true;
  choices.replaceChildren();
  choices.hidden = true;
  next.hidden = false;
  message();
  const step = steps[index];
  updateNavigation();

  if (!step) {
    title.textContent = "吧台任务完成";
    byId("step-label").textContent = "课程回顾";
    still.src = "media/service.jpg";
    still.alt = "托盘上的冰美式";
    instruction.textContent = "回想一下，刚才是怎样完成这杯冰美式的？";
    const recap = document.createElement("ol");
    recap.className = "recap";
    for (const phase of ["洗手、准备器具", "加冰、加水", "称粉、压粉、萃取", "混合、摆盘、介绍饮品", "清洁器具和台面"]) {
      const item = document.createElement("li");
      item.textContent = phase;
      recap.append(item);
    }
    choices.append(recap);
    choices.hidden = false;
    next.textContent = "再做一遍";
    watch.hidden = true;
  } else {
    byId("step-label").textContent = step.phase;
    title.textContent = step.title;
    still.src = `media/${step.id}.jpg`;
    still.alt = step.ranges ? "" : "摆好冰美式、吸管和纸巾的托盘";
    next.textContent = index === steps.length - 1 ? "完成课程" : "下一步";
    if (stations[step.id]) {
      showStation();
    } else {
      showDemo(false);
    }
  }
  if (focus) title.focus();
}

next.onclick = () => {
  if (index === steps.length) {
    stationProgress.clear();
    index = 0;
    unlocked = 0;
  } else {
    index++;
    unlocked = Math.max(index, unlocked);
  }
  render();
};

watch.onclick = () => {
  message();
  if (stations[steps[index].id]) {
    if (workbench.hidden) {
      showStation();
      workbench.querySelector(".tool:not(:disabled)")?.focus();
    } else {
      showDemo(true);
      byId("media-options").hidden = false;
      video.focus();
    }
    return;
  }
  if (!video.hidden && video.readyState > 0) video.currentTime = 0;
  showDemo(true);
};

skip.onclick = () => {
  stationProgress.get(steps[index].id).skipped = true;
  skip.hidden = true;
  showDemo(true);
  next.focus();
};

speed.onchange = () => { video.playbackRate = Number(speed.value); };
sound.onclick = () => {
  const enable = muted;
  if (enable && video.volume === 0) video.volume = 0.5;
  video.muted = !enable;
};
video.onvolumechange = () => {
  if (video.hidden) return;
  muted = video.muted || video.volume === 0;
  sound.setAttribute("aria-pressed", String(!muted));
  sound.textContent = muted ? "原声 · 关" : "原声 · 开";
};
video.onended = () => {
  message(`${steps[index].short}。可以重看，也可以继续下一步。`);
};
video.onerror = () => {
  if (!video.hidden) message("视频暂时无法播放。可以重看或继续下一步。");
};
byId("back").onclick = () => {
  if (index > 0) index--;
  render();
};

try {
  const response = await fetch("lesson.json");
  if (!response.ok) throw new Error("课程数据读取失败");
  ({ steps } = await response.json());
  for (const name of new Set(steps.map((step) => step.phase))) {
    const phase = document.createElement("li");
    phase.textContent = name;
    byId("phases").append(phase);
  }
  steps.forEach((step, i) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = step.title;
    button.onclick = () => {
      index = i;
      byId("step-list").closest("details").open = false;
      render();
    };
    item.append(button);
    byId("step-list").append(item);
  });
  sound.textContent = "原声 · 关";
  byId("lesson").hidden = false;
  byId("nav").hidden = false;
  render(false);
} catch {
  const error = byId("load-error");
  error.hidden = false;
  error.textContent = "课程载入失败。请通过本地服务器打开页面后重试。";
}
