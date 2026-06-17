import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/**
 * 解析 public/ 下的资源 URL，兼容 localhost 与 GitHub Pages 二级目录。
 * CONFIG 里写相对路径（无 leading slash），如 models/hero.glb
 */
function resolveAssetUrl(relativePath) {
  const normalized = String(relativePath).replace(/^\.?\//, '');
  const base = import.meta.env.BASE_URL || './';
  const baseWithSlash = base.endsWith('/') ? base : `${base}/`;
  return `${baseWithSlash}${normalized}`;
}

function logAssetLoadError(label, requestUrl, error) {
  console.error(`[asset] ${label} 加载失败`, {
    requestUrl,
    pageUrl: window.location.href,
    baseUrl: import.meta.env.BASE_URL,
    error,
  });
}

function loadGltfAsync(loader, relativePath, label = 'gltf') {
  const requestUrl = resolveAssetUrl(relativePath);
  return new Promise((resolve, reject) => {
    loader.load(
      requestUrl,
      (gltf) => resolve(gltf),
      undefined,
      (error) => {
        logAssetLoadError(label, requestUrl, error);
        reject(error);
      }
    );
  });
}

function loadFbxAsync(loader, relativePath, label = 'fbx') {
  const requestUrl = resolveAssetUrl(relativePath);
  return new Promise((resolve, reject) => {
    loader.load(
      requestUrl,
      (object) => resolve(object),
      undefined,
      (error) => {
        logAssetLoadError(label, requestUrl, error);
        reject(error);
      }
    );
  });
}

// ---------------------------------------------------------------------------
// 核心参数（保留原 GitHub 跑酷项目的滚动 / 换道数学）
// ---------------------------------------------------------------------------
const CONFIG = {
  rollingSpeed: 0.006,
  worldRadius: 26,
  heroRadius: 0.2,
  /** 脚站在赛道顶面之上（trackTopY + 0.15） */
  heroBaseY: 0.33,
  trackY: 0,
  lanePlatformHeight: 0.18,
  /** 赛道顶面世界 Y = trackY + lanePlatformHeight */
  trackTopY: 0.18,
  /** 跳跃物理（单位：米·秒制，每帧乘 delta） */
  gravity: 18,
  jumpVelocity: 5.4,
  /** 换道小跳初速度（须明显小于 jumpVelocity） */
  laneHopVelocity: 1.8,
  /** 主角碰撞体（相对脚点，略小于视觉体积） */
  heroStandHitboxHeight: 0.92,
  heroHitboxRadiusX: 0.32,
  heroHitboxRadiusZ: 0.34,
  /** 滑铲后头顶高度，须低于 overheadClearanceBottom */
  heroSlideHitboxHeight: 0.38,
  /** 低空障碍（需跳跃） */
  lowObstacleHeight: 0.36,
  lowObstacleHalfWidth: 0.38,
  lowObstacleHalfDepth: 0.32,
  logRadius: 0.22,
  logLength: 0.78,
  rockWidth: 0.82,
  rockHeight: 0.38,
  rockDepth: 0.72,
  logColor: 0x6b4423,
  logBarkColor: 0x4a2f18,
  rockColor: 0x75756e,
  /** 高空障碍（需滑铲） */
  overheadClearanceBottom: 1.02,
  overheadClearanceTop: 1.52,
  overheadBeamRadius: 0.1,
  overheadSpan: 1.85,
  /** 障碍碰撞盒相对视觉缩小（更宽容） */
  obstacleHitboxScale: 0.82,
  /** 跳跃/滑铲通过判定余量 */
  passMarginGround: 0.1,
  passMarginOverhead: 0.05,
  /** 动作切回跑步的淡入时长（秒） */
  actionCrossFade: 0.18,
  /** 相机高度跟随平滑系数 */
  cameraFollowSmooth: 14,
  branchColor: 0x5c3d1e,
  branchLeafColor: 0x2f6b38,
  mushroomCapColor: 0xc45c48,
  mushroomStemColor: 0xe8dcc8,
  stumpBarkColor: 0x5a4030,
  stumpTopColor: 0x9a7d5c,
  mossGreenColor: 0x3d6b42,
  vineGreenColor: 0x2d5a30,
  /** 已弃用随机比例，改由 nextPathObstacleType 交替刷新 */
  groundObstacleChance: 0.5,
  /** 单条赛道宽度占 laneWidth 的比例（越小三道之间缝越大） */
  laneStripWidthRatio: 0.68,
  leftLane: -1,
  middleLane: 0,
  rightLane: 1,
  /** 三条赛道的横向间距（越大换道越明显） */
  laneWidth: 2.8,
  laneLerpFactor: 22,
  /** 三条平面赛道分段长度 / 数量（贴在滚动球面上） */
  laneSegmentLength: 7,
  laneSegmentCount: 16,
  grassColor: 0x2a6b44,
  dirtColor: 0x9a6b3a,
  /** 森林氛围：光、雾、天空 */
  fogColor: 0x3a5c48,
  fogDensity: 0.028,
  skyColor: 0x6a9f82,
  ambientColor: 0xe0ffe0,
  ambientIntensity: 0.46,
  hemiSkyColor: 0xf0fff0,
  hemiGroundColor: 0x1e3d28,
  hemiIntensity: 0.52,
  /** 路边灌木条带（随赛道滚动） */
  roadsideStripLength: 7,
  roadsideStripCount: 20,
  roadsideXMin: 4.8,
  roadsideXMax: 7.4,
  roadsidePlantPerStrip: 6,
  /** 远景低矮山脊（贴地平线，避免头顶倒挂半球） */
  distantForestLayers: [
    { z: -58, y: 0.35, scaleX: 36, scaleY: 2.8, color: 0x2f6340 },
    { z: -72, y: 0.42, scaleX: 48, scaleY: 3.2, color: 0x285538 },
  ],
  /** 右上方清晨阳光 */
  sunColor: 0xffe8b8,
  sunIntensity: 0.78,
  sunPosition: { x: 18, y: 22, z: 12 },
  fillLightColor: 0xb8dcc0,
  fillLightIntensity: 0.22,
  shadowMapSize: 2048,
  shadowCameraSize: 22,
  shadowSoftness: 4,
  treeSides: 8,
  treeTiers: 6,
  particleCount: 20,
  explosionPowerStart: 1.07,
  /** 主菜单预览用静态模型（Tripo3D hero.glb） */
  menuHeroModelPath: 'models/hero.glb',
  menuHeroRotationY: Math.PI / 2,
  /** 游戏中使用的动画模型 */
  heroAnimatedPath: 'assets/hero_animated.glb',
  /** 静态备用模型 */
  heroModelPath: 'models/hero.glb',
  /** 旧版 FBX 动画备用 */
  heroRunAnimPath: 'models/FastRun.fbx',
  heroJumpAnimPath: 'models/RunningJump.fbx',
  heroSlideAnimPath: 'models/RunningSlide.fbx',
  runAnimTimeScale: 1.2,
  jumpAnimTimeScale: 1.45,
  slideAnimTimeScale: 1.75,
  slideMaxDuration: 1.05,
  jumpCrossFade: 0.18,
  slideCrossFade: 0.18,
  heroTargetHeight: 1.22,
  /** 主角世界坐标：中央赛道、踩在平面跑道顶面 */
  heroPosition: { x: 0, y: 0.33, z: 4.8 },
  trackScrollFactor: 32,
  /** 摄像机：后撤并抬高，保证全身入镜 */
  cameraOffset: { x: 0, y: 4.65, z: 6.9 },
  cameraLookAhead: { y: 1.35, z: -7.5 },
  cameraFov: 60,
  /** 模型默认朝 +X；+90° 后面向 -Z（背对镜头、朝跑道跑） */
  heroModelRotationY: Math.PI / 2,
  /** Mixamo GLB 朝 -Z 奔跑 */
  heroAnimatedRotationY: Math.PI,
  /** Mixamo FBX 备用朝向 */
  heroRunRotationY: Math.PI,
  /** 左 / 中 / 右 三赛道在球面上的角度 */
  pathAngleValues: [1.46, 1.57, 1.68],
  /** 分数：按跑动距离累计（距离 × scorePerDistance） */
  scorePerDistance: 2.5,
  /** 每累计多少分提升一档速度（越小升得越快） */
  scorePerDifficultyStep: 55,
  /** 每档速度加成；约 15 档触顶（见 maxSpeedSteps） */
  speedStepBonus: 0.055,
  /** 速度加成上限：约 1.82×，兼顾难度与人类反应（~250ms 判读 + 换道/跳滑） */
  maxSpeedBonus: 0.82,
  /** 速度最多升多少档，与 maxSpeedBonus 共同封顶 */
  maxSpeedSteps: 15,
  /** 障碍波次间隔（秒）：随分数缩短 */
  spawnIntervalBase: 2.15,
  spawnIntervalMin: 2.0,
  /** 阶段 2 分数门槛（约 1.5–2 分钟） */
  scorePhase2Threshold: 1200,
  /** 阶段 3 时间门槛（秒）：满 4 分钟进入三道高压 */
  phase3TimeSeconds: 240,
  /** 阶段 3 宽障碍（占两道）出现概率 */
  wideObstacleChance: 0.12,
  wideLaneSpan: 1.55,
  /** 赛道数量循环：每 7500 分一轮 3→2→1→3 */
  laneScoreCycle: 7500,
  /** 循环内 >5000 分缩为双赛道，>7000 分缩为单赛道，满 7500 恢复三赛道 */
  laneTwoScoreThreshold: 5000,
  laneOneScoreThreshold: 7000,
  /** 各阶段刷怪间隔 / 概率（速度加成与此独立） */
  phaseSpawnInterval: [2.5, 2.15, 2.0],
  phaseSpawnChance: [0.52, 0.68, 0.82],
  /** 同排多道障碍 Z 对齐微抖动 */
  waveSpawnZJitter: 0.35,
  /** 同赛道相邻障碍最小 Z 间距（跳/滑交替时额外加大，见 getMinOppositeTypeGapZ） */
  minOppositeTypeGapExtra: 18,
  /** 开局适应期（秒），结束后立刻出现第一波障碍 */
  spawnGracePeriod: 3,
  maxTreesInPool: 28,
  obstacleSpawnZMin: -52,
  obstacleSpawnZMax: -30,
  sideTreeCount: 20,
  /** 跳跃纯代码动画（前倾 + 拉伸 / 落地 squash） */
  jumpLeanAngle: 0.28,
  jumpStretch: 0.14,
  jumpSquash: 0.1,
  landingSquashDuration: 0.14,
  /** 下滑：碰撞体与视觉 lowering（与 heroSlideHitboxHeight 对齐） */
  slideDuration: 0.68,
  slideLeanDeg: 34,
  slideSquashY: 0.55,
  slideStretchZ: 1.18,
  slideDropY: 0.22,
  slideExitDuration: 0.06,
  /** 提前按跳跃的缓冲时间（秒） */
  jumpInputBuffer: 0.18,
  /** 背景音乐 */
  bgmPath: 'audio/念张师.mp3',
  bgmVolume: 0.45,
  /** 动作音效 */
  sfxRunPath: 'audio/run-cloth.flac',
  sfxJumpPath: 'audio/jump.wav',
  sfxSlidePath: 'audio/slide.wav',
  sfxRunVolume: 0.55,
  sfxJumpVolume: 0.72,
  sfxSlideVolume: 0.68,
  sfxDeathPath: 'audio/death.mp3',
  sfxStartGamePath: 'audio/start-game.mp3',
  sfxButtonClickPath: 'audio/button-click.mp3',
  sfxCountdownPath: 'audio/countdown.mp3',
  sfxDeathVolume: 0.82,
  sfxStartGameVolume: 0.78,
  sfxButtonClickVolume: 0.68,
  sfxCountdownVolume: 0.75,
  /** 倒计时音效在适应期内播完（0.88 ≈ 3 秒内结束 4.4s 音频） */
  sfxCountdownFinishRatio: 0.88,
  /** 主菜单角色预览自转速度 */
  menuSpinSpeed: 0.008,
  /** 主菜单预览站位（左侧展示区，避免被右侧菜单遮挡） */
  menuHeroPosition: { x: -2.4, y: 0.33, z: 0 },
  /** 菜单预览相机（相对主角，把角色框在画面左侧） */
  menuCameraOffset: { x: 1.45, y: 1.12, z: 3.05 },
  menuCameraLookAt: { x: 0.25, y: 0.95, z: 0 },
  /** 主菜单预览模型略放大，便于看清细节 */
  menuHeroPreviewScale: 1.18,
  /** 菜单时减弱雾效，避免角色被吞没 */
  menuFogDensity: 0.012,
};

/** 跳跃峰值高度 ≈ v²/(2g) */
function getJumpPeakHeight() {
  return (CONFIG.jumpVelocity * CONFIG.jumpVelocity) / (2 * CONFIG.gravity);
}

/** 腾空时间 ≈ 2v/g */
function getJumpAirTime() {
  return (2 * CONFIG.jumpVelocity) / CONFIG.gravity;
}

/** 跳跃期间赛道滚动距离 ≈ scrollSpeed × airTime */
function getJumpTravelDistance() {
  const scrollSpeed =
    CONFIG.rollingSpeed * CONFIG.worldRadius * CONFIG.trackScrollFactor;
  return scrollSpeed * getJumpAirTime();
}

// ---------------------------------------------------------------------------
// 运行时状态
// ---------------------------------------------------------------------------
let sceneWidth;
let sceneHeight;
let camera;
let scene;
let renderer;
let sunLight = null;
let menuPreviewLight = null;
let rollingGroundSphere;
/** @type {THREE.Group} 世界空间三条平面赛道 */
let laneTrackGroup;
/** @type {THREE.Group | null} 两侧滚动灌木 */
let roadsideFoliageGroup = null;
const roadsideLeftStrips = [];
const roadsideRightStrips = [];
/** @type {THREE.Group | null} 远景森林剪影 */
let distantForestGroup = null;
/** @type {THREE.Group} 主角根节点（位置 / 换道 / 跳跃） */
let heroRoot;
/** @type {THREE.Group} 跳跃倾斜与 squash 动画层 */
let heroVisualPivot;
/** @type {THREE.Mesh | null} 加载失败时的占位球 */
let heroPlaceholder = null;
/** @type {THREE.Object3D | null} Tripo3D 英雄模型 */
let heroModel = null;
/** @type {THREE.Object3D | null} 主菜单专用预览模型 */
let menuHeroModel = null;
/** @type {THREE.AnimationClip[]} 主菜单 hero.glb 内嵌动画（无独立游戏模型时备用） */
let menuHeroAnimations = [];
/** @type {{ scene: THREE.Object3D, animations: THREE.AnimationClip[], rotationY: number, extraClips?: object } | null} */
let gameplayHeroCache = null;
let gameplayHeroLoadPromise = null;
/** @type {THREE.AnimationMixer | null} */
let heroMixer = null;
/** @type {THREE.AnimationAction | null} */
let heroRunAction = null;
/** @type {THREE.AnimationAction | null} */
let heroJumpAction = null;
/** @type {THREE.AnimationAction | null} */
let heroSlideAction = null;
let isJumpAnimPlaying = false;
let isSlideAnimPlaying = false;
/** 跳跃动画先结束、人仍在空中时，延迟恢复跑步 */
let pendingRunResume = false;
let heroRollingSpeed;
let currentLane = CONFIG.middleLane;
let clock;
let bounceValue = 0;
let cameraHeightSmoothed = CONFIG.heroBaseY;

let particleGeometry;
let particles;
let explosionPower = CONFIG.explosionPowerStart;

const sphericalHelper = new THREE.Spherical();
const treeWorldPos = new THREE.Vector3();
const treesInPath = [];
const treesPool = [];
const lanePlatforms = [[], [], []];
const laneGapSegments = [[], []];
const LANE_INDICES = [CONFIG.leftLane, CONFIG.middleLane, CONFIG.rightLane];
let treeSpawnTimer = 0;
let score = 0;
let displayScore = 0;
let gameplayElapsed = 0;
let spawnGraceRemaining = CONFIG.spawnGracePeriod;
let hasCollided = false;
let wasAirborne = false;
let landingSquashTimer = 0;
let isSliding = false;
let slideTimer = 0;
/** 滑铲结束后视觉复位过渡（秒） */
let slideRecoveryTimer = 0;
let jumpInputBuffer = 0;
let bgmAudio = null;
let bgmStarted = false;
let sfxRunAudio = null;
let sfxJumpAudio = null;
let sfxSlideAudio = null;
let sfxDeathAudio = null;
let sfxStartGameAudio = null;
let sfxButtonClickAudio = null;
let sfxCountdownAudio = null;
let sfxUnlocked = false;
const AUDIO_SETTINGS_KEY = 'xuefeng-runner-audio';
const audioSettings = {
  bgmEnabled: true,
  sfxEnabled: true,
};
let isPaused = false;
let countdownRemaining = 0;
let menuHeroTemplate = null;
const jumpAnimScale = new THREE.Vector3(1, 1, 1);
const GROUND_EPSILON = 0.02;

/** @type {'MENU'|'PLAYING'|'GAMEOVER'} */
let gameState = 'MENU';
let heroModelBaseRotationY = CONFIG.heroModelRotationY;
let heroModelLoaded = false;

const mainMenuEl = document.getElementById('main-menu');
const startBtnEl = document.getElementById('start-btn');
const hudEl = document.getElementById('hud');
const gameoverPanelEl = document.getElementById('gameover-panel');
const restartBtnEl = document.getElementById('restart-btn');
const scoreHudEl = document.getElementById('score-hud');
const gameoverScoreEl = document.getElementById('gameover-score');
const settingsBtnEl = document.getElementById('settings-btn');
const settingsPanelEl = document.getElementById('settings-panel');
const menuSettingsBtnEl = document.getElementById('menu-settings-btn');
const bgmToggleEl = document.getElementById('bgm-toggle');
const sfxToggleEl = document.getElementById('sfx-toggle');
const settingsRestartBtnEl = document.getElementById('settings-restart-btn');
const settingsExitBtnEl = document.getElementById('settings-exit-btn');
const settingsCloseBtnEl = document.getElementById('settings-close-btn');
const countdownOverlayEl = document.getElementById('countdown-overlay');
const countdownNumberEl = document.getElementById('countdown-number');
const countdownHintEl = document.getElementById('countdown-hint');

/** 分阶段障碍图案：phase0 单道 / phase1 双道 / phase2 三道 */
const OBSTACLE_PATTERNS_BY_PHASE = [
  [
    { lanes: [null, 'ground', null], weight: 1 },
    { lanes: ['ground', null, null], weight: 1 },
    { lanes: [null, null, 'ground'], weight: 1 },
    { lanes: [null, 'overhead', null], weight: 1 },
    { lanes: ['overhead', null, null], weight: 1 },
    { lanes: [null, null, 'overhead'], weight: 1 },
  ],
  [
    { lanes: ['ground', 'ground', null], weight: 1 },
    { lanes: ['ground', null, 'ground'], weight: 1 },
    { lanes: [null, 'ground', 'ground'], weight: 1 },
    { lanes: ['overhead', 'overhead', null], weight: 1 },
    { lanes: ['overhead', null, 'overhead'], weight: 1 },
    { lanes: [null, 'overhead', 'overhead'], weight: 1 },
    { lanes: ['ground', null, 'overhead'], weight: 1.2 },
    { lanes: ['overhead', null, 'ground'], weight: 1.2 },
    { lanes: [null, 'ground', 'overhead'], weight: 1 },
    { lanes: ['ground', 'overhead', null], weight: 1 },
  ],
  [
    { lanes: ['ground', 'overhead', 'ground'], weight: 1.2 },
    { lanes: ['overhead', 'ground', 'overhead'], weight: 1.2 },
    { lanes: ['ground', 'ground', 'overhead'], weight: 1 },
    { lanes: ['overhead', 'ground', 'ground'], weight: 1 },
    { lanes: ['ground', 'overhead', 'overhead'], weight: 1 },
    { lanes: ['overhead', 'overhead', 'ground'], weight: 1 },
  ],
];

const PHASE_LABELS = ['热身', '进阶', '高压'];
const LANE_MODE_LABELS = ['三赛道', '双赛道', '单赛道'];

/** 双赛道模式下当前开放的两道索引（0 左 / 1 中 / 2 右） */
let activeTwoLanePair = [0, 1];
let lastLaneModeStateKey = null;

function isGameActive() {
  return gameState === 'PLAYING';
}

function isGameplayRunning() {
  return gameState === 'PLAYING' && !isPaused && !hasCollided;
}

function loadAudioSettings() {
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (typeof saved.bgmEnabled === 'boolean') {
      audioSettings.bgmEnabled = saved.bgmEnabled;
    }
    if (typeof saved.sfxEnabled === 'boolean') {
      audioSettings.sfxEnabled = saved.sfxEnabled;
    }
  } catch (error) {
    console.warn('[settings] 读取音效设置失败', error);
  }
}

