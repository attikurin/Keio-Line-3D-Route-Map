/* =========================================================================
 * UI 制御：路線表示切替・電車運転・速度・ラベル・カメラリセット
 * KEIO_APP（app.js が公開）を操作する。
 * ========================================================================= */

// app.js の初期化を待ってからバインド
function ready() {
  if (!window.KEIO_APP) { setTimeout(ready, 60); return; }
  buildLineToggles();
  bindControls();
  bindStationPanel();
}

function buildLineToggles() {
  const ul = document.getElementById('line-toggles');
  const lines = window.KEIO_APP.lineList();
  ul.innerHTML = '';
  lines.forEach((ln) => {
    const li = document.createElement('li');
    const hex = '#' + ln.color.toString(16).padStart(6, '0');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.id = 'chk-' + ln.id;

    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = hex;
    sw.style.color = hex;

    const name = document.createElement('span');
    name.className = 'line-name';
    name.textContent = ln.name;

    cb.addEventListener('change', () => {
      window.KEIO_APP.toggleLine(ln.id, cb.checked);
      li.classList.toggle('off', !cb.checked);
    });
    // 路線名クリックでその路線へカメラを寄せる
    name.addEventListener('click', () => {
      if (!cb.checked) { cb.checked = true; window.KEIO_APP.toggleLine(ln.id, true); li.classList.remove('off'); }
      window.KEIO_APP.focusLine(ln.id);
    });

    li.appendChild(cb);
    li.appendChild(sw);
    li.appendChild(name);
    ul.appendChild(li);
  });
}

function bindControls() {
  // 運転 ON/OFF
  const btnRun = document.getElementById('btn-run');
  let running = true;
  btnRun.addEventListener('click', () => {
    running = !running;
    window.KEIO_APP.setRunning(running);
    btnRun.textContent = running ? '⏸ 停止' : '▶ 運転再開';
    btnRun.classList.toggle('btn-primary', running);
  });

  // 速度
  const speed = document.getElementById('speed-range');
  const speedVal = document.getElementById('speed-val');
  speed.addEventListener('input', () => {
    const v = parseFloat(speed.value);
    window.KEIO_APP.setSpeed(v);
    speedVal.textContent = v.toFixed(1) + '×';
  });

  // 電車の表示/非表示
  const chkTrains = document.getElementById('chk-trains');
  chkTrains.addEventListener('change', () => {
    window.KEIO_APP.setTrainsVisible(chkTrains.checked);
  });

  // ===== 運行モード切替 =====
  const normalControls = document.getElementById('normal-controls');
  const timetableControls = document.getElementById('timetable-controls');
  const modeBtns = document.querySelectorAll('.mode-btn');
  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mode;
      window.KEIO_APP.setMode(m);
      modeBtns.forEach((b) => b.classList.toggle('active', b === btn));
      const isTT = (m === 'timetable');
      timetableControls.hidden = !isTT;
      normalControls.hidden = isTT;
    });
  });

  // ===== 時刻表モード：時計・スライダー・時刻送り・倍速 =====
  const simClock = document.getElementById('sim-clock');
  const timeRange = document.getElementById('time-range');
  const rateRange = document.getElementById('rate-range');
  const rateVal = document.getElementById('rate-val');

  // app からの時刻通知 → 表示更新
  window.KEIO_APP.onTimeUpdate((sec) => {
    simClock.textContent = formatClock(sec);
    // スライダーはドラッグ中は更新しない
    if (!timeRange.dataset.dragging) {
      timeRange.value = Math.floor(sec % 86400);
    }
  });

  // スライダーで時刻指定
  timeRange.addEventListener('input', () => {
    timeRange.dataset.dragging = '1';
    window.KEIO_APP.setSimTime(parseInt(timeRange.value, 10));
  });
  timeRange.addEventListener('change', () => {
    delete timeRange.dataset.dragging;
  });

  // 時刻ジャンプ（±）
  document.querySelectorAll('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.KEIO_APP.addSimTime(parseInt(btn.dataset.jump, 10));
    });
  });
  // 時刻プリセット
  document.querySelectorAll('[data-settime]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.KEIO_APP.setSimTime(parseInt(btn.dataset.settime, 10));
    });
  });
  // 再生速度
  rateRange.addEventListener('input', () => {
    const r = parseInt(rateRange.value, 10);
    window.KEIO_APP.setSimRate(r);
    rateVal.textContent = r + '×';
  });

  // 視点：上下左右の平行移動（押し続けで連続移動）
  document.querySelectorAll('[data-pan]').forEach((btn) => {
    holdRepeat(btn, () => window.KEIO_APP.panView(btn.dataset.pan));
  });
  // 軌道回転
  document.querySelectorAll('[data-orbit]').forEach((btn) => {
    const map = {
      left:  [-0.06, 0], right: [0.06, 0],
      up:    [0, -0.05], down:  [0, 0.05],
    };
    const [az, el] = map[btn.dataset.orbit];
    holdRepeat(btn, () => window.KEIO_APP.orbitView(az, el));
  });
  // ズーム
  document.querySelectorAll('[data-zoom]').forEach((btn) => {
    const f = btn.dataset.zoom === 'in' ? 0.94 : 1.06;
    holdRepeat(btn, () => window.KEIO_APP.zoomView(f));
  });
  // 方向パッド中央：リセット
  document.querySelectorAll('[data-action="reset"]').forEach((btn) => {
    btn.addEventListener('click', () => window.KEIO_APP.resetView());
  });

  // ラベル表示
  const chkLabels = document.getElementById('chk-labels');
  chkLabels.addEventListener('change', () => {
    window.KEIO_APP.toggleLabels(chkLabels.checked);
  });

  // リセット
  document.getElementById('btn-reset').addEventListener('click', () => {
    window.KEIO_APP.resetView();
  });

  // パネル開閉（モバイル）
  const panel = document.getElementById('control-panel');
  document.getElementById('panel-toggle').addEventListener('click', () => {
    panel.classList.toggle('hidden');
  });
}

