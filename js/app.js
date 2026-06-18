/* =========================================================================
 * 京王線 3D 路線図ビューア  (Three.js)
 * - 背景なし（線路だけ）
 * - 高低差/直線/カーブを再現
 * - 駅・車庫・留置線を表現
 * - 電車を走らせる / 360度回転して眺める
 * ========================================================================= */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const { LINES, LINE_ORDER, TIMETABLE, TRACKS, geo } = window.KEIO_DATA;

/* ---------------------------------------------------------------- 基本構成 */
let scene, camera, renderer, controls, clock;
const lineObjects = {};   // lineId -> { group, curve, stations[], trains[], stationU[] }
const allTrains = [];     // 通常モードの電車
let running = true;       // 走行 ON/OFF
let speedFactor = 1.0;    // 速度倍率

// ---- モード管理 ----
let mode = 'normal';      // 'normal' | 'timetable'
// 時刻表モード用：仮想時計
let simSec = 7 * 3600;    // シミュレーション時刻（00:00 からの秒）。初期 07:00
let simRate = 60;         // 1実秒あたり何シミュレーション秒進むか（60 = 60倍速）
const ttTrains = [];      // 時刻表モードで生成された列車プール
let ttTimeCallback = null;// UIへ時刻を通知するコールバック
let trainsVisible = true; // 電車の表示/非表示（ユーザー設定）
const pickStationMeshes = []; // クリック判定対象の駅メッシュ
const labelSprites = [];      // 駅名ラベル（LOD・密集回避の対象）
let labelsEnabled = true;     // ユーザーのラベル表示 ON/OFF
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

// 駅の重要度ランクを TIMETABLE から算出
//   2 = 特急/ライナー停車駅 / 1 = 急行・区急・快速停車駅 / 0 = 各停のみ
function computeStationRanks(lineId) {
  const line = LINES[lineId];
  const tt = TIMETABLE[lineId] || { services: [] };
  const n = line.stations.length;
  const ranks = new Array(n).fill(0);
  const topTypes = ['特急', 'ライナー'];
  const midTypes = ['急行', '区急', '快速'];
  tt.services.forEach((svc) => {
    const stopsHere = (i) => svc.stopsAll || (svc.stops && svc.stops.includes(i));
    for (let i = 0; i < n; i++) {
      if (!stopsHere(i)) continue;
      if (topTypes.includes(svc.type)) ranks[i] = Math.max(ranks[i], 2);
      else if (midTypes.includes(svc.type)) ranks[i] = Math.max(ranks[i], 1);
    }
  });
  // 始発・終着は必ず最重要に
  ranks[0] = 2;
  ranks[n - 1] = 2;
  return ranks;
}

// モードと表示設定に応じて、通常電車・時刻表列車の可視性を切り替える
function applyTrainVisibility() {
  const normalShow = trainsVisible && mode === 'normal';
  allTrains.forEach((tr) => { tr.group.visible = normalShow; });
  const ttShow = trainsVisible && mode === 'timetable';
  ttTrains.forEach((t) => {
    // 時刻表モードでは updateTimetable が個別に visible を制御するが、
    // OFF のときは全部隠す。
    if (!ttShow) t.mesh.visible = false;
  });
}

const container = document.getElementById('scene');

function init() {
  scene = new THREE.Scene();
  scene.background = null; // 背景なし（透過）

  const w = container.clientWidth;
  const h = container.clientHeight;

  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 5000);
  camera.position.set(0, 220, 320);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(0x000000, 0); // 透過 → CSS背景が見える(=線路だけ)
  container.appendChild(renderer.domElement);

  // ライト（線路を立体的に見せるため。背景オブジェクトは置かない）
  const amb = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(120, 300, 160);
  scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0x88aaff, 0.25);
  dir2.position.set(-160, 120, -120);
  scene.add(dir2);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 30;
  controls.maxDistance = 1200;
  controls.target.set(40, 0, 40);
  controls.enablePan = true;
  controls.screenSpacePanning = true; // 上下左右に素直に平行移動
  controls.panSpeed = 1.0;
  // キーボード（矢印キー）でも視点移動できるように
  controls.listenToKeyEvents(window);
  controls.keyPanSpeed = 24;

  clock = new THREE.Clock();

  buildAllLines();
  applyTrainVisibility(); // 初期モード(通常)に合わせて表示を整える
  centerView();

  window.addEventListener('resize', onResize);
  // 駅クリック検出（ドラッグと区別するため down/up の位置差で判定）
  setupStationPicking();
  animate();
}

/* ----------------------------------------------- 駅クリック検出 */
let stationClickCallback = null;
function setupStationPicking() {
  const el = renderer.domElement;
  let downX = 0, downY = 0, downT = 0;
  el.addEventListener('pointerdown', (e) => {
    downX = e.clientX; downY = e.clientY; downT = performance.now();
  });
  el.addEventListener('pointerup', (e) => {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    const dt = performance.now() - downT;
    // 大きく動いた/長押しはドラッグ操作とみなしクリック扱いしない
    if (moved > 6 || dt > 600) return;
    pickStation(e.clientX, e.clientY);
  });
}

function pickStation(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  // 表示中の駅のみ対象
  const targets = pickStationMeshes.filter((m) => {
    const lo = lineObjects[m.userData.stationRef.lineId];
    return lo && lo.group.visible;
  });
  const hits = raycaster.intersectObjects(targets, true);
  if (hits.length === 0) return;
  // 最初にヒットした要素から駅参照を辿る
  let obj = hits[0].object;
  while (obj && !(obj.userData && obj.userData.stationRef)) obj = obj.parent;
  if (!obj) return;
  const { lineId, stIdx } = obj.userData.stationRef;
  if (stationClickCallback) {
    stationClickCallback(getStationInfo(lineId, stIdx));
  }
}

/* ----------------------------------------------- 路線・駅・車庫の生成 */

// 駅+via を 3D ベクトル列に変換。駅が pts 配列の何番目かも返す。
function buildPoints(line) {
  const pts = [];
  const stationPointIndex = []; // stations[i] が pts の何番目か
  line.stations.forEach((st) => {
    if (line.via && line.via[st.name]) {
      line.via[st.name].forEach((v) => {
        const g = geo(v.lat, v.lon);
        pts.push(new THREE.Vector3(g.x, v.y, g.z));
      });
    }
    const g = geo(st.lat, st.lon);
    pts.push(new THREE.Vector3(g.x, st.y, g.z));
    stationPointIndex.push(pts.length - 1);
  });
  return { pts, stationPointIndex };
}