function saveAudioSettings() {
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(audioSettings));
  } catch (error) {
    console.warn('[settings] 保存音效设置失败', error);
  }
}

function isBgmEnabled() {
  return audioSettings.bgmEnabled;
}

function isSfxEnabled() {
  return audioSettings.sfxEnabled;
}

function syncAudioToggleUi() {
  if (bgmToggleEl) bgmToggleEl.checked = isBgmEnabled();
  if (sfxToggleEl) sfxToggleEl.checked = isSfxEnabled();
}

function applyBgmEnabled() {
  if (!bgmAudio) return;
  if (!isBgmEnabled()) {
    bgmAudio.pause();
    return;
  }
  if (!bgmStarted) {
    tryStartBackgroundMusic();
    return;
  }
  bgmAudio.play().catch((error) => {
    console.warn('[bgm] 恢复播放失败', error);
  });
}

function applySfxEnabled() {
  if (!isSfxEnabled()) {
    stopRunSfx();
  } else if (sfxUnlocked && isGameActive() && !hasCollided && !isPaused) {
    startRunSfx();
  }
}

function setBgmEnabled(enabled) {
  audioSettings.bgmEnabled = enabled;
  saveAudioSettings();
  syncAudioToggleUi();
  applyBgmEnabled();
}

function setSfxEnabled(enabled) {
  audioSettings.sfxEnabled = enabled;
  saveAudioSettings();
  syncAudioToggleUi();
  applySfxEnabled();
}

function updateSettingsButtonVisibility() {
  if (!settingsBtnEl) return;
  const show = gameState === 'PLAYING' || gameState === 'GAMEOVER';
  settingsBtnEl.hidden = !show;
}

function updateSettingsPanelActions() {
  const showGameActions = gameState === 'PLAYING' || gameState === 'GAMEOVER';
  if (settingsRestartBtnEl) {
    settingsRestartBtnEl.hidden = !showGameActions;
  }
  if (settingsExitBtnEl) {
    settingsExitBtnEl.hidden = !showGameActions;
  }
  if (settingsCloseBtnEl) {
    settingsCloseBtnEl.textContent =
      gameState === 'PLAYING' && !hasCollided && isPaused ? '继续游戏' : '关闭';
  }
}

function openSettingsPanel() {
  if (!settingsPanelEl) return;
  if (countdownRemaining > 0) return;
  if (gameState === 'MENU') {
    syncAudioToggleUi();
    updateSettingsPanelActions();
    settingsPanelEl.hidden = false;
    settingsPanelEl.classList.add('is-visible');
    return;
  }

  if (gameState !== 'PLAYING' && gameState !== 'GAMEOVER') return;

  if (gameState === 'PLAYING' && !hasCollided) {
    isPaused = true;
    stopRunSfx();
  }

  syncAudioToggleUi();
  updateSettingsPanelActions();
  settingsPanelEl.hidden = false;
  settingsPanelEl.classList.add('is-visible');
}

function closeSettingsPanel(resumeWithCountdown = true) {
  if (!settingsPanelEl) return;
  settingsPanelEl.classList.remove('is-visible');
  settingsPanelEl.hidden = true;

  if (gameState === 'PLAYING' && !hasCollided) {
    if (resumeWithCountdown) {
      startAdaptationCountdown();
    } else {
      isPaused = false;
      unlockGameAudio();
    }
  }
}

function toggleSettingsPanel() {
  if (settingsPanelEl?.classList.contains('is-visible')) {
    closeSettingsPanel();
  } else {
    openSettingsPanel();
  }
}

function setupSettingsUi() {
  syncAudioToggleUi();
  updateSettingsButtonVisibility();

  settingsBtnEl?.addEventListener('click', () => {
    playUiButtonSfx();
    openSettingsPanel();
  });
  menuSettingsBtnEl?.addEventListener('click', () => {
    playUiButtonSfx();
    openSettingsPanel();
  });
  settingsCloseBtnEl?.addEventListener('click', () => {
    playUiButtonSfx();
    closeSettingsPanel();
  });

  settingsRestartBtnEl?.addEventListener('click', () => {
    playUiButtonSfx();
    closeSettingsPanel(false);
    if (gameState === 'GAMEOVER' || gameState === 'PLAYING') {
      resetGame();
    }
  });

  settingsExitBtnEl?.addEventListener('click', () => {
    playUiButtonSfx();
    closeSettingsPanel(false);
    if (gameState !== 'MENU') {
      returnToMainMenu();
    }
  });

  bgmToggleEl?.addEventListener('change', (event) => {
    setBgmEnabled(event.target.checked);
  });

  sfxToggleEl?.addEventListener('change', (event) => {
    setSfxEnabled(event.target.checked);
  });

  settingsPanelEl?.addEventListener('click', (event) => {
    if (event.target === settingsPanelEl) {
      closeSettingsPanel();
    }
  });
}

function resetHeroToMenuPreview() {
  heroMixer = null;
  heroRunAction = null;
  heroJumpAction = null;
  heroSlideAction = null;
  isJumpAnimPlaying = false;
  isSlideAnimPlaying = false;
  pendingRunResume = false;
  resetHeroActionState();
  resetSlideVisualPivotImmediate();
  pinHeroToGround();

  if (menuHeroTemplate) {
    mountMenuHeroModel(menuHeroTemplate);
  } else {
    loadMenuHeroModel().catch(console.error);
  }
  applyMenuPreviewLayout();
}

function returnToMainMenu() {
  isPaused = false;
  countdownRemaining = 0;
  hideCountdownHud();
  hasCollided = false;
  hideGameOverPanel();
  stopRunSfx();

  for (const tree of [...treesInPath]) {
    recycleTree(tree);
  }
  purgeTreesNearHero();

  treeSpawnTimer = 0;
  score = 0;
  displayScore = 0;
  gameplayElapsed = 0;
  bounceValue = 0;
  jumpInputBuffer = 0;
  spawnGraceRemaining = CONFIG.spawnGracePeriod;

  gameState = 'MENU';

  if (mainMenuEl) {
    mainMenuEl.classList.remove('is-hidden');
  }
  if (hudEl) {
    hudEl.classList.add('hud--menu');
  }
  if (startBtnEl) {
    startBtnEl.disabled = !heroModelLoaded;
    startBtnEl.textContent = '开始游戏';
  }

  resetHeroToMenuPreview();
  resetLaneModeState();
  updateSettingsButtonVisibility();
  updateScoreHud();
  setModelStatus('角色预览就绪 · 点击开始游戏');
}

function getScorePhase() {
  if (gameplayElapsed >= CONFIG.phase3TimeSeconds) return 2;
  if (displayScore >= CONFIG.scorePhase2Threshold) return 1;
  return 0;
}

function getLaneCyclePosition() {
  return displayScore % CONFIG.laneScoreCycle;
}

/** @returns {3|2|1} 当前开放赛道条数 */
function getActiveLaneMode() {
  const pos = getLaneCyclePosition();
  if (pos <= CONFIG.laneTwoScoreThreshold) return 3;
  if (pos <= CONFIG.laneOneScoreThreshold) return 2;
  return 1;
}

function getActiveLaneIndices() {
  const mode = getActiveLaneMode();
  if (mode === 3) return [0, 1, 2];
  if (mode === 1) return [1];
  return activeTwoLanePair;
}

function isLaneIndexActive(laneIndex) {
  return getActiveLaneIndices().includes(laneIndex);
}

function canSwitchToLane(lane) {
  const activeValues = getActiveLaneIndices().map((i) => LANE_INDICES[i]);
  return activeValues.includes(lane);
}

function snapHeroToActiveLane() {
  if (canSwitchToLane(currentLane)) return;
  const indices = getActiveLaneIndices();
  currentLane = LANE_INDICES[indices[Math.floor(indices.length / 2)]];
}

function getLaneModeLabel() {
  const mode = getActiveLaneMode();
  return LANE_MODE_LABELS[mode === 3 ? 0 : mode === 2 ? 1 : 2];
}

function onActiveLaneModeChanged(mode) {
  if (mode === 2) {
    activeTwoLanePair = Math.random() < 0.5 ? [0, 1] : [1, 2];
  }
  recycleObstaclesOnInactiveLanes();
}

function recycleObstaclesOnInactiveLanes() {
  const active = new Set(getActiveLaneIndices());
  for (const tree of [...treesInPath]) {
    if (!tree.visible || !tree.userData.isObstacle) continue;
    if (!active.has(getLaneIndexFromX(tree.position.x))) {
      recycleTree(tree);
    }
  }
}

function updateLanePlatformVisibility() {
  const mode = getActiveLaneMode();

  if (lastLaneModeStateKey !== null) {
    const prevMode = Number(lastLaneModeStateKey.split(':')[0]);
    if (prevMode !== mode) {
      onActiveLaneModeChanged(mode);
    }
  }

  const indices = getActiveLaneIndices();
  const stateKey = `${mode}:${indices.join(',')}`;
  if (lastLaneModeStateKey === stateKey) return;
  lastLaneModeStateKey = stateKey;
  snapHeroToActiveLane();

  const activeSet = new Set(indices);
  for (let li = 0; li < 3; li += 1) {
    const visible = activeSet.has(li);
    for (const segment of lanePlatforms[li]) {
      segment.visible = visible;
    }
  }

  const showGapLeft = activeSet.has(0) && activeSet.has(1);
  const showGapRight = activeSet.has(1) && activeSet.has(2);
  for (const gap of laneGapSegments[0]) {
    gap.visible = showGapLeft;
  }
  for (const gap of laneGapSegments[1]) {
    gap.visible = showGapRight;
  }
}

function resetLaneModeState() {
  activeTwoLanePair = [0, 1];
  lastLaneModeStateKey = null;
  updateLanePlatformVisibility();
}

function getPhaseLabel() {
  return PHASE_LABELS[getScorePhase()] ?? PHASE_LABELS[0];
}

function getDifficultySteps() {
  return Math.floor(score / CONFIG.scorePerDifficultyStep);
}

function getEffectiveDifficultySteps() {
  return Math.min(CONFIG.maxSpeedSteps, getDifficultySteps());
}

function getDifficultyLevel() {
  return getEffectiveDifficultySteps();
}

function getSpeedBonus() {
  return Math.min(
    CONFIG.maxSpeedBonus,
    getEffectiveDifficultySteps() * CONFIG.speedStepBonus
  );
}

function isSpeedAtMax() {
  return getSpeedBonus() >= CONFIG.maxSpeedBonus - 0.0001;
}

function getScrollSpeedMultiplier() {
  if (gameState !== 'PLAYING') return 0;
  return 1 + getSpeedBonus();
}

function getSpawnInterval() {
  const phase = getScorePhase();
  const phaseBase = CONFIG.phaseSpawnInterval[phase] ?? CONFIG.spawnIntervalBase;
  const t = Math.min(1, getEffectiveDifficultySteps() / CONFIG.maxSpeedSteps) * 0.12;
  return THREE.MathUtils.lerp(phaseBase, CONFIG.spawnIntervalMin, t);
}

function getSpawnChance() {
  const phase = getScorePhase();
  return CONFIG.phaseSpawnChance[phase] ?? 0.6;
}

/** 适应期结束后下一帧即刷出第一波障碍 */
function primeObstacleSpawnTimer() {
  treeSpawnTimer = getSpawnInterval();
}

function updateCountdownHud() {
  if (!countdownOverlayEl || !countdownNumberEl) return;

  if (countdownRemaining <= 0) {
    countdownOverlayEl.hidden = true;
    return;
  }

  countdownOverlayEl.hidden = false;
  const secondsLeft = Math.ceil(countdownRemaining);
  countdownNumberEl.textContent = secondsLeft > 0 ? String(secondsLeft) : '开始';
  if (countdownHintEl) {
    countdownHintEl.textContent = secondsLeft > 0 ? '准备开始' : '跑！';
  }
}

function hideCountdownHud() {
  if (countdownOverlayEl) {
    countdownOverlayEl.hidden = true;
  }
  stopCountdownSfx();
}

function startAdaptationCountdown() {
  countdownRemaining = CONFIG.spawnGracePeriod;
  spawnGraceRemaining = CONFIG.spawnGracePeriod;
  primeObstacleSpawnTimer();
  isPaused = true;
  stopRunSfx();
  pinHeroToGround();
  resetSlideVisualPivotImmediate();
  lockHeroModelToGround();
  compensateHeroFootSink();
  updateCountdownHud();
  unlockGameAudio();
  playCountdownSfx();
  setModelStatus('准备开始…');
}

function updateAdaptationCountdown(delta) {
  if (countdownRemaining <= 0) return;

  countdownRemaining -= delta;
  spawnGraceRemaining -= delta;
  updateCountdownHud();

  if (countdownRemaining > 0) return;

  countdownRemaining = 0;
  spawnGraceRemaining = Math.max(0, spawnGraceRemaining);
  isPaused = false;
  hideCountdownHud();
  unlockGameAudio();
  setModelStatus('游戏进行中');
}

function updateScoreHud() {
  if (!scoreHudEl) return;
  if (gameState !== 'PLAYING') {
    scoreHudEl.hidden = true;
    return;
  }
  scoreHudEl.hidden = false;
  const speedPct = Math.round(getSpeedBonus() * 100);
  const phaseLabel = getPhaseLabel();
  const laneLabel = getLaneModeLabel();
  const speedText =
    speedPct > 0
      ? isSpeedAtMax()
        ? `　速度 MAX (+${speedPct}%)`
        : `　速度 +${speedPct}%`
      : '';
  scoreHudEl.textContent = `分数 ${displayScore}　${laneLabel}　${phaseLabel}${speedText}`;
}

function updateScore(delta) {
  if (!isGameplayRunning()) return;
  gameplayElapsed += delta;
  score += getTrackScrollSpeed(delta) * CONFIG.scorePerDistance;
  displayScore = Math.floor(score);
  updateLanePlatformVisibility();
  updateScoreHud();
}

function pickObstacleWavePattern() {
  const phase = getScorePhase();
  const pool = OBSTACLE_PATTERNS_BY_PHASE[phase] ?? OBSTACLE_PATTERNS_BY_PHASE[0];
  let pick = Math.random() * pool.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of pool) {
    pick -= entry.weight;
    if (pick <= 0) return maskLanesToActive(entry.lanes);
  }
  return maskLanesToActive(pool[0].lanes);
}

