export class PlaybackClock {
  constructor() {
    this._startPerf = 0;
    this._startOffset = 0;
    this._rate = 1.0;
    this._state = 'stopped';
    this._pausedAt = 0;
  }

  now() {
    if (this._state === 'stopped') return 0;
    if (this._state === 'paused') return this._pausedAt;
    return this._startOffset + ((performance.now() - this._startPerf) / 1000) * this._rate;
  }

  getRate() {
    return this._rate;
  }

  getState() {
    return this._state;
  }

  play() {
    if (this._state === 'playing') return;
    if (this._state === 'paused') {
      this._startOffset = this._pausedAt;
    }
    this._startPerf = performance.now();
    this._state = 'playing';
  }

  pause() {
    if (this._state !== 'playing') return;
    this._pausedAt = this.now();
    this._state = 'paused';
  }

  stop() {
    this._state = 'stopped';
    this._startOffset = 0;
    this._pausedAt = 0;
  }

  seek(seconds) {
    if (this._state === 'playing') {
      this._startOffset = seconds;
      this._startPerf = performance.now();
    } else if (this._state === 'paused') {
      this._pausedAt = seconds;
      this._startOffset = seconds;
    } else {
      this._startOffset = seconds;
    }
  }

  setRate(rate) {
    if (this._state === 'playing') {
      // 현재 위치 앵커링 후 rate 변경 (시간 점프 방지)
      this._startOffset = this.now();
      this._startPerf = performance.now();
    }
    this._rate = rate;
  }
}