// 各駅の弧長パラメータ u (0..1) を求める。
// 曲線を細かくサンプリングし、各駅3D座標に最も近い u を割り当てる。
function computeStationU(curve, stationPositions) {
  const SAMPLES = 800;
  const samples = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES;
    samples.push({ u, p: curve.getPointAt(clampU(u)) });
  }
  return stationPositions.map((sp) => {
    let best = 0, bestDist = Infinity;
    for (const s of samples) {
      const d = s.p.distanceToSquared(sp);
      if (d < bestDist) { bestDist = d; best = s.u; }
    }
    return best;
  });
}

function buildAllLines() {
  LINE_ORDER.forEach((id) => {
    const line = LINES[id];
    const track = TRACKS[id] || { type: 'double', gauge: 2.4, passingStations: [] };
    const group = new THREE.Group();
    group.name = 'line-' + id;

    const { pts: points } = buildPoints(line);
    const centerCurve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2);
    const railColor = new THREE.Color(line.color);
    // 走行線オフセット生成の分割数（負荷と滑らかさのバランス）。
    const seg = points.length * 8;

    // 駅位置の3D座標と中心線上の弧長パラメータ u を先に求める
    const stationPositions = line.stations.map((st) => {
      const g = geo(st.lat, st.lon);
      return new THREE.Vector3(g.x, st.y, g.z);
    });
    const stationU = computeStationU(centerCurve, stationPositions);

    // 待避駅 index 一覧
    const passingIdx = (track.passingStations || []).slice();

    // 駅近接度関数（全駅 / 待避駅のみ）
    const bumpAll = makeStationBump(stationU, 0.022);   // 駅構内で本線が少し開く
    const bumpPass = makeStationBump(stationU, 0.020);  // 待避駅で待避線が膨らむ

    const G = track.gauge || 2.4;        // 本線の上下線オフセット
    const STA_SPREAD = 1.2;              // 駅で本線がさらに開く量
    const SIDE_BASE = G + 2.6;           // 待避線の基本外側位置
    const SIDE_BUMP = 2.4;               // 待避駅でさらに外へ

    // --- 走行線（本線）---
    let downTrackCurve, upTrackCurve;
    let downSideCurve = null, upSideCurve = null;
    if (track.type === 'double') {
      // 本線：駅構内で少しだけ外へ膨らむ（ホームを挟む）
      const mainOff = (sign) => (u) => sign * (G + STA_SPREAD * bumpAll(u));
      downTrackCurve = new THREE.CatmullRomCurve3(offsetCurvePointsVariable(centerCurve, seg, mainOff(-1)));
      upTrackCurve   = new THREE.CatmullRomCurve3(offsetCurvePointsVariable(centerCurve, seg, mainOff(+1)));

      // 待避線：待避駅でのみ本線の外側へ分岐して膨らむ。駅間では本線に重ねる。
      if (passingIdx.length > 0) {
        const sideOff = (sign) => (u) => {
          const b = bumpPass(u, passingIdx);
          // b=0（駅間）では本線と同じ位置、b=1（待避駅）で外へ
          return sign * (G + STA_SPREAD * bumpAll(u) + (SIDE_BASE - G) * b + SIDE_BUMP * b);
        };
        downSideCurve = new THREE.CatmullRomCurve3(offsetCurvePointsVariable(centerCurve, seg, sideOff(-1)));
        upSideCurve   = new THREE.CatmullRomCurve3(offsetCurvePointsVariable(centerCurve, seg, sideOff(+1)));
      }
    } else {
      downTrackCurve = centerCurve;
      upTrackCurve = centerCurve;
    }

    // --- 線路の見た目（路線色チューブ＋銀レール）---
    if (track.type === 'double') {
      drawTrackVisual(group, downTrackCurve, points.length, railColor);
      drawTrackVisual(group, upTrackCurve, points.length, railColor);
      // 待避線は控えめ（細め）に描画
      if (downSideCurve) drawTrackVisual(group, downSideCurve, points.length, railColor, 0.7);
      if (upSideCurve)   drawTrackVisual(group, upSideCurve, points.length, railColor, 0.7);
      // 上下本線の間に枕木
      drawSleepers(group, downTrackCurve, upTrackCurve, points.length, railColor);
    } else {
      drawTrackVisual(group, centerCurve, points.length, railColor);
    }

    // --- 駅の重要度ランクを算出（ラベルの段階表示=LODに使用）---
    // rank 2: 最優等(特急/ライナー)停車駅 → 常に表示
    // rank 1: 優等(急行/区急/快速)停車駅 → やや引いた視点まで表示
    // rank 0: 各停のみの駅 → 近づいたときだけ表示
    const stationRank = computeStationRanks(id);

    // --- 駅 ---
    const stationMeshes = [];
    line.stations.forEach((st, idx) => {
      const pos = stationPositions[idx];
      const isPassing = passingIdx.includes(idx);
      const su = stationU[idx];
      // 駅構内の上下線・待避線の実際の横位置を計算してホーム/線路を正確に配置
      const layout = {
        gauge: G + STA_SPREAD * bumpAll(su),
        sideOffset: SIDE_BASE + SIDE_BUMP, // 待避線の駅での外側位置
        tangent: centerCurve.getTangentAt(clampU(su)).normalize(),
      };
      const stMesh = makeStation(st, railColor, track, isPassing, layout);
      stMesh.position.copy(pos);
      const meta = { lineId: id, stIdx: idx };
      stMesh.userData.stationRef = meta;
      stMesh.traverse((o) => { o.userData.stationRef = meta; });
      group.add(stMesh);
      stationMeshes.push({ name: st.name, pos, isPassing, mesh: stMesh });
      pickStationMeshes.push(stMesh);
      const rank = stationRank[idx];
      const accentColor = rank >= 2 ? '#' + line.color.toString(16).padStart(6, '0') : null;
      const label = makeLabelSprite(st.name, rank < 2, accentColor);
      label.position.set(pos.x, pos.y + 9, pos.z);
      label.userData.isLabel = true;
      label.userData.rank = rank;       // LOD 判定用
      label.userData.basePos = pos.clone();
      label.userData.stationRef = meta;
      group.add(label);
      labelSprites.push(label);
      pickStationMeshes.push(label);
    });

    // --- 車庫・留置線 ---
    (line.depots || []).forEach((dp) => {
      const g = geo(dp.lat, dp.lon);
      const depot = makeDepot(dp, railColor);
      depot.position.set(g.x, dp.y, g.z);
      group.add(depot);
    });

    scene.add(group);

    lineObjects[id] = {
      id, name: line.name, color: line.color,
      group, curve: centerCurve, downTrackCurve, upTrackCurve,
      downSideCurve, upSideCurve,
      track, stations: stationMeshes, stationU, trains: [],
    };

    // 通常モードの電車：上り1本・下り1本を配置（複線ですれ違う）
    spawnTrain(id, Math.random(), 1, 1);   // 下り
    if (track.type === 'double') {
      spawnTrain(id, Math.random(), 1, -1); // 上り
    }
  });

  // 時刻表モード用の列車プールを構築（最初は非表示）
  buildTimetableTrains();
}