/** 只保留当前开放赛道上的障碍位 */
function maskLanesToActive(lanes) {
  return lanes.map((type, laneIndex) =>
    isLaneIndexActive(laneIndex) ? type : null
  );
}

function spawnSingleActiveLaneWave() {
  const laneIndex = getActiveLaneIndices()[0];
  const baseZ =
    CONFIG.obstacleSpawnZMin +
    Math.random() * (CONFIG.obstacleSpawnZMax - CONFIG.obstacleSpawnZMin);
  const obstacleType = Math.random() < 0.5 ? 'ground' : 'overhead';
  const z = resolveFairSpawnZ(
    laneIndex,
    obstacleType,
    baseZ + (Math.random() - 0.5) * CONFIG.waveSpawnZJitter
  );
  if (z !== null) spawnPathObstacle(laneIndex, obstacleType, z);
}

function spawnDualActiveLaneWave() {
  const laneIndices = getActiveLaneIndices();
  const baseZ =
    CONFIG.obstacleSpawnZMin +
    Math.random() * (CONFIG.obstacleSpawnZMax - CONFIG.obstacleSpawnZMin);

  const types = laneIndices.map(() =>
    Math.random() < 0.5 ? 'ground' : 'overhead'
  );
  const mixedWave = types[0] !== types[1];
  const mixedWaveStagger = mixedWave ? getMinOppositeTypeGapZ() * 0.5 : 0;

  for (let i = 0; i < laneIndices.length; i += 1) {
    const laneIndex = laneIndices[i];
    const obstacleType = types[i];
    let preferredZ =
      baseZ + (Math.random() - 0.5) * CONFIG.waveSpawnZJitter;
    if (mixedWave) {
      preferredZ =
        obstacleType === 'overhead'
          ? baseZ + CONFIG.waveSpawnZJitter * 0.15
          : baseZ - mixedWaveStagger;
    }
    const z = resolveFairSpawnZ(laneIndex, obstacleType, preferredZ);
    if (z !== null) spawnPathObstacle(laneIndex, obstacleType, z);
  }
}

function isHeroGrounded() {
  return heroRoot.position.y <= CONFIG.heroBaseY + GROUND_EPSILON;
}

/** 换道用：是否处于任意腾空（含换道小跳） */
function isHeroAirborne() {
  return (
    !isSlideLocked() &&
    (bounceValue > CONFIG.laneHopVelocity * 0.55 ||
      heroRoot.position.y > CONFIG.heroBaseY + 0.12)
  );
}

/** 是否处于大跳腾空（换道小跳不算，避免换道后无法立刻跳跃） */
function isMainJumpAirborne() {
  return (
    bounceValue >= CONFIG.jumpVelocity * 0.35 ||
    heroRoot.position.y > CONFIG.heroBaseY + 0.45
  );
}

/** 是否处于需要禁止跳跃/下滑的腾空（忽略跑步 idle 小弹跳与换道小跳） */
function isHeroInActionAir() {
  if (isSlideLocked()) return false;
  return isMainJumpAirborne();
}

function isSlideLocked() {
  return isSliding || slideRecoveryTimer > 0;
}

function canJump() {
  return !isSlideLocked() && !isSlideAnimPlaying && !isHeroInActionAir();
}

function canSlide() {
  return !isSlideLocked() && !isSlideAnimPlaying && !isHeroInActionAir();
}

function resetSlideVisualPivotImmediate() {
  if (!heroVisualPivot) return;
  heroVisualPivot.rotation.x = 0;
  heroVisualPivot.rotation.z = 0;
  heroVisualPivot.position.y = 0;
  heroVisualPivot.scale.set(1, 1, 1);
}

function pinHeroToGround() {
  if (!heroRoot) return;
  heroRoot.position.y = CONFIG.heroBaseY;
  bounceValue = 0;
}

/** 剥离动画根运动后，把模型脚点锁回地面基准 */
function lockHeroModelToGround() {
  if (!heroModel?.userData?.groundLockPosition) return;
  const lock = heroModel.userData.groundLockPosition;
  heroModel.position.set(lock.x, lock.y, lock.z);
}

/** 跑步动画会把骨骼往下压，按脚底世界高度补偿，避免穿进赛道 */
function compensateHeroFootSink() {
  if (!heroModel?.userData?.groundLockPosition || !heroRoot) return;

  lockHeroModelToGround();
  const box = measureHeroModelBox(heroModel);
  const lift = heroRoot.position.y - box.min.y;
  if (lift > 0.001) {
    heroModel.position.y += lift;
  }
}

function finalizeHeroGroundFit() {
  if (!heroModel) return;
  if (heroMixer && heroRunAction) {
    heroMixer.update(0);
  }
  compensateHeroFootSink();
  if (heroModel.userData.groundLockPosition) {
    heroModel.userData.groundLockPosition = heroModel.position.clone();
  }
}

/** 滑铲视觉：只动 pivot，不动 heroRoot / heroModel 的 Y */
function applySlideVisualPose(blend = 1) {
  if (!heroVisualPivot) return;

  heroVisualPivot.rotation.x = THREE.MathUtils.degToRad(CONFIG.slideLeanDeg) * blend;
  heroVisualPivot.scale.set(
    THREE.MathUtils.lerp(1, 1.08, blend),
    THREE.MathUtils.lerp(1, CONFIG.slideSquashY, blend),
    THREE.MathUtils.lerp(1, CONFIG.slideStretchZ, blend)
  );
  heroVisualPivot.position.y = -CONFIG.slideDropY * blend;
}

/** 滑铲结束后平滑复位旋转/缩放/局部 Y，避免瞬间弹起 */
function updateSlideRecovery(delta) {
  if (slideRecoveryTimer <= 0) return false;

  slideRecoveryTimer -= delta;
  pinHeroToGround();

  if (!heroVisualPivot) {
    if (slideRecoveryTimer <= 0) {
      slideRecoveryTimer = 0;
    }
    return slideRecoveryTimer > 0;
  }

  const smooth = 1 - Math.exp(-22 * delta);
  heroVisualPivot.rotation.x = THREE.MathUtils.lerp(heroVisualPivot.rotation.x, 0, smooth);
  heroVisualPivot.position.y = THREE.MathUtils.lerp(heroVisualPivot.position.y, 0, smooth);
  heroVisualPivot.scale.x = THREE.MathUtils.lerp(heroVisualPivot.scale.x, 1, smooth);
  heroVisualPivot.scale.y = THREE.MathUtils.lerp(heroVisualPivot.scale.y, 1, smooth);
  heroVisualPivot.scale.z = THREE.MathUtils.lerp(heroVisualPivot.scale.z, 1, smooth);

  if (slideRecoveryTimer <= 0) {
    slideRecoveryTimer = 0;
    resetSlideVisualPivotImmediate();
  }

  return true;
}

function resetHeroActionState() {
  wasAirborne = false;
  landingSquashTimer = 0;
  isSliding = false;
  slideTimer = 0;
  slideRecoveryTimer = 0;
  isJumpAnimPlaying = false;
  isSlideAnimPlaying = false;
  pendingRunResume = false;
  resumeHeroRunAnimation();
  pinHeroToGround();
  resetSlideVisualPivotImmediate();
  if (heroVisualPivot) {
    heroVisualPivot.rotation.set(0, heroVisualPivot.rotation.y, 0);
  }
}

function hasSkeletalJumpAnim() {
  return heroJumpAction != null;
}

function hasSkeletalAnim() {
  return heroRunAction != null;
}

function hasSkeletalSlideAnim() {
  return heroSlideAction != null;
}

function getSlideAnimDuration() {
  if (!heroSlideAction) return CONFIG.slideDuration;
  const raw = heroSlideAction.getClip().duration / CONFIG.slideAnimTimeScale;
  return Math.min(raw, CONFIG.slideMaxDuration);
}

function applySlidePoseImmediate() {
  applySlideVisualPose(1);
}

function applyJumpPoseImmediate() {
  if (!heroVisualPivot) return;

  heroVisualPivot.rotation.x = CONFIG.jumpLeanAngle * 0.55;
  heroVisualPivot.scale.set(
    1 - CONFIG.jumpSquash * 0.35,
    1 + CONFIG.jumpStretch * 0.35,
    1 - CONFIG.jumpSquash * 0.35
  );
}

function startMainJump() {
  if (!canJump()) return false;

  bounceValue = CONFIG.jumpVelocity;
  applyJumpPoseImmediate();
  if (hasSkeletalJumpAnim()) {
    playHeroJumpAnimation();
  }
  playJumpSfx();
  return true;
}

function queueJumpInput() {
  if (startMainJump()) return;
  jumpInputBuffer = CONFIG.jumpInputBuffer;
}

function updateJumpInputBuffer(delta) {
  if (jumpInputBuffer <= 0) return;
  jumpInputBuffer -= delta;
  if (startMainJump()) {
    jumpInputBuffer = 0;
  }
}

function startSlide() {
  if (!heroVisualPivot || !canSlide()) return;

  slideRecoveryTimer = 0;
  pinHeroToGround();
  isSliding = true;
  wasAirborne = false;
  landingSquashTimer = 0;
  isJumpAnimPlaying = false;
  heroJumpAction?.setEffectiveWeight(0);

  if (hasSkeletalSlideAnim() && playHeroSlideAnimation()) {
    applySlidePoseImmediate();
    slideTimer = getSlideAnimDuration();
  } else {
    applySlidePoseImmediate();
    slideTimer = CONFIG.slideDuration;
  }
  playSlideSfx();
}

function laneToX(lane) {
  return lane * CONFIG.laneWidth;
}

const container = document.getElementById('game-container');
const modelStatusEl = document.getElementById('model-status');

function setModelStatus(message, isError = false) {
  if (!modelStatusEl) return;
  modelStatusEl.textContent = message;
  modelStatusEl.style.color = isError ? '#ff8a80' : '#a5d6a7';
}

function markHeroModelReady(message = '角色预览就绪 · 点击开始游戏') {
  heroModelLoaded = true;
  if (gameState === 'MENU') {
    setModelStatus(message);
    if (startBtnEl) {
      startBtnEl.disabled = false;
      startBtnEl.textContent = '开始游戏';
    }
  }
}

function setupMainMenu() {
  if (startBtnEl) {
    startBtnEl.disabled = true;
    startBtnEl.addEventListener('click', () => startGame());
  }

  if (restartBtnEl) {
    restartBtnEl.addEventListener('click', () => {
      playUiButtonSfx();
      resetGame();
    });
  }

  if (hudEl) {
    hudEl.classList.add('hud--menu');
  }

  setupSettingsUi();
}

function onBgmUnlockAttempt() {
  tryStartBackgroundMusic();
  unlockGameAudio();
}

function tryStartBackgroundMusic() {
  if (!isBgmEnabled() || bgmStarted || !bgmAudio) return;

  bgmAudio
    .play()
    .then(() => {
      bgmStarted = true;
      window.removeEventListener('pointerdown', onBgmUnlockAttempt);
      window.removeEventListener('keydown', onBgmUnlockAttempt);
      window.removeEventListener('click', onBgmUnlockAttempt);
    })
    .catch((error) => {
      console.warn('[bgm] 播放失败', error);
    });
}

function playOneShotSfx(audio) {
  if (!audio || !sfxUnlocked || !isSfxEnabled()) return;
  audio.currentTime = 0;
  audio.play().catch((error) => {
    console.warn('[sfx] 播放失败', error);
  });
}

function playJumpSfx() {
  playOneShotSfx(sfxJumpAudio);
}

function playSlideSfx() {
  playOneShotSfx(sfxSlideAudio);
}

function playDeathSfx() {
  playOneShotSfx(sfxDeathAudio);
}

function playStartGameSfx() {
  unlockGameAudio();
  playOneShotSfx(sfxStartGameAudio);
}

function playUiButtonSfx() {
  unlockGameAudio();
  playOneShotSfx(sfxButtonClickAudio);
}

function playCountdownSfx() {
  if (!sfxCountdownAudio || !isSfxEnabled()) return;
  unlockGameAudio();

  const duration = sfxCountdownAudio.duration;
  const targetSeconds = CONFIG.spawnGracePeriod * CONFIG.sfxCountdownFinishRatio;
  if (Number.isFinite(duration) && duration > 0 && targetSeconds > 0) {
    sfxCountdownAudio.playbackRate = THREE.MathUtils.clamp(
      duration / targetSeconds,
      1.2,
      2.4
    );
  } else {
    sfxCountdownAudio.playbackRate = 1.65;
  }

  sfxCountdownAudio.pause();
  sfxCountdownAudio.currentTime = 0;
  sfxCountdownAudio.play().catch((error) => {
    console.warn('[sfx] 倒计时音效播放失败', error);
  });
}

function stopCountdownSfx() {
  if (!sfxCountdownAudio) return;
  sfxCountdownAudio.pause();
  sfxCountdownAudio.currentTime = 0;
  sfxCountdownAudio.playbackRate = 1;
}

function startRunSfx() {
  if (
    !sfxRunAudio ||
    !sfxUnlocked ||
    !isSfxEnabled() ||
    !isGameActive() ||
    hasCollided ||
    isPaused
  ) {
    return;
  }
  sfxRunAudio.play().catch((error) => {
    console.warn('[sfx] 跑步音效播放失败', error);
  });
}

function stopRunSfx() {
  if (!sfxRunAudio) return;
  if (!sfxRunAudio.paused) {
    sfxRunAudio.pause();
  }
  sfxRunAudio.currentTime = 0;
}

function updateRunSfx() {
  if (!sfxRunAudio || !sfxUnlocked || !isSfxEnabled()) return;

  const shouldPlay = isGameplayRunning();
  if (!shouldPlay) {
    if (isPaused || hasCollided || gameState !== 'PLAYING') {
      stopRunSfx();
    }
    return;
  }

  const speedRate = 0.9 + getSpeedBonus() * 0.65;
  sfxRunAudio.playbackRate = THREE.MathUtils.clamp(speedRate, 0.9, 1.55);
  sfxRunAudio.volume = isSliding
    ? CONFIG.sfxRunVolume * 0.3
    : CONFIG.sfxRunVolume;

  if (sfxRunAudio.paused) {
    startRunSfx();
  }
}

function unlockGameAudio() {
  if (sfxUnlocked) {
    applyBgmEnabled();
    applySfxEnabled();
    return;
  }
  sfxUnlocked = true;
  applyBgmEnabled();
  if (isSfxEnabled() && isGameplayRunning()) {
    startRunSfx();
  }
}

/** 进入主菜单即尝试播放；若浏览器拦截则首次点击/按键后启动 */
function setupBackgroundMusic() {
  bgmAudio = new Audio(resolveAssetUrl(CONFIG.bgmPath));
  bgmAudio.loop = true;
  bgmAudio.volume = CONFIG.bgmVolume;
  bgmAudio.preload = 'auto';

  sfxRunAudio = new Audio(resolveAssetUrl(CONFIG.sfxRunPath));
  sfxRunAudio.loop = true;
  sfxRunAudio.volume = CONFIG.sfxRunVolume;
  sfxRunAudio.preload = 'auto';

  sfxJumpAudio = new Audio(resolveAssetUrl(CONFIG.sfxJumpPath));
  sfxJumpAudio.volume = CONFIG.sfxJumpVolume;
  sfxJumpAudio.preload = 'auto';

  sfxSlideAudio = new Audio(resolveAssetUrl(CONFIG.sfxSlidePath));
  sfxSlideAudio.volume = CONFIG.sfxSlideVolume;
  sfxSlideAudio.preload = 'auto';

  sfxDeathAudio = new Audio(resolveAssetUrl(CONFIG.sfxDeathPath));
  sfxDeathAudio.volume = CONFIG.sfxDeathVolume;
  sfxDeathAudio.preload = 'auto';

  sfxStartGameAudio = new Audio(resolveAssetUrl(CONFIG.sfxStartGamePath));
  sfxStartGameAudio.volume = CONFIG.sfxStartGameVolume;
  sfxStartGameAudio.preload = 'auto';

  sfxButtonClickAudio = new Audio(resolveAssetUrl(CONFIG.sfxButtonClickPath));
  sfxButtonClickAudio.volume = CONFIG.sfxButtonClickVolume;
  sfxButtonClickAudio.preload = 'auto';

  sfxCountdownAudio = new Audio(resolveAssetUrl(CONFIG.sfxCountdownPath));
  sfxCountdownAudio.volume = CONFIG.sfxCountdownVolume;
  sfxCountdownAudio.preload = 'auto';

  window.addEventListener('pointerdown', onBgmUnlockAttempt);
  window.addEventListener('keydown', onBgmUnlockAttempt);
  window.addEventListener('click', onBgmUnlockAttempt);

  tryStartBackgroundMusic();
}

function applyMenuPreviewLayout() {
  if (!heroRoot) return;

  heroRoot.position.set(
    CONFIG.menuHeroPosition.x,
    CONFIG.menuHeroPosition.y,
    CONFIG.menuHeroPosition.z
  );
  heroRoot.rotation.z = 0;

  if (scene?.fog) {
    scene.fog.density = CONFIG.menuFogDensity;
  }

  if (!menuPreviewLight) {
    menuPreviewLight = new THREE.PointLight(0xfff4e0, 1.35, 18, 1.4);
    scene.add(menuPreviewLight);
  }
}

