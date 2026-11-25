const prepLimit = 60_000;
const startLimit = 5_000;
const dripTime = 1_200;
const flowRate = 2.1;
const tailWeight = 1.6;

export function createExtractionRun(entry) {
  // A level opened through the picker starts with the previous operations prepared.
  return { preparationTime: entry === "extract-tare" || entry === "extract-brew" ? 0 : null };
}

export function showExtraction(kind, { actions, line, feedback, button, pass, run, retryPrep }) {
  const widget = document.createElement("div");
  widget.className = "extraction-game";
  const bench = document.createElement("div");
  bench.className = "extraction-bench";
  bench.setAttribute("aria-hidden", "true");
  bench.innerHTML = `<div class="extract-machine"><i></i><i></i><i></i></div>
    <div class="extract-group"></div><div class="extract-handle"></div>
    <div class="extract-flow"></div><div class="extract-scale"></div>
    <div class="extract-cup"><span></span></div><div class="extract-tray"></div>
    <div class="extract-cloth"></div><div class="extract-spill"></div>`;
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
  let entered = performance.now();
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
  function flushClock(now = performance.now()) {
    return (run.preparationTime ?? 0) + now - entered;
  }
  const prepare = () => setControls(primary("重新空排水", retryPrep));

  function showFlush() {
    status.textContent = "冲煮头下留空。排水满 3 秒会停止。";
    readout.textContent = "空排水 0.0 秒";
    setControls(primary("开始空排水", () => {
      const started = performance.now();
      bench.dataset.flow = "water";
      const stop = now => {
        delete bench.dataset.flow;
        const seconds = Math.min(3, (now - started) / 1000);
        readout.textContent = `空排水 ${seconds.toFixed(1)} 秒`;
        if (seconds < 3) {
          feedback.textContent = "水还没排够 3 秒，再试一次。";
          showFlush();
          return;
        }
        entered = performance.now();
        run.preparationTime = 0;
        feedback.textContent = "";
        line.textContent = "用蓝色抹布擦拭沥水盘。";
        status.textContent = "蓝布在托盘左边。";
        setControls(primary("用蓝布擦沥水盘", () => {
          bench.dataset.wiped = "";
          status.textContent = "沥水盘擦好了。";
          setControls(primary("继续", () => {
            run.preparationTime = flushClock();
            pass();
          }));
        }));
      };
      setControls(primary("停止排水", () => stop(performance.now())));
      animate(now => {
        if (!bench.dataset.flow) return false;
        if (now - started >= 3_000) {
          stop(now);
          return false;
        }
        readout.textContent = `空排水 ${((now - started) / 1000).toFixed(1)} 秒`;
        return true;
      });
    }));
  }

  function showTare() {
    bench.dataset.scale = "side";
    readout.textContent = "电子秤 0.0 g";
    setControls(primary("把量杯放上秤", () => {
      bench.dataset.cup = "side";
      readout.textContent = "电子秤 86.0 g";
      status.textContent = "杯子已经放稳。按去皮键归零。";
      setControls(primary("去皮", () => {
        readout.textContent = "电子秤 0.0 g";
        status.textContent = "把秤和量杯一起移到冲煮头下方。";
        setControls(primary("移到冲煮头下", () => {
          bench.dataset.scale = bench.dataset.cup = "ready";
          status.textContent = "量杯已对准出液口。";
          setControls(primary("继续", () => {
            run.preparationTime = flushClock();
            pass();
          }));
        }));
      }));
    }));
  }

  function showBrew() {
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
      if (flushClock() > prepLimit) {
        feedback.textContent = "距空排水已超过 1 分钟。重新排水并擦拭沥水盘。";
        prepare();
        return;
      }
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
      if (flushClock(now) > prepLimit) {
        hanging = undefined;
        feedback.textContent = "距空排水已超过 1 分钟。请重新空排水。";
        prepare();
        return;
      }
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

  if (kind === "extract-flush") showFlush();
  if (kind === "extract-tare") showTare();
  if (kind === "extract-brew") showBrew();
}
