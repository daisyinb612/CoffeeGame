export function showServiceTray({ actions, line, button, pass }) {
  const game = document.createElement("div");
  game.className = "service-game";
  const bench = document.createElement("div");
  bench.className = "service-bench";
  const status = document.createElement("p");
  status.className = "service-status";
  status.setAttribute("role", "status");

  let cupClean = false;
  let trayClean = false;
  let cupPlaced = false;
  let strawPlaced = false;
  let napkinPlaced = false;
  let delivered = false;

  const tray = button("", () => {
    if (trayClean) return;
    trayClean = true;
    tray.dataset.clean = "";
    tray.setAttribute("aria-label", "托盘已擦净");
    update();
  }, "service-tray");
  tray.setAttribute("aria-label", "擦净托盘水渍");

  const cup = button("", () => {
    if (!cupClean) {
      cupClean = true;
      cup.dataset.clean = "";
      cup.setAttribute("aria-label", "把冰美式放到托盘");
    } else if (!trayClean) {
      status.textContent = "托盘还有水渍，先擦干净。";
      return;
    } else if (!cupPlaced) {
      cupPlaced = true;
      cup.dataset.placed = "";
      cup.setAttribute("aria-label", "冰美式已放在托盘中");
    }
    update();
  }, "service-cup");
  cup.setAttribute("aria-label", "擦净杯身咖啡渍");

  function addAccessory(label, kind, markPlaced) {
    const control = button("", () => {
      if (!cupPlaced) {
        status.textContent = "先把冰美式放进干净的托盘。";
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
  const napkin = addAccessory("纸巾", "napkin", () => { napkinPlaced = true; });
  const submit = button("递送饮品", () => {
    if (delivered) {
      pass();
      return;
    }
    if (!cupClean || !trayClean || !cupPlaced || !strawPlaced || !napkinPlaced) {
      update();
      return;
    }
    delivered = true;
    bench.dataset.delivered = "";
    for (const item of [tray, cup, straw, napkin]) item.disabled = true;
    line.textContent = "冰美式已递送。";
    status.textContent = "杯身和托盘干净，吸管和纸巾齐全。";
    submit.textContent = "继续";
  }, "primary");

  function update() {
    if (!cupClean || !trayClean) {
      status.textContent = !cupClean && !trayClean
        ? "点杯身和托盘，擦掉咖啡渍和水渍。"
        : !cupClean ? "杯身还有咖啡渍。" : "托盘还有水渍。";
    } else if (!cupPlaced) {
      line.textContent = "把冰美式放进托盘。";
      status.textContent = "点冰美式，把杯子放稳在托盘中。";
    } else if (!strawPlaced || !napkinPlaced) {
      line.textContent = "配好吸管和纸巾。";
      status.textContent = !strawPlaced && !napkinPlaced ? "点吸管和纸巾，把它们摆到杯子两侧。"
        : !strawPlaced ? "还差一根吸管。" : "还差一张纸巾。";
    } else {
      line.textContent = "把冰美式递给顾客。";
      status.textContent = "杯身和托盘干净，吸管和纸巾齐全。";
    }
    submit.hidden = !cupPlaced;
  }

  bench.append(tray, cup, straw, napkin);
  game.append(bench, status, submit);
  actions.replaceChildren(game);
  update();
}
