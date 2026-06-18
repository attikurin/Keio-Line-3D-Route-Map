/* =========================================================================
 * 京王電鉄 路線データ（全駅完全再現版 / B案）
 * -------------------------------------------------------------------------
 * 緯度経度は各駅の実際の位置（小数第6位）に基づく実座標。
 * geo() で基準点(新宿)からの相対メートルに変換。駅間距離は実比率で表現。
 *
 * services の各種別について：
 *   stopsAll: true → 全駅停車（各駅停車）
 *   stops: [idx...] → 停車駅の index 配列
 *   headwaySec: 種別独自の運行間隔（省略時は路線の headwaySec を使用）
 *   color: 種別カラー（UI・チップ表示に使用）
 *
 * ※停車駅は京王電鉄の標準的な平日ダイヤ（2023年ダイヤ改正以降）に準拠。
 * ========================================================================= */

const ORIGIN_LAT = 35.690221;
const ORIGIN_LON = 139.700464;
const M_PER_LAT  = 111000;
const M_PER_LON  = 90400;
const SCALE      = 0.012;
const ELEV_SCALE = 1.0;

function geo(lat, lon) {
  const x = (lon - ORIGIN_LON) * M_PER_LON * SCALE;
  const z = -(lat - ORIGIN_LAT) * M_PER_LAT * SCALE;
  return { x, z };
}

/* =========================================================================
 * 路線・駅定義
 * ========================================================================= */
