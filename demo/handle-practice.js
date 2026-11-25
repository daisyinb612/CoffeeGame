const photoDescriptions = {
  scale: "空手柄放在电子秤上",
  distribution: "布粉器在木底座上的粉碗里",
  tamp: "压粉锤垂直对着粉碗",
  grounds: "装好粉的手柄在粉渣桶上方",
};

function captureDrag(surface, onMove, onFinish = () => {}) {
  let drag;
  surface.addEventListener("pointerdown", event => {
    if (event.button !== 0 || drag || surface.dataset.active !== "true") return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    surface.setPointerCapture(event.pointerId);
    onMove(event, drag);
  });
  surface.addEventListener("pointermove", event => {
    if (drag?.id === event.pointerId) onMove(event, drag);
  });
  surface.addEventListener("pointerup", event => {
    if (drag?.id !== event.pointerId) return;
    if (surface.dataset.active === "true") onMove(event, drag);
    onFinish(event, drag);
    drag = undefined;
  });
  surface.addEventListener("lostpointercapture", () => { drag = undefined; });
}

function setupScale({ stage, image, status, updateControls, action, feedback, pass }) {
  const readout = document.createElement("output");
  readout.className = "handle-scale-readout";
  readout.setAttribute("aria-live", "polite");
  const spot = action("", event => {
    if (!suppressClick || event.detail === 0) runSpot();
  }, "handle-scale-spot");
  stage.append(readout, spot);

  const emptyHandle = 6212;
  const firstGrind = 154;
  let grams = 0;
  let runSpot, suppressClick = false;
  const display = amount => { readout.textContent = `${(amount / 10).toFixed(1)} g`; };
  const showPhoto = (name, description) => {
    image.src = `assets/handle/${name}.jpg`;
    image.alt = description;
  };

  const showSpot = (position, label, activate) => {
    const moveFocus = document.activeElement?.matches(".handle-practice-controls button:focus-visible");
    spot.textContent = label;
    spot.dataset.position = position;
    runSpot = activate;
    spot.disabled = false;
    spot.hidden = false;
    updateControls();
    if (moveFocus) spot.focus({ preventScroll: true });
  };

  const checkWeight = () => {
    if (grams >= 178 && grams <= 182) {
      pass();
      return;
    }
    feedback.textContent = grams < 178
      ? "粉量还少，补一点再称。"
      : "粉量偏多，去掉一点再称。";
  };
  const adjust = amount => {
    feedback.textContent = "";
    grams = Math.max(0, grams + amount);
    display(grams);
  };
  const weigh = () => {
    showPhoto("scale-filled", "装了咖啡粉的手柄放在电子秤上");
    readout.hidden = false;
    adjust(firstGrind);
    status.textContent = "看秤面。17.8–18.2 g 都可以。";
    const amountControls = document.createElement("div");
    amountControls.className = "handle-scale-adjustments";
    amountControls.append(
      action("减 0.1 g", () => adjust(-1)),
      action("补 0.1 g", () => adjust(1)),
      action("补 1.0 g", () => adjust(10)),
    );
    updateControls(amountControls, action("确认粉量", checkWeight, "primary"));
  };
  const grind = () => {
    const moveFocus = spot.matches(":focus-visible");
    spot.disabled = true;
    status.textContent = "正在接粉。";
    stage.dataset.grinding = "true";
    window.setTimeout(() => {
      if (!stage.isConnected) return;
      delete stage.dataset.grinding;
      spot.hidden = true;
      status.textContent = "第一份粉接好了。放回秤上看读数。";
      const returnButton = action("放回秤上", weigh, "primary");
      updateControls(returnButton);
      if (moveFocus) returnButton.focus({ preventScroll: true });
    }, 720);
  };
  const tare = () => {
    const moveFocus = spot.matches(":focus-visible");
    display(0);
    spot.hidden = true;
    status.textContent = "现在是 0.0 g。秤记住了空手柄的重量，可以去接粉了。";
    const grinderButton = action("去磨豆机接粉", () => {
      showPhoto("scale-grind", "磨豆机的接粉开关和下方的手柄");
      readout.hidden = true;
      status.textContent = "点磨豆机的开关，接第一份粉。";
      showSpot("grind", "接粉", grind);
    }, "primary");
    updateControls(grinderButton);
    if (moveFocus) grinderButton.focus({ preventScroll: true });
  };
  const place = () => {
    showPhoto("scale", "空手柄放在电子秤上");
    display(emptyHandle);
    readout.hidden = false;
    status.textContent = "秤上只有空手柄。点「去皮」，把这个读数设为 0.0 g。";
    showSpot("tare", "去皮", tare);
  };

  const scaleTarget = document.createElement("span");
  scaleTarget.className = "handle-scale-target";
  scaleTarget.setAttribute("aria-hidden", "true");
  scaleTarget.hidden = true;
  stage.append(scaleTarget);
  let grip;
  spot.addEventListener("pointerdown", event => {
    if (event.button !== 0 || grip) return;
    suppressClick = false;
    if (spot.dataset.position !== "place") return;
    grip = { id: event.pointerId, x: event.clientX, y: event.clientY };
    spot.setPointerCapture(event.pointerId);
  });
  spot.addEventListener("pointermove", event => {
    if (grip?.id !== event.pointerId) return;
    const dx = event.clientX - grip.x;
    const dy = event.clientY - grip.y;
    if (!grip.moved && Math.hypot(dx, dy) < 7) return;
    grip.moved = true;
    scaleTarget.hidden = false;
    spot.style.setProperty("--handle-drag-x", `${dx}px`);
    spot.style.setProperty("--handle-drag-y", `${dy}px`);
  });
  const finishDrag = event => {
    if (grip?.id !== event.pointerId) return;
    const bounds = scaleTarget.getBoundingClientRect();
    const onScale = event.type === "pointerup" && grip.moved
      && event.clientX >= bounds.left && event.clientX <= bounds.right
      && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    // A captured pointer can synthesize a click after release.
    suppressClick = Boolean(grip.moved);
    scaleTarget.hidden = true;
    spot.style.removeProperty("--handle-drag-x");
    spot.style.removeProperty("--handle-drag-y");
    grip = undefined;
    if (onScale) place();
  };
  spot.addEventListener("pointerup", finishDrag);
  spot.addEventListener("lostpointercapture", finishDrag);

  showPhoto("scale-place", "手里拿着空手柄，旁边是电子秤");
  readout.hidden = true;
  status.textContent = "把空手柄拖到秤上，也可以点一下手柄。";
  showSpot("place", "空手柄", place);
}