// 走行線1本ぶんの見た目（路線色チューブ＋2本の銀レール）を描く
// scale: 待避線などを細めに描くための倍率
function drawTrackVisual(group, curve, pointCount, railColor, scale = 1) {
  // チューブの分割数（負荷の主因。視覚上 *6 で十分滑らか）
  const tubeSeg = pointCount * 6;
  const tubeGeo = new THREE.TubeGeometry(curve, tubeSeg, 0.55 * scale, 6, false);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: railColor, metalness: 0.3, roughness: 0.5,
    emissive: railColor.clone().multiplyScalar(scale < 1 ? 0.08 : 0.15),
  });
  group.add(new THREE.Mesh(tubeGeo, tubeMat));

  const railMat = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, metalness: 0.8, roughness: 0.3 });
  [-0.9 * scale, 0.9 * scale].forEach((off) => {
    const railCurve = new THREE.CatmullRomCurve3(offsetCurvePoints(curve, tubeSeg, off));
    const rg = new THREE.TubeGeometry(railCurve, tubeSeg, 0.18 * scale, 5, false);
    group.add(new THREE.Mesh(rg, railMat));
  });
}

// 複線の上下線をつなぐ横木（枕木）を一定間隔で描く（負荷軽減のため間引き）
function drawSleepers(group, c1, c2, pointCount, color) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a6470, roughness: 0.9 });
  const N = Math.min(pointCount * 2, 60);
  for (let i = 0; i <= N; i++) {
    const u = clampU(i / N);
    const a = c1.getPointAt(u);
    const b = c2.getPointAt(u);
    const mid = a.clone().lerp(b, 0.5);
    const len = a.distanceTo(b);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(len, 0.15, 0.5), mat);
    sl.position.copy(mid);
    sl.lookAt(b.x, mid.y, b.z);
    sl.rotateY(Math.PI / 2);
    group.add(sl);
  }
}

// カーブを法線方向に一定量オフセットした点列（簡易レール用）
function offsetCurvePoints(curve, segments, offset) {
  const pts = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    pts.push(p.clone().addScaledVector(side, offset));
  }
  return pts;
}

// 弧長基準で可変オフセットした点列を作る。
// offsetFn(u) が各位置 u (0..1) における横オフセット量を返す。
// → 駅構内で線路が外へ膨らむ/待避線が分岐する表現に使う。
function offsetCurvePointsVariable(curve, segments, offsetFn) {
  const pts = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segments; i++) {
    const u = clampU(i / segments);
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    pts.push(p.clone().addScaledVector(side, offsetFn(u)));
  }
  return pts;
}

// 駅周辺で 1 に近づき、駅間で 0 になる「駅近接度」関数を作る。
// stationU: 各駅の u 値、width: 影響範囲（u 単位）
function makeStationBump(stationU, width) {
  return function (u, onlyStations) {
    let best = 0;
    const list = onlyStations || stationU.map((_, i) => i);
    for (const i of list) {
      const su = stationU[i];
      const d = Math.abs(u - su);
      if (d < width) {
        // スムーズな山型（コサイン）
        const v = 0.5 * (1 + Math.cos((d / width) * Math.PI));
        if (v > best) best = v;
      }
    }
    return best;
  };
}

// 駅オブジェクト：実際の線路数に合わせてホーム・線路を配置（重ならない）
// layout: { gauge(本線オフセット), sideOffset(待避線外側位置), tangent(線路方向) }
function makeStation(st, color, track, isPassing, layout) {
  const g = new THREE.Group();
  const platMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, metalness: 0.1, roughness: 0.8,
    emissive: new THREE.Color(color).multiplyScalar(0.05),
  });
  const railMatS = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, metalness: 0.7, roughness: 0.35 });

  // ローカル座標系：X = 線路に直交（ホーム/線路を横に並べる軸）、Z = 線路の長手方向。
  // 駅グループ全体を接線方向に回転させて線路に沿わせる（下で setRotationFromYaw）。
  const gauge = (layout && layout.gauge) || (track && track.gauge) || 2.4;
  const sideOffset = (layout && layout.sideOffset) || (gauge + 4.0);
  const PLAT_LEN = 11; // ホーム長（Z方向）

  // ホーム1面を作るヘルパー（中心x, 幅w）
  const makePlatform = (cx, w) => {
    const pl = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, PLAT_LEN), platMat);
    pl.position.set(cx, 0.2, 0);
    g.add(pl);
    return pl;
  };
  // 線路（駅構内のレール表現：Z方向の短いレール）
  const makeTrackLine = (cx) => {
    [-0.85, 0.85].forEach((roff) => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, PLAT_LEN + 2), railMatS);
      r.position.set(cx + roff, 0.35, 0);
      g.add(r);
    });
  };

  if (track && track.type === 'single') {
    // 単線駅：1線＋片面ホーム
    makeTrackLine(0);
    makePlatform(2.2, 2.4);
  } else if (isPassing) {
    // 待避駅：上下とも「本線＋待避線」で計4線。線路がそれぞれ独立して並ぶ。
    //   配置（Xの絶対値小→大）：本線下 / 待避下 ... 中央ホーム ... 本線上 / 待避上
    [-1, 1].forEach((side) => {
      const mainX = side * gauge;        // 本線（内側）
      const sideX = side * sideOffset;   // 待避線（外側）
      makeTrackLine(mainX);
      makeTrackLine(sideX);
      // 本線と待避線の間にホーム（島式：両側に列車が止まる）
      makePlatform(side * (gauge + sideOffset) / 2, Math.abs(sideOffset - gauge) - 1.0);
      // 本線→待避線の渡り線（分岐を斜めレールで表現）
      [-1, 1].forEach((zz) => {
        const cross = new THREE.Mesh(
          new THREE.BoxGeometry(Math.abs(sideX - mainX), 0.22, 0.3), railMatS);
        cross.position.set((mainX + sideX) / 2, 0.34, zz * (PLAT_LEN / 2 + 0.5));
        cross.rotation.y = (zz > 0 ? 1 : -1) * side * 0.45;
        g.add(cross);
      });
    });
    // 中央ホーム（上下本線の内側を共用）
    makePlatform(0, gauge * 2 - 1.0);
  } else {
    // 通常の複線駅：上り線・下り線の2線＋島式ホーム1面（線間）
    makeTrackLine(-gauge);
    makeTrackLine(gauge);
    makePlatform(0, gauge * 2 - 0.8);
  }

  // 駅マーカー（路線色の柱＋球）
  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 6.5, 12),
    new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.4,
      emissive: new THREE.Color(color).multiplyScalar(0.3) })
  );
  pin.position.y = 4.0;
  g.add(pin);
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(1.3, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(color).multiplyScalar(0.5) })
  );
  ball.position.y = 7.5;
  g.add(ball);

  // 高架なら脚（高架構造の桁下高さ＝地表からの構造高のみを表現。
  // st.y には海抜標高が含まれるため、脚は絶対高ではなく固定の構造高で描く）
  if (st.grade === 'elevated') {
    const legMat = new THREE.MeshStandardMaterial({ color: 0xb0b8c0, roughness: 0.7 });
    const span = isPassing ? sideOffset : gauge;
    const legH = 13; // 高架の桁下高さ（約13m相当）
    [[-span, -3], [span, -3], [-span, 3], [span, 3]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, legH, 8), legMat);
      leg.position.set(lx, -legH / 2 - 0.6, lz);
      g.add(leg);
    });
  }

  // 線路の進行方向（接線）に合わせて駅全体を回転
  if (layout && layout.tangent) {
    const yaw = Math.atan2(layout.tangent.x, layout.tangent.z);
    g.rotation.y = yaw;
  }
  g.userData.station = st;
  return g;
}

