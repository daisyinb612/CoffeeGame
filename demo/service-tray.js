export function showServiceTray({ actions, line, button, pass }) {
  const game = document.createElement("div");
  game.className = "service-game";
  const bench = document.createElement("div");
  bench.className = "service-bench";
  const status = document.createElement("p");
  status.className = "service-status";
  status.setAttribute("role", "status");

  let cupPlaced = false;
  let strawPlaced = false;
  let napkinPlaced = false;
  let delivered = false;

  const tray = document.createElement("div");
  tray.className = "service-tray";
  tray.setAttribute("aria-label", "出品托盘");
  const cup = button("", () => {
    cupPlaced = true;
    cup.dataset.placed = "";
    cup.setAttribute("aria-label", "冰美式已放在托盘中");
    update();
  }, "service-cup");
  cup.setAttribute("aria-label", "把冰美式放到托盘");

  function addAccessory(label, kind, markPlaced) {
    const control = button("", () => {
      if (!cupPlaced) {
        status.textContent = "先把冰美式放进托盘。";
        return;
      }
      markPlaced();
      control.dataset.placed = "";
      control.setAttribute("aria-label", `${label}已放在托盘中`);
      update();
    }, `service-${kind}`);
    control.setAttribute("aria-label", `把${label}放到托盘`);
    return control;
  }
  const straw = addAccessory("吸管", "straw", () => { strawPlaced = true; });
  const strawPhoto = document.createElement("img");
  strawPhoto.src = "assets/inventory/straw.jpg";
  strawPhoto.alt = "带包装的吸管";
  straw.append(strawPhoto);
  const napkin = addAccessory("纸巾", "napkin", () => { napkinPlaced = true; });
  const napkinImage = document.createElement("img");
  napkinImage.src = "assets/service/folded-napkin.png";
  napkinImage.alt = "折叠白色餐巾纸";
  napkin.append(napkinImage);
  const submit = button("递送饮品", () => {
    if (delivered) {
      pass();
      return;
    }
    if (!cupPlaced || !strawPlaced || !napkinPlaced) {
      update();
      return;
    }
    delivered = true;
    bench.dataset.delivered = "";
    for (const item of [cup, straw, napkin]) item.disabled = true;
    line.textContent = "冰美式已递送。";
    status.textContent = "冰美式、吸管和纸巾已摆放齐全。";
    submit.textContent = "继续";
  }, "primary");

  function update() {
    if (!cupPlaced) {
      line.textContent = "把冰美式放进托盘。";
      status.textContent = "点冰美式，把杯子放稳在托盘中。";
    } else if (!strawPlaced || !napkinPlaced) {
      line.textContent = "配好吸管和纸巾。";
      status.textContent = !strawPlaced && !napkinPlaced ? "点吸管和纸巾，把它们摆到杯子两侧。"
        : !strawPlaced ? "还差一根吸管。" : "还差一张纸巾。";
    } else {
      line.textContent = "把冰美式递给顾客。";
      status.textContent = "冰美式、吸管和纸巾已摆放齐全。";
    }
    submit.hidden = !cupPlaced;
  }

  bench.append(tray, cup, straw, napkin);
  game.append(bench, status, submit);
  actions.replaceChildren(game);
  update();
  import("./service-tray-scene.js?v=physical-serving-2").then(({ mountServiceScene }) => {
    if (bench.isConnected) mountServiceScene(bench);
  }).catch(() => { /* Keep the illustrated controls when WebGL is unavailable. */ });
}