function setupDistribution({ stage, status, updateControls, action, pass }) {
  const dial = document.createElement("span");
  dial.className = "handle-distribution-dial";
  dial.setAttribute("aria-hidden", "true");
  dial.hidden = true;
  stage.append(dial);

  const turn = Math.PI * 2;
  let angle = 0;
  const report = () => {
    const degrees = Math.abs(angle) * 180 / Math.PI;
    dial.style.setProperty("--turn-angle", `${degrees % 360}deg`);
    dial.style.setProperty("--turn-progress", `${degrees % 360}deg`);
    const count = Math.min(2, Math.floor((Math.abs(angle) + .00001) / turn));
    if (count !== 2) {
      const instruction = `沿圆环转两圈。已转 ${count} / 2 圈。`;
      if (status.textContent !== instruction) status.textContent = instruction;
      return;
    }
    stage.dataset.active = "false";
    dial.hidden = true;
    status.textContent = "两圈完成。把布粉器放回原位。";
    updateControls(action("放回布粉器", pass, "primary"));
  };

  captureDrag(stage, (event, drag) => {
    const bounds = dial.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    if (Math.hypot(dx, dy) < bounds.width * .19) {
      drag.lastAngle = undefined;
      return;
    }
    const nextAngle = Math.atan2(dy, dx);
    if (drag.lastAngle !== undefined && stage.dataset.active === "true") {
      const delta = nextAngle - drag.lastAngle;
      angle += Math.atan2(Math.sin(delta), Math.cos(delta));
      report();
    }
    drag.lastAngle = nextAngle;
  });

  status.textContent = "把手柄放稳在底座上。";
  updateControls(action("手柄放到底座", () => {
    status.textContent = "把布粉器放在粉碗上。";
    updateControls(action("放上布粉器", () => {
      dial.hidden = false;
      stage.dataset.active = "true";
      updateControls(action("转一圈", () => {
        angle = (Math.abs(angle) + turn) * (Math.sign(angle) || 1);
        report();
      }));
      report();
    }, "primary"));
  }, "primary"));
}

