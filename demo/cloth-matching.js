const cloths = [
  { id: 'brown', name: '咖色抹布', photo: 'assets/cloths/brown.png', use: '咖色抹布用来擦干冲洗后的粉碗。' },
  { id: 'blue', name: '蓝色抹布', photo: 'assets/cloths/blue.png', use: '蓝色抹布用来擦拭沥水盘和工作台面。' },
  { id: 'white', name: '干净口巾', photo: 'assets/cloths/white.png', use: '干净口巾用来擦干冲洗后的量杯和搅拌棒。' },
];
const rounds = [
  { name: '粉碗', action: '冲洗后擦干', answer: 'brown', photos: ['assets/handle/basket-rinse.jpg'] },
  { name: '沥水盘', action: '擦拭干净', answer: 'blue', photos: ['assets/preparation/drip-tray.jpg'] },
  { name: '工作台面', action: '擦净粉渣、水迹和咖啡渍', answer: 'blue', counter: true },
  { name: '量杯、搅拌棒', action: '冲洗后擦干', answer: 'white', photos: ['assets/inventory/measuring-cup.jpg', 'assets/inventory/spoon.jpg'] },
];

export function showClothMatching({ actions, button, pass }) {
  const root = document.createElement('div');
  root.className = 'cloth-matching';
  const progress = document.createElement('p');
  progress.className = 'inventory-progress';
  progress.setAttribute('aria-live', 'polite');
  const meter = document.createElement('div');
  meter.className = 'inventory-meter';
  const steps = document.createElement('div');
  steps.className = 'inventory-steps';
  steps.setAttribute('aria-hidden', 'true');
  const marks = rounds.map(() => document.createElement('span'));
  steps.append(...marks);
  meter.append(steps, progress);
  const target = document.createElement('div');
  target.className = 'cloth-target';
  target.setAttribute('role', 'group');
  target.tabIndex = -1;
  const visual = document.createElement('div');
  visual.className = 'cloth-target-visual';
  const caption = document.createElement('span');
  caption.className = 'cloth-target-caption';
  target.append(visual, caption);
  const instruction = '点一块布进行配对，也可以把布拖到上方对象。';
  const feedback = document.createElement('p');
  feedback.className = 'inventory-feedback cloth-feedback';
  feedback.setAttribute('role', 'status');
  const options = document.createElement('div');
  options.className = 'cloth-options';
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', '选择清洁用布');
  let index = 0, answered = false, drag = null, ghost = null;

  function choose(cloth, choice) {
    if (answered) return;
    options.querySelector('[data-error]')?.removeAttribute('data-error');
    if (cloth.id !== rounds[index].answer) {
      choice.dataset.error = '';
      feedback.textContent = `${cloth.use}再想想这一项。`;
      return;
    }
    answered = true;
    choice.setAttribute('aria-pressed', 'true');
    feedback.textContent = `配对正确。${cloth.use}`;
    next.disabled = false;
  }

  function withinTarget(event) {
    const box = target.getBoundingClientRect();
    return event.clientX >= box.left - 8 && event.clientX <= box.right + 8
      && event.clientY >= box.top - 8 && event.clientY <= box.bottom + 8;
  }

  function clearDrag() {
    ghost?.remove();
    ghost = null;
    drag = null;
    delete target.dataset.drop;
  }

  for (const cloth of cloths) {
    let suppressClick = false;
    const choice = button(cloth.name, event => {
      if (suppressClick && event.detail !== 0) { suppressClick = false; return; }
      if (answered) return;
      choose(cloth, choice);
    }, 'cloth-option');
    choice.setAttribute('aria-pressed', 'false');
    const photo = document.createElement('img');
    photo.src = cloth.photo;
    photo.alt = '';
    photo.draggable = false;
    choice.prepend(photo);
    choice.addEventListener('pointerdown', event => {
      if (event.button !== 0 || answered || drag) return;
      suppressClick = false;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, round: index };
      choice.setPointerCapture(event.pointerId);
    });
    choice.addEventListener('pointermove', event => {
      if (drag?.id !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
      drag.moved = true;
      if (!ghost) {
        ghost = document.createElement('img');
        ghost.src = cloth.photo;
        ghost.alt = '';
        ghost.className = 'cloth-drag-ghost';
        root.append(ghost);
      }
      ghost.style.left = `${event.clientX}px`;
      ghost.style.top = `${event.clientY}px`;
      target.dataset.drop = String(withinTarget(event));
    });
    choice.addEventListener('pointerup', event => {
      if (drag?.id !== event.pointerId) return;
      suppressClick = drag.moved;
      if (drag.moved && drag.round === index) {
        if (withinTarget(event)) {
          choose(cloth, choice);
        } else feedback.textContent = '把布拖到上方的清洁对象上，再松手。';
      }
      clearDrag();
    });
    choice.addEventListener('pointercancel', event => {
      if (drag?.id !== event.pointerId) return;
      suppressClick = true;
      clearDrag();
    });
    choice.addEventListener('lostpointercapture', event => {
      if (drag?.id === event.pointerId) clearDrag();
    });
    options.append(choice);
  }

  const next = button('下一项', () => {
    if (!answered) return;
    index++;
    if (index === rounds.length) { pass(); return; }
    showRound();
    target.focus({ preventScroll: true });
  }, 'primary');

  function showRound() {
    clearDrag();
    const round = rounds[index];
    answered = false;
    progress.textContent = `${index + 1} / ${rounds.length}`;
    progress.setAttribute('aria-label', `第 ${index + 1} 项，共 ${rounds.length} 项`);
    marks.forEach((mark, position) => {
      mark.dataset.state = position < index ? 'complete' : position === index ? 'current' : 'upcoming';
    });
    target.setAttribute('aria-label', `清洁对象：${round.name}，${round.action}`);
    visual.replaceChildren();
    visual.classList.toggle('cloth-counter-visual', !!round.counter);
    if (round.counter) {
      const counter = document.createElement('div');
      counter.className = 'cloth-counter-crop';
      counter.setAttribute('aria-hidden', 'true');
      visual.append(counter);
    } else {
      for (const path of round.photos) {
        const photo = document.createElement('img');
        photo.src = path;
        photo.alt = '';
        photo.draggable = false;
        visual.append(photo);
      }
    }
    const name = document.createElement('strong');
    name.textContent = round.name;
    const action = document.createElement('span');
    action.textContent = round.action;
    caption.replaceChildren(name, action);
    options.querySelectorAll('button').forEach(choice => {
      choice.setAttribute('aria-pressed', 'false');
      choice.removeAttribute('data-error');
    });
    feedback.textContent = instruction;
    next.disabled = true;
    next.textContent = index === rounds.length - 1 ? '继续' : '下一项';
  }

  root.append(meter, target, options, feedback, next);
  actions.replaceChildren(root);
  showRound();
}