const LINES = {

  /* ---- 京王線（新宿〜京王八王子 全32駅） ---- */
  keio: {
    id: 'keio', name: '京王線', color: 0xd2227f,
    // 駅 index:
    //  0新宿 1笹塚 2代田橋 3明大前 4下高井戸 5桜上水 6上北沢 7八幡山
    //  8芦花公園 9千歳烏山 10仙川 11つつじヶ丘 12柴崎 13国領 14布田
    //  15調布 16西調布 17飛田給 18武蔵野台 19多磨霊園 20東府中
    //  21府中 22分倍河原 23中河原 24聖蹟桜ヶ丘 25百草園 26高幡不動
    //  27南平 28平山城址公園 29長沼 30北野 31京王八王子
    stations: [
      { name: '新宿',         lat: 35.690221, lon: 139.700464, y: 24,  grade: 'underground' },
      { name: '笹塚',         lat: 35.673229, lon: 139.666473, y: 52,  grade: 'elevated'    },
      { name: '代田橋',       lat: 35.671100, lon: 139.658900, y: 50,  grade: 'elevated'    },
      { name: '明大前',       lat: 35.668094, lon: 139.649417, y: 50,  grade: 'elevated'    },
      { name: '下高井戸',     lat: 35.668300, lon: 139.640500, y: 48,  grade: 'ground'      },
      { name: '桜上水',       lat: 35.667731, lon: 139.631942, y: 46,  grade: 'ground'      },
      { name: '上北沢',       lat: 35.667900, lon: 139.625800, y: 50,  grade: 'elevated'    },
      { name: '八幡山',       lat: 35.667847, lon: 139.620639, y: 54,  grade: 'elevated'    },
      { name: '芦花公園',     lat: 35.667600, lon: 139.609700, y: 50,  grade: 'ground'      },
      { name: '千歳烏山',     lat: 35.667969, lon: 139.598556, y: 50,  grade: 'ground'      },
      { name: '仙川',         lat: 35.662431, lon: 139.583758, y: 48,  grade: 'ground'      },
      { name: 'つつじヶ丘',   lat: 35.659019, lon: 139.574367, y: 44,  grade: 'ground'      },
      { name: '柴崎',         lat: 35.656300, lon: 139.564900, y: 42,  grade: 'ground'      },
      { name: '国領',         lat: 35.652900, lon: 139.557600, y: 28,  grade: 'underground' },
      { name: '布田',         lat: 35.651900, lon: 139.550900, y: 27,  grade: 'underground' },
      { name: '調布',         lat: 35.651825, lon: 139.544214, y: 26,  grade: 'underground' },
      { name: '西調布',       lat: 35.655600, lon: 139.529800, y: 44,  grade: 'ground'      },
      { name: '飛田給',       lat: 35.658100, lon: 139.521300, y: 46,  grade: 'ground'      },
      { name: '武蔵野台',     lat: 35.662600, lon: 139.508600, y: 48,  grade: 'ground'      },
      { name: '多磨霊園',     lat: 35.665600, lon: 139.500300, y: 50,  grade: 'ground'      },
      { name: '東府中',       lat: 35.669722, lon: 139.492778, y: 50,  grade: 'ground'      },
      { name: '府中',         lat: 35.671967, lon: 139.480586, y: 56,  grade: 'elevated'    },
      { name: '分倍河原',     lat: 35.665958, lon: 139.464486, y: 42,  grade: 'ground'      },
      { name: '中河原',       lat: 35.657200, lon: 139.455900, y: 44,  grade: 'ground'      },
      { name: '聖蹟桜ヶ丘',   lat: 35.651981, lon: 139.446094, y: 56,  grade: 'elevated'    },
      { name: '百草園',       lat: 35.656300, lon: 139.428900, y: 60,  grade: 'ground'      },
      { name: '高幡不動',     lat: 35.661069, lon: 139.412258, y: 58,  grade: 'ground'      },
      { name: '南平',         lat: 35.658600, lon: 139.392600, y: 70,  grade: 'ground'      },
      { name: '平山城址公園', lat: 35.658300, lon: 139.380800, y: 80,  grade: 'ground'      },
      { name: '長沼',         lat: 35.659800, lon: 139.370900, y: 88,  grade: 'elevated'    },
      { name: '北野',         lat: 35.660761, lon: 139.361753, y: 96,  grade: 'elevated'    },
      { name: '京王八王子',   lat: 35.658494, lon: 139.339883, y: 98,  grade: 'underground' }
    ],
    via: {
      // 調布(15)→西調布(16) は地下から地上に上がる区間
      '府中':     [{ lat: 35.671000, lon: 139.486000, y: 52 }],
      '高幡不動': [{ lat: 35.658500, lon: 139.420000, y: 58 }],
      '京王八王子':[{ lat: 35.660000, lon: 139.349000, y: 102 }]
    },
    depots: [
      { name: '若葉台車両基地', lat: 35.620500, lon: 139.490000, tracks: 8, y: 70 }
    ]
  },

  /* ---- 京王相模原線（調布〜橋本 全12駅） ---- */
  sagamihara: {
    id: 'sagamihara', name: '京王相模原線', color: 0x0a7bd6,
    branchFrom: { line: 'keio', station: '調布' },
    // 駅 index:
    //  0調布 1京王多摩川 2京王稲田堤 3京王よみうりランド 4稲城
    //  5若葉台 6京王永山 7京王多摩センター 8京王堀之内
    //  9南大沢 10多摩境 11橋本
    stations: [
      { name: '調布',             lat: 35.651825, lon: 139.544214, y: 26, grade: 'underground' },
      { name: '京王多摩川',       lat: 35.643569, lon: 139.541564, y: 32, grade: 'ground'      },
      { name: '京王稲田堤',       lat: 35.633161, lon: 139.542017, y: 40, grade: 'elevated'    },
      { name: '京王よみうりランド',lat: 35.628303, lon: 139.519719, y: 70, grade: 'elevated'    },
      { name: '稲城',             lat: 35.629064, lon: 139.504347, y: 64, grade: 'elevated'    },
      { name: '若葉台',           lat: 35.623119, lon: 139.486667, y: 74, grade: 'ground'      },
      { name: '京王永山',         lat: 35.631569, lon: 139.464167, y: 82, grade: 'elevated'    },
      { name: '京王多摩センター',  lat: 35.625833, lon: 139.423889, y: 86, grade: 'elevated'    },
      { name: '京王堀之内',       lat: 35.616944, lon: 139.405278, y: 90, grade: 'elevated'    },
      { name: '南大沢',           lat: 35.615278, lon: 139.376389, y: 96, grade: 'elevated'    },
      { name: '多摩境',           lat: 35.608056, lon: 139.352778, y: 98, grade: 'elevated'    },
      { name: '橋本',             lat: 35.594722, lon: 139.344167, y: 92, grade: 'ground'      }
    ],
    via: {},
    depots: [
      { name: '若葉台検車区', lat: 35.620500, lon: 139.490000, tracks: 10, y: 74 }
    ]
  },

  /* ---- 京王高尾線（北野〜高尾山口 全7駅） ---- */
  takao: {
    id: 'takao', name: '京王高尾線', color: 0x2faa3f,
    branchFrom: { line: 'keio', station: '北野' },
    // 0北野 1京王片倉 2山田 3めじろ台 4狭間 5高尾 6高尾山口
    stations: [
      { name: '北野',     lat: 35.660761, lon: 139.361753, y: 96,  grade: 'elevated' },
      { name: '京王片倉', lat: 35.651389, lon: 139.347222, y: 100, grade: 'ground'   },
      { name: '山田',     lat: 35.648611, lon: 139.331944, y: 122, grade: 'elevated' },
      { name: 'めじろ台', lat: 35.640833, lon: 139.319444, y: 138, grade: 'elevated' },
      { name: '狭間',     lat: 35.640556, lon: 139.302500, y: 158, grade: 'elevated' },
      { name: '高尾',     lat: 35.642778, lon: 139.285278, y: 168, grade: 'ground'   },
      { name: '高尾山口', lat: 35.633889, lon: 139.272500, y: 192, grade: 'ground'   }
    ],
    via: {},
    depots: []
  },

  /* ---- 京王新線（新線新宿〜笹塚 全4駅） ---- */
  shin: {
    id: 'shin', name: '京王新線', color: 0xf0a000,
    // 0新線新宿 1初台 2幡ヶ谷 3笹塚
    stations: [
      { name: '新線新宿', lat: 35.689444, lon: 139.699444, y: 12, grade: 'underground' },
      { name: '初台',     lat: 35.682500, lon: 139.686111, y: 16, grade: 'underground' },
      { name: '幡ヶ谷',   lat: 35.677778, lon: 139.674444, y: 18, grade: 'underground' },
      { name: '笹塚',     lat: 35.673229, lon: 139.666473, y: 52, grade: 'elevated'    }
    ],
    via: {},
    depots: []
  },

  /* ---- 井の頭線（渋谷〜吉祥寺 全17駅） ---- */
  inokashira: {
    id: 'inokashira', name: '井の頭線', color: 0x7a3fb0,
    // 0渋谷 1神泉 2駒場東大前 3池ノ上 4下北沢 5新代田 6東松原
    // 7明大前 8永福町 9西永福 10浜田山 11高井戸 12富士見ヶ丘
    // 13久我山 14三鷹台 15井の頭公園 16吉祥寺
    stations: [
      { name: '渋谷',       lat: 35.658871, lon: 139.701238, y: 20, grade: 'elevated'    },
      { name: '神泉',       lat: 35.657500, lon: 139.693889, y: 12, grade: 'underground' },
      { name: '駒場東大前', lat: 35.658611, lon: 139.684722, y: 28, grade: 'ground'      },
      { name: '池ノ上',     lat: 35.661111, lon: 139.672778, y: 30, grade: 'ground'      },
      { name: '下北沢',     lat: 35.661389, lon: 139.668056, y: 30, grade: 'ground'      },
      { name: '新代田',     lat: 35.663611, lon: 139.662222, y: 31, grade: 'ground'      },
      { name: '東松原',     lat: 35.664444, lon: 139.656389, y: 32, grade: 'ground'      },
      { name: '明大前',     lat: 35.668094, lon: 139.649417, y: 40, grade: 'elevated'    },
      { name: '永福町',     lat: 35.676389, lon: 139.640556, y: 38, grade: 'ground'      },
      { name: '西永福',     lat: 35.681111, lon: 139.633056, y: 40, grade: 'ground'      },
      { name: '浜田山',     lat: 35.685278, lon: 139.625278, y: 42, grade: 'ground'      },
      { name: '高井戸',     lat: 35.684167, lon: 139.615278, y: 50, grade: 'elevated'    },
      { name: '富士見ヶ丘', lat: 35.686944, lon: 139.606111, y: 46, grade: 'ground'      },
      { name: '久我山',     lat: 35.689444, lon: 139.598889, y: 48, grade: 'ground'      },
      { name: '三鷹台',     lat: 35.696111, lon: 139.591389, y: 50, grade: 'ground'      },
      { name: '井の頭公園', lat: 35.699167, lon: 139.582778, y: 52, grade: 'ground'      },
      { name: '吉祥寺',     lat: 35.703056, lon: 139.579722, y: 60, grade: 'elevated'    }
    ],
    via: {},
    depots: [
      { name: '富士見ヶ丘検車区', lat: 35.685500, lon: 139.609000, tracks: 8, y: 46 }
    ]
  },

  /* ---- 競馬場線（東府中〜府中競馬正門前 全2駅） ---- */
  keibajo: {
    id: 'keibajo', name: '競馬場線', color: 0x9aa0a6,
    branchFrom: { line: 'keio', station: '東府中' },
    stations: [
      { name: '東府中',       lat: 35.669722, lon: 139.492778, y: 50, grade: 'ground' },
      { name: '府中競馬正門前',lat: 35.663611, lon: 139.493333, y: 48, grade: 'ground' }
    ],
    via: {}, depots: []
  },

  /* ---- 動物園線（高幡不動〜多摩動物公園 全2駅） ---- */
  dobutsuen: {
    id: 'dobutsuen', name: '動物園線', color: 0xff7043,
    branchFrom: { line: 'keio', station: '高幡不動' },
    stations: [
      { name: '高幡不動',   lat: 35.661069, lon: 139.412258, y: 58, grade: 'ground' },
      { name: '多摩動物公園',lat: 35.649722, lon: 139.403056, y: 80, grade: 'ground' }
    ],
    via: {}, depots: []
  }
};

