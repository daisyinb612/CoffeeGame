import { checkpoints } from "./story.js?v=inventory";

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
const controls = get("controls");
const captions = get("captions");
const captionTrack = get("caption-track").track;
const lessonStart = 7.5;
let next = 0;
let state = "ready";
let muted = true;

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
  controls.hidden = value !== "playing";
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
    if (state !== "playing") return;
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

function inventoryControls(items) {
  const selected = new Set();
  const grid = document.createElement("div");
  grid.className = "inventory-grid";
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "准备物品，多选");
  const confirm = button("确认 · 已选 0 项", () => {
    if ([...selected].some(item => !item.needed)) {
      feedback.textContent = "提示　托盘和压粉锤之后才用。回想刚才的杯子、搅拌棒和带包装的用品。";
    } else if (items.some(item => item.needed && !selected.has(item))) {
      feedback.textContent = "提示　还没找齐。回想柜子、机顶和水槽旁各放了什么。";
    } else {
      pass();
    }
  }, "primary");

  for (const item of items) {
    const control = button(item.name, () => {
      if (selected.has(item)) selected.delete(item);
      else selected.add(item);
      control.setAttribute("aria-pressed", String(selected.has(item)));
      confirm.textContent = `确认 · 已选 ${selected.size} 项`;
      feedback.textContent = "";
    });
    control.setAttribute("aria-pressed", "false");
    grid.append(control);
  }
  return [grid, confirm];
}

function showCheckpoint(checkpoint) {
  mode("question");
  film.pause();
  title.textContent = `第 ${next + 1} 关`;
  speaker.textContent = `第 ${next + 1} 关 · 共 ${checkpoints.length} 关`;
  line.textContent = checkpoint.prompt;
  feedback.textContent = "";
  if (checkpoint.inventory) {
    actions.replaceChildren(...inventoryControls(checkpoint.inventory));
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
  if (state === "playing" && checkpoint && seconds >= checkpoint.at) showCheckpoint(checkpoint);
}

function start() {
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
  mode("done");
  title.textContent = "课程完成";
  speaker.textContent = "课程完成";
  line.textContent = "你已完成从准备器具、制作冰美式到清洁吧台的学习。";
  actions.replaceChildren(button("再学一遍", start, "primary"));
  actions.firstChild.focus({ preventScroll: true });
};
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
line.textContent = "先看老师怎么准备器具，再一起做一杯。";
actions.replaceChildren(button("开始学习", start, "primary"));