function restoreGameplayHeroLayout() {
  if (!heroRoot) return;

  heroRoot.position.set(
    CONFIG.heroPosition.x,
    CONFIG.heroPosition.y,
    CONFIG.heroPosition.z
  );

  if (scene?.fog) {
    scene.fog.density = CONFIG.fogDensity;
  }

  if (menuPreviewLight) {
    scene.remove(menuPreviewLight);
    menuPreviewLight = null;
  }
}

function updateMenuPreviewLight() {
  if (!menuPreviewLight || !heroRoot) return;

  menuPreviewLight.position.set(
    heroRoot.position.x + CONFIG.menuCameraOffset.x,
    heroRoot.position.y + CONFIG.menuCameraOffset.y,
    heroRoot.position.z + CONFIG.menuCameraOffset.z
  );
}

function startGame() {
  if (gameState !== 'MENU' || !heroModelLoaded) return;

  playStartGameSfx();

  if (startBtnEl) {
    startBtnEl.disabled = true;
    startBtnEl.textContent = '加载中…';
  }

  gameState = 'PLAYING';
  isPaused = false;

  if (mainMenuEl) {
    mainMenuEl.classList.add('is-hidden');
  }
  if (hudEl) {
    hudEl.classList.remove('hud--menu');
  }
  updateSettingsButtonVisibility();

  swapToGameplayHero()
    .then(() => {
      restoreGameplayHeroLayout();
      if (heroVisualPivot) {
        heroVisualPivot.rotation.set(0, 0, 0);
        heroVisualPivot.position.y = 0;
        heroVisualPivot.scale.set(1, 1, 1);
      }
      heroRoot.rotation.z = 0;
      resetHeroActionState();
      resumeHeroRunAnimation();
      finalizeHeroGroundFit();
      startAdaptationCountdown();
      score = 0;
      displayScore = 0;
      gameplayElapsed = 0;
      resetLaneModeState();
      updateScoreHud();
      bounceValue = 0;
      cameraHeightSmoothed = CONFIG.heroBaseY;
      tryStartBackgroundMusic();
      unlockGameAudio();
    })
    .catch((error) => {
      console.error('[hero] 切换游戏模型失败', error);
      setModelStatus('游戏模型加载失败', true);
      gameState = 'MENU';
      if (mainMenuEl) mainMenuEl.classList.remove('is-hidden');
      if (hudEl) hudEl.classList.add('hud--menu');
      if (startBtnEl) {
        startBtnEl.disabled = false;
        startBtnEl.textContent = '开始游戏';
      }
    });
}

function updateMenuPreview() {
  const previewModel = menuHeroModel || heroModel;
  if (previewModel) {
    previewModel.rotation.y += CONFIG.menuSpinSpeed;
  } else if (heroVisualPivot) {
    heroVisualPivot.rotation.y += CONFIG.menuSpinSpeed;
  }
}

function updateCameraMenuPreview() {
  camera.position.set(
    heroRoot.position.x + CONFIG.menuCameraOffset.x,
    heroRoot.position.y + CONFIG.menuCameraOffset.y,
    heroRoot.position.z + CONFIG.menuCameraOffset.z
  );
  camera.lookAt(
    heroRoot.position.x + CONFIG.menuCameraLookAt.x,
    heroRoot.position.y + CONFIG.menuCameraLookAt.y,
    heroRoot.position.z + CONFIG.menuCameraLookAt.z
  );
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------
function init() {
  createScene();
  animate();
}

function createScene() {
  sceneWidth = window.innerWidth;
  sceneHeight = window.innerHeight;

  clock = new THREE.Clock();
  heroRollingSpeed = (CONFIG.rollingSpeed * CONFIG.worldRadius / CONFIG.heroRadius) / 5;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.skyColor);
  scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity);

  camera = new THREE.PerspectiveCamera(CONFIG.cameraFov, sceneWidth / sceneHeight, 0.1, 1000);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setClearColor(CONFIG.skyColor, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setSize(sceneWidth, sceneHeight);
  container.appendChild(renderer.domElement);

  addWorld();
  addHero();
  applyMenuPreviewLayout();
  addLight();
  addExplosion();
  setupCamera();
  loadAudioSettings();
  setupBackgroundMusic();

  window.addEventListener('resize', onWindowResize);
  window.addEventListener('keydown', handleKeyDown);
  setupMainMenu();

  loadMenuHeroModel().catch(console.error);
  preloadGameplayHero().catch(console.error);
  purgeTreesNearHero();
  console.info('[physics] 跳跃', {
    peak: getJumpPeakHeight().toFixed(2),
    airTime: getJumpAirTime().toFixed(2),
    travel: getJumpTravelDistance().toFixed(2),
    groundTop: (CONFIG.trackTopY + CONFIG.lowObstacleHeight).toFixed(2),
    slideTop: (CONFIG.heroBaseY + CONFIG.heroSlideHitboxHeight).toFixed(2),
    overheadGap: (CONFIG.trackTopY + CONFIG.overheadClearanceBottom).toFixed(2),
  });
}

// ---------------------------------------------------------------------------
// 无限滚动地面
// ---------------------------------------------------------------------------
function addWorld() {
  const groundGeom = new THREE.CircleGeometry(95, 64);
  rollingGroundSphere = new THREE.Mesh(
    groundGeom,
    new THREE.MeshStandardMaterial({
      color: CONFIG.grassColor,
      flatShading: true,
      roughness: 0.92,
    })
  );
  rollingGroundSphere.rotation.x = -Math.PI / 2;
  rollingGroundSphere.position.set(0, CONFIG.trackY - 0.14, -28);
  rollingGroundSphere.receiveShadow = true;
  scene.add(rollingGroundSphere);

  addTrackLanes();
  addForestScenery();
  createTreesPool();
}

function deformGroundSurface(sphereGeometry, sides, tiers) {
  const positions = sphereGeometry.attributes.position;
  const maxHeight = 0.07;
  let firstVertexVector = new THREE.Vector3();
  let nextVertexVector = new THREE.Vector3();

  for (let j = 1; j < tiers - 2; j += 1) {
    for (let i = 0; i < sides; i += 1) {
      const vertexIndex = j * sides + 1 + i;
      const vertexVector = new THREE.Vector3(
        positions.getX(vertexIndex),
        positions.getY(vertexIndex),
        positions.getZ(vertexIndex)
      );

      if (j % 2 !== 0) {
        if (i === 0) {
          firstVertexVector = vertexVector.clone();
        }
        nextVertexVector = new THREE.Vector3(
          positions.getX(vertexIndex + 1),
          positions.getY(vertexIndex + 1),
          positions.getZ(vertexIndex + 1)
        );
        if (i === sides - 1) {
          nextVertexVector = firstVertexVector.clone();
        }
        vertexVector.lerp(nextVertexVector, Math.random() * 0.5 + 0.25);
      }

      const heightValue = Math.random() * maxHeight - maxHeight / 2;
      vertexVector.add(
        vertexVector.clone().normalize().multiplyScalar(heightValue)
      );
      positions.setXYZ(vertexIndex, vertexVector.x, vertexVector.y, vertexVector.z);
    }
  }

  positions.needsUpdate = true;
  sphereGeometry.computeVertexNormals();
}

function addTrackLanes() {
  laneTrackGroup = new THREE.Group();
  scene.add(laneTrackGroup);
  initLanePlatforms();
}

/** 单条平面赛道分段（世界空间，与 hero 换道 X 坐标对齐） */
function createLanePlatformSegment(laneIndex) {
  const w = CONFIG.laneWidth * CONFIG.laneStripWidthRatio;
  const len = CONFIG.laneSegmentLength;
  const h = CONFIG.lanePlatformHeight;
  const group = new THREE.Group();

  const topColors = [0xa87238, 0xc08848, 0xa87238];
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.1, len),
    new THREE.MeshStandardMaterial({
      color: topColors[laneIndex],
      flatShading: true,
      roughness: 0.78,
    })
  );
  top.position.y = h;
  top.receiveShadow = true;
  group.add(top);

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.03, len * 0.75),
    new THREE.MeshStandardMaterial({ color: 0xfff3d6, flatShading: true })
  );
  dash.position.y = h + 0.055;
  group.add(dash);

  group.userData.laneIndex = laneIndex;
  return group;
}

function placeLanePlatform(segment, laneX, zOffset) {
  segment.position.set(laneX, CONFIG.trackY, zOffset);
}

function initLanePlatforms() {
  const len = CONFIG.laneSegmentLength;

  for (let li = 0; li < 3; li += 1) {
    const laneX = laneToX(LANE_INDICES[li]);
    for (let i = 0; i < CONFIG.laneSegmentCount; i += 1) {
      const segment = createLanePlatformSegment(li);
      placeLanePlatform(segment, laneX, -i * len);
      laneTrackGroup.add(segment);
      lanePlatforms[li].push(segment);
    }
  }

  initLaneGapSegments();
}

/** 两道分隔缝：深色草地，强调三条独立平面赛道 */
function initLaneGapSegments() {
  const len = CONFIG.laneSegmentLength;
  const gapWidth = CONFIG.laneWidth * (1 - CONFIG.laneStripWidthRatio) + 0.55;
  const gapMat = new THREE.MeshStandardMaterial({
    color: 0x1a4a30,
    flatShading: true,
    roughness: 0.92,
  });

  for (const laneCenter of [laneToX(-0.5), laneToX(0.5)]) {
    const column = laneCenter === laneToX(-0.5) ? 0 : 1;
    for (let i = 0; i < CONFIG.laneSegmentCount; i += 1) {
      const gap = new THREE.Mesh(new THREE.BoxGeometry(gapWidth, 0.06, len), gapMat);
      gap.position.set(laneCenter, CONFIG.trackY + 0.02, -i * len);
      gap.receiveShadow = true;
      laneTrackGroup.add(gap);
      laneGapSegments[column].push(gap);
    }
  }
}

function getTrackScrollSpeed(delta) {
  return (
    CONFIG.rollingSpeed *
    CONFIG.worldRadius *
    CONFIG.trackScrollFactor *
    delta *
    getScrollSpeedMultiplier()
  );
}

function getRollingSpeed() {
  return CONFIG.rollingSpeed * getScrollSpeedMultiplier();
}

/** 平面赛道与障碍树一起向后滚（视觉上迎向主角） */
function updateLanePlatforms(delta) {
  const speed = getTrackScrollSpeed(delta);
  const len = CONFIG.laneSegmentLength;
  const recycleWorldPos = new THREE.Vector3();

  for (let li = 0; li < 3; li += 1) {
    const segments = lanePlatforms[li];
    let minZ = Infinity;

    for (const segment of segments) {
      segment.position.z += speed;
      minZ = Math.min(minZ, segment.position.z);
    }

    for (const segment of segments) {
      segment.getWorldPosition(recycleWorldPos);
      if (recycleWorldPos.z > 10) {
        segment.position.z = minZ - len;
        minZ = segment.position.z;
      }
    }
  }

  for (const tree of treesInPath) {
    tree.position.z += speed;
  }

  updateRoadsideFoliageScroll(speed);

  for (let gi = 0; gi < laneGapSegments.length; gi += 1) {
    const gaps = laneGapSegments[gi];
    let minZ = Infinity;

    for (const gap of gaps) {
      gap.position.z += speed;
      minZ = Math.min(minZ, gap.position.z);
    }

    for (const gap of gaps) {
      gap.getWorldPosition(recycleWorldPos);
      if (recycleWorldPos.z > 10) {
        gap.position.z = minZ - len;
        minZ = gap.position.z;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 程序化森林美化（路边灌木 + 远景剪影）
// ---------------------------------------------------------------------------
const FOLIAGE_GREENS = [0x3a8a45, 0x2f7340, 0x4a9955, 0x256632, 0x5cab62];

function createFoliageMaterial() {
  return new THREE.MeshStandardMaterial({
    color: FOLIAGE_GREENS[Math.floor(Math.random() * FOLIAGE_GREENS.length)],
    flatShading: true,
    roughness: 0.94,
    metalness: 0,
  });
}

function createRoadsidePlant() {
  const mat = createFoliageMaterial();
  const useSphere = Math.random() < 0.48;
  let mesh;

  if (useSphere) {
    const radius = 0.22 + Math.random() * 0.62;
    mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 7, 6), mat);
    mesh.position.y = CONFIG.trackTopY + radius * 0.82;
  } else {
    const height = 0.45 + Math.random() * 1.25;
    const radius = 0.18 + Math.random() * 0.42;
    mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7), mat);
    mesh.position.y = CONFIG.trackTopY + height * 0.5;
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.y = Math.random() * Math.PI * 2;
  const scale = 0.75 + Math.random() * 0.65;
  mesh.scale.setScalar(scale);
  return mesh;
}

function createRoadsideStrip(side) {
  const group = new THREE.Group();
  const xMin = side === 'left' ? -CONFIG.roadsideXMax : CONFIG.roadsideXMin;
  const xMax = side === 'left' ? -CONFIG.roadsideXMin : CONFIG.roadsideXMax;
  const clusterCount = CONFIG.roadsidePlantPerStrip + Math.floor(Math.random() * 3);

  for (let i = 0; i < clusterCount; i += 1) {
    const plant = createRoadsidePlant();
    plant.position.x = xMin + Math.random() * (xMax - xMin);
    plant.position.z = (Math.random() - 0.5) * CONFIG.roadsideStripLength * 0.9;

    if (Math.random() < 0.35) {
      const companion = createRoadsidePlant();
      companion.position.x = plant.position.x + (Math.random() - 0.5) * 0.9;
      companion.position.z = plant.position.z + (Math.random() - 0.5) * 0.7;
      group.add(companion);
    }

    group.add(plant);
  }

  return group;
}

function initRoadsideFoliage() {
  roadsideFoliageGroup = new THREE.Group();
  scene.add(roadsideFoliageGroup);

  roadsideLeftStrips.length = 0;
  roadsideRightStrips.length = 0;

  for (let i = 0; i < CONFIG.roadsideStripCount; i += 1) {
    const z = -i * CONFIG.roadsideStripLength;

    const leftStrip = createRoadsideStrip('left');
    leftStrip.position.z = z;
    roadsideFoliageGroup.add(leftStrip);
    roadsideLeftStrips.push(leftStrip);

    const rightStrip = createRoadsideStrip('right');
    rightStrip.position.z = z + CONFIG.roadsideStripLength * 0.35;
    roadsideFoliageGroup.add(rightStrip);
    roadsideRightStrips.push(rightStrip);
  }
}

function updateRoadsideFoliageScroll(speed) {
  if (!speed || (!roadsideLeftStrips.length && !roadsideRightStrips.length)) return;

  const len = CONFIG.roadsideStripLength;
  const recycleWorldPos = new THREE.Vector3();

  for (const strips of [roadsideLeftStrips, roadsideRightStrips]) {
    let minZ = Infinity;

    for (const strip of strips) {
      strip.position.z += speed;
      minZ = Math.min(minZ, strip.position.z);
    }

    for (const strip of strips) {
      strip.getWorldPosition(recycleWorldPos);
      if (recycleWorldPos.z > 12) {
        strip.position.z = minZ - len;
        minZ = strip.position.z;
      }
    }
  }
}

function addDistantForestSilhouette() {
  distantForestGroup = new THREE.Group();

  for (const layer of CONFIG.distantForestLayers) {
    const mat = new THREE.MeshStandardMaterial({
      color: layer.color,
      flatShading: true,
      roughness: 1,
      metalness: 0,
      fog: true,
    });
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      mat
    );
    hill.position.set(0, layer.y, layer.z);
    hill.scale.set(layer.scaleX, layer.scaleY, layer.scaleZ ?? layer.scaleX);
    distantForestGroup.add(hill);
  }

  scene.add(distantForestGroup);
}

function addForestScenery() {
  initRoadsideFoliage();
  addDistantForestSilhouette();
}

// ---------------------------------------------------------------------------
// 程序化树木（保留原 createTree / blowUpTree / tightenTree 算法）
// ---------------------------------------------------------------------------
function getGeometryVertex(positions, index) {
  return new THREE.Vector3(
    positions.getX(index),
    positions.getY(index),
    positions.getZ(index)
  );
}

function setGeometryVertex(positions, index, vector) {
  positions.setXYZ(index, vector.x, vector.y, vector.z);
}

function blowUpTree(positions, sides, currentTier, scalarMultiplier, odd = false) {
  const midPointVector = getGeometryVertex(positions, 0);

  for (let i = 0; i < sides; i += 1) {
    const vertexIndex = currentTier * sides + 1 + i;
    const vertexVector = getGeometryVertex(positions, vertexIndex);
    midPointVector.y = vertexVector.y;
    const offset = vertexVector.clone().sub(midPointVector);

    if (odd) {
      if (i % 2 === 0) {
        offset.normalize().multiplyScalar(scalarMultiplier / 6);
        vertexVector.add(offset);
      } else {
        offset.normalize().multiplyScalar(scalarMultiplier);
        vertexVector.add(offset);
        const lower = getGeometryVertex(positions, vertexIndex + sides);
        vertexVector.y = lower.y + 0.05;
      }
    } else if (i % 2 !== 0) {
      offset.normalize().multiplyScalar(scalarMultiplier / 6);
      vertexVector.add(offset);
    } else {
      offset.normalize().multiplyScalar(scalarMultiplier);
      vertexVector.add(offset);
      const lower = getGeometryVertex(positions, vertexIndex + sides);
      vertexVector.y = lower.y + 0.05;
    }

    setGeometryVertex(positions, vertexIndex, vertexVector);
  }
}

