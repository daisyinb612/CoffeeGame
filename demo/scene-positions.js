const directions = [
  { id: 'front', name: '前方', help: '打开场景时你正对着的画面' },
  { id: 'right', name: '右侧', help: '从前方向右转 90° 看到的画面' },
  { id: 'back', name: '后方', help: '从前方向后转 180° 看到的画面' },
  { id: 'left', name: '左侧', help: '从前方向左转 90° 看到的画面' },
];
const existing = [
  ['coffee-bar.jpg', '原图 1 · 咖啡机与置物架'],
  ['back-room.jpg', '原图 2 · 门口与冰箱'],
  ['lounge.jpg', '原图 3 · 店内长桌'],
  ['sink.jpg', '原图 4 · 水槽与窗户'],
];
const assetBase = 'assets/scene-boxes/';
const slots = new Map();
const status = document.getElementById('status');
function say(message, kind = '') { status.textContent = message; status.className = kind; }
function labelFor(source) { return existing.find(([file]) => file === source)?.[1] || '已上传的照片'; }

for (const direction of directions) {
  const article = document.createElement('section'); article.className = 'slot';
  const previewWrap = document.createElement('div'); previewWrap.className = 'preview-wrap';
  const preview = document.createElement('img'); preview.className = 'preview'; preview.alt = `${direction.name}照片预览`; preview.hidden = true;
  const placeholder = document.createElement('span'); placeholder.className = 'preview-placeholder'; placeholder.textContent = '照片预览';
  previewWrap.append(preview, placeholder);
  const fields = document.createElement('div');
  const heading = document.createElement('h2'); heading.textContent = direction.name;
  const help = document.createElement('p'); help.textContent = direction.help;
  const selectLabel = document.createElement('label'); selectLabel.textContent = '选择已有照片';
  const select = document.createElement('select'); select.name = direction.id; selectLabel.htmlFor = `select-${direction.id}`; select.id = selectLabel.htmlFor;
  select.add(new Option('请选择照片', ''));
  for (const [file, label] of existing) select.add(new Option(label, file));
  const uploadLabel = document.createElement('label'); uploadLabel.textContent = '或上传新照片';
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
  input.id = `upload-${direction.id}`; uploadLabel.htmlFor = input.id;
  fields.append(heading, help, selectLabel, select, uploadLabel, input); article.append(previewWrap, fields);
  document.getElementById('slots').append(article);
  const compass = document.getElementById(`compass-${direction.id}`);
  const face = compass.parentElement;
  let objectUrl = null;
  function showPreview(source, name) {
    preview.hidden = !source;
    placeholder.hidden = Boolean(source);
    if (source) preview.src = source;
    else preview.removeAttribute('src');
    compass.textContent = name || '未选择';
    face.classList.toggle('filled', Boolean(source));
  }
  select.addEventListener('change', () => {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    input.value = '';
    showPreview(select.value ? assetBase + select.value : '', select.value ? labelFor(select.value) : '');
  });
  input.addEventListener('change', () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = input.files[0] ? URL.createObjectURL(input.files[0]) : null;
    if (objectUrl) select.value = '';
    showPreview(objectUrl, input.files[0]?.name || '');
  });
  slots.set(direction.id, { select, input, showPreview });
}

try {
  const response = await fetch(assetBase + 'scene-positions.json', { cache: 'no-store' });
  if (response.ok) {
    const manifest = await response.json();
    for (const direction of directions) {
      const source = manifest.faces?.[direction.id];
      if (!source) continue;
      const slot = slots.get(direction.id);
      if (![...slot.select.options].some(option => option.value === source)) slot.select.add(new Option('已上传的照片', source));
      slot.select.value = source;
      slot.showPreview(assetBase + source, labelFor(source));
    }
    say('已载入上次保存的方向。你可以修改后再次保存。');
  }
} catch { /* No saved mapping yet. */ }

document.getElementById('mapping-form').addEventListener('submit', async event => {
  event.preventDefault();
  const mapping = {}, chosen = [];
  const data = new FormData();
  for (const direction of directions) {
    const slot = slots.get(direction.id);
    if (slot.input.files[0]) {
      const file = slot.input.files[0];
      if (file.size > 20 * 1024 * 1024) { say(`${direction.name}的照片超过 20 MB。`, 'error'); return; }
      mapping[direction.id] = { kind: 'upload' };
      data.append(`file_${direction.id}`, file, file.name);
      chosen.push(`file:${file.name}:${file.size}`);
    } else if (slot.select.value) {
      mapping[direction.id] = { kind: 'existing', source: slot.select.value };
      chosen.push(`existing:${slot.select.value}`);
    } else { say(`请先选择${direction.name}的照片。`, 'error'); slot.select.focus(); return; }
  }
  if (new Set(chosen).size !== 4) { say('四个方向需要使用四张不同照片。', 'error'); return; }
  data.append('mapping', JSON.stringify(mapping));
  const save = document.getElementById('save'); save.disabled = true; say('正在保存照片与方向…');
  try {
    const response = await fetch('/api/scene-positions', { method: 'POST', headers: { 'X-CoffeeGame-Upload': '1' }, body: data });
    if (!response.ok) throw new Error(`保存失败（HTTP ${response.status}）。请确认已通过项目本地服务打开页面。`);
    const saved = await response.json();
    for (const direction of directions) {
      const source = saved.faces[direction.id];
      const slot = slots.get(direction.id);
      if (![...slot.select.options].some(option => option.value === source)) slot.select.add(new Option('已上传的照片', source));
      slot.select.value = source; slot.input.value = '';
      slot.showPreview(assetBase + source, labelFor(source));
    }
    say('已保存到项目。前、右、后、左的对应关系现在可以供我读取。', 'success');
  } catch (error) { say(error.message, 'error'); }
  finally { save.disabled = false; }
});