/* ===================== 駅情報パネル ===================== */
let currentStationInfo = null;
let currentTTDir = 'down';

function bindStationPanel() {
  const panel = document.getElementById('station-panel');
  const closeBtn = document.getElementById('station-close');

  // app からの駅クリック通知
  window.KEIO_APP.onStationClick((info) => {
    currentStationInfo = info;
    currentTTDir = 'down';
    renderStationPanel(info);
    panel.hidden = false;
  });

  closeBtn.addEventListener('click', () => { panel.hidden = true; });

  // 時刻表 上り/下り タブ
  document.querySelectorAll('.tt-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tt-tab').forEach((t) => t.classList.toggle('active', t === tab));
      currentTTDir = tab.dataset.dir;
      if (currentStationInfo) renderTimetable(currentStationInfo);
    });
  });
}

function colorHex(c) { return '#' + c.toString(16).padStart(6, '0'); }

function renderStationPanel(info) {
  const hex = colorHex(info.lineColor);
  document.getElementById('station-line-badge').style.background = hex;
  document.getElementById('station-name').textContent = info.name;
  document.getElementById('station-line-name').textContent = info.lineName;
  document.getElementById('station-order').textContent = `${info.index + 1} / ${info.total}`;
  document.getElementById('station-track').textContent = info.trackType;
  document.getElementById('station-grade').textContent =
    `${info.grade}（海抜 約${info.altitude}m）`;
  document.getElementById('station-passing').textContent = info.isPassing ? '待避・追い越し可' : '―';

  // 停車種別チップ（種別ごとの色を svc-XXX クラスで付与）
  const stopsEl = document.getElementById('station-stops');
  stopsEl.innerHTML = '';
  info.stoppingTypes.forEach((t) => {
    const chip = document.createElement('span');
    chip.className = 'chip svc-' + t;
    chip.textContent = t;
    stopsEl.appendChild(chip);
  });
  // 通過種別
  const passWrap = document.getElementById('station-pass-wrap');
  const passEl = document.getElementById('station-passtypes');
  passEl.innerHTML = '';
  if (info.passingTypes.length > 0) {
    passWrap.hidden = false;
    info.passingTypes.forEach((t) => {
      const chip = document.createElement('span');
      chip.className = 'chip pass svc-' + t;
      chip.textContent = t;
      passEl.appendChild(chip);
    });
  } else {
    passWrap.hidden = true;
  }

  // 隣の駅
  document.getElementById('station-prev').textContent = info.prev || '（始発駅）';
  document.getElementById('station-next').textContent = info.next || '（終着駅）';
  const conn = document.getElementById('station-connections');
  conn.textContent = info.connections.length
    ? '接続：' + info.connections.join('・')
    : '';

  // 時刻表方面ラベル
  document.getElementById('tt-down-dest').textContent = info.timetable.downDest;
  document.getElementById('tt-up-dest').textContent = info.timetable.upDest;

  renderTimetable(info);
}

function renderTimetable(info) {
  const wrap = document.getElementById('station-timetable');
  const list = currentTTDir === 'down' ? info.timetable.down : info.timetable.up;
  wrap.innerHTML = '';
  if (!list || list.length === 0) {
    wrap.innerHTML = '<p class="tt-empty">この方面の発車はありません（終端駅など）。</p>';
    return;
  }
  // 時間帯ごとにグループ化（HH をキー）
  const byHour = {};
  list.forEach((d) => {
    const hh = d.time.slice(0, 2);
    (byHour[hh] = byHour[hh] || []).push(d);
  });
  Object.keys(byHour).sort().forEach((hh) => {
    const row = document.createElement('div');
    row.className = 'tt-row';
    const hcol = document.createElement('span');
    hcol.className = 'tt-hour';
    hcol.textContent = hh;
    const mcol = document.createElement('span');
    mcol.className = 'tt-mins';
    byHour[hh].forEach((d) => {
      const m = document.createElement('span');
      m.className = 'tt-min type-' + d.type;
      m.textContent = d.time.slice(3) + ' ';
      m.title = d.type;
      const sup = document.createElement('sup');
      sup.textContent = d.type.slice(0, 1); // 種別の頭文字（各/特/急/快）
      m.appendChild(sup);
      mcol.appendChild(m);
    });
    row.appendChild(hcol);
    row.appendChild(mcol);
    wrap.appendChild(row);
  });
}

// 秒 → HH:MM:SS 表記（24時以降は翌日扱いで 00〜表示）
function formatClock(sec) {
  let s = Math.floor(sec) % 86400;
  if (s < 0) s += 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(ss)}`;
}

// ボタンを押している間、連続して fn を実行する（マウス/タッチ対応）
function holdRepeat(btn, fn) {
  let timer = null;
  const start = (e) => {
    e.preventDefault();
    fn();
    timer = setInterval(fn, 60);
  };
  const stop = () => {
    if (timer) { clearInterval(timer); timer = null; }
  };
  btn.addEventListener('mousedown', start);
  btn.addEventListener('touchstart', start, { passive: false });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach((ev) =>
    btn.addEventListener(ev, stop)
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ready);
} else {
  ready();
}