function tightenTree(positions, sides, currentTier) {
  const midPointVector = getGeometryVertex(positions, 0);

  for (let i = 0; i < sides; i += 1) {
    const vertexIndex = currentTier * sides + 1 + i;
    const vertexVector = getGeometryVertex(positions, vertexIndex);
    midPointVector.y = vertexVector.y;
    const offset = vertexVector.clone().sub(midPointVector);
    offset.normalize().multiplyScalar(0.06);
    vertexVector.sub(offset);
    setGeometryVertex(positions, vertexIndex, vertexVector);
  }
}

function createTree() {
  const { treeSides: sides, treeTiers: tiers } = CONFIG;
  const scalarMultiplier = Math.random() * 0.15 + 0.05;

  const treeGeometry = new THREE.ConeGeometry(0.5, 1, sides, tiers);
  const positions = treeGeometry.attributes.position;

  blowUpTree(positions, sides, 0, scalarMultiplier);
  tightenTree(positions, sides, 1);
  blowUpTree(positions, sides, 2, scalarMultiplier * 1.1, true);
  tightenTree(positions, sides, 3);
  blowUpTree(positions, sides, 4, scalarMultiplier * 1.2);
  tightenTree(positions, sides, 5);
  positions.needsUpdate = true;
  treeGeometry.computeVertexNormals();

  const treeTop = new THREE.Mesh(
    treeGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x358a42,
      flatShading: true,
      roughness: 0.88,
    })
  );
  treeTop.castShadow = true;
  treeTop.receiveShadow = false;
  treeTop.position.y = 0.9;
  treeTop.rotation.y = Math.random() * Math.PI;

  const treeTrunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6),
    new THREE.MeshStandardMaterial({
      color: 0x886633,
      flatShading: true,
      roughness: 0.95,
    })
  );
  treeTrunk.castShadow = true;
  treeTrunk.position.y = 0.25;

  const tree = new THREE.Group();
  tree.add(treeTrunk, treeTop);
  tree.userData.isObstacle = false;
  return tree;
}

function getHeroWorldHitbox() {
  const { x, y, z } = heroRoot.position;
  const halfW = CONFIG.heroHitboxRadiusX;
  const halfD = CONFIG.heroHitboxRadiusZ;
  const maxY = isSliding
    ? y + CONFIG.heroSlideHitboxHeight
    : y + CONFIG.heroStandHitboxHeight;

  return {
    minX: x - halfW,
    maxX: x + halfW,
    minY: y,
    maxY,
    minZ: z - halfD,
    maxZ: z + halfD,
  };
}

function getObstacleWorldHitbox(obstacle) {
  const hitbox = obstacle.userData.hitbox;
  if (!hitbox) return null;

  obstacle.updateMatrixWorld(true);
  const worldPos = new THREE.Vector3();
  obstacle.getWorldPosition(worldPos);

  const scale = CONFIG.obstacleHitboxScale ?? 1;
  return {
    type: hitbox.type,
    minX: worldPos.x - hitbox.halfWidth * scale,
    maxX: worldPos.x + hitbox.halfWidth * scale,
    minY: hitbox.minY,
    maxY: hitbox.maxY,
    minZ: worldPos.z - hitbox.halfDepth * scale,
    maxZ: worldPos.z + hitbox.halfDepth * scale,
    clearanceBottom: hitbox.clearanceBottom,
  };
}

function boxesOverlap3D(a, b) {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

/** 按障碍类型判定是否发生碰撞（跳跃越过低空 / 滑铲钻过高空） */
function hitsObstacle(heroBox, obstacleBox, obstacle = null) {
  const xzOverlap =
    heroBox.minX < obstacleBox.maxX &&
    heroBox.maxX > obstacleBox.minX &&
    heroBox.minZ < obstacleBox.maxZ &&
    heroBox.maxZ > obstacleBox.minZ;

  if (!xzOverlap) {
    return false;
  }

  if (obstacleBox.type === 'ground') {
    if (obstacle?.userData.jumpCleared) {
      return false;
    }

    const clearFeetY = Math.max(
      obstacleBox.maxY - CONFIG.passMarginGround,
      CONFIG.heroBaseY + CONFIG.lowObstacleHeight * 0.55
    );

    if (heroBox.minY >= clearFeetY) {
      if (obstacle) obstacle.userData.jumpCleared = true;
      return false;
    }

    if (isMainJumpAirborne() || isJumpAnimPlaying) {
      if (obstacle) obstacle.userData.jumpCleared = true;
      return false;
    }

    return true;
  }

  if (obstacleBox.type === 'overhead') {
    if (obstacle?.userData.slideCleared) {
      return false;
    }

    const clearanceBottom = obstacleBox.clearanceBottom;
    const slidePassHeadY = clearanceBottom + CONFIG.passMarginOverhead;

    if (isSliding && heroBox.maxY <= slidePassHeadY) {
      if (obstacle) obstacle.userData.slideCleared = true;
      return false;
    }

    if (!isSliding && heroBox.maxY > clearanceBottom) {
      return true;
    }

    return false;
  }

  return boxesOverlap3D(heroBox, obstacleBox);
}

function disposeObstacleMeshes(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => mat.dispose());
      } else {
        child.material.dispose();
      }
    }
  }
}

function forestMat(color, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness,
  });
}

function setGroundHitbox(group, trackTop, height, halfWidth, halfDepth) {
  group.userData.hitbox = {
    type: 'ground',
    minY: trackTop,
    maxY: trackTop + height,
    halfWidth,
    halfDepth,
  };
}

function buildGroundLog(group, trackTop) {
  const radius = CONFIG.logRadius;
  const length = CONFIG.logLength;
  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.05, length, 10),
    forestMat(CONFIG.logColor, 0.92)
  );
  log.rotation.x = Math.PI / 2;
  log.position.y = trackTop + radius;
  log.castShadow = true;
  log.receiveShadow = true;
  group.add(log);

  const knot = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.55, 6, 5),
    forestMat(CONFIG.logBarkColor, 0.95)
  );
  knot.position.set(0, trackTop + radius, length * 0.28);
  group.add(knot);

  group.userData.groundVariant = 'log';
  return { halfWidth: CONFIG.lowObstacleHalfWidth, halfDepth: length * 0.5 };
}

function buildGroundRock(group, trackTop) {
  const rock = new THREE.Mesh(
    new THREE.BoxGeometry(CONFIG.rockWidth, CONFIG.rockHeight, CONFIG.rockDepth),
    forestMat(CONFIG.rockColor, 0.88)
  );
  rock.position.y = trackTop + CONFIG.rockHeight * 0.5;
  rock.rotation.y = Math.random() * Math.PI;
  rock.castShadow = true;
  rock.receiveShadow = true;
  group.add(rock);

  const pebble = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 6, 5),
    forestMat(0x8a8a82)
  );
  pebble.position.set(0.35, trackTop + 0.1, 0.22);
  pebble.scale.set(1.2, 0.55, 1);
  group.add(pebble);

  group.userData.groundVariant = 'rock';
  return {
    halfWidth: CONFIG.rockWidth * 0.5,
    halfDepth: CONFIG.rockDepth * 0.5,
  };
}

/** 森林变体：红蘑菇簇 */
function buildGroundMushroom(group, trackTop) {
  const stemMat = forestMat(CONFIG.mushroomStemColor, 0.85);
  const capMat = forestMat(CONFIG.mushroomCapColor, 0.78);

  function addMushroom(x, z, stemH, capR) {
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(capR * 0.35, capR * 0.42, stemH, 7),
      stemMat
    );
    stem.position.set(x, trackTop + stemH * 0.5, z);
    stem.castShadow = true;
    group.add(stem);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(capR, 8, 6),
      capMat
    );
    cap.scale.set(1, 0.55, 1);
    cap.position.set(x, trackTop + stemH + capR * 0.35, z);
    cap.castShadow = true;
    group.add(cap);

    const spot = new THREE.Mesh(
      new THREE.SphereGeometry(capR * 0.18, 5, 4),
      forestMat(0xf5f0e6, 0.8)
    );
    spot.position.set(x + capR * 0.25, trackTop + stemH + capR * 0.55, z + capR * 0.1);
    group.add(spot);
  }

  addMushroom(0, 0, 0.22, 0.28);
  addMushroom(0.32, 0.18, 0.14, 0.18);
  addMushroom(-0.28, 0.12, 0.12, 0.15);

  const moss = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.48, 0.06, 8),
    forestMat(CONFIG.mossGreenColor, 0.95)
  );
  moss.position.y = trackTop + 0.03;
  moss.receiveShadow = true;
  group.add(moss);

  group.userData.groundVariant = 'mushroom';
  return { halfWidth: 0.4, halfDepth: 0.34 };
}

/** 森林变体：树桩 */
function buildGroundStump(group, trackTop) {
  const barkMat = forestMat(CONFIG.stumpBarkColor, 0.93);
  const topMat = forestMat(CONFIG.stumpTopColor, 0.88);

  const stump = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.42, 0.36, 10),
    barkMat
  );
  stump.position.y = trackTop + 0.18;
  stump.castShadow = true;
  stump.receiveShadow = true;
  group.add(stump);

  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 10), topMat);
  top.position.y = trackTop + 0.36;
  top.castShadow = true;
  group.add(top);

  for (let i = 0; i < 3; i += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.12 + i * 0.07, 0.012, 4, 12),
      forestMat(0x7a6348, 0.9)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = trackTop + 0.365;
    group.add(ring);
  }

  const root = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.1, 0.38),
    barkMat
  );
  root.position.set(0.28, trackTop + 0.05, 0.1);
  root.rotation.y = 0.4;
  group.add(root);

  group.userData.groundVariant = 'stump';
  return { halfWidth: 0.4, halfDepth: 0.36 };
}

/** 森林变体：落枝 + 落叶 */
function buildGroundFallenBranch(group, trackTop) {
  const branchMat = forestMat(CONFIG.branchColor, 0.9);
  const leafMat = forestMat(CONFIG.branchLeafColor, 0.88);

  const branch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 0.88, 7),
    branchMat
  );
  branch.rotation.z = Math.PI / 2;
  branch.rotation.y = 0.25 + Math.random() * 0.35;
  branch.position.set(0, trackTop + 0.11, 0);
  branch.castShadow = true;
  group.add(branch);

  const twig = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 0.32, 5),
    branchMat
  );
  twig.rotation.z = 0.8;
  twig.position.set(0.22, trackTop + 0.18, 0.15);
  group.add(twig);

  for (const [x, z, ry] of [
    [-0.2, 0.2, 0.5],
    [0.15, -0.18, 2.1],
    [0.35, 0.08, 1.2],
  ]) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 5), leafMat);
    leaf.position.set(x, trackTop + 0.14, z);
    leaf.rotation.set(0, ry, Math.PI);
    group.add(leaf);
  }

  group.userData.groundVariant = 'branch';
  return { halfWidth: 0.38, halfDepth: 0.42 };
}

/** 低空障碍：圆木 / 石块 + 蘑菇 / 树桩 / 落枝 */
function buildLowObstacle(group) {
  const trackTop = CONFIG.trackTopY;
  const height = CONFIG.lowObstacleHeight;
  const variants = ['log', 'rock', 'mushroom', 'stump', 'branch'];
  const variant = variants[Math.floor(Math.random() * variants.length)];

  let sizes;
  if (variant === 'log') sizes = buildGroundLog(group, trackTop);
  else if (variant === 'rock') sizes = buildGroundRock(group, trackTop);
  else if (variant === 'mushroom') sizes = buildGroundMushroom(group, trackTop);
  else if (variant === 'stump') sizes = buildGroundStump(group, trackTop);
  else sizes = buildGroundFallenBranch(group, trackTop);

  setGroundHitbox(group, trackTop, height, sizes.halfWidth, sizes.halfDepth);
}

/** 宽障碍：横跨两道，只能换到剩余一道 */
function buildWideGroundObstacle(group) {
  const trackTop = CONFIG.trackTopY;
  const height = CONFIG.lowObstacleHeight;
  const span = CONFIG.laneWidth * CONFIG.wideLaneSpan;

  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.28, span, 10),
    forestMat(CONFIG.logColor, 0.92)
  );
  log.rotation.z = Math.PI / 2;
  log.position.y = trackTop + 0.22;
  log.castShadow = true;
  log.receiveShadow = true;
  group.add(log);

  const moss = new THREE.Mesh(
    new THREE.BoxGeometry(span * 0.82, 0.1, 0.42),
    forestMat(CONFIG.mossGreenColor, 0.9)
  );
  moss.position.set(0, trackTop + 0.08, 0.05);
  group.add(moss);

  for (const xOff of [-0.35, 0.35]) {
    const stump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.13, 0.18, 6),
      forestMat(CONFIG.stumpBarkColor, 0.93)
    );
    stump.position.set(xOff, trackTop + 0.09, 0.2);
    group.add(stump);
  }

  group.userData.groundVariant = 'wide';
  group.userData.isWide = true;
  group.userData.hitbox = {
    type: 'ground',
    minY: trackTop,
    maxY: trackTop + height,
    halfWidth: span * 0.5,
    halfDepth: CONFIG.logLength * 0.48,
  };
}

function setOverheadHitbox(group, trackTop, clearanceBottom, clearanceTop, span) {
  group.userData.hitbox = {
    type: 'overhead',
    minY: clearanceBottom,
    maxY: clearanceTop + CONFIG.overheadBeamRadius * 2,
    clearanceBottom,
    halfWidth: span * 0.5 + 0.12,
    halfDepth: CONFIG.lowObstacleHalfDepth + 0.08,
  };
}

function addOverheadPosts(group, trackTop, span, postHeight, mat) {
  const leftPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, postHeight, 6),
    mat
  );
  leftPost.position.set(-span * 0.48, trackTop + postHeight * 0.5, 0);
  leftPost.castShadow = true;

  const rightPost = leftPost.clone();
  rightPost.position.x = span * 0.48;

  group.add(leftPost, rightPost);
}

/** 高空变体：木架横梁（原样式） */
function buildOverheadTimber(group, trackTop, clearanceBottom, clearanceTop, span) {
  const branchMat = forestMat(CONFIG.branchColor, 0.86);
  const leafMat = forestMat(CONFIG.branchLeafColor, 0.9);
  const postHeight = clearanceTop - trackTop + 0.08;

  addOverheadPosts(group, trackTop, span, postHeight, branchMat);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(
      CONFIG.overheadBeamRadius,
      CONFIG.overheadBeamRadius * 1.15,
      span,
      8
    ),
    branchMat
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.y = clearanceTop - CONFIG.overheadBeamRadius;
  beam.castShadow = true;
  group.add(beam);

  for (const xOff of [-0.55, 0, 0.55]) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.38, 6), leafMat);
    leaf.position.set(xOff, clearanceBottom + 0.12, 0);
    leaf.rotation.z = Math.PI;
    group.add(leaf);
  }

  const hangBranch = new THREE.Mesh(
    new THREE.BoxGeometry(span * 0.92, 0.12, 0.16),
    branchMat
  );
  hangBranch.position.y = clearanceBottom + 0.06;
  group.add(hangBranch);

  group.userData.overheadVariant = 'timber';
}

/** 森林变体：垂坠藤蔓 */
function buildOverheadVines(group, trackTop, clearanceBottom, clearanceTop, span) {
  const postMat = forestMat(CONFIG.branchColor, 0.88);
  const vineMat = forestMat(CONFIG.vineGreenColor, 0.82);
  const postHeight = clearanceTop - trackTop + 0.08;

  addOverheadPosts(group, trackTop, span, postHeight, postMat);

  const topBar = new THREE.Mesh(
    new THREE.BoxGeometry(span * 0.94, 0.1, 0.14),
    postMat
  );
  topBar.position.y = clearanceTop - 0.05;
  topBar.castShadow = true;
  group.add(topBar);

  for (let i = 0; i < 7; i += 1) {
    const t = i / 6;
    const x = THREE.MathUtils.lerp(-span * 0.42, span * 0.42, t);
    const vineLen = clearanceTop - clearanceBottom + 0.08;
    const vine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.04, vineLen, 5),
      vineMat
    );
    vine.position.set(x + (Math.random() - 0.5) * 0.08, clearanceBottom + vineLen * 0.5 - 0.04, 0);
    vine.rotation.z = (Math.random() - 0.5) * 0.12;
    group.add(vine);

    if (i % 2 === 0) {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.2, 5),
        forestMat(CONFIG.mossGreenColor, 0.9)
      );
      leaf.position.set(x, clearanceBottom + 0.08, 0.06);
      leaf.rotation.z = Math.PI;
      group.add(leaf);
    }
  }

  group.userData.overheadVariant = 'vines';
}

/** 森林变体：苔藓倒木 */
function buildOverheadMossLog(group, trackTop, clearanceBottom, clearanceTop, span) {
  const woodMat = forestMat(CONFIG.logColor, 0.9);
  const mossMat = forestMat(CONFIG.mossGreenColor, 0.92);

  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.19, span * 0.95, 9),
    woodMat
  );
  log.rotation.z = Math.PI / 2;
  log.position.y = clearanceTop - 0.12;
  log.castShadow = true;
  group.add(log);

  const mossPatch = new THREE.Mesh(
    new THREE.BoxGeometry(span * 0.7, 0.14, 0.28),
    mossMat
  );
  mossPatch.position.set(0, clearanceTop - 0.05, 0.08);
  group.add(mossPatch);

  for (const xOff of [-0.5, 0.15, 0.55]) {
    const droop = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 5), mossMat);
    droop.position.set(xOff, clearanceBottom + 0.1, 0);
    droop.rotation.z = Math.PI;
    group.add(droop);
  }

  const snag = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.07, 0.28, 5),
    woodMat
  );
  snag.position.set(span * 0.35, clearanceBottom + 0.14, 0.12);
  snag.rotation.z = 0.6;
  group.add(snag);

  group.userData.overheadVariant = 'moss_log';
}

