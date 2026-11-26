const startLimit = 5_000;
const dripTime = 1_200;
const flowRate = 2.1;
const tailWeight = 1.6;

export function showExtraction({ actions, feedback, button, pass }) {
  const widget = document.createElement("div");
  widget.className = "extraction-game";
  const bench = document.createElement("div");
  bench.className = "extraction-bench";
  bench.setAttribute("aria-hidden", "true");
  bench.innerHTML = `<div class="extract-machine"><i></i><i></i><i></i></div>
    <div class="extract-group"></div><div class="extract-handle"></div>
    <div class="extract-flow"></div><div class="extract-scale"></div>
    <div class="extract-cup"><span></span></div><div class="extract-tray"></div>
    <div class="extract-spill"></div>`;
  const liquid = bench.querySelector(".extract-cup span");
  const readout = document.createElement("p");
  readout.className = "extract-readout";
  const status = document.createElement("p");
  status.className = "extract-status";
  status.setAttribute("role", "status");
  const controls = document.createElement("div");
  controls.className = "extract-actions";
  widget.append(bench, readout, status, controls);
  actions.replaceChildren(widget);
  function setControls(...items) {
    const focused = controls.contains(document.activeElement);
    controls.replaceChildren(...items);
    if (focused) controls.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
  }
  const primary = (label, activate) => button(label, activate, "primary");
  function animate(update) {
    function frame(now) {
      if (widget.isConnected && update(now)) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  bench.dataset.scale = bench.dataset.cup = "ready";
  readout.textContent = "电子秤 0.0 g";
  let hanging, started, stopped, stopWeight, movedCup, settled;
  function reset() {
    hanging = started = stopped = undefined;
    movedCup = settled = false;
    delete bench.dataset.handle;
    delete bench.dataset.flow;
    delete bench.dataset.spill;
    bench.dataset.scale = bench.dataset.cup = "ready";
    liquid.style.height = "0%";
    readout.textContent = "电子秤 0.0 g";
    status.textContent = "量杯已去皮并对准出液口。挂上手柄后计时。";
    setControls(primary("挂上手柄", hang));
  }
  function hang() {
    feedback.textContent = "";
    hanging = performance.now();
    bench.dataset.handle = "";
    setControls(primary("开始萃取", start));
    animate(now => {
      if (hanging === undefined || started !== undefined) return false;
      const remaining = startLimit - (now - hanging);
      if (remaining < 0) {
        reset();
        feedback.textContent = "已超过 5 秒。重新挂手柄，再按萃取键。";
        return false;
      }
      status.textContent = `请按萃取键。剩余 ${(remaining / 1000).toFixed(1)} 秒。`;
      return true;
    });
  }
  function start() {
    const now = performance.now();
    if (now - hanging > startLimit) {
      reset();
      feedback.textContent = "已超过 5 秒。重新挂手柄，再按萃取键。";
      return;
    }
    started = now;
    bench.dataset.flow = "coffee";
    status.textContent = "观察秤面。停机后还会滴一小段余液。";
    setControls(primary("停止萃取", stop), button("移开量杯", removeCup));
    animate(update);
  }
  const weightAt = now => (now - started) / 1000 * flowRate;
  function stop() {
    stopped = performance.now();
    stopWeight = weightAt(stopped);
    status.textContent = "等余液滴完，再看最终重量。";
    setControls(button("移开量杯", removeCup));
  }
  function removeCup() {
    if (settled) return;
    movedCup = true;
    bench.dataset.cup = "side";
    bench.dataset.spill = "";
    feedback.textContent = "液流还没停，移开量杯会外洒。";
    if (stopped === undefined) stop();
    setControls();
  }
  function update(now) {
    const tail = stopped === undefined ? 0 : Math.max(0, Math.min(1, (now - stopped) / dripTime));
    const weight = stopped === undefined ? weightAt(now) : stopWeight + tailWeight * tail;
    readout.textContent = `电子秤 ${movedCup ? "0.0" : weight.toFixed(1)} g`;
    if (!movedCup) liquid.style.height = Math.min(100, weight / 48 * 100) + "%";
    if (weight >= 48) bench.dataset.spill = "";
    if (stopped === undefined && weight >= 49) stop();
    if (tail < 1) return true;
    delete bench.dataset.flow;
    settled = true;
    const displayed = Number(weight.toFixed(1));
    if (bench.hasAttribute("data-spill") || displayed < 34 || displayed > 38) {
      status.textContent = bench.hasAttribute("data-spill") ? "这次有外洒。"
        : `最终 ${displayed.toFixed(1)} g，${displayed < 34 ? "偏少" : "偏多"}。合格范围 34–38 g。`;
      setControls(primary("再试一次", () => { feedback.textContent = ""; reset(); }));
    } else {
      status.textContent = `最终 ${displayed.toFixed(1)} g，无外洒。`;
      setControls(primary("继续", pass));
    }
    return false;
  }
  reset();
}
