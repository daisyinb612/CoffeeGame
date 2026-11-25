const cleaning = [
  ["手柄", "handle/grounds", ["把残渣敲进粉渣桶", "冲洗粉碗", "用咖色抹布擦干"]],
  ["冲煮头", "handle/rinse", ["空排水，冲掉残粉"]],
  ["沥水盘", "preparation/drip-tray", ["用蓝色抹布擦净沥水盘"]],
  ["量杯", "inventory/measuring-cup", ["用流水冲洗量杯内侧和杯口", "用干净口布擦干量杯"]],
  ["搅拌棒", "inventory/spoon", ["用流水冲洗搅拌棒", "用干净口布擦干搅拌棒"]],
];

const returnItems = [
  ["手柄", "handle/basket-rinse", 0],
  ["量杯", "inventory/measuring-cup", 0],
  ["搅拌棒", "inventory/spoon", 1],
  ["口布", "preparation/cup-cloth", 2],
];
const locations = ["咖啡机顶部格栅", "工具筒", "口布架"];

export function showCleanup(kind, { actions, feedback, button, pass }) {
  const game = document.createElement("div");
  game.className = "cleanup-game";
  const status = document.createElement("p");
  status.className = "cleanup-status";
  status.setAttribute("role", "status");
  const visual = document.createElement("div");
  visual.className = "cleanup-visual";
  const controls = document.createElement("div");
  controls.className = "cleanup-controls";
  const image = document.createElement("img");
  image.alt = "";
  game.append(status, visual, controls);
  actions.replaceChildren(game);

  function setControls(...items) {
    const restoreFocus = game.contains(document.activeElement);
    controls.replaceChildren(...items);
    if (restoreFocus) items[0]?.focus({ preventScroll: true });
  }
  function photo(path) {
    image.src = `assets/${path}.jpg`;
    visual.replaceChildren(image);
  }
  function finish(message) {
    feedback.textContent = "";
    status.textContent = message;
    setControls(button("继续", pass, "primary"));
  }

  if (kind === "cleanup-tools") {
    let item = 0, step = 0;
    function showTool() {
      const [name, path, steps] = cleaning[item];
      status.textContent = `清洁${name} · ${item + 1} / ${cleaning.length}`;
      photo(path);
      setControls(button(steps[step], () => {
        step++;
        if (step === steps.length) {
          step = 0;
          item++;
        }
        if (item === cleaning.length) finish("五件器具都清洁好了。");
        else showTool();
      }, "primary"));
    }
    showTool();
  } else if (kind === "cleanup-counter") {
    const marks = ["咖啡渍", "残粉", "水渍"];
    let remaining = marks.length;
    const top = document.createElement("div");
    top.className = "cleanup-counter";
    const update = () => { status.textContent = `点台面上的污渍，用蓝布擦净。还剩 ${remaining} 处。`; };
    for (const [index, name] of marks.entries()) {
      const mark = button(name, () => {
        if (mark.disabled) return;
        mark.disabled = true;
        mark.hidden = true;
        remaining--;
        if (remaining === 0) finish("台面擦干净了。");
        else {
          update();
          top.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
        }
      }, "cleanup-mark");
      mark.dataset.mark = index;
      top.append(mark);
    }
    visual.append(top);
    update();
  } else {
    let item = 0;
    function showItem() {
      const [name, path, destination] = returnItems[item];
      status.textContent = `把${name}放回哪里？ · ${item + 1} / ${returnItems.length}`;
      photo(path);
      setControls(...locations.map((location, index) => button(location, () => {
        if (index !== destination) {
          feedback.textContent = `这里不是${name}的收纳位置，再试一次。`;
          return;
        }
        feedback.textContent = "";
        item++;
        if (item === returnItems.length) finish("工具已归位，工作台恢复整洁。");
        else showItem();
      })));
    }
    showItem();
  }
}