// 車庫・留置線
function makeDepot(dp, color) {
  const g = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x444b55, roughness: 0.9 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(dp.tracks * 2.4, 0.6, 14), baseMat);
  g.add(base);
  // 複数の留置線
  const railMat = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, metalness: 0.7, roughness: 0.35 });
  for (let i = 0; i < dp.tracks; i++) {
    const x = (i - (dp.tracks - 1) / 2) * 2.2;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 13), railMat);
    rail.position.set(x, 0.4, 0);
    g.add(rail);
    // 留置車両（ランダムに何本か）
    if (Math.random() > 0.4) {
      const car = makeCarMesh(color, 0.7);
      car.position.set(x, 1.4, (Math.random() - 0.5) * 6);
      g.add(car);
    }
  }
  // 車庫名ラベル
  const lbl = makeLabelSprite('🚉 ' + dp.name, true);
  lbl.position.set(0, 7, 0);
  g.add(lbl);
  return g;
}

// 1両分の電車メッシュ
function makeCarMesh(color, scale = 1) {
  // 長手方向 = Z軸（進行方向）。幅 = X軸、高さ = Y軸。
  const g = new THREE.Group();
  const LEN = 5.4 * scale;   // 車両長(Z)
  const WIDTH = 2.0 * scale; // 車幅(X)
  const HEIGHT = 2.2 * scale;// 車高(Y)

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xf4f6f8, metalness: 0.4, roughness: 0.3,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, HEIGHT, LEN), bodyMat);
  g.add(body);

  // 路線カラー帯（側面に沿って＝長手方向）
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(WIDTH * 1.02, 0.5 * scale, LEN),
    new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.3) })
  );
  band.position.y = 0.45 * scale;
  g.add(band);

  // 窓（側面に長く）
  const winMat = new THREE.MeshStandardMaterial({ color: 0x22303a, metalness: 0.6, roughness: 0.2 });
  const win = new THREE.Mesh(new THREE.BoxGeometry(WIDTH * 1.01, 0.7 * scale, LEN * 0.82), winMat);
  win.position.y = -0.15 * scale;
  g.add(win);

  // 前面ライト（lookAt はオブジェクトの -Z を向けるので、前面 = -Z 側）
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.8 });
  [-0.5, 0.5].forEach((lx) => {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4 * scale, 0.4 * scale, 0.2 * scale), lightMat);
    lamp.position.set(lx * scale, -0.4 * scale, -LEN / 2 - 0.05);
    g.add(lamp);
  });

  return g;
}

// 電車（複数両）を路線に配置
// startDir: 1=下り（始発→終点, downTrackCurve）/ -1=上り（終点→始発, upTrackCurve）
function spawnTrain(lineId, startT = 0, cars = 1, startDir = 1) {
  const lo = lineObjects[lineId];
  if (!lo) return;
  const group = new THREE.Group();
  const carMeshes = [];
  for (let i = 0; i < cars; i++) {
    const c = makeCarMesh(lo.color);
    group.add(c);
    carMeshes.push(c);
  }
  lo.group.add(group);
  // 進行方向に応じて走行線を選択（複線ならすれ違う）
  const curveRef = startDir === 1 ? lo.downTrackCurve : lo.upTrackCurve;
  const totalLen = curveRef.getLength();
  const carGap = (5.8) / totalLen;
  const train = {
    lineId, group, carMeshes,
    curveRef,
    // 下り(startDir=1)は t を 0→1 方向、上り(-1)は 1→0 方向で開始
    t: startDir === 1 ? startT * 0.5 : 1 - startT * 0.5,
    tMove: startDir,
    carGap,
    baseSpeed: 0.015 + Math.random() * 0.005,
  };
  lo.trains.push(train);
  allTrains.push(train);
}

/* =========================================================================
 * 時刻表モード：ダイヤ生成 ＋ 運行シミュレーション
 * ========================================================================= */