function setupTamp({ stage, status, updateControls, action, pass }) {
  const marker = document.createElement("span");
  marker.className = "handle-tamp-marker";
  marker.setAttribute("aria-hidden", "true");
  marker.hidden = true;
  stage.append(marker);
  const press = () => {
    if (stage.dataset.active !== "true") return;
    stage.dataset.active = "false";
    marker.hidden = true;
    status.textContent = "已垂直压粉一次。把压粉锤放回原位。";
    updateControls(action("放回压粉锤", pass, "primary"));
  };
  captureDrag(stage, (event, drag) => {
    marker.style.setProperty("--press-offset", `${Math.max(0, Math.min(25, event.clientY - drag.y))}px`);
  }, (event, drag) => {
    const down = event.clientY - drag.y;
    marker.style.removeProperty("--press-offset");
    if (down >= 32 && Math.abs(event.clientX - drag.x) < down * .58) press();
    else status.textContent = "把压粉锤放平，再垂直向下压一次。";
  });
  status.textContent = "把压粉锤平放在粉碗上。";
  updateControls(action("放上压粉锤", () => {
    stage.dataset.active = "true";
    marker.hidden = false;
    status.textContent = "在画面上向下滑，垂直压一次。";
    updateControls(action("向下压一次", press));
  }, "primary"));
}

function setupGrounds({ stage, status, updateControls, action, feedback, pass }) {
  const clear = () => {
    if (stage.dataset.active !== "true") return;
    stage.dataset.active = "false";
    feedback.textContent = "";
    status.textContent = "外缘干净了。平时看见残粉再清理。";
    updateControls(action("继续", pass, "primary"));
  };
  captureDrag(stage, () => {}, (event, drag) => {
    if (event.clientY - drag.y >= 28) clear();
  });
  stage.dataset.active = "true";
  status.textContent = "朝粉渣桶向下拨，也可以点下方操作。";
  updateControls(action("拨入粉渣桶", clear, "primary"), action("直接继续", () => {
    feedback.textContent = "这次外缘还有残粉，先拨入下方的粉渣桶。";
  }));
}

const practices = {
  scale: setupScale, distribution: setupDistribution, tamp: setupTamp, grounds: setupGrounds,
};

function showPhotoPractice(kind, { actions, feedback, button: action, pass }) {
  const game = document.createElement("div");
  game.className = "handle-practice";
  game.dataset.kind = kind;
  const stage = document.createElement("div");
  stage.className = "handle-practice-media";
  const image = document.createElement("img");
  image.alt = photoDescriptions[kind];
  image.src = `assets/handle/${kind}.jpg`;
  image.draggable = false;
  stage.append(image);
  const status = document.createElement("p");
  status.className = "handle-practice-status";
  status.setAttribute("role", "status");
  const controls = document.createElement("div");
  controls.className = "handle-practice-controls";
  const updateControls = (...children) => {
    const restoreFocus = controls.contains(document.activeElement);
    controls.replaceChildren(...children);
    if (restoreFocus) controls.querySelector("button")?.focus({ preventScroll: true });
  };
  practices[kind]({ stage, image, status, updateControls, action, feedback, pass });
  game.append(stage, status, controls);
  actions.replaceChildren(game);
}

export function showHandlePractice(kind, options) {
  if (kind !== "scale") {
    showPhotoPractice(kind, options);
    return;
  }
  const bench = document.createElement("handle-scale-bench");
  const fallback = () => {
    if (bench.isConnected) showPhotoPractice(kind, options);
  };
  bench.addEventListener("scale-bench-complete", options.pass, { once: true });
  bench.addEventListener("scale-bench-unavailable", fallback, { once: true });
  options.actions.replaceChildren(bench);
  import("./handle-scale-bench.js?v=brush-gesture").catch(fallback);
}
