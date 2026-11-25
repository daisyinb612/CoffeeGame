const prompts = {
  pour: "把浓缩液倒进冰水杯。",
  pouring: "正在倒入浓缩液。",
  stir: "用搅拌棒把咖啡搅匀。",
  sink: "把用过的搅拌棒放进水槽。",
  done: "搅拌棒放好了。调配与搅拌得 2 分。",
};

function control(label, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  return button;
}

function isInside(event, target, padding = 0) {
  const bounds = target.getBoundingClientRect();
  return event.clientX >= bounds.left - padding
    && event.clientX <= bounds.right + padding
    && event.clientY >= bounds.top - padding
    && event.clientY <= bounds.bottom + padding;
}

function attachDrag(item, enabled, drop, tap, preview = () => {}) {
  let drag;
  let suppressClick = false;

  item.addEventListener("pointerdown", event => {
    if (event.button !== 0 || drag || !enabled()) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    item.setPointerCapture(event.pointerId);
  });
  item.addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId) return;
    const x = event.clientX - drag.x;
    const y = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(x, y) < 6) return;
    drag.moved = true;
    item.style.setProperty("--drag-x", `${x}px`);
    item.style.setProperty("--drag-y", `${y}px`);
    preview(event);
  });
  item.addEventListener("pointerup", event => {
    if (drag?.id !== event.pointerId) return;
    suppressClick = drag.moved;
    if (drag.moved) drop(event);
    item.style.removeProperty("--drag-x");
    item.style.removeProperty("--drag-y");
    drag = undefined;
    preview(null);
  });
  item.addEventListener("lostpointercapture", () => {
    item.style.removeProperty("--drag-x");
    item.style.removeProperty("--drag-y");
    drag = undefined;
    preview(null);
  });
  item.addEventListener("click", () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (enabled()) tap();
  });
}