// 1 つの便（trip）のスケジュールを生成
// direction: 1 = 始発→終点方向 / -1 = 逆方向
// overtakeSet: 追い越し待ちで待避線に入る駅index集合（Set）。null/未指定なら
//   どの駅でも延長停車しない（＝待避線に入らない）。
function buildTrip(lineId, service, departSec, direction, overtakeSet) {
  const lo = lineObjects[lineId];
  const tt = TIMETABLE[lineId];
  const line = LINES[lineId];
  const n = line.stations.length;

  // 停車駅index一覧
  let stops;
  if (service.stopsAll) {
    stops = Array.from({ length: n }, (_, i) => i);
  } else {
    stops = service.stops.slice().sort((a, b) => a - b);
  }

  // 逆方向なら駅順を反転
  const order = direction === 1 ? stops : stops.slice().reverse();

  const track = TRACKS[lineId];
  const isLocal = service.stopsAll;

  // 駅間所要：segSec[i] は station i→i+1。区間を跨ぐ場合は合算。
  const schedule = []; // { stIdx, u, arr, dep }
  let clock = departSec;
  for (let k = 0; k < order.length; k++) {
    const stIdx = order[k];
    const arr = clock;
    const isEnd = (k === 0 || k === order.length - 1);
    // 待避駅でも、実際に追い越しがある場合のみ停車時間を延長（待避線に入る）
    const atPassing = isLocal && track && track.passingStations
      && track.passingStations.includes(stIdx);
    const overtaken = atPassing && overtakeSet && overtakeSet.has(stIdx);
    let dwell = tt.dwellSec;
    if (overtaken) dwell = tt.dwellSec + 100; // 約2分の待避
    const dep = arr + (isEnd && k === 0 ? 0 : dwell);
    schedule.push({ stIdx, u: lo.stationU[stIdx], arr, dep, overtaken: !!overtaken });
    // 次駅まで所要
    if (k < order.length - 1) {
      const nextIdx = order[k + 1];
      const lo2 = Math.min(stIdx, nextIdx);
      const hi2 = Math.max(stIdx, nextIdx);
      let travel = 0;
      for (let s = lo2; s < hi2; s++) travel += tt.segSec[s];
      clock = dep + travel;
    }
  }
  return {
    lineId, service, direction,
    schedule,
    startSec: schedule[0].arr,
    endSec: schedule[schedule.length - 1].dep,
  };
}

// ある便が、指定した弧長パラメータ uTarget を通過/到達する時刻を返す。
// 便が走行中に uTarget を横切るか、停車中に uTarget にいる場合にその時刻を返す。
// uTarget を通らない便なら null。
function tripTimeAtU(trip, uTarget) {
  const sch = trip.schedule;
  for (let k = 0; k < sch.length; k++) {
    const cur = sch[k];
    // 停車駅の u と一致（その駅に停車する便）
    if (Math.abs(cur.u - uTarget) < 1e-6) {
      return (cur.arr + cur.dep) / 2;
    }
    if (k < sch.length - 1) {
      const nxt = sch[k + 1];
      const a = cur.u, b = nxt.u;
      // uTarget が区間 [a,b]（向きは問わない）に含まれるか
      const within = (uTarget - a) * (uTarget - b) <= 0 && a !== b;
      if (within) {
        const f = (uTarget - a) / (b - a); // 0..1
        return cur.dep + (nxt.arr - cur.dep) * f;
      }
    }
  }
  return null;
}

// 路線ごとに全便を生成（2パス）。
// パス1: 延長停車なしで全便を仮生成。
// 検出: 各停の待避駅停車中に、同方向の優等が同駅を通過するか判定。
// パス2: 実際に追い越しがある駅のみ延長停車（待避線進入）して再生成。
function buildAllTrips(lineId) {
  const tt = TIMETABLE[lineId];
  const track = TRACKS[lineId] || {};
  const passing = track.passingStations || [];
  const lo = lineObjects[lineId];

  // ---- パス1: 延長停車なしで仮生成 ----
  const draftMeta = []; // { service, dep, direction }
  const draftTrips = [];
  tt.services.forEach((service) => {
    const headway = service.headwaySec || tt.headwaySec;
    // 種別固有の運転時間帯があればそれを使う（ライナー等 17:00-23:00）
    const svcFirst = service.firstSec !== undefined ? service.firstSec : tt.firstSec;
    const svcLast  = service.lastSec  !== undefined ? service.lastSec  : tt.lastSec;
    for (let dep = svcFirst; dep <= svcLast; dep += headway) {
      draftMeta.push({ service, dep, direction: 1 });
      draftTrips.push(buildTrip(lineId, service, dep, 1, null));
      draftMeta.push({ service, dep: dep + headway / 2, direction: -1 });
      draftTrips.push(buildTrip(lineId, service, dep + headway / 2, -1, null));
    }
  });

  // 優等（各停以外）便のみ抽出
  const fastTrips = draftTrips.filter((t) => !t.service.stopsAll);

  // ---- 検出: 各停便ごとに、待避駅で追い越されるか判定 ----
  // 結果は draftTrips と同じ index で overtakeSet を持つ配列に格納。
  const overtakeSets = draftTrips.map((trip) => {
    const set = new Set();
    if (!trip.service.stopsAll || passing.length === 0) return set;
    trip.schedule.forEach((e) => {
      if (!passing.includes(e.stIdx)) return;
      // この各停の当駅停車中に、同方向の優等が当駅 u を「通過」するか
      const passedBy = fastTrips.some((ft) => {
        if (ft.direction !== trip.direction) return false;
        // 優等が当駅に停車する場合は追い越しではない（並びになるだけ）
        const stopsHere = ft.schedule.some((s) => s.stIdx === e.stIdx);
        if (stopsHere) return false;
        const tPass = tripTimeAtU(ft, e.u);
        if (tPass === null) return false;
        // 各停が当駅に在線している時間帯（待避を見越し少し広めの窓）
        return tPass >= e.arr - tt.dwellSec && tPass <= e.dep + 100;
      });
      if (passedBy) set.add(e.stIdx);
    });
    return set;
  });

  // ---- パス2: 追い越しのある駅のみ延長停車で本生成 ----
  const trips = draftMeta.map((m, i) =>
    buildTrip(lineId, m.service, m.dep, m.direction, overtakeSets[i]));

  return trips;
}

// 時刻表モード用の列車プール（路線ごと）とダイヤを構築
function buildTimetableTrains() {
  LINE_ORDER.forEach((id) => {
    const lo = lineObjects[id];
    const trips = buildAllTrips(id);
    lo.trips = trips;

    // 同時アクティブ便の最大数を概算 → プールサイズ（路線別）
    // keio: 6種別×下上=12系統、同時走行を考慮して多めに確保
    // 他路線: 2種別×下上=4系統
    const poolSizeMap = { keio: 56, sagamihara: 18, takao: 16, shin: 10, inokashira: 22, keibajo: 6, dobutsuen: 6 };
    const poolSize = poolSizeMap[id] || 16;
    const pool = [];
    for (let i = 0; i < poolSize; i++) {
      const mesh = makeCarMesh(lo.color);
      mesh.visible = false;
      lo.group.add(mesh);
      pool.push(mesh);
      ttTrains.push({ mesh });
    }
    lo.ttPool = pool;
  });
}

/* =========================================================================
 * 駅情報の算出
 * ========================================================================= */
