import { showClothMatching } from "./cloth-matching.js?v=cloth-hq-3";

const returnItems = [
  ["手柄", "assets/return/portafilter-clean.png", 0],
  ["量杯", "assets/return/measuring-cup-clean.png", 0],
  ["搅拌棒", "assets/return/stirrer-clean.png", 1],
  ["口布", "assets/cloths/white.png", 2],
];
const locations = [
  { name: "机顶格栅", photo: "assets/return/location-rack-v2.png", crop: "rack" },
  { name: "工具筒", photo: "assets/return/location-holder-v2.png", crop: "holder" },
  { name: "口布架", photo: "assets/return/location-cloth-v2.png", crop: "cloth" },
];

export function showCleanup(kind, { actions, feedback, button, pass }) {
  if (kind === "cleanup-cloths") {
    showClothMatching({ actions, button, pass });
    return;
  }
  feedback.textContent = "";
  const game = document.createElement("div");
  game.className = "return-tools";
  const meter = document.createElement("div");
  meter.className = "inventory-meter";
  const steps = document.createElement("div");
  steps.className = "inventory-steps";
  steps.setAttribute("aria-hidden", "true");
  const marks = returnItems.map(() => document.createElement("span"));
  steps.append(...marks);
  const progress = document.createElement("p");
  progress.className = "inventory-progress";
  progress.setAttribute("aria-live", "polite");
  meter.append(steps, progress);
  const visual = document.createElement("figure");
  visual.className = "return-object";
  const image = document.createElement("img");
  image.alt = "";
  const caption = document.createElement("figcaption");
  visual.append(image, caption);
  const controls = document.createElement("div");
  controls.className = "return-options";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "选择归位位置");
  const hint = document.createElement("p");
  hint.className = "inventory-feedback return-feedback";
  hint.setAttribute("role", "status");
  const next = button("下一步", () => {
    if (!answered) return;
    if (item === returnItems.length - 1) { pass(); return; }
    item++;
    showItem();
  }, "primary");
  game.append(meter, visual, controls, hint, next);
  actions.replaceChildren(game);
  let item = 0, answered = false;

  function showItem() {
    const restoreFocus = game.contains(document.activeElement);
    answered = false;
    next.disabled = true;
    next.textContent = item === returnItems.length - 1 ? "继续" : "下一步";
    const [name, path, destination] = returnItems[item];
    progress.textContent = `${item + 1} / ${returnItems.length}`;
    progress.setAttribute("aria-label", `第${item + 1}项，共${returnItems.length}项`);
    marks.forEach((mark, index) => { mark.dataset.state = index < item ? "complete" : index === item ? "current" : "upcoming"; });
    image.src = path;
    caption.textContent = name;
    hint.textContent = "已经洗净、擦干。点选它应该放回的位置。";
    controls.replaceChildren(...locations.map((location, index) => {
      const choice = button(location.name, () => {
        if (answered) return;
        controls.querySelector("[data-error]")?.removeAttribute("data-error");
        if (index !== destination) {
          choice.dataset.error = "";
          hint.textContent = `这里不是${name}的收纳位置，再想想它原来放在哪里。`;
          return;
        }
        answered = true;
        choice.setAttribute("aria-pressed", "true");
        marks[item].dataset.state = "complete";
        hint.textContent = `答对了。${name}放回${location.name}。`;
        next.disabled = false;
      }, "return-option");
      choice.setAttribute("aria-pressed", "false");
      const photo = document.createElement("span");
      photo.className = `return-location-photo return-location-${location.crop}`;
      const img = document.createElement("img");
      img.src = location.photo;
      img.alt = "";
      img.draggable = false;
      photo.append(img);
      choice.prepend(photo);
      return choice;
    }));
    if (restoreFocus) controls.firstElementChild?.focus({ preventScroll: true });
  }
  showItem();
}