const LINE_ORDER = ['keio','sagamihara','takao','shin','inokashira','keibajo','dobutsuen'];

/* =========================================================================
 * 時刻表データ
 * -------------------------------------------------------------------------
 * segSec: 各駅間の標準所要時間（秒）。stations の隣接ペア順。
 *         実ダイヤの各停所要時間を基準に設定。
 * services: 種別ごとの停車パターン。stops の index は stations[] に対応。
 *
 * 【京王線 種別・停車駅（2023年ダイヤ改正以降の平日標準）】
 *   駅idx: 0新宿 1笹塚 2代田橋 3明大前 4下高井戸 5桜上水 6上北沢 7八幡山
 *          8芦花公園 9千歳烏山 10仙川 11つつじヶ丘 12柴崎 13国領 14布田
 *          15調布 16西調布 17飛田給 18武蔵野台 19多磨霊園 20東府中
 *          21府中 22分倍河原 23中河原 24聖蹟桜ヶ丘 25百草園 26高幡不動
 *          27南平 28平山城址公園 29長沼 30北野 31京王八王子
 *
 *   各停 : 全駅
 *   快速 : 新宿・笹塚・明大前・桜上水・千歳烏山・仙川・つつじヶ丘・
 *          調布以西全駅（代田橋2・下高井戸4・上北沢6・八幡山7・芦花公園8 を通過）
 *          ※快速は調布以西は各駅停車
 *   区急 : 新宿・笹塚・明大前・千歳烏山・つつじヶ丘・調布以西全駅
 *   急行 : 新宿・笹塚・明大前・千歳烏山・調布・府中・分倍河原・
 *          聖蹟桜ヶ丘・高幡不動・北野・京王八王子
 *   特急 : 新宿・明大前・調布・府中・分倍河原・聖蹟桜ヶ丘・
 *          高幡不動・北野・京王八王子
 *   ライナー: 新宿・府中・分倍河原・聖蹟桜ヶ丘・高幡不動・北野・京王八王子
 *             ※夕夜間下りのみ（座席指定）17:00〜23:00
 * ========================================================================= */