function fmtTime(sec) {
  let s = Math.floor(sec) % 86400;
  if (s < 0) s += 86400;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function getStationInfo(lineId, stIdx) {
  const line = LINES[lineId];
  const tt = TIMETABLE[lineId];
  const track = TRACKS[lineId] || {};
  const st = line.stations[stIdx];
  const lo = lineObjects[lineId];

  // 構造の日本語
  const gradeMap = { elevated: '高架', ground: '地上', underground: '地下' };

  // この駅に停車する種別
  const stoppingTypes = tt.services
    .filter((s) => s.stopsAll || (s.stops && s.stops.includes(stIdx)))
    .map((s) => s.type);

  // 通過する種別
  const passingTypes = tt.services
    .filter((s) => !(s.stopsAll || (s.stops && s.stops.includes(stIdx))))
    .map((s) => s.type);

  // 隣接駅
  const prev = stIdx > 0 ? line.stations[stIdx - 1].name : null;
  const next = stIdx < line.stations.length - 1 ? line.stations[stIdx + 1].name : null;

  // 乗り入れ・接続路線（同名駅を他路線から探す）
  const connections = [];
  LINE_ORDER.forEach((id) => {
    if (id === lineId) return;
    const idx = LINES[id].stations.findIndex((s) => s.name === st.name);
    if (idx >= 0) connections.push(LINES[id].name);
  });

  // 当駅を発車する列車の時刻表（下り・上りに分けて、種別と発車時刻）
  const depDown = [], depUp = [];
  (lo.trips || []).forEach((trip) => {
    const e = trip.schedule.find((s) => s.stIdx === stIdx);
    if (!e) return; // この便は当駅を通過 or 経由しない
    const item = { time: e.dep, type: trip.service.type };
    if (trip.direction === 1) depDown.push(item); else depUp.push(item);
  });
  const sortByTime = (a, b) => a.time - b.time;
  depDown.sort(sortByTime);
  depUp.sort(sortByTime);

  // 終点方向/始発方向の名称
  const downDest = line.stations[line.stations.length - 1].name;
  const upDest = line.stations[0].name;

  return {
    lineId,
    lineName: line.name,
    lineColor: line.color,
    name: st.name,
    index: stIdx,
    total: line.stations.length,
    grade: gradeMap[st.grade] || st.grade,
    elevation: st.y,
    // 概算海抜（構造による上下を差し引いた地表標高の目安）
    altitude: Math.round(
      st.grade === 'elevated' ? st.y - 8 :
      st.grade === 'underground' ? st.y + 12 :
      st.y
    ),
    isPassing: !!(track.passingStations && track.passingStations.includes(stIdx)),
    trackType: track.type === 'single' ? '単線' : '複線',
    stoppingTypes,
    passingTypes,
    prev, next,
    connections,
    timetable: {
      downDest, upDest,
      down: depDown.map((d) => ({ time: fmtTime(d.time), type: d.type })),
      up: depUp.map((d) => ({ time: fmtTime(d.time), type: d.type })),
    },
  };
}

// 現在の simSec における各便の位置を計算してプールメッシュに割り当て
function updateTimetable() {
  if (!trainsVisible || mode !== 'timetable') {
    ttTrains.forEach((t) => (t.mesh.visible = false));
    return;
  }
  LINE_ORDER.forEach((id) => {
    const lo = lineObjects[id];
    if (!lo.group.visible) {
      lo.ttPool.forEach((m) => (m.visible = false));
      return;
    }
    // 今アクティブな便を収集
    const active = [];
    for (const trip of lo.trips) {
      if (simSec >= trip.startSec && simSec <= trip.endSec) {
        const r = tripPositionU(trip, simSec);
        if (r !== null) active.push({ trip, u: r.u, sideBlend: r.sideBlend });
      }
    }
    // プールに割り当て。方向で走行線（上り線/下り線）を選択し、
    // 待避線曲線とブレンドしてレールに沿ってスムーズに移動させる。
    lo.ttPool.forEach((mesh, i) => {
      if (i < active.length) {
        mesh.visible = true;
        const a = active[i];
        const dir = a.trip.direction;
        const mainCurve = (dir === 1) ? lo.downTrackCurve : lo.upTrackCurve;
        const sideCurve = (dir === 1) ? lo.downSideCurve : lo.upSideCurve;
        placeTrainBlended(mainCurve, sideCurve, mesh, a.u, dir, a.sideBlend);
      } else {
        mesh.visible = false;
      }
    });
  });
}

// 便の schedule から、時刻 sec における弧長パラメータ u を補間
// 戻り値: { u, sideBlend }
//   sideBlend: 0=本線, 1=待避線。停車前後で滑らかに 0↔1 を補間し、
//   待避線曲線へレールに沿って入線/退避するように見せる。
const APPROACH = 35; // 待避線への進入/退出にかける秒数（シミュ時間）
function tripPositionU(trip, sec) {
  const sch = trip.schedule;
  const isLocal = trip.service.stopsAll;
  for (let k = 0; k < sch.length; k++) {
    const cur = sch[k];
    // 待避線に入るのは「実際に追い越しがある駅」のみ（overtaken フラグ）
    const enterSide = isLocal && cur.overtaken;

    // 駅停車中
    if (sec >= cur.arr && sec <= cur.dep) {
      let sideBlend = 0;
      if (enterSide) {
        // 到着直後は入線途中、出発直前は退避途中で滑らかに
        const inT = Math.min(1, (sec - cur.arr) / APPROACH);
        const outT = Math.min(1, (cur.dep - sec) / APPROACH);
        sideBlend = Math.min(inT, outT);
        sideBlend = easeInOut(sideBlend);
      }
      return { u: cur.u, sideBlend };
    }
    // 次駅への走行中
    if (k < sch.length - 1) {
      const nxt = sch[k + 1];
      if (sec > cur.dep && sec < nxt.arr) {
        const span = nxt.arr - cur.dep;
        const f = (sec - cur.dep) / span;
        const e = easeInOut(f);
        return { u: cur.u + (nxt.u - cur.u) * e, sideBlend: 0 };
      }
    }
  }
  return null;
}
function easeInOut(f) {
  return f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
}

// 時刻表モードの一時オブジェクト
const _fwd2 = new THREE.Vector3();
const _euler2 = new THREE.Euler();
const _q2 = new THREE.Quaternion();
const _pMain = new THREE.Vector3();
const _pSide = new THREE.Vector3();
const _tMain = new THREE.Vector3();
const _tSide = new THREE.Vector3();

// 本線と待避線をブレンドして配置（sideBlend: 0=本線, 1=待避線）。
// 待避線が無い駅では本線のみ。レールに沿って滑らかに横移動する。
function placeTrainBlended(mainCurve, sideCurve, car, uRaw, dir, sideBlend) {
  const u = clampU(uRaw);
  mainCurve.getPointAt(u, _pMain);
  mainCurve.getTangentAt(u, _tMain).normalize();

  let p = _pMain, tan = _tMain;
  if (sideCurve && sideBlend > 0.001) {
    sideCurve.getPointAt(u, _pSide);
    sideCurve.getTangentAt(u, _tSide).normalize();
    // 位置・接線を補間
    _pMain.lerp(_pSide, sideBlend);
    _tMain.lerp(_tSide, sideBlend).normalize();
    p = _pMain; tan = _tMain;
  }
  applyCarTransform(car, p, tan, dir);
}

// 位置 p・接線 tan・進行方向 dir から車両の姿勢を決める（共通処理）
function applyCarTransform(car, p, tan, dir) {
  _fwd2.copy(tan).multiplyScalar(dir);
  car.position.copy(p);
  car.position.y += 1.4;

  const horiz = Math.hypot(_fwd2.x, _fwd2.z);
  let yaw;
  if (horiz < 1e-4) {
    yaw = car.userData.lastYaw !== undefined ? car.userData.lastYaw : 0;
  } else {
    yaw = Math.atan2(_fwd2.x, _fwd2.z);
    car.userData.lastYaw = yaw;
  }
  let pitch = Math.atan2(_fwd2.y, horiz);
  const maxPitch = THREE.MathUtils.degToRad(20);
  pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
  _euler2.set(pitch, yaw + Math.PI, 0, 'YXZ');
  _q2.setFromEuler(_euler2);
  car.quaternion.copy(_q2);
}

/* ----------------------------------------------- 駅名ラベル（Sprite） */
function makeLabelSprite(text, small = false, accent = null) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = small ? 30 : 42;
  const pad = 16;
  ctx.font = `bold ${fontSize}px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
  const textW = ctx.measureText(text).width;
  const accentW = accent ? 8 : 0; // 主要駅は左に路線色のアクセントバー
  canvas.width = textW + pad * 2 + accentW;
  canvas.height = fontSize + 22;
  // 背景（主要駅は濃いめ＝視認性UP）
  ctx.fillStyle = small ? 'rgba(18,23,31,0.74)' : 'rgba(12,16,22,0.9)';
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 10);
  ctx.fill();
  // 主要駅：左端に路線色のアクセントバー
  if (accent) {
    ctx.fillStyle = accent;
    roundRect(ctx, 0, 0, accentW + 6, canvas.height, 10);
    ctx.fill();
  }
  // 縁取り（薄い白枠で背景から浮かせる）
  ctx.strokeStyle = small ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, canvas.width - 2, canvas.height - 2, 9);
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = `bold ${fontSize}px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad + accentW, canvas.height / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  const sc = small ? 0.05 : 0.058;
  sprite.scale.set(canvas.width * sc, canvas.height * sc, 1);
  sprite.userData.isLabel = true;
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ----------------------------------------------- 表示中心へカメラ調整 */
function centerView() {
  const box = new THREE.Box3();
  Object.values(lineObjects).forEach((lo) => {
    if (lo.group.visible) box.expandByObject(lo.group);
  });
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  controls.target.copy(center);
  const dist = Math.max(size.x, size.z) * 0.9 + 120;
  camera.position.set(center.x, center.y + dist * 0.6, center.z + dist);
  controls.update();
}

/* ----------------------------------------------- アニメーション */
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  if (mode === 'normal') {
    updateNormal(dt);
  } else {
    updateTimetableMode(dt);
  }

  controls.update();
  updateLabelLOD();
  renderer.render(scene, camera);
}