/** 高空障碍：木架 / 藤蔓 / 苔藓倒木（迫使滑铲） */
function buildOverheadObstacle(group) {
  const trackTop = CONFIG.trackTopY;
  const clearanceBottom = trackTop + CONFIG.overheadClearanceBottom;
  const clearanceTop = trackTop + CONFIG.overheadClearanceTop;
  const span = CONFIG.overheadSpan;
  const variants = ['timber', 'vines', 'moss_log'];
  const variant = variants[Math.floor(Math.random() * variants.length)];

  if (variant === 'timber') {
    buildOverheadTimber(group, trackTop, clearanceBottom, clearanceTop, span);
  } else if (variant === 'vines') {
    buildOverheadVines(group, trackTop, clearanceBottom, clearanceTop, span);
  } else {
    buildOverheadMossLog(group, trackTop, clearanceBottom, clearanceTop, span);
  }

  setOverheadHitbox(group, trackTop, clearanceBottom, clearanceTop, span);
}

function buildLowOrOverhead(group, type) {
  group.userData.isWide = false;
  if (type === 'wide') {
    buildWideGroundObstacle(group);
    group.userData.obstacleType = 'wide';
  } else if (type === 'ground') {
    buildLowObstacle(group);
    group.userData.obstacleType = 'ground';
  } else {
    buildOverheadObstacle(group);
    group.userData.obstacleType = type;
  }
  group.userData.isObstacle = true;
}

function createPathObstacle(type) {
  const group = new THREE.Group();
  buildLowOrOverhead(group, type);
  return group;
}

function popPathObstacle(type) {
  let index = treesPool.findIndex((item) => item.userData.obstacleType === type);
  if (index < 0 && treesPool.length > 0) {
    index = treesPool.length - 1;
  }

  if (index >= 0) {
    const obstacle = treesPool.splice(index, 1)[0];
    if (obstacle.userData.obstacleType !== type) {
      disposeObstacleMeshes(obstacle);
      buildLowOrOverhead(obstacle, type);
    }
    return obstacle;
  }

  return createPathObstacle(type);
}

function createTreesPool() {
  const poolSize = CONFIG.maxTreesInPool;
  for (let i = 0; i < poolSize - 4; i += 1) {
    const type = i % 2 === 0 ? 'ground' : 'overhead';
    const obstacle = createPathObstacle(type);
    obstacle.visible = false;
    treesPool.push(obstacle);
  }
  for (let i = 0; i < 4; i += 1) {
    const obstacle = createPathObstacle('wide');
    obstacle.visible = false;
    treesPool.push(obstacle);
  }
}

/** 将树贴到滚动球面（保留原 spherical 定位 + 法线对齐） */
function placeTreeOnSphere(tree, radius, phi, theta) {
  sphericalHelper.set(radius, phi, theta);
  tree.position.setFromSpherical(sphericalHelper);

  const rollingGroundVector = rollingGroundSphere.position.clone().normalize();
  const treeVector = tree.position.clone().normalize();
  tree.quaternion.setFromUnitVectors(treeVector, rollingGroundVector);
  tree.rotation.x += Math.random() * (Math.PI / 5) - Math.PI / 10;
  tree.scale.setScalar(0.85 + Math.random() * 0.35);
}

/**
 * 在指定赛道生成障碍（X 对齐三道，Y 贴赛道面，Z 在远端刷新区）
 * 逻辑等价于原 items 生成表，统一在此维护。
 */
function spawnPathObstacle(laneIndex, obstacleType, spawnZ = null) {
  const obstacle = popPathObstacle(obstacleType);
  obstacle.visible = true;
  obstacle.userData.isObstacle = true;
  obstacle.userData.jumpCleared = false;
  obstacle.userData.slideCleared = false;

  const laneX = laneToX(LANE_INDICES[laneIndex]);
  const z =
    spawnZ ??
    CONFIG.obstacleSpawnZMin +
      Math.random() * (CONFIG.obstacleSpawnZMax - CONFIG.obstacleSpawnZMin);

  obstacle.position.set(laneX, CONFIG.trackY, z);
  obstacle.rotation.set(0, 0, 0);
  obstacle.scale.setScalar(1);

  if (obstacle.parent !== laneTrackGroup) {
    if (obstacle.parent) obstacle.parent.remove(obstacle);
    laneTrackGroup.add(obstacle);
  }

  treesInPath.push(obstacle);
  return obstacle;
}

function spawnWideObstacle(centerX, spawnZ) {
  const obstacle = popPathObstacle('wide');
  obstacle.visible = true;
  obstacle.userData.isObstacle = true;
  obstacle.userData.jumpCleared = false;
  obstacle.userData.slideCleared = false;

  obstacle.position.set(centerX, CONFIG.trackY, spawnZ);
  obstacle.rotation.set(0, 0, 0);
  obstacle.scale.setScalar(1);

  if (obstacle.parent !== laneTrackGroup) {
    if (obstacle.parent) obstacle.parent.remove(obstacle);
    laneTrackGroup.add(obstacle);
  }

  treesInPath.push(obstacle);
  return obstacle;
}

/**
 * @param {boolean} inPath  true=赛道障碍  false=两侧装饰林
 * @param {number} row      赛道索引 0|1|2 或圆周角
 * @param {boolean | string} isLeftOrType  装饰林左右侧，或赛道障碍类型 'ground'|'overhead'
 * @param {boolean} [isLeft]
 */
function addTree(inPath, row, isLeftOrType = false, isLeft = false) {
  let tree;

  if (inPath) {
    const obstacleType =
      typeof isLeftOrType === 'string' ? isLeftOrType : 'ground';
    tree = spawnPathObstacle(row, obstacleType);
  } else {
    tree = createTree();
    const sideLeft = typeof isLeftOrType === 'boolean' ? isLeftOrType : isLeft;
    let forestAreaAngle;
    if (sideLeft) {
      forestAreaAngle = 1.68 + Math.random() * 0.1;
    } else {
      forestAreaAngle = 1.46 - Math.random() * 0.1;
    }
    placeTreeOnSphere(tree, CONFIG.worldRadius - 0.3, forestAreaAngle, row);
  }

  tree.userData.isObstacle = inPath;

  if (!inPath) {
    rollingGroundSphere.add(tree);
  }
}

/** 两侧静态装饰林，随球体一起滚动 */
function addWorldTrees() {
  const gap = (Math.PI * 2) / CONFIG.sideTreeCount;
  for (let i = 0; i < CONFIG.sideTreeCount; i += 1) {
    addTree(false, i * gap, true);
    addTree(false, i * gap, false);
  }
}

/** 按波次刷障碍：同排可多道，至少留一道空赛道 */
function getScrollSpeedUnitsPerSec() {
  const mult = gameState === 'PLAYING' ? getScrollSpeedMultiplier() : 1;
  return CONFIG.rollingSpeed * CONFIG.worldRadius * CONFIG.trackScrollFactor * mult;
}

function getLaneIndexFromX(x) {
  let bestLane = 1;
  let bestDist = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const dist = Math.abs(x - laneToX(LANE_INDICES[i]));
    if (dist < bestDist) {
      bestDist = dist;
      bestLane = i;
    }
  }
  return bestLane;
}

function obstacleAffectsLane(obstacle, laneIndex) {
  const laneX = laneToX(LANE_INDICES[laneIndex]);
  const hitbox = obstacle.userData.hitbox;
  if (!hitbox) return getLaneIndexFromX(obstacle.position.x) === laneIndex;
  const halfW = hitbox.halfWidth;
  const minX = obstacle.position.x - halfW;
  const maxX = obstacle.position.x + halfW;
  return laneX >= minX && laneX <= maxX;
}

function getWideAffectedLanes(centerX) {
  const halfSpan = CONFIG.laneWidth * CONFIG.wideLaneSpan * 0.5;
  const lanes = [];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(laneToX(LANE_INDICES[i]) - centerX) < halfSpan) {
      lanes.push(i);
    }
  }
  return lanes;
}

function canSpawnWideAt(centerX, z) {
  for (const laneIndex of getWideAffectedLanes(centerX)) {
    if (!canSpawnObstacleOnLane(laneIndex, 'wide', z)) return false;
  }
  return getWideAffectedLanes(centerX).length >= 2;
}

function resolveFairWideSpawnZ(centerX, preferredZ) {
  if (canSpawnWideAt(centerX, preferredZ)) return preferredZ;

  let z = preferredZ;
  const step = 5;
  const limit = CONFIG.obstacleSpawnZMin - 24;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    z -= step;
    if (z < limit) return null;
    if (canSpawnWideAt(centerX, z)) return z;
  }
  return null;
}

function spawnWideBlockWave() {
  const baseZ =
    CONFIG.obstacleSpawnZMin +
    Math.random() * (CONFIG.obstacleSpawnZMax - CONFIG.obstacleSpawnZMin);

  const openLeft = Math.random() < 0.5;
  const openLane = openLeft ? 0 : 2;
  const wideCenterX = openLeft
    ? (laneToX(LANE_INDICES[1]) + laneToX(LANE_INDICES[2])) * 0.5
    : (laneToX(LANE_INDICES[0]) + laneToX(LANE_INDICES[1])) * 0.5;

  const wideZ = resolveFairWideSpawnZ(wideCenterX, baseZ);
  if (wideZ === null) return false;

  spawnWideObstacle(wideCenterX, wideZ);

  const openType = Math.random() < 0.5 ? 'ground' : 'overhead';
  const openZ = resolveFairSpawnZ(openLane, openType, baseZ);
  if (openZ !== null) spawnPathObstacle(openLane, openType, openZ);
  return true;
}

/** 同类型前后最小间距（米，边缘到边缘） */
function getMinSameLaneGapZ() {
  const speed = getScrollSpeedUnitsPerSec();
  return speed * 1.35 + CONFIG.lowObstacleHalfDepth * 2.5;
}

/** 跳↔滑交替时最小间距：按两种方向取更长的反应时间 */
function getMinOppositeTypeGapZ() {
  const speed = getScrollSpeedUnitsPerSec();
  const slideThenJump =
    CONFIG.slideDuration +
    CONFIG.slideExitDuration +
    0.7 +
    CONFIG.actionCrossFade;
  const jumpThenSlide =
    getJumpAirTime() +
    CONFIG.landingSquashDuration +
    0.4 +
    CONFIG.actionCrossFade;
  const chainTime = Math.max(slideThenJump, jumpThenSlide);
  return (
    speed * chainTime +
    CONFIG.logLength +
    CONFIG.minOppositeTypeGapExtra
  );
}

function getObstacleEdgeGapZ(existing, newZ) {
  const halfDepth =
    existing.userData.hitbox?.halfDepth ?? CONFIG.lowObstacleHalfDepth;
  const centerGap = Math.abs(existing.position.z - newZ);
  return centerGap - halfDepth - CONFIG.lowObstacleHalfDepth;
}

function canSpawnObstacleOnLane(laneIndex, obstacleType, z) {
  for (const tree of treesInPath) {
    if (!tree.visible || !tree.userData.isObstacle) continue;
    if (!obstacleAffectsLane(tree, laneIndex)) continue;

    const edgeGap = getObstacleEdgeGapZ(tree, z);
    const otherType = tree.userData.obstacleType;
    const minGap =
      otherType === obstacleType ? getMinSameLaneGapZ() : getMinOppositeTypeGapZ();
    if (edgeGap < minGap) return false;
  }
  return true;
}

function resolveFairSpawnZ(laneIndex, obstacleType, preferredZ) {
  if (canSpawnObstacleOnLane(laneIndex, obstacleType, preferredZ)) {
    return preferredZ;
  }

  let z = preferredZ;
  const step = 5;
  const limit = CONFIG.obstacleSpawnZMin - 24;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    z -= step;
    if (z < limit) return null;
    if (canSpawnObstacleOnLane(laneIndex, obstacleType, z)) return z;
  }
  return null;
}

function spawnObstacleWave() {
  if (Math.random() > getSpawnChance()) return;

  const laneMode = getActiveLaneMode();
  if (laneMode === 1) {
    spawnSingleActiveLaneWave();
    return;
  }
  if (laneMode === 2) {
    spawnDualActiveLaneWave();
    return;
  }

  const phase = getScorePhase();
  if (phase === 2 && Math.random() < CONFIG.wideObstacleChance) {
    if (spawnWideBlockWave()) return;
  }

  const lanes = pickObstacleWavePattern();
  const baseZ =
    CONFIG.obstacleSpawnZMin +
    Math.random() * (CONFIG.obstacleSpawnZMax - CONFIG.obstacleSpawnZMin);

  const hasGround = lanes.some((type) => type === 'ground');
  const hasOverhead = lanes.some((type) => type === 'overhead');
  const mixedWave = hasGround && hasOverhead;
  /** 同排跳+滑时错开 Z：头顶障碍先到，地面障碍后到，避免同一瞬间反应不过来 */
  const mixedWaveStagger = mixedWave ? getMinOppositeTypeGapZ() * 0.5 : 0;

  for (let laneIndex = 0; laneIndex < 3; laneIndex += 1) {
    const obstacleType = lanes[laneIndex];
    if (!obstacleType || !isLaneIndexActive(laneIndex)) continue;

    let preferredZ =
      baseZ + (Math.random() - 0.5) * CONFIG.waveSpawnZJitter;
    if (mixedWave) {
      if (obstacleType === 'overhead') {
        preferredZ = baseZ + CONFIG.waveSpawnZJitter * 0.15;
      } else {
        preferredZ = baseZ - mixedWaveStagger;
      }
    }

    const z = resolveFairSpawnZ(laneIndex, obstacleType, preferredZ);
    if (z === null) continue;

    spawnPathObstacle(laneIndex, obstacleType, z);
  }
}

function recycleTree(tree) {
  tree.visible = false;
  tree.userData.jumpCleared = false;
  tree.userData.slideCleared = false;
  if (tree.parent) {
    tree.parent.remove(tree);
  }

  const pathIndex = treesInPath.indexOf(tree);
  if (pathIndex >= 0) {
    treesInPath.splice(pathIndex, 1);
  }

  treesPool.push(tree);
}

/** 障碍只保留树冠，去掉树干（避免脚下像石头） */
function hideTreeTrunk(tree) {
  tree.traverse((child) => {
    if (child.isMesh && child.geometry?.type === 'CylinderGeometry') {
      child.visible = false;
    }
  });
}

/** 清掉主角附近误生成的障碍 */
function purgeTreesNearHero(minDistanceZ = 8) {
  for (const tree of [...treesInPath]) {
    tree.getWorldPosition(treeWorldPos);
    if (
      Math.abs(treeWorldPos.z - heroRoot.position.z) < minDistanceZ &&
      Math.abs(treeWorldPos.x - heroRoot.position.x) < CONFIG.laneWidth * 0.55
    ) {
      recycleTree(tree);
    }
  }
}

/** 障碍树越界回收 + 与主角碰撞检测 */
function doTreeLogic() {
  const treesToRemove = [];

  for (const tree of treesInPath) {
    if (!tree.visible) continue;

    tree.getWorldPosition(treeWorldPos);

    if (treeWorldPos.z > 8) {
      treesToRemove.push(tree);
      continue;
    }

    if (!hasCollided && spawnGraceRemaining <= 0 && tree.userData.isObstacle) {
      const heroBox = getHeroWorldHitbox();
      const obstacleBox = getObstacleWorldHitbox(tree);
      if (obstacleBox && hitsObstacle(heroBox, obstacleBox, tree)) {
        onPlayerHitObstacle(treeWorldPos);
      }
    }
  }

  for (const tree of treesToRemove) {
    recycleTree(tree);
  }
}

function onPlayerHitObstacle(position) {
  hasCollided = true;
  gameState = 'GAMEOVER';
  isPaused = false;
  stopRunSfx();
  playDeathSfx();
  triggerExplosion(position);
  setModelStatus('撞到障碍物！', true);
  showGameOverPanel();
  updateSettingsButtonVisibility();
}

function showGameOverPanel() {
  if (gameoverScoreEl) {
    gameoverScoreEl.textContent = `本次得分：${displayScore}`;
  }
  if (gameoverPanelEl) {
    gameoverPanelEl.hidden = false;
    gameoverPanelEl.classList.add('is-visible');
  }
}

function hideGameOverPanel() {
  if (gameoverPanelEl) {
    gameoverPanelEl.classList.remove('is-visible');
    gameoverPanelEl.hidden = true;
  }
}

function resetGame() {
  hasCollided = false;
  gameState = 'PLAYING';
  hideGameOverPanel();
  closeSettingsPanel(false);
  treeSpawnTimer = 0;
  score = 0;
  displayScore = 0;
  gameplayElapsed = 0;
  updateScoreHud();
  bounceValue = 0;
  jumpInputBuffer = 0;
  cameraHeightSmoothed = CONFIG.heroBaseY;
  currentLane = CONFIG.middleLane;
  heroRoot.position.set(
    CONFIG.heroPosition.x,
    CONFIG.heroPosition.y,
    CONFIG.heroPosition.z
  );
  heroRoot.rotation.z = 0;
  if (heroModel) {
    heroModel.rotation.y = heroModelBaseRotationY;
  }
  resetHeroActionState();

  for (const tree of [...treesInPath]) {
    recycleTree(tree);
  }
  purgeTreesNearHero();

  resetLaneModeState();
  startAdaptationCountdown();
  updateSettingsButtonVisibility();
}

