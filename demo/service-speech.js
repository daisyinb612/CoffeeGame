const microphoneIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';

class ServiceSpeech extends HTMLElement {
  connectedCallback() {
    if (this.input) return;
    this.input = new AbortController();
    this.request = 0;
    this.innerHTML = `
      <details class="speech-help">
        <summary>看看怎么说</summary>
        <blockquote class="speech-example">您好，您的冰美式，请慢用。</blockquote>
        <p>也可以用自己的话表达。</p>
      </details>
      <div class="speech-panel">
        <button type="button" class="speech-record-button" aria-label="开始录音">${microphoneIcon}<span>点击录音</span></button>
        <p class="speech-instruction">点麦克风开始，说完再点一次。</p>
        <p class="speech-timer" aria-label="录音时长" hidden>00:00</p>
        <p class="speech-status" role="status"></p>
        <audio class="speech-playback" controls preload="metadata" aria-label="回听我的录音" hidden></audio>
      </div>
      <button type="button" class="primary speech-complete" hidden disabled>完成练习，看示范</button>
      <p class="speech-privacy">录音仅保留在当前页面，离开练习后清除。</p>`;
    this.recordButton = this.querySelector('.speech-record-button');
    this.status = this.querySelector('.speech-status');
    this.audio = this.querySelector('audio');
    this.timer = this.querySelector('.speech-timer');
    this.complete = this.querySelector('.speech-complete');
    const events = { signal: this.input.signal };
    this.recordButton.addEventListener('click', () => this.recorder?.state === 'recording' ? this.stop() : this.start(), events);
    this.complete.addEventListener('click', () => {
      if (!this.complete.disabled) this.dispatchEvent(new Event('speech-complete', { bubbles: true }));
    }, events);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); }, events);
    document.addEventListener('toggle', event => {
      if (event.target instanceof HTMLDialogElement && event.target.open) this.stop();
    }, { ...events, capture: true });
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      this.status.textContent = '当前浏览器暂不支持录音，可以换用支持录音的浏览器。';
      this.recordButton.disabled = true;
    }
  }

  async start() {
    if (this.pending || this.finishing || this.recorder?.state === 'recording') return;
    const request = ++this.request;
    this.pending = true;
    this.audio.pause();
    this.recordButton.disabled = true;
    this.status.textContent = '正在请求麦克风权限…';
    this.updateComplete();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!this.isConnected || request !== this.request) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = stream;
      const recorder = new MediaRecorder(stream);
      this.recorder = recorder;
      const chunks = [];
      let failed = false;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        failed = true;
        this.status.textContent = '录音中断，请检查麦克风后重新录音。';
        this.stop();
      };
      recorder.onstop = () => {
        this.finishing = false;
        window.clearInterval(this.clock);
        stream.getTracks().forEach(track => track.stop());
        if (!this.isConnected) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' });
        if (blob.size && !failed) {
          if (this.url) URL.revokeObjectURL(this.url);
          this.url = URL.createObjectURL(blob);
          this.audio.src = this.url;
          this.audio.hidden = false;
          this.recorded = true;
          this.status.textContent = '已录制，可以回听或重新录音。';
        } else {
          this.status.textContent = failed ? '录音中断，请检查麦克风后重新录音。' : '没有录到声音，请再试一次。';
        }
        this.recordButton.innerHTML = `${microphoneIcon}<span>重新录音</span>`;
        this.recordButton.setAttribute('aria-label', '重新录音');
        delete this.dataset.recording;
        this.updateComplete();
      };
      recorder.start();
      this.audio.hidden = true;
      this.started = performance.now();
      this.timer.textContent = '00:00';
      this.timer.hidden = false;
      this.clock = window.setInterval(() => {
        const seconds = Math.floor((performance.now() - this.started) / 1000);
        this.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
      }, 250);
      this.dataset.recording = 'true';
      this.recordButton.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg><span>停止录音</span>';
      this.recordButton.setAttribute('aria-label', '停止录音');
      this.status.textContent = '正在录音，说完后点击停止。';
    } catch (error) {
      this.stream?.getTracks().forEach(track => track.stop());
      if (!this.isConnected || request !== this.request) return;
      const messages = {
        NotAllowedError: '麦克风权限未开启，允许使用麦克风后再试。',
        NotFoundError: '没有找到麦克风，请连接后再试。',
        NotReadableError: '麦克风暂时无法使用，请检查是否被其他应用占用。',
      };
      this.status.textContent = messages[error.name] || '录音未能开始，请检查麦克风后重新尝试。';
    } finally {
      if (this.isConnected && request === this.request) {
        this.pending = false;
        this.recordButton.disabled = false;
        this.updateComplete();
      }
    }
  }

  stop() {
    ++this.request;
    if (this.pending && this.status) this.status.textContent = '已取消录音，可以重新开始。';
    this.pending = false;
    window.clearInterval(this.clock);
    if (this.recorder?.state === 'recording') {
      this.finishing = true;
      this.recorder.stop();
    }
    this.stream?.getTracks().forEach(track => track.stop());
    if (this.recordButton) this.recordButton.disabled = false;
  }

  updateComplete() {
    const busy = this.pending || this.finishing || this.recorder?.state === 'recording';
    this.complete.hidden = !this.recorded || busy;
    this.complete.disabled = !this.recorded || busy;
  }

  disconnectedCallback() {
    this.stop();
    this.input?.abort();
    this.audio?.pause();
    this.audio?.removeAttribute('src');
    if (this.url) URL.revokeObjectURL(this.url);
    this.input = null;
  }
}
if (!customElements.get('service-speech')) customElements.define('service-speech', ServiceSpeech);