// カメラ距離に応じて駅名ラベルを段階表示（密集回避）。
// 引いた視点では主要駅のみ、寄ると各停駅まで表示。
// さらに、画面上で近接するラベル同士は重要度の低い方を隠す。
const _camPos = new THREE.Vector3();
function updateLabelLOD() {
  if (!labelsEnabled) return;
  _camPos.copy(camera.position);
  const dist = _camPos.distanceTo(controls.target);

  // 距離しきい値（小さいほど寄り）。ランクごとに表示開始距離を変える。
  // rank2: 常に表示 / rank1: 中距離以下 / rank0: 近距離のみ
  const showMid = dist < 900;
  const showMinor = dist < 470;

  // 1パス目：距離による基本可否
  for (const lb of labelSprites) {
    const lo = lineObjects[lb.userData.stationRef.lineId];
    const lineVisible = lo && lo.group.visible;
    let on = lineVisible;
    if (on) {
      const r = lb.userData.rank;
      if (r >= 2) on = true;
      else if (r === 1) on = showMid;
      else on = showMinor;
    }
    lb.userData._lodOn = on;
  }

  // 2パス目：画面上で重なるラベルは重要度の高い方を優先（簡易デクラッタ）
  // 中距離以降で常時実施し、ラベル同士の重なりを防ぐ。
  if (showMid) {
    const visibles = labelSprites
      .filter((l) => l.userData._lodOn)
      .map((l) => {
        l.getWorldPosition(_tmpWorld);
        _tmpWorld.project(camera);
        return { lb: l, sx: _tmpWorld.x, sy: _tmpWorld.y, z: _tmpWorld.z, rank: l.userData.rank };
      })
      // 手前→奥、重要度高→低の順で確定
      .sort((a, b) => (b.rank - a.rank) || (a.z - b.z));
    const placed = [];
    const MINX = 0.055, MINY = 0.045; // NDC上の最小間隔
    for (const item of visibles) {
      if (item.z < -1 || item.z > 1) { item.lb.userData._lodOn = false; continue; }
      let clash = false;
      for (const p of placed) {
        if (Math.abs(item.sx - p.sx) < MINX && Math.abs(item.sy - p.sy) < MINY) {
          clash = true; break;
        }
      }
      if (clash && item.rank < 2) { item.lb.userData._lodOn = false; }
      else placed.push(item);
    }
  }

  for (const lb of labelSprites) lb.visible = lb.userData._lodOn;
}
const _tmpWorld = new THREE.Vector3();