function updateTrees(delta) {
  if (!isGameplayRunning()) return;

  updateScore(delta);

  if (spawnGraceRemaining > 0) {
    spawnGraceRemaining -= delta;
    purgeTreesNearHero();
    doTreeLogic();
    return;
  }

  treeSpawnTimer += delta;
  if (treeSpawnTimer >= getSpawnInterval()) {
    spawnObstacleWave();
    treeSpawnTimer = 0;
  }

  doTreeLogic();
}

// ---------------------------------------------------------------------------
// 粒子爆炸（保留原 explode 扩散算法，碰撞时可调用 triggerExplosion）
// ---------------------------------------------------------------------------
function addExplosion() {
  const positions = new Float32Array(CONFIG.particleCount * 3);

  particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3)
  );

  particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({
      color: 0xfffafa,
      size: 0.25,
      blending: THREE.AdditiveBlending,
      transparent: true,
    })
  );
  particles.visible = false;
  scene.add(particles);
}

/** 碰撞 / 游戏结束时调用，例如：triggerExplosion(heroSphere.position) */
function triggerExplosion(position) {
  const positions = particleGeometry.attributes.position;

  particles.position.copy(position);
  particles.position.y += 0.2;

  for (let i = 0; i < CONFIG.particleCount; i += 1) {
    positions.setXYZ(
      i,
      -0.2 + Math.random() * 0.4,
      -0.2 + Math.random() * 0.4,
      -0.2 + Math.random() * 0.4
    );
  }

  positions.needsUpdate = true;
  explosionPower = CONFIG.explosionPowerStart;
  particles.visible = true;
}

function updateExplosion() {
  if (!particles.visible) return;

  const positions = particleGeometry.attributes.position;

  for (let i = 0; i < CONFIG.particleCount; i += 1) {
    positions.setXYZ(
      i,
      positions.getX(i) * explosionPower,
      positions.getY(i) * explosionPower,
      positions.getZ(i) * explosionPower
    );
  }

  positions.needsUpdate = true;

  if (explosionPower > 1.005) {
    explosionPower -= 0.001;
  } else {
    particles.visible = false;
  }
}

// ---------------------------------------------------------------------------
// 主角：占位球 + Tripo3D GLB 自动替换
// ---------------------------------------------------------------------------
function addHero() {
  heroRoot = new THREE.Group();
  heroVisualPivot = new THREE.Group();
  heroRoot.add(heroVisualPivot);
  heroRoot.position.set(
    CONFIG.heroPosition.x,
    CONFIG.heroPosition.y,
    CONFIG.heroPosition.z
  );
  currentLane = CONFIG.middleLane;
  resetHeroActionState();
  scene.add(heroRoot);

  heroPlaceholder = new THREE.Mesh(
    new THREE.DodecahedronGeometry(CONFIG.heroRadius, 1),
    new THREE.MeshStandardMaterial({ color: 0xe5f2f2, flatShading: true })
  );
  heroPlaceholder.receiveShadow = true;
  heroPlaceholder.castShadow = true;
  heroVisualPivot.add(heroPlaceholder);
}

function disposePlaceholder() {
  if (!heroPlaceholder) return;
  heroVisualPivot.remove(heroPlaceholder);
  heroPlaceholder.geometry.dispose();
  heroPlaceholder.material.dispose();
  heroPlaceholder = null;
}

function prepareHeroModelMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;

    child.frustumCulled = false;
    child.castShadow = true;
    child.receiveShadow = true;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;

      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
      } else if (material.color) {
        const brightness = material.color.r + material.color.g + material.color.b;
        if (brightness < 0.2) {
          material.color.setHex(0xc5cec8);
        }
      }

      if ('metalness' in material) material.metalness = Math.min(material.metalness ?? 0, 0.25);
      if ('roughness' in material) material.roughness = Math.max(material.roughness ?? 0.8, 0.55);

      material.side = THREE.DoubleSide;
      material.needsUpdate = true;
    }
  });
}

function measureHeroModelBox(model) {
  const box = new THREE.Box3();
  model.updateMatrixWorld(true);

  model.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;

    const geometry = child.geometry;
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }

    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;

    const meshBox = geometry.boundingBox.clone();
    meshBox.applyMatrix4(child.matrixWorld);
    box.union(meshBox);
  });

  if (box.isEmpty()) {
    box.min.set(-0.11, -0.5, -0.22);
    box.max.set(0.11, 0.5, 0.22);
  }

  return box;
}

function fitHeroModelToGround(model, rotationY, scaleMultiplier = 1) {
  prepareHeroModelMaterials(model);

  model.rotation.set(0, rotationY, 0);
  model.updateMatrixWorld(true);

  const box = measureHeroModelBox(model);
  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(size.y, size.x, size.z, 0.01);
  const scale = (CONFIG.heroTargetHeight / height) * scaleMultiplier;

  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const fittedBox = measureHeroModelBox(model);
  const center = fittedBox.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -fittedBox.min.y, -center.z);
  model.userData.groundLockPosition = model.position.clone();
  heroModelBaseRotationY = rotationY;

  return { scale, height, size };
}

function mountMenuHeroModel(model) {
  const fit = fitHeroModelToGround(
    model,
    CONFIG.menuHeroRotationY,
    CONFIG.menuHeroPreviewScale
  );
  console.info('[hero] 主菜单模型尺寸', {
    height: fit.height.toFixed(3),
    scale: fit.scale.toFixed(3),
  });

  if (menuHeroModel?.parent) {
    heroVisualPivot.remove(menuHeroModel);
  }
  if (heroModel?.parent && heroModel !== menuHeroModel) {
    heroVisualPivot.remove(heroModel);
  }

  disposePlaceholder();
  heroVisualPivot.add(model);
  menuHeroModel = model;
  heroModel = model;
  applyMenuPreviewLayout();
}

function mountHeroModel(model, rotationY = CONFIG.heroModelRotationY) {
  fitHeroModelToGround(model, rotationY);

  if (menuHeroModel?.parent) {
    heroVisualPivot.remove(menuHeroModel);
    menuHeroModel = null;
  }
  if (heroModel?.parent) {
    heroVisualPivot.remove(heroModel);
  }

  disposePlaceholder();
  heroVisualPivot.add(model);
  heroModel = model;
}

function findAnimClip(animations, includeKeywords, excludeKeywords = []) {
  const include = includeKeywords.map((k) => k.toLowerCase());
  const exclude = excludeKeywords.map((k) => k.toLowerCase());

  return animations.find((clip) => {
    const name = clip.name.toLowerCase();
    if (exclude.some((key) => name.includes(key))) return false;
    return include.some((key) => name.includes(key));
  });
}