class MixStirGame extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";
    this.dataset.phase = "pour";

    const steps = document.createElement("ol");
    steps.className = "ice-workshop-steps";
    steps.setAttribute("aria-label", "练习进度");
    for (const [index, name] of ["倒入", "搅拌", "放入水槽"].entries()) {
      const step = document.createElement("li");
      const count = document.createElement("span");
      count.textContent = `${index + 1} / 3`;
      step.append(name, count);
      steps.append(step);
    }

    const arena = document.createElement("div");
    arena.className = "mix-arena";
    const counter = document.createElement("div");
    counter.className = "mix-counter";
    counter.setAttribute("aria-hidden", "true");

    const sink = document.createElement("div");
    sink.className = "mix-sink";
    sink.innerHTML = "<span>水槽</span>";
    sink.setAttribute("aria-hidden", "true");

    const cup = document.createElement("div");
    cup.className = "mix-cup";
    cup.innerHTML = '<span class="mix-liquid"></span><i></i><i></i><i></i>';
    cup.setAttribute("aria-hidden", "true");

    const stream = document.createElement("span");
    stream.className = "mix-pour-stream";
    stream.setAttribute("aria-hidden", "true");

    const spill = document.createElement("span");
    spill.className = "mix-spill";
    spill.setAttribute("aria-hidden", "true");

    const pitcher = control("浓缩液", "mix-pitcher");
    pitcher.setAttribute("aria-label", "浓缩液量杯，拖到冰水杯上倒入");

    const stirZone = control("搅拌", "mix-stir-zone");
    stirZone.setAttribute("aria-label", "在杯中滑动搅拌，也可以点按完成搅拌");
    stirZone.hidden = true;

    const stirrer = control("搅拌棒", "mix-stirrer");
    stirrer.setAttribute("aria-label", "使用后的搅拌棒，拖到水槽中");
    stirrer.hidden = true;

    const pourHint = document.createElement("div");
    pourHint.className = "mix-gesture-hint mix-pour-hint";
    pourHint.setAttribute("aria-hidden", "true");
    pourHint.innerHTML = '<span class="mix-tap-dot"></span>';
    const stirHint = document.createElement("div");
    stirHint.className = "mix-gesture-hint mix-stir-hint";
    stirHint.setAttribute("aria-hidden", "true");
    stirHint.innerHTML = '<svg viewBox="0 0 120 64" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M106.36 37.69 A48 22 0 1 1 107.27 28.18" stroke-dasharray="3 5"/><path d="M100.77 23.18L107.27 28.18L108.77 20.18"/><circle class="mix-gesture-dot" cx="60" cy="32" r="4" fill="currentColor" stroke="#faf7f2" stroke-width="2"/></svg>';
    const sinkHint = document.createElement("div");
    sinkHint.className = "mix-gesture-hint mix-sink-hint";
    sinkHint.setAttribute("aria-hidden", "true");
    sinkHint.innerHTML = '<span class="mix-tap-dot"></span>';
    arena.append(counter, sink, spill, cup, stream, pitcher, stirZone, stirrer, pourHint, stirHint, sinkHint);
    pitcher.addEventListener("pointerdown", () => { pourHint.hidden = true; });
    pitcher.addEventListener("pointercancel", () => { pourHint.hidden = false; });

    const footer = document.createElement("div");
    footer.className = "mix-footer";
    const status = document.createElement("p");
    status.className = "mix-status";
    status.setAttribute("role", "status");
    const next = control("继续", "primary mix-next");
    next.hidden = true;
    next.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("mix-game-complete", { bubbles: true }));
    });
    footer.append(status, next);
    this.append(steps, arena, footer);

    const phase = value => {
      this.dataset.phase = value;
      status.textContent = {
        pour: "点量杯，或拖到杯口圆环亮起时松手。",
        stir: "沿杯口绕两圈。点一下搅拌棒也能搅一圈。",
        sink: "点搅拌棒，或把它拖进左边的水槽。"
      }[value] ?? "";
      const current = { pour: 0, pouring: 0, stir: 1, sink: 2, done: 2 }[value];
      Array.from(steps.children).forEach((step, i) => {
        if (i === current) step.setAttribute("aria-current", "step");
        else step.removeAttribute("aria-current");
      });
      const prompt = prompts[value] ?? prompts.pour;
      this.dispatchEvent(new CustomEvent("mix-game-prompt", { bubbles: true, detail: prompt }));
    };

    const miss = message => {
      spill.dataset.visible = "true";
      status.textContent = message;
      pourHint.hidden = false;
      window.setTimeout(() => {
        delete spill.dataset.visible;
      }, 800);
    };

    const finishPour = () => {
      if (this.dataset.phase !== "pour") return;
      const board = arena.getBoundingClientRect();
      const held = pitcher.getBoundingClientRect();
      this.pourOrigin = { x: (held.left + held.width / 2 - board.left) / board.width,
        y: (held.top + held.height / 2 - board.top) / board.height };
      this.pourStarted = performance.now();
      phase("pouring");
      pitcher.disabled = true;
      this.dataset.pouring = "true";
      window.setTimeout(() => {
        if (!this.isConnected) return;
        delete this.dataset.pouring;
        cup.dataset.mixed = "false";
        pitcher.hidden = true;
        stirZone.hidden = false;
        phase("stir");
        stirZone.focus({ preventScroll: true });
      }, 2350);
    };

    const nearRim = event => {
      const r = cup.getBoundingClientRect();
      return Math.abs(event.clientX - (r.left + r.width / 2)) < r.width * .64 &&
        Math.abs(event.clientY - (r.top + 5)) < Math.max(24, r.height * .23);
    };
    attachDrag(
      pitcher,
      () => this.dataset.phase === "pour",
      event => nearRim(event)
        ? finishPour()
        : miss("浓缩液洒到杯外了。重新把量杯对准杯口。"),
      finishPour,
      event => {
        arena.toggleAttribute("data-aligned", Boolean(event && nearRim(event)));
      },
    );

    const motion = this.stirMotion = { x: 0, y: 0, angle: 0 };
    let stirring, swept = 0, tapFrame = 0;
    const fullTurn = Math.PI * 2;
    const updateMotion = (x, y, delta) => {
      motion.x = x;
      motion.y = y;
      motion.angle += delta;
      swept += Math.abs(delta);
      if (swept > .12) stirHint.hidden = true;
      const progress = Math.min(1, (swept + .00001) / (fullTurn * 2));
      stirZone.style.setProperty("--stir-progress", progress * 100 + "%");
      stirZone.style.setProperty("--stir-turn", motion.angle + "rad");
      if (progress < 1) return;
      stirring = undefined;
      cup.dataset.mixed = "true";
      stirZone.hidden = true;
      stirrer.hidden = false;
      phase("sink");
      stirrer.focus({ preventScroll: true });
    };
    function contact(event) {
      const r = cup.getBoundingClientRect();
      const x = (event.clientX - r.left - r.width / 2) / (r.width * .48);
      const y = (event.clientY - r.top - r.height * .09) / (r.width * .34);
      const radius = Math.hypot(x, y);
      const scale = Math.max(1, radius);
      return { x: x / scale, y: y / scale, angle: radius > .19 ? Math.atan2(y,x) : null };
    }
    stirZone.onpointerdown = event => {
      if (event.button !== 0 || stirring || tapFrame) return;
      const p = contact(event);
      stirring = { id: event.pointerId, startX: event.clientX, startY: event.clientY, angle: p.angle, moved: false };
      stirZone.setPointerCapture(event.pointerId);
      updateMotion(p.x, p.y, 0);
    };
    stirZone.onpointermove = event => {
      if (stirring?.id !== event.pointerId) return;
      const p = contact(event);
      if (Math.hypot(event.clientX - stirring.startX, event.clientY - stirring.startY) > 4) stirring.moved = true;
      const turn = stirring.angle === null || p.angle === null ? 0 : p.angle - stirring.angle;
      stirring.angle = p.angle;
      updateMotion(p.x, p.y, Math.atan2(Math.sin(turn), Math.cos(turn)));
    };
    stirZone.onpointerup = event => {
      if (stirring?.id !== event.pointerId) return;
      const tapped = !stirring.moved;
      stirring = undefined;
      if (tapped) stirOnce();
    };
    stirZone.onlostpointercapture = () => { stirring = undefined; };
    stirZone.onclick = event => { if (event.detail === 0) stirOnce(); };
    function stirOnce() {
      if (tapFrame || gameFinished()) return;
      stirHint.hidden = true;
      const start = performance.now(), from = Math.atan2(motion.y, motion.x);
      let previous = 0;
      function animate(now) {
        tapFrame = 0;
        if (gameFinished()) return;
        const t = Math.min(1, (now - start) / 760);
        const turn = t * fullTurn;
        updateMotion(Math.cos(from + turn), Math.sin(from + turn), turn - previous);
        previous = turn;
        if (t < 1) tapFrame = requestAnimationFrame(animate);
      }
      tapFrame = requestAnimationFrame(animate);
    }
    function gameFinished() { return !stirZone.isConnected || stirZone.hidden; }

    const finishSink = () => {
      if (this.dataset.phase !== "sink") return;
      stirrer.hidden = true;
      sink.dataset.filled = "true";
      phase("done");
      next.hidden = false;
      next.focus({ preventScroll: true });
    };
    attachDrag(
      stirrer,
      () => this.dataset.phase === "sink",
      event => {
        if (isInside(event, sink, 14)) finishSink();
        else status.textContent = "搅拌棒不能留在台面上，把它放进水槽。";
      },
      finishSink,
    );

    phase("pour");
    this.hidden = false;
    import("./mix-stir-scene.js?v=shared-coffee-1").then(({ mountMixScene }) => {
      this.releaseScene = mountMixScene(this, arena);
    }).catch(() => { /* The same controls work in the illustrated view. */ });
  }
  disconnectedCallback() { this.releaseScene?.(); }
}

if (!customElements.get("mix-stir-game")) customElements.define("mix-stir-game", MixStirGame);