// 通常モード：各列車が自分の走行線（上り線/下り線）を往復する。
// 複線では下り線と上り線が別レーンなので、必ずすれ違う。
function updateNormal(dt) {
  allTrains.forEach((tr) => {
    const lo = lineObjects[tr.lineId];
    if (!lo.group.visible) return;
    if (running) {
      // tMove: t の増減方向。tFace: 車両の前面が向く向き（t増加=+1）。
      tr.t += tr.tMove * tr.baseSpeed * speedFactor * dt;
      if (tr.t > 1) { tr.t = 1; tr.tMove = -1; }
      if (tr.t < 0) { tr.t = 0; tr.tMove = 1; }
    }
    placeTrain(tr.curveRef, tr);
  });
}

// 時刻表モード：仮想時計を進めてダイヤ通りに運行
function updateTimetableMode(dt) {
  if (running) {
    simSec += dt * simRate;
    // 翌日へループ（27:00 ≒ 全列車終了後に 05:00 へ）
    if (simSec >= 27 * 3600) simSec = 5 * 3600;
  }
  updateTimetable();
  if (ttTimeCallback) ttTimeCallback(simSec);
}

// 再利用する一時オブジェクト
const _fwd = new THREE.Vector3();
const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();

function placeTrain(curve, tr) {
  tr.carMeshes.forEach((car, i) => {
    // 後続車は進行方向の後ろにずらす（tMove の逆）
    let t = tr.t - tr.tMove * i * tr.carGap;
    t = Math.min(1, Math.max(0, t));
    const u = clampU(t);

    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u).normalize();

    // 進行方向ベクトル（t の増減方向 = 接線×tMove）
    _fwd.copy(tan).multiplyScalar(tr.tMove);

    // 位置：レール上に乗せる
    car.position.copy(p);
    car.position.y += 1.4;

    // --- 向きをヨー(水平回転)＋ピッチ(勾配)に分離して安定させる ---
    // 立ってしまわないよう、上方向は常にワールドYを基準にする。
    // 水平面での進行方向角（ヨー）
    const horiz = Math.hypot(_fwd.x, _fwd.z);
    let yaw;
    if (horiz < 1e-4) {
      // ほぼ垂直な接線：前回のヨーを保持してブレを防ぐ
      yaw = (car.userData.lastYaw !== undefined) ? car.userData.lastYaw : 0;
    } else {
      yaw = Math.atan2(_fwd.x, _fwd.z);
      car.userData.lastYaw = yaw;
    }
    // 勾配によるピッチ（水平距離に対する高低）。誇張を抑えて緩やかに。
    let pitch = Math.atan2(_fwd.y, horiz);
    // ピッチは見た目用に控えめに（±20度程度に制限）
    const maxPitch = THREE.MathUtils.degToRad(20);
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));

    // 車両前方はローカル -Z。ヨーは Y軸回転、ピッチは X軸回転。
    // 前方-Z をヨーで向けるには Y回転に π を加味（atan2(x,z) は +Z 基準のため）
    _euler.set(pitch, yaw + Math.PI, 0, 'YXZ');
    _q.setFromEuler(_euler);
    car.quaternion.copy(_q);
  });
}
function clampU(t) { return Math.min(0.9999, Math.max(0.0001, t)); }

function onResize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

/* ----------------------------------------------- UI 連携 (公開API) */
window.KEIO_APP = {
  toggleLine(id, visible) {
    if (lineObjects[id]) lineObjects[id].group.visible = visible;
  },
  setRunning(v) { running = v; },
  setSpeed(v) { speedFactor = v; },
  setTrainsVisible(v) {
    trainsVisible = v;
    applyTrainVisibility();
  },

  // ---- モード切替 ----
  setMode(m) {
    mode = (m === 'timetable') ? 'timetable' : 'normal';
    applyTrainVisibility();
    if (ttTimeCallback) ttTimeCallback(simSec);
  },
  getMode() { return mode; },

  // ---- 時刻表モード操作 ----
  setSimTime(sec) {
    simSec = ((sec % (24 * 3600)) + 24 * 3600) % (24 * 3600);
    updateTimetable();
    if (ttTimeCallback) ttTimeCallback(simSec);
  },
  addSimTime(deltaSec) {
    simSec += deltaSec;
    if (simSec < 0) simSec += 24 * 3600;
    updateTimetable();
    if (ttTimeCallback) ttTimeCallback(simSec);
  },
  setSimRate(rate) { simRate = rate; },
  getSimTime() { return simSec; },
  onTimeUpdate(cb) { ttTimeCallback = cb; },

  // ---- 駅クリック ----
  onStationClick(cb) { stationClickCallback = cb; },
  getStationInfo(lineId, stIdx) { return getStationInfo(lineId, stIdx); },
  focusLine(id) {
    const lo = lineObjects[id];
    if (!lo) return;
    const box = new THREE.Box3().setFromObject(lo.group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    controls.target.copy(center);
    const dist = Math.max(size.x, size.z) * 0.9 + 80;
    camera.position.set(center.x, center.y + dist * 0.55, center.z + dist);
    controls.update();
  },
  resetView() { centerView(); },
  // 視点を上下左右に平行移動（dir: 'up'|'down'|'left'|'right'）
  panView(dir) {
    const dist = camera.position.distanceTo(controls.target);
    const step = dist * 0.12;
    // カメラの向きから「右」「上」ベクトルを算出
    const forward = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const move = new THREE.Vector3();
    if (dir === 'left')  move.addScaledVector(right, -step);
    if (dir === 'right') move.addScaledVector(right,  step);
    if (dir === 'up')    move.addScaledVector(up,     step);
    if (dir === 'down')  move.addScaledVector(up,    -step);
    camera.position.add(move);
    controls.target.add(move);
    controls.update();
  },
  // カメラを軌道回転（az/el: ラジアン相当の小さな角度）
  orbitView(deltaAz, deltaEl) {
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta += deltaAz;
    sph.phi += deltaEl;
    sph.phi = Math.max(0.05, Math.min(Math.PI - 0.05, sph.phi));
    offset.setFromSpherical(sph);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  },
  zoomView(factor) {
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    offset.multiplyScalar(factor);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  },
  toggleLabels(show) {
    labelsEnabled = show;
    // 駅ラベルは LOD 管理下。OFF なら即時に全て隠す（ON 時は updateLabelLOD が制御）
    if (!show) labelSprites.forEach((l) => { l.visible = false; });
    // 車庫など駅以外のラベルは従来どおり一括制御
    scene.traverse((o) => {
      if (o.userData && o.userData.isLabel && o.userData.rank === undefined) o.visible = show;
    });
  },
  lineList() {
    return LINE_ORDER.map((id) => ({ id, name: LINES[id].name, color: LINES[id].color }));
  },
};

init();
