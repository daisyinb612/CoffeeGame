const images = [
  { id: 'front', label: '01 / 前方', detail: '工作台与补全的水池', file: 'coffee-bar.jpg', review: 'coffee-bar-review-v1.png' },
  { id: 'right', label: '02 / 右侧', detail: '以门和通道尽头为主', file: 'back-room.jpg', review: 'back-room-review-v1.png' },
  { id: 'back', label: '03 / 后方', detail: '工作台背面、展示柜与通道', file: 'lounge.jpg', review: 'lounge-review-v1.png' },
  { id: 'left', label: '04 / 左侧', detail: '只保留窗户作为主画面', file: 'sink.jpg', review: 'sink-review-v1.png' },
  { id: 'panorama', label: '05 / 球形全景底图', detail: '以四张整理图为参考补全天花板和地面', file: 'coffee-room-spherical-v3.png', review: 'coffee-room-spherical-review-v1.png' },
];
const fields = new Map();
const list = document.getElementById('image-list');
const status = document.getElementById('status');

for (const item of images) {
  const card = document.createElement('section');
  card.className = 'card';
  const figure = document.createElement('figure');
  figure.className = 'comparison';
  for (const [file, name] of [[item.file, '原图'], [item.review, '整理预览']]) {
    const link = document.createElement('a');
    link.href = `assets/scene-boxes/${file}`;
    link.target = '_blank';
    link.rel = 'noopener';
    const caption = document.createElement('span');
    caption.textContent = `${name} · 点击看大图`;
    const image = document.createElement('img');
    image.src = link.href;
    image.alt = `${item.label}${name}`;
    image.loading = 'lazy';
    link.append(caption, image);
    figure.append(link);
  }
  const content = document.createElement('div');
  content.className = 'content';
  const heading = document.createElement('h2');
  heading.textContent = item.label;
  const detail = document.createElement('p');
  detail.textContent = item.detail;
  const filename = document.createElement('small');
  filename.textContent = item.file;
  const label = document.createElement('label');
  label.htmlFor = `prompt-${item.id}`;
  label.textContent = '你希望怎么修改这张图？';
  const field = document.createElement('textarea');
  field.id = label.htmlFor;
  field.rows = 6;
  field.maxLength = 5000;
  field.placeholder = '例如：保留咖啡机和玻璃杯，去掉与右侧照片重复的……';
  fields.set(item.id, field);
  content.append(heading, detail, filename, label, field);
  card.append(figure, content);
  list.append(card);
}

try {
  const response = await fetch('assets/scene-boxes/scene-prompts.json', { cache: 'no-store' });
  if (response.ok) {
    const saved = await response.json();
    for (const item of images) fields.get(item.id).value = saved.prompts?.[item.id] || '';
    status.textContent = '已载入上次保存的 Prompt。';
  }
} catch { /* First use. */ }

document.getElementById('prompt-form').addEventListener('submit', async event => {
  event.preventDefault();
  const prompts = Object.fromEntries(images.map(item => [item.id, fields.get(item.id).value.trim()]));
  const button = document.getElementById('save');
  button.disabled = true;
  status.textContent = '正在保存…';
  status.className = '';
  try {
    const response = await fetch('/api/scene-prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CoffeeGame-Prompts': '1' },
      body: JSON.stringify({ prompts }),
    });
    if (!response.ok) throw new Error(`保存失败（HTTP ${response.status}）`);
    status.textContent = '已保存五条 Prompt；图片尚未修改。';
    status.className = 'success';
  } catch (error) {
    status.textContent = `${error.message}。请通过项目本地服务打开此页。`;
    status.className = 'error';
  } finally { button.disabled = false; }
});
