// Each operation changes the workbench and can require an earlier operation.
export const stations = {
  ice: {
    object: "cup", initial: "空玻璃杯",
    actions: [
      { id: "ice", tool: "冰铲", icon: "🧊", verb: "铲一勺冰", count: 2, state: "冰块已入杯" },
    ],
    instruction: "点冰铲，把两勺冰放进杯里。",
  },
  water: {
    object: "cup", initial: "杯中有冰块", look: "ice",
    actions: [
      { id: "water", tool: "直饮水龙头", icon: "🚰", verb: "往冰杯加水", state: "冰水做好了", look: "water" },
    ],
    instruction: "打开直饮水龙头，给冰杯加水。",
  },
  dose: {
    object: "scale", initial: "粉碗里有咖啡粉",
    actions: [
      { id: "weigh", tool: "电子秤", icon: "⚖️", verb: "称粉", state: "还差一点，补一些粉" },
      { id: "add", tool: "磨豆机", icon: "◉", verb: "补一些粉", needs: ["weigh"], hint: "先用电子秤看看粉量。", state: "已补粉，放回秤上确认" },
      { id: "check", tool: "电子秤", icon: "⚖️", verb: "再称一次", needs: ["add"], hint: "补粉后再称一次。", state: "粉量已确认" },
    ],
    instruction: "用电子秤检查粉量，补粉后再称一次。这一关的目标是 18 克。",
  },
  extract: {
    object: "cup", initial: "等待放置量杯", look: "machine",
    actions: [
      { id: "place", tool: "量杯", icon: "🥛", verb: "放到冲煮头下", state: "量杯已就位", look: "empty" },
      { id: "brew", tool: "咖啡机", icon: "◉", verb: "萃取浓缩", needs: ["place"], hint: "先放好量杯来接浓缩。", state: "量杯接到了浓缩", look: "coffee" },
    ],
    instruction: "先放好接液量杯，再启动萃取。",
  },
  mix: {
    object: "cup", initial: "杯里是冰水", look: "water",
    actions: [
      { id: "pour", tool: "浓缩", icon: "☕", verb: "倒入冰水", state: "浓缩已经倒进冰水", look: "layers" },
      { id: "stir", tool: "搅拌棒", icon: "🥄", verb: "搅匀", needs: ["pour"], hint: "先把浓缩倒进冰水。", state: "冰美式做好了", look: "mixed" },
    ],
    instruction: "把浓缩倒进冰水，再用搅拌棒搅匀。",
  },
  tray: {
    object: "tray", initial: "空托盘",
    actions: [
      { id: "drink", tool: "冰美式", icon: "🥤", verb: "摆上饮品", state: "饮品已放好" },
      { id: "straw", tool: "吸管", icon: "／", verb: "摆上吸管", state: "吸管已放好" },
      { id: "napkin", tool: "纸巾", icon: "▤", verb: "摆上纸巾", state: "纸巾已放好" },
    ],
    instruction: "点选台面上的物品，把饮品、吸管和纸巾放到托盘上。",
  },
  clean: {
    object: "cleanup", initial: "吧台还有用过的器具",
    actions: [
      { id: "handle", tool: "手柄", icon: "◉", verb: "清洁手柄", state: "手柄已清洁" },
      { id: "tools", tool: "量杯和搅拌棒", icon: "🥄", verb: "冲洗器具", state: "器具已冲洗" },
      { id: "cloth", tool: "抹布", icon: "▤", verb: "擦干净台面", state: "台面已擦干净" },
    ],
    instruction: "点选用过的器具和抹布，收拾吧台。",
  },
};

function create(tag, className, text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

export function renderWorkbench(workbench, station, progress, onOperate) {
  const isDone = (action) => (progress.counts[action.id] ?? 0) >= (action.count ?? 1);
  const scene = create("div", "station-scene");
  scene.setAttribute("aria-hidden", "true");
  if (station.object === "cup") {
    const cup = create("div", "cup");
    cup.dataset.look = progress.look ?? station.look ?? "empty";
    const iceCount = progress.counts.ice ?? (["ice", "water", "layers", "mixed"].includes(cup.dataset.look) ? 2 : 0);
    for (let i = 0; i < iceCount; i++) cup.append(create("span", "ice-cube"));
    scene.append(cup);
  } else if (station.object === "scale") {
    const value = progress.counts.check ? "18 g" : progress.counts.add ? "待复称" : progress.counts.weigh ? "17 g" : "待称重";
    scene.append(create("div", "scale-pan"), create("div", "scale-display", value));
  } else if (station.object === "tray") {
    const tray = create("div", "serving-tray");
    for (const action of station.actions) {
      const slot = create("span", isDone(action) ? "tray-slot filled" : "tray-slot", isDone(action) ? action.icon : action.tool);
      tray.append(slot);
    }
    scene.append(tray);
  } else {
    const counter = create("div", "counter");
    for (const action of station.actions) {
      counter.append(create("span", isDone(action) ? "counter-item cleaned" : "counter-item", isDone(action) ? "✓" : action.icon));
    }
    scene.append(counter);
  }

  const display = create("p", "station-state", progress.state ?? station.initial);
  if (station.object === "scale") display.textContent += ` · ${scene.lastElementChild.textContent}`;
  if (station.actions[0].count) display.textContent += ` · ${progress.counts.ice ?? 0}/2 勺`;
  display.setAttribute("role", "status");
  const tools = create("div", "station-tools");
  for (const action of station.actions) {
    const icon = create("span", "tool-icon", action.icon);
    icon.setAttribute("aria-hidden", "true");
    const button = create("button", "tool");
    button.type = "button";
    button.dataset.tool = action.id;
    button.disabled = isDone(action);
    button.append(icon, create("span", "tool-name", action.tool), create("span", "tool-verb", isDone(action) ? "已完成" : action.verb));
    button.onclick = () => {
      const blocked = action.needs?.some((id) => !isDone(station.actions.find((item) => item.id === id)));
      if (blocked) {
        onOperate(action.hint);
        return;
      }
      progress.counts[action.id] = (progress.counts[action.id] ?? 0) + 1;
      progress.state = action.state;
      if (action.look) progress.look = action.look;
      onOperate("", action.id);
    };
    tools.append(button);
  }
  workbench.replaceChildren(scene, display, tools);
  return station.actions.every(isDone);
}