/** 去掉 Mixamo 动画里 Hips/Root 位移轨道，避免角色平移/弹回原点 */
function stripRootMotionTracks(clip) {
  if (!clip?.tracks?.length) return clip;

  const tracks = clip.tracks.filter((track) => {
    if (!track.name.endsWith('.position')) return true;
    const bone = track.name.slice(0, -'.position'.length).toLowerCase();
    return !/(hips|root)/.test(bone);
  });

  if (tracks.length === clip.tracks.length) return clip;

  const hasMotion = tracks.some(
    (track) =>
      track.name.endsWith('.quaternion') ||
      track.name.endsWith('.rotation') ||
      track.name.endsWith('.scale')
  );
  if (!hasMotion) return clip;

  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function setupHeroAnimations(root, animations, extraClips = {}) {
  if (!animations?.length && !extraClips.jump && !extraClips.slide) return;

  if (heroMixer) {
    heroMixer.stopAllAction();
  }

  heroMixer = new THREE.AnimationMixer(root);
  heroMixer.addEventListener('finished', onHeroMixerFinished);

  heroRunAction = null;
  heroJumpAction = null;
  heroSlideAction = null;
  isJumpAnimPlaying = false;
  isSlideAnimPlaying = false;
  pendingRunResume = false;

  const runClipRaw =
    findAnimClip(animations, ['run', 'fast', 'mixamo'], ['jump', 'slide']) ||
    animations.find((clip) => clip !== extraClips.jump && clip !== extraClips.slide) ||
    animations[0];
  const runClip = runClipRaw ? stripRootMotionTracks(runClipRaw) : null;
  const jumpClipRaw = extraClips.jump || findAnimClip(animations, ['jump']);
  const slideClipRaw = extraClips.slide || findAnimClip(animations, ['slide']);
  const jumpClip = jumpClipRaw ? stripRootMotionTracks(jumpClipRaw) : null;
  const slideClip = slideClipRaw ? stripRootMotionTracks(slideClipRaw) : null;

  if (runClip) {
    heroRunAction = heroMixer.clipAction(runClip);
    heroRunAction.setLoop(THREE.LoopRepeat);
    heroRunAction.timeScale = CONFIG.runAnimTimeScale;
    heroRunAction.setEffectiveWeight(1);
    heroRunAction.play();
  }

  if (jumpClip) {
    heroJumpAction = heroMixer.clipAction(jumpClip);
    heroJumpAction.setLoop(THREE.LoopOnce);
    heroJumpAction.clampWhenFinished = true;
    heroJumpAction.timeScale = CONFIG.jumpAnimTimeScale;
  }

  if (slideClip) {
    heroSlideAction = heroMixer.clipAction(slideClip);
    heroSlideAction.setLoop(THREE.LoopOnce);
    heroSlideAction.clampWhenFinished = true;
    heroSlideAction.timeScale = CONFIG.slideAnimTimeScale;
  }

  if (gameState === 'MENU' && heroRunAction) {
    heroRunAction.paused = true;
  } else if (gameState === 'PLAYING') {
    finalizeHeroGroundFit();
  }
}

function resumeHeroRunAnimation(fromAction = null) {
  if (!heroRunAction) {
    isJumpAnimPlaying = false;
    isSlideAnimPlaying = false;
    pendingRunResume = false;
    return;
  }

  const fade = CONFIG.actionCrossFade ?? 0.18;
  const outgoing =
    fromAction ||
    (heroJumpAction?.getEffectiveWeight() > 0.05 ? heroJumpAction : null) ||
    (heroSlideAction?.getEffectiveWeight() > 0.05 ? heroSlideAction : null);

  isJumpAnimPlaying = false;
  isSlideAnimPlaying = false;
  pendingRunResume = false;

  heroRunAction.enabled = true;
  heroRunAction.paused = false;
  heroRunAction.setLoop(THREE.LoopRepeat);
  heroRunAction.setEffectiveTimeScale(CONFIG.runAnimTimeScale);
  heroRunAction.setEffectiveWeight(1);
  if (!heroRunAction.isRunning()) {
    heroRunAction.play();
  }

  if (outgoing && outgoing !== heroRunAction) {
    heroRunAction.crossFadeFrom(outgoing, fade, true);
    outgoing.fadeOut(fade);
  } else {
    heroJumpAction?.setEffectiveWeight(0);
    heroSlideAction?.setEffectiveWeight(0);
  }

  lockHeroModelToGround();
  resetSlideVisualPivotImmediate();
}

function playHeroJumpAnimation() {
  if (!heroJumpAction || !heroRunAction) return;

  const fade = CONFIG.actionCrossFade ?? 0.18;
  heroJumpAction.reset();
  heroJumpAction.setEffectiveTimeScale(CONFIG.jumpAnimTimeScale);
  heroJumpAction.setEffectiveWeight(1);
  heroJumpAction.play();
  heroJumpAction.crossFadeFrom(heroRunAction, fade, true);
  isJumpAnimPlaying = true;
}

function playHeroSlideAnimation() {
  if (!heroSlideAction || !heroRunAction) {
    return false;
  }

  const fade = CONFIG.actionCrossFade ?? 0.18;
  heroSlideAction.reset();
  heroSlideAction.setEffectiveTimeScale(CONFIG.slideAnimTimeScale);
  heroSlideAction.setEffectiveWeight(1);
  heroSlideAction.play();
  heroSlideAction.crossFadeFrom(heroRunAction, fade, true);
  isSlideAnimPlaying = true;
  return true;
}

/** 地面跑步时保持 Run 循环播放，避免权重被 crossFade 压成 0 后卡成贴纸 */
function syncHeroRunPlayback() {
  if (!heroRunAction || gameState !== 'PLAYING' || hasCollided) return;

  const holdRun =
    isSlideLocked() ||
    isJumpAnimPlaying ||
    isSlideAnimPlaying ||
    isMainJumpAirborne();

  if (holdRun) {
    heroRunAction.paused = true;
    return;
  }

  heroRunAction.paused = false;
  heroRunAction.enabled = true;

  const runWeight = heroRunAction.getEffectiveWeight();
  const jumpWeight = heroJumpAction?.getEffectiveWeight() ?? 0;
  const slideWeight = heroSlideAction?.getEffectiveWeight() ?? 0;

  if (runWeight < 0.85 && jumpWeight < 0.08 && slideWeight < 0.08) {
    heroJumpAction?.setEffectiveWeight(0);
    heroSlideAction?.setEffectiveWeight(0);
    heroRunAction.setEffectiveWeight(1);
    heroRunAction.setEffectiveTimeScale(CONFIG.runAnimTimeScale);
    if (!heroRunAction.isRunning()) {
      heroRunAction.play();
    }
  }
}

function requestRunResumeAfterJump(fromAction = null) {
  if (isHeroGrounded() && !isSlideLocked()) {
    resumeHeroRunAnimation(fromAction);
  } else {
    pendingRunResume = true;
  }
}

function finishSlide() {
  if (!isSliding) return;

  isSliding = false;
  slideTimer = 0;
  isSlideAnimPlaying = false;
  wasAirborne = false;
  landingSquashTimer = 0;
  pinHeroToGround();
  lockHeroModelToGround();
  slideRecoveryTimer = CONFIG.slideExitDuration;
  resumeHeroRunAnimation(heroSlideAction);
}

function onHeroMixerFinished(event) {
  if (event.action === heroJumpAction) {
    isJumpAnimPlaying = false;
    lockHeroModelToGround();
    requestRunResumeAfterJump(event.action);
    return;
  }

  if (event.action === heroSlideAction) {
    finishSlide();
  }
}

async function loadHeroJumpClip() {
  const fileExists = await verifyModelFile(CONFIG.heroJumpAnimPath);
  if (!fileExists) return null;

  const fbx = await loadFbxAsync(new FBXLoader(), CONFIG.heroJumpAnimPath, 'RunningJump.fbx');
  const clip = fbx.animations.find((anim) => /mixamo|jump/i.test(anim.name)) || fbx.animations[0];
  if (!clip) return null;

  clip.name = 'RunningJump';
  return clip;
}

async function loadHeroSlideClip() {
  const fileExists = await verifyModelFile(CONFIG.heroSlideAnimPath);
  if (!fileExists) return null;

  const fbx = await loadFbxAsync(new FBXLoader(), CONFIG.heroSlideAnimPath, 'RunningSlide.fbx');
  const clip = fbx.animations.find((anim) => /mixamo|slide/i.test(anim.name)) || fbx.animations[0];
  if (!clip) return null;

  clip.name = 'RunningSlide';
  return clip;
}

/** 主菜单：加载 Tripo3D 静态 hero.glb 作为旋转预览 */
async function loadMenuHeroModel() {
  const requestUrl = resolveAssetUrl(CONFIG.menuHeroModelPath);
  const fileExists = await verifyModelFile(CONFIG.menuHeroModelPath);
  if (!fileExists) {
    console.warn('[hero] 找不到主菜单模型', { requestUrl });
    setModelStatus('占位球预览 · 点击开始游戏', true);
    markHeroModelReady();
    return;
  }

  try {
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loadGltfAsync(loader, CONFIG.menuHeroModelPath, 'menu hero.glb');
    menuHeroAnimations = gltf.animations || [];
    menuHeroTemplate = gltf.scene;
    mountMenuHeroModel(gltf.scene);
    console.info('[hero] 主菜单 hero.glb 已加载', requestUrl);
    markHeroModelReady('角色预览就绪 · 点击开始游戏');
  } catch (error) {
    console.warn('[hero] 主菜单模型解析失败', { requestUrl, error });
    setModelStatus(`主菜单模型加载失败：${error.message}`, true);
    markHeroModelReady();
  }
}

/** 判断 hero_animated.glb 是否为独立游戏模型（非 menu hero.glb 的副本） */
async function isDistinctAnimatedHeroModel(relativePath) {
  if (!(await verifyModelFile(relativePath))) return false;
  if (!(await verifyModelFile(CONFIG.menuHeroModelPath))) return true;

  try {
    const [animatedHead, menuHead] = await Promise.all([
      fetch(resolveAssetUrl(relativePath), { method: 'HEAD' }),
      fetch(resolveAssetUrl(CONFIG.menuHeroModelPath), { method: 'HEAD' }),
    ]);
    const animatedSize = Number(animatedHead.headers.get('content-length') || 0);
    const menuSize = Number(menuHead.headers.get('content-length') || 0);
    if (animatedSize > 0 && menuSize > 0 && animatedSize === menuSize) {
      console.warn(
        '[hero] hero_animated.glb 与 hero.glb 大小相同，视为菜单模型副本，改用 FBX 游戏模型',
        { animatedSize }
      );
      return false;
    }
  } catch (error) {
    console.warn('[hero] 无法比对动画模型与菜单模型', error);
  }

  return true;
}

async function tryLoadFbxGameplayHero() {
  if (!(await verifyModelFile(CONFIG.heroRunAnimPath))) return null;

  try {
    const fbx = await loadFbxAsync(new FBXLoader(), CONFIG.heroRunAnimPath, 'FastRun.fbx');
    let jumpClip = null;
    let slideClip = null;
    try {
      jumpClip = await loadHeroJumpClip();
    } catch (error) {
      console.warn('[hero] RunningJump.fbx 加载失败', error);
    }
    try {
      slideClip = await loadHeroSlideClip();
    } catch (error) {
      console.warn('[hero] RunningSlide.fbx 加载失败', error);
    }

    const loaded = [jumpClip && '跳跃', slideClip && '滑铲'].filter(Boolean);
    console.info('[hero] Mixamo FBX 游戏模型已预加载', loaded.join(' + ') || '跑步');
    return {
      kind: 'fbx',
      root: fbx,
      animations: fbx.animations,
      extraClips: { jump: jumpClip, slide: slideClip },
      rotationY: CONFIG.heroRunRotationY,
    };
  } catch (error) {
    console.warn('[hero] FastRun.fbx 预加载失败', error);
    return null;
  }
}

async function tryLoadGltfGameplayHero() {
  const animatedCandidates = [CONFIG.heroAnimatedPath, 'assets/hero_animated.glb'];

  for (const relativePath of [...new Set(animatedCandidates)]) {
    if (!(await isDistinctAnimatedHeroModel(relativePath))) continue;

    const requestUrl = resolveAssetUrl(relativePath);
    try {
      await MeshoptDecoder.ready;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loadGltfAsync(loader, relativePath, 'hero_animated.glb');

      if (!gltf.animations.length) {
        console.warn('[hero] hero_animated.glb 无动画轨道', { requestUrl });
        continue;
      }

      const clipNames = gltf.animations.map((clip) => clip.name).join(', ');
      console.info('[hero] 游戏模型 hero_animated.glb 已预加载', clipNames, requestUrl);
      return {
        kind: 'gltf',
        root: gltf.scene,
        animations: gltf.animations,
        rotationY: CONFIG.heroAnimatedRotationY,
      };
    } catch (error) {
      console.warn('[hero] hero_animated.glb 预加载失败', { requestUrl, error });
    }
  }

  return null;
}

/** 预加载游戏用动画模型（不挂载到场景） */
async function fetchGameplayHeroData() {
  const fbxData = await tryLoadFbxGameplayHero();
  if (fbxData) return fbxData;

  const gltfData = await tryLoadGltfGameplayHero();
  if (gltfData) return gltfData;

  return null;
}

function preloadGameplayHero() {
  if (gameplayHeroCache) return Promise.resolve(gameplayHeroCache);
  if (gameplayHeroLoadPromise) return gameplayHeroLoadPromise;

  gameplayHeroLoadPromise = fetchGameplayHeroData().then((data) => {
    gameplayHeroCache = data;
    return data;
  });
  return gameplayHeroLoadPromise;
}

/** 开始游戏时：移除菜单预览，切换为带动画的游戏模型 */
async function swapToGameplayHero() {
  const data = await preloadGameplayHero();

  if (data) {
    const model = data.kind === 'gltf' ? SkeletonUtils.clone(data.root) : data.root;
    mountHeroModel(model, data.rotationY);
    setupHeroAnimations(heroModel, data.animations, data.extraClips || {});
    return;
  }

  if (menuHeroModel) {
    const model = SkeletonUtils.clone(menuHeroModel);
    mountHeroModel(model, CONFIG.menuHeroRotationY);
    if (menuHeroAnimations.length) {
      setupHeroAnimations(heroModel, menuHeroAnimations);
      console.info('[hero] 使用 hero.glb 内嵌动画进行游戏');
    } else {
      heroMixer = null;
      heroRunAction = null;
      heroJumpAction = null;
      heroSlideAction = null;
      console.info('[hero] 无动画模型，使用主菜单 hero.glb 进行游戏');
    }
    return;
  }

  throw new Error('没有可用的游戏角色模型');
}

/** 确认模型文件存在且不是 404 返回的 HTML */
async function verifyModelFile(relativePath) {
  const requestUrl = resolveAssetUrl(relativePath);
  try {
    const response = await fetch(requestUrl, { method: 'HEAD' });
    if (!response.ok) {
      console.warn('[asset] HEAD 失败', { requestUrl, status: response.status });
      return false;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      console.warn('[asset] 返回 HTML 而非模型文件（多为 404）', { requestUrl, contentType });
      return false;
    }

    const size = Number(response.headers.get('content-length') || 0);
    if (size > 12) return true;

    // GitHub Pages 等环境 HEAD 可能无 Content-Length，200 且非 HTML 即视为存在
    if (response.ok) return true;

    console.warn('[asset] 文件过小或缺少 Content-Length', { requestUrl, size });
    return false;
  } catch (error) {
    console.warn('[asset] HEAD 请求异常', { requestUrl, error });
    return false;
  }
}

// ---------------------------------------------------------------------------
// 键盘换道
// ---------------------------------------------------------------------------
function handleKeyDown(keyEvent) {
  const key = keyEvent.key.toLowerCase();

  if (key === 'escape') {
    if (gameState === 'PLAYING' || gameState === 'GAMEOVER' || gameState === 'MENU') {
      toggleSettingsPanel();
      keyEvent.preventDefault();
    }
    return;
  }

  if (isPaused) {
    return;
  }

  if (gameState === 'MENU') {
    return;
  }

  if (gameState === 'GAMEOVER') {
    if (key === 'r') {
      resetGame();
    }
    return;
  }

  const code = keyEvent.keyCode;
  const isJumpKey = code === 38 || key === 'w';
  const isSlideKey = code === 40 || key === 's';
  const isLaneKey =
    code === 37 ||
    code === 39 ||
    key === 'a' ||
    key === 'd';

  if (isJumpKey || isSlideKey || isLaneKey) {
    keyEvent.preventDefault();
  }

  if (isJumpKey) {
    if (!keyEvent.repeat) {
      queueJumpInput();
    }
    return;
  }

  if (isSlideKey) {
    if (!keyEvent.repeat) {
      startSlide();
    }
    return;
  }

  let validMove = true;
  let targetLane = currentLane;

  if (code === 37 || key === 'a') {
    if (currentLane === CONFIG.middleLane && canSwitchToLane(CONFIG.leftLane)) {
      targetLane = CONFIG.leftLane;
    } else if (currentLane === CONFIG.rightLane && canSwitchToLane(CONFIG.middleLane)) {
      targetLane = CONFIG.middleLane;
    } else validMove = false;
  } else if (code === 39 || key === 'd') {
    if (currentLane === CONFIG.middleLane && canSwitchToLane(CONFIG.rightLane)) {
      targetLane = CONFIG.rightLane;
    } else if (currentLane === CONFIG.leftLane && canSwitchToLane(CONFIG.middleLane)) {
      targetLane = CONFIG.middleLane;
    } else validMove = false;
  } else {
    validMove = false;
  }

  if (!validMove) return;
  currentLane = targetLane;

  // 地面换道保留小跳；大跳/滑铲腾空时只平移赛道，不叠加垂直速度
  const canLaneHop =
    isHeroGrounded() &&
    !isMainJumpAirborne() &&
    !isJumpAnimPlaying &&
    !isSlideLocked();

  if (canLaneHop) {
    bounceValue = CONFIG.laneHopVelocity;
  }
}

function addLight() {
  const ambient = new THREE.AmbientLight(CONFIG.ambientColor, CONFIG.ambientIntensity);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(
    CONFIG.hemiSkyColor,
    CONFIG.hemiGroundColor,
    CONFIG.hemiIntensity
  );
  hemi.position.set(0, 30, 0);
  scene.add(hemi);

  sunLight = new THREE.DirectionalLight(CONFIG.sunColor, CONFIG.sunIntensity);
  sunLight.position.set(
    CONFIG.sunPosition.x,
    CONFIG.sunPosition.y,
    CONFIG.sunPosition.z
  );
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(CONFIG.shadowMapSize, CONFIG.shadowMapSize);
  sunLight.shadow.camera.near = 1.5;
  sunLight.shadow.camera.far = 55;

  const shadowHalf = CONFIG.shadowCameraSize;
  sunLight.shadow.camera.left = -shadowHalf;
  sunLight.shadow.camera.right = shadowHalf;
  sunLight.shadow.camera.top = shadowHalf;
  sunLight.shadow.camera.bottom = -shadowHalf;

  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.03;
  sunLight.shadow.radius = CONFIG.shadowSoftness;

  sunLight.target.position.set(0, CONFIG.trackY, -6);
  scene.add(sunLight.target);
  scene.add(sunLight);

  const fill = new THREE.DirectionalLight(CONFIG.fillLightColor, CONFIG.fillLightIntensity);
  fill.position.set(-10, 8, 8);
  scene.add(fill);
}

/** 阴影相机跟随主角，保证近处阴影清晰 */
function updateShadowLight() {
  if (!sunLight || !heroRoot) return;

  sunLight.target.position.set(
    heroRoot.position.x,
    CONFIG.trackY,
    heroRoot.position.z - 6
  );
}

/** 下滑：前倾贴地冲刺（仅 pivot 视觉，根节点 Y 锁死） */
function updateSlideAnimation(delta) {
  if (!heroVisualPivot || !isSliding) return;

  pinHeroToGround();
  lockHeroModelToGround();
  slideTimer -= delta;

  const exitT =
    slideTimer < CONFIG.slideExitDuration
      ? 1 - slideTimer / CONFIG.slideExitDuration
      : 0;
  const blend = exitT > 0 ? 1 - exitT : 1;

  applySlideVisualPose(blend);

  if (slideTimer <= 0) {
    finishSlide();
  }
}

/** 跳跃时前倾 + 空中拉伸 / 落地 squash（纯代码动画） */
function updateJumpAnimation(delta) {
  if (!heroVisualPivot || isSlideLocked()) return;

  const grounded = isHeroGrounded();
  const airborne = !grounded;
  const airHeight = Math.max(0, heroRoot.position.y - CONFIG.heroBaseY);
  const airT = THREE.MathUtils.clamp(airHeight / getJumpPeakHeight(), 0, 1);
  const rising = bounceValue > 0;
  const smooth = 1 - Math.exp(-28 * delta);

  if (wasAirborne && grounded) {
    landingSquashTimer = CONFIG.landingSquashDuration;
    if (pendingRunResume) {
      resumeHeroRunAnimation(heroJumpAction);
    }
  }
  wasAirborne = airborne;

  if (airborne) {
    const lean = rising
      ? CONFIG.jumpLeanAngle * (0.55 + airT * 0.45)
      : CONFIG.jumpLeanAngle * 0.35;
    heroVisualPivot.rotation.x = THREE.MathUtils.lerp(
      heroVisualPivot.rotation.x,
      lean,
      smooth
    );

    if (rising) {
      jumpAnimScale.set(
        1 - airT * CONFIG.jumpSquash,
        1 + airT * CONFIG.jumpStretch,
        1 - airT * CONFIG.jumpSquash
      );
    } else {
      jumpAnimScale.set(
        1 + airT * CONFIG.jumpSquash * 0.6,
        1 - airT * CONFIG.jumpStretch * 0.5,
        1 + airT * CONFIG.jumpSquash * 0.6
      );
    }
    heroVisualPivot.scale.lerp(jumpAnimScale, smooth);
    return;
  }

  if (landingSquashTimer > 0) {
    landingSquashTimer -= delta;
    const t = landingSquashTimer / CONFIG.landingSquashDuration;
    heroVisualPivot.rotation.x = THREE.MathUtils.lerp(
      heroVisualPivot.rotation.x,
      -0.06 * t,
      smooth
    );
    heroVisualPivot.scale.set(
      1 + t * CONFIG.jumpSquash,
      1 - t * CONFIG.jumpStretch,
      1 + t * CONFIG.jumpSquash
    );
    return;
  }

  heroVisualPivot.rotation.x = THREE.MathUtils.lerp(heroVisualPivot.rotation.x, 0, smooth);
  heroVisualPivot.scale.lerp(jumpAnimScale.set(1, 1, 1), smooth);
}

function updateHeroActionAnimation(delta) {
  if (isSliding) {
    pinHeroToGround();
    lockHeroModelToGround();

    const exitT =
      slideTimer < CONFIG.slideExitDuration
        ? 1 - slideTimer / CONFIG.slideExitDuration
        : 0;
    const blend = exitT > 0 ? 1 - exitT : 1;
    applySlideVisualPose(blend);

    if (hasSkeletalSlideAnim()) {
      slideTimer -= delta;
      if (slideTimer <= 0 && isSlideAnimPlaying) {
        finishSlide();
      }
    } else {
      updateSlideAnimation(delta);
    }
    return;
  }

  if (updateSlideRecovery(delta)) {
    return;
  }

  if (!hasSkeletalAnim() || !isJumpAnimPlaying) {
    updateJumpAnimation(delta);
  }

  if (isJumpAnimPlaying || isMainJumpAirborne()) {
    lockHeroModelToGround();
  }
}

function updateHeroVerticalPhysics(delta) {
  if (isSlideLocked()) {
    pinHeroToGround();
    return;
  }

  if (heroRoot.position.y <= CONFIG.heroBaseY) {
    heroRoot.position.y = CONFIG.heroBaseY;
    if (bounceValue < 0) {
      bounceValue = 0;
    }
  }

  heroRoot.position.y += bounceValue * delta;
  bounceValue -= CONFIG.gravity * delta;

  if (heroRoot.position.y < CONFIG.heroBaseY) {
    heroRoot.position.y = CONFIG.heroBaseY;
    if (bounceValue < 0) {
      bounceValue = 0;
    }
  }
}

function setupCamera() {
  updateCamera();
}

/** 第三人称：相机平滑跟随主角（含滑铲下蹲偏移） */
function updateCamera(delta = 1 / 60) {
  const visualYOffset = heroVisualPivot?.position.y ?? 0;
  const targetHeight = heroRoot.position.y + visualYOffset;
  const smooth = 1 - Math.exp(-(CONFIG.cameraFollowSmooth ?? 14) * delta);
  cameraHeightSmoothed = THREE.MathUtils.lerp(cameraHeightSmoothed, targetHeight, smooth);

  camera.position.set(
    heroRoot.position.x + CONFIG.cameraOffset.x,
    cameraHeightSmoothed + CONFIG.cameraOffset.y,
    heroRoot.position.z + CONFIG.cameraOffset.z
  );
  camera.lookAt(
    heroRoot.position.x,
    cameraHeightSmoothed + CONFIG.cameraLookAhead.y,
    heroRoot.position.z + CONFIG.cameraLookAhead.z
  );
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  update();
  render();
}

function update() {
  const delta = clock.getDelta();

  if (gameState === 'MENU') {
    updateMenuPreview();
    updateShadowLight();
    updateMenuPreviewLight();
    updateCameraMenuPreview();
    updateRoadsideFoliageScroll(
      CONFIG.rollingSpeed * CONFIG.worldRadius * CONFIG.trackScrollFactor * delta * 0.22
    );
    if (heroMixer) {
      heroMixer.update(delta);
    }
    return;
  }

  if (gameState === 'PLAYING' && isPaused) {
    if (countdownRemaining > 0) {
      updateAdaptationCountdown(delta);
      updateShadowLight();
      updateCamera(delta);
      if (heroMixer) {
        syncHeroRunPlayback();
        heroMixer.update(0);
        if (isHeroGrounded() && !isSlideLocked()) {
          compensateHeroFootSink();
        }
      }
      return;
    }

    updateShadowLight();
    updateCamera(delta);
    if (heroMixer) {
      heroMixer.update(0);
    }
    return;
  }

  updateLanePlatforms(delta);
  updateShadowLight();

  if (gameState === 'GAMEOVER') {
    updateExplosion();
    updateCamera(delta);
    if (heroMixer) {
      heroMixer.update(delta);
    }
    return;
  }

  if (heroPlaceholder && heroRoot.position.y <= CONFIG.heroBaseY + GROUND_EPSILON) {
    heroPlaceholder.rotation.x -= heroRollingSpeed;
  }

  updateHeroVerticalPhysics(delta);
  updateJumpInputBuffer(delta);

  heroRoot.position.x = THREE.MathUtils.lerp(
    heroRoot.position.x,
    laneToX(currentLane),
    CONFIG.laneLerpFactor * delta
  );

  const tiltTarget = -(heroRoot.position.x - laneToX(currentLane)) * 0.22;
  heroRoot.rotation.z = THREE.MathUtils.lerp(
    heroRoot.rotation.z,
    tiltTarget,
    1 - Math.exp(-12 * delta)
  );

  if (heroMixer) {
    syncHeroRunPlayback();
    heroMixer.update(delta);
    if (isHeroGrounded() && !isSlideLocked()) {
      lockHeroModelToGround();
      compensateHeroFootSink();
    } else if (
      isSliding ||
      isJumpAnimPlaying ||
      isSlideAnimPlaying ||
      isMainJumpAirborne()
    ) {
      lockHeroModelToGround();
    }
  }

  if (isSlideLocked()) {
    pinHeroToGround();
  }

  updateHeroActionAnimation(delta);
  updateRunSfx();
  updateTrees(delta);
  updateExplosion();
  updateCamera(delta);
}

function render() {
  renderer.render(scene, camera);
}

function onWindowResize() {
  sceneWidth = window.innerWidth;
  sceneHeight = window.innerHeight;
  renderer.setSize(sceneWidth, sceneHeight);
  camera.aspect = sceneWidth / sceneHeight;
  camera.updateProjectionMatrix();
}

init();