const TIMETABLE = {

  /* ── 京王線 ── */
  keio: {
    dwellSec: 30,
    turnSec: 180,
    // 各停の駅間所要時間（31区間：新宿方向→京王八王子方向）
    segSec: [
      120, // 0  新宿-笹塚
      60,  // 1  笹塚-代田橋
      60,  // 2  代田橋-明大前
      60,  // 3  明大前-下高井戸
      60,  // 4  下高井戸-桜上水
      60,  // 5  桜上水-上北沢
      60,  // 6  上北沢-八幡山
      90,  // 7  八幡山-芦花公園
      80,  // 8  芦花公園-千歳烏山
      120, // 9  千歳烏山-仙川
      80,  // 10 仙川-つつじヶ丘
      70,  // 11 つつじヶ丘-柴崎
      80,  // 12 柴崎-国領
      60,  // 13 国領-布田
      70,  // 14 布田-調布
      120, // 15 調布-西調布
      70,  // 16 西調布-飛田給
      90,  // 17 飛田給-武蔵野台
      70,  // 18 武蔵野台-多磨霊園
      80,  // 19 多磨霊園-東府中
      90,  // 20 東府中-府中
      120, // 21 府中-分倍河原
      80,  // 22 分倍河原-中河原
      90,  // 23 中河原-聖蹟桜ヶ丘
      120, // 24 聖蹟桜ヶ丘-百草園
      120, // 25 百草園-高幡不動
      90,  // 26 高幡不動-南平
      80,  // 27 南平-平山城址公園
      90,  // 28 平山城址公園-長沼
      90,  // 29 長沼-北野
      150  // 30 北野-京王八王子
    ],
    headwaySec: 300,
    firstSec: 5 * 3600,
    lastSec:  24 * 3600 + 30 * 60,
    services: [
      {
        // 各駅停車：全32駅停車
        type: '各停', color: 0x888888, stopsAll: true,
        headwaySec: 300
      },
      {
        // 快速：代田橋(2)・下高井戸(4)・上北沢(6)・八幡山(7)・芦花公園(8) 通過、
        //       調布以西は各駅停車
        type: '快速', color: 0x00aa44,
        stops: [0, 1, 3, 5, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
        headwaySec: 600
      },
      {
        // 区間急行：都区内は笹塚・明大前・千歳烏山・仙川・つつじヶ丘、調布以西は各駅
        type: '区急', color: 0xee6600,
        stops: [0, 1, 3, 9, 10, 11, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
        headwaySec: 600
      },
      {
        // 急行：新宿・笹塚・明大前・千歳烏山・つつじヶ丘・調布・府中・分倍河原・
        //       聖蹟桜ヶ丘・高幡不動・北野・京王八王子
        type: '急行', color: 0xff4400,
        stops: [0, 1, 3, 9, 11, 15, 21, 22, 24, 26, 30, 31],
        headwaySec: 600
      },
      {
        // 特急：新宿・明大前・調布・府中・分倍河原・聖蹟桜ヶ丘・
        //       高幡不動・北野・京王八王子
        type: '特急', color: 0xcc0044,
        stops: [0, 3, 15, 21, 22, 24, 26, 30, 31],
        headwaySec: 600
      },
      {
        // 京王ライナー：夕夜間下りのみ（座席指定列車）17:00〜23:00
        // 新宿・府中・分倍河原・聖蹟桜ヶ丘・高幡不動・北野・京王八王子
        type: 'ライナー', color: 0x003399,
        stops: [0, 21, 22, 24, 26, 30, 31],
        headwaySec: 1200,
        firstSec: 17 * 3600,
        lastSec:  23 * 3600
      }
    ]
  },

  /* ── 京王相模原線 ── */
  // 駅idx: 0調布 1京王多摩川 2京王稲田堤 3京王よみうりランド 4稲城
  //        5若葉台 6京王永山 7京王多摩センター 8京王堀之内
  //        9南大沢 10多摩境 11橋本
  sagamihara: {
    dwellSec: 30, turnSec: 150,
    segSec: [90, 90, 120, 90, 90, 120, 180, 120, 120, 120, 90],
    headwaySec: 600,
    firstSec: 5 * 3600, lastSec: 24 * 3600,
    services: [
      { type: '各停', color: 0x888888, stopsAll: true, headwaySec: 600 },
      {
        // 急行：調布・京王稲田堤・京王よみうりランド・稲城・若葉台・京王永山・
        //       京王多摩センター・南大沢・橋本（京王多摩川・京王堀之内・多摩境を通過）
        type: '急行', color: 0xff4400,
        stops: [0, 2, 3, 4, 5, 6, 7, 9, 11],
        headwaySec: 600
      },
      {
        // 特急：調布・京王永山・京王多摩センター・南大沢・橋本
        //       （調布〜京王永山間ノンストップ）
        type: '特急', color: 0xcc0044,
        stops: [0, 6, 7, 9, 11],
        headwaySec: 1200
      }
    ]
  },

  /* ── 京王高尾線 ── */
  // 駅idx: 0北野 1京王片倉 2山田 3めじろ台 4狭間 5高尾 6高尾山口
  takao: {
    dwellSec: 25, turnSec: 150,
    segSec: [90, 120, 120, 120, 120, 90],
    headwaySec: 600,
    firstSec: 5 * 3600, lastSec: 24 * 3600,
    services: [
      { type: '各停', color: 0x2faa3f, stopsAll: true, headwaySec: 600 },
      {
        // 特急：北野・めじろ台・高尾・高尾山口に停車
        type: '特急', color: 0xcc0044,
        stops: [0, 3, 5, 6],
        headwaySec: 600
      }
    ]
  },

  /* ── 京王新線 ── */
  shin: {
    dwellSec: 25, turnSec: 120,
    segSec: [90, 90, 90],
    headwaySec: 480,
    firstSec: 5 * 3600, lastSec: 24 * 3600,
    services: [{ type: '各停', color: 0xf0a000, stopsAll: true }]
  },

  /* ── 井の頭線 ── */
  // 駅idx: 0渋谷 1神泉 2駒場東大前 3池ノ上 4下北沢 5新代田 6東松原
  //        7明大前 8永福町 9西永福 10浜田山 11高井戸 12富士見ヶ丘
  //        13久我山 14三鷹台 15井の頭公園 16吉祥寺
  inokashira: {
    dwellSec: 25, turnSec: 150,
    segSec: [60, 60, 90, 60, 60, 60, 90, 120, 60, 60, 90, 60, 60, 90, 60, 90],
    headwaySec: 300,
    firstSec: 5 * 3600, lastSec: 24 * 3600 + 30 * 60,
    services: [
      { type: '各停', color: 0x7a3fb0, stopsAll: true, headwaySec: 300 },
      {
        // 急行：渋谷・下北沢・明大前・永福町・久我山・吉祥寺
        type: '急行', color: 0xaa44cc,
        stops: [0, 4, 7, 8, 13, 16],
        headwaySec: 600
      }
    ]
  },

  /* ── 競馬場線 ── */
  keibajo: {
    dwellSec: 30, turnSec: 120,
    segSec: [120],
    headwaySec: 1200,
    firstSec: 6 * 3600, lastSec: 23 * 3600,
    services: [{ type: '各停', color: 0x9aa0a6, stopsAll: true }]
  },

  /* ── 動物園線 ── */
  dobutsuen: {
    dwellSec: 30, turnSec: 120,
    segSec: [180],
    headwaySec: 1200,
    firstSec: 6 * 3600, lastSec: 23 * 3600,
    services: [{ type: '各停', color: 0xff7043, stopsAll: true }]
  }
};

/* =========================================================================
 * 線路構成データ
 * -------------------------------------------------------------------------
 * passingStations: 待避線を持つ駅の index（各停が待避し優等が通過）
 *
 * 【京王線 待避可能駅】
 *   笹塚(1)・桜上水(5)・八幡山(7)・千歳烏山(9)・つつじヶ丘(11)・調布(15)・
 *   東府中(20)・府中(21)・高幡不動(26)・北野(30)
 * ========================================================================= */
const TRACKS = {
  keio: {
    type: 'double', gauge: 2.6,
    // 待避線のある駅: 笹塚(1)・桜上水(5)・八幡山(7)・千歳烏山(9)・つつじヶ丘(11)・
    //                調布(15)・東府中(20)・府中(21)・高幡不動(26)・北野(30)
    passingStations: [1, 5, 7, 9, 11, 15, 20, 21, 26, 30]
  },
  sagamihara: {
    type: 'double', gauge: 2.6,
    passingStations: [5, 7]  // 若葉台・京王多摩センター
  },
  takao: {
    type: 'double', gauge: 2.4,
    passingStations: [3]  // めじろ台
  },
  shin: {
    type: 'double', gauge: 2.4,
    passingStations: []
  },
  inokashira: {
    type: 'double', gauge: 2.2,
    passingStations: [8]  // 永福町（待避駅）
  },
  keibajo: {
    type: 'single', gauge: 0,
    passingStations: [], singleStations: [0, 1]
  },
  dobutsuen: {
    type: 'single', gauge: 0,
    passingStations: [], singleStations: [0, 1]
  }
};

window.KEIO_DATA = { LINES, LINE_ORDER, TIMETABLE, TRACKS, geo, SCALE, ELEV_SCALE };
