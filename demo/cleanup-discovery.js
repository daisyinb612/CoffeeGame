const targets = [
  { id: 'handle', name: '手柄', areas: [[4,67,32,31]], tip: '敲掉粉渣，再冲洗粉碗。', clue: '看看台面上装过咖啡粉的器具。' },
  { id: 'head', name: '冲煮头', areas: [[20,21,23,20]], tip: '按键出水，冲掉残粉。', clue: '看看咖啡机出水的地方。' },
  { id: 'drip', name: '沥水盘', areas: [[2,46,61,18]], tip: '沥水盘也要擦净。', clue: '看看咖啡机下方接水的地方。' },
  { id: 'cup', name: '量杯', areas: [[43,65,27,28]], tip: '冲洗杯内和杯口。', clue: '看看刚才装过浓缩液的小杯子。' },
  { id: 'stirrer', name: '搅拌棒', areas: [[72,66,27,31]], tip: '用过的搅拌棒也要清洗。', clue: '看看右边用来搅匀咖啡的细长器具。' },
  { id: 'counter', name: '工作台面', areas: [[64,53,17,14],[31,87,14,11],[84,56,14,14]], tip: '清除台面的粉渣、水迹和咖啡渍。', clue: '看看器具周围的粉渣和水迹。' },
  { id: 'straw', name: '备用吸管', areas: [[70,36,28,18]], distractor: true, reason: '这是未拆封的备用吸管，保持包装完整即可。' },
];
const selectedIcon = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="3"/></svg>';
const checkIcon = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>';
const errorIcon = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>';

export function showCleanupDiscovery({ actions, button, pass }) {
  const root = document.createElement('div');
  root.className = 'cleanup-discovery';
  const instruction = document.createElement('p');
  instruction.className = 'discovery-instruction';
  instruction.textContent = '可多选 · 再点一次取消';
  const scene = document.createElement('div');
  scene.className = 'discovery-scene';
  scene.setAttribute('role', 'group');
  scene.setAttribute('aria-label', '制作完成、尚未清洁的工作区');
  const image = document.createElement('img');
  image.src = 'assets/cleanup/workstation-before-cleaning.png';
  image.alt = '制作结束后的咖啡工作区，点选需要清洁的对象。';
  image.draggable = false;
  image.width = 1400;
  image.height = 1050;
  scene.append(image);
  const count = document.createElement('p');
  count.className = 'discovery-count';
  count.setAttribute('role', 'status');
  const feedback = document.createElement('p');
  feedback.className = 'inventory-feedback discovery-feedback';
  feedback.setAttribute('role', 'status');
  const initialHint = '点选需要清洁的物品和地方。';
  feedback.textContent = initialHint;
  const controls = document.createElement('div');
  controls.className = 'discovery-controls';
  const selected = new Set();
  const incorrect = new Set();
  const verified = new Set();
  const clueLevels = new Map();
  const hotspots = new Map();
  let solved = false, highlighted = null, hintTarget = null;
  let sceneReady = image.complete && image.naturalWidth > 0;
  const required = targets.filter(target => !target.distractor);
  const missing = () => required.filter(target => !selected.has(target.id));

  function refresh() {
    root.dataset.solved = String(solved);
    count.textContent = `已选 ${selected.size} 处`;
    for (const target of targets) {
      for (const { control, label, main } of hotspots.get(target.id)) {
        const chosen = selected.has(target.id);
        control.setAttribute('aria-pressed', String(chosen));
        control.dataset.selected = String(chosen);
        control.dataset.correct = String(chosen && verified.has(target.id));
        control.dataset.error = String(incorrect.has(target.id));
        control.dataset.hint = String(highlighted === target.id);
        control.disabled = !sceneReady || (solved && !!target.distractor);
        label.innerHTML = `${incorrect.has(target.id) ? errorIcon : verified.has(target.id) ? checkIcon : selectedIcon}${main ? `<span>${target.name}</span>` : ''}`;
      }
    }
  }

  for (const target of targets) {
    const buttons = target.areas.map(([left, top, width, height], index) => {
      const control = button('', () => {
        if (solved) { feedback.textContent = `${target.name}：${target.tip}`; return; }
        if (selected.has(target.id)) selected.delete(target.id);
        else selected.add(target.id);
        incorrect.delete(target.id);
        verified.delete(target.id);
        highlighted = null;
        feedback.textContent = selected.size ? '选好后点「检查」。' : initialHint;
        refresh();
      }, 'discovery-hotspot');
      control.setAttribute('aria-label', target.name);
      control.setAttribute('aria-pressed', 'false');
      control.style.left = `${left}%`;
      control.style.top = `clamp(0px, ${top}%, calc(100% - 44px))`;
      control.style.width = `${width}%`;
      control.style.height = `${height}%`;
      if (target.id === 'counter') control.classList.add('discovery-counter');
      const label = document.createElement('span');
      label.className = 'discovery-label';
      label.setAttribute('aria-hidden', 'true');
      control.append(label);
      scene.append(control);
      return { control, label, main: index === 0 };
    });
    hotspots.set(target.id, buttons);
  }

  const hint = button('给我提示', () => {
    const remaining = missing();
    if (!remaining.length) { feedback.textContent = '再检查一下，有没有选到无需清洁的物品。'; return; }
    if (!hintTarget || selected.has(hintTarget.id)) hintTarget = remaining[0];
    const level = clueLevels.get(hintTarget.id) || 0;
    clueLevels.set(hintTarget.id, level + 1);
    if (level === 0) {
      highlighted = null;
      feedback.textContent = hintTarget.clue;
    } else {
      highlighted = hintTarget.id;
      feedback.textContent = `${hintTarget.name}也需要清洁。点选它，再检查。`;
    }
    refresh();
  }, 'discovery-hint');
  hint.hidden = true;
  const continueButton = button('继续', pass, 'primary');
  continueButton.hidden = true;
  const check = button('检查', () => {
    highlighted = null;
    incorrect.clear();
    verified.clear();
    required.filter(target => selected.has(target.id)).forEach(target => verified.add(target.id));
    targets.filter(target => target.distractor && selected.has(target.id)).forEach(target => incorrect.add(target.id));
    const remaining = missing();
    if (incorrect.size) {
      feedback.textContent = targets.filter(target => incorrect.has(target.id)).map(target => target.reason).join(' ');
      hint.hidden = !remaining.length;
    } else if (remaining.length) {
      feedback.textContent = '还有需要清洁的地方，再找找。';
      hint.hidden = false;
    } else {
      solved = true;
      feedback.textContent = '器具要洗净，台面也要清洁。点选对象可以查看清洁提示。';
      hint.hidden = check.hidden = true;
      continueButton.hidden = false;
    }
    refresh();
    if (solved) continueButton.focus({ preventScroll: true });
  }, 'primary');
  check.disabled = !sceneReady;
  image.addEventListener('load', () => {
    sceneReady = true;
    check.disabled = false;
    refresh();
  });
  controls.append(hint, check, continueButton);
  const toolbar = document.createElement('div');
  toolbar.className = 'discovery-toolbar';
  toolbar.append(instruction, count);
  root.append(toolbar, scene, feedback, controls);
  image.addEventListener('error', () => {
    feedback.textContent = '工作区画面未能加载，请刷新后重试。';
    check.disabled = true;
    hint.hidden = true;
    for (const buttons of hotspots.values()) buttons.forEach(({ control }) => { control.disabled = true; });
  });
  actions.replaceChildren(root);
  refresh();
}
