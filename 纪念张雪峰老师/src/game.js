import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

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
  idleBounceVelocityMin: 0.28,
  idleBounceVelocityMax: 0.52,
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
  passMarginGround: 0.14,
  passMarginOverhead: 0.14,
  branchColor: 0x5c3d1e,
  branchLeafColor: 0x2f6b38,
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
  /** 远景森林半球剪影 */
  distantForestLayers: [
    { z: -38, y: 1.8, scaleX: 34, scaleY: 7, color: 0x2f6340 },
    { z: -50, y: 2.6, scaleX: 44, scaleY: 10, color: 0x285538 },
    { z: -64, y: 3.4, scaleX: 54, scaleY: 13, color: 0x1f452c },
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
  menuHeroModelPath: '/models/hero.glb',
  menuHeroRotationY: Math.PI / 2,
  /** 游戏中使用的动画模型 */
  heroAnimatedPath: '/assets/hero_animated.glb',
  /** 静态备用模型 */
  heroModelPath: '/models/hero.glb',
  /** 旧版 FBX 动画备用 */
  heroRunAnimPath: '/models/FastRun.fbx',
  heroJumpAnimPath: '/models/RunningJump.fbx',
  heroSlideAnimPath: '/models/RunningSlide.fbx',
  runAnimTimeScale: 1.2,
  jumpAnimTimeScale: 1.45,
  slideAnimTimeScale: 1.75,
  slideMaxDuration: 1.05,
  jumpCrossFade: 0,
  slideCrossFade: 0,
  heroTargetHeight: 1.22,
  /** 主角世界坐标：中央赛道、踩在平面跑道顶面 */
  heroPosition: { x: 0, y: 0.33, z: 4.8 },
  trackScrollFactor: 32,
  /** 摄像机：高斜俯视，看更远便于预判障碍 */
  cameraOffset: { x: 0, y: 4.2, z: 4.7 },
  cameraLookAhead: { y: 1.2, z: -13 },
  cameraFov: 58,
  /** 模型默认朝 +X；+90° 后面向 -Z（背对镜头、朝跑道跑） */
  heroModelRotationY: Math.PI / 2,
  /** Mixamo GLB 朝 -Z 奔跑 */
  heroAnimatedRotationY: Math.PI,
  /** Mixamo FBX 备用朝向 */
  heroRunRotationY: Math.PI,
  /** 左 / 中 / 右 三赛道在球面上的角度 */
  pathAngleValues: [1.46, 1.57, 1.68],
  /** 障碍生成：更稀疏、更早出现以便预判 */
  treeReleaseInterval: 3.4,
  treeSpawnChance: 0.36,
  secondTreeChance: 0.1,
  spawnGracePeriod: 5,
  maxTreesInPool: 14,
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
  bgmPath: '/audio/念张师.mp3',
  bgmVolume: 0.45,
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
/** 高低障碍交替：ground → overhead → ground … */
let nextPathObstacleType = 'ground';
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

function isGameActive() {
  return gameState === 'PLAYING';
}

function getScrollSpeedMultiplier() {
  return gameState === 'PLAYING' ? 1 : 0;
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
  if (!heroVisualPivot) return;

  heroVisualPivot.rotation.x = THREE.MathUtils.degToRad(CONFIG.slideLeanDeg);
  heroVisualPivot.scale.set(1.08, CONFIG.slideSquashY, CONFIG.slideStretchZ);
  heroVisualPivot.position.y = 0;
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
  heroJumpAction?.stop();

  if (hasSkeletalSlideAnim() && playHeroSlideAnimation()) {
    resetSlideVisualPivotImmediate();
    slideTimer = getSlideAnimDuration();
  } else {
    applySlidePoseImmediate();
    slideTimer = CONFIG.slideDuration;
  }
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
    restartBtnEl.addEventListener('click', () => resetGame());
  }

  if (hudEl) {
    hudEl.classList.add('hud--menu');
  }
}

function onBgmUnlockAttempt() {
  tryStartBackgroundMusic();
}

function tryStartBackgroundMusic() {
  if (bgmStarted || !bgmAudio) return;

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

/** 进入主菜单即尝试播放；若浏览器拦截则首次点击/按键后启动 */
function setupBackgroundMusic() {
  bgmAudio = new Audio(CONFIG.bgmPath);
  bgmAudio.loop = true;
  bgmAudio.volume = CONFIG.bgmVolume;
  bgmAudio.preload = 'auto';

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

  if (startBtnEl) {
    startBtnEl.disabled = true;
    startBtnEl.textContent = '加载中…';
  }

  gameState = 'PLAYING';

  if (mainMenuEl) {
    mainMenuEl.classList.add('is-hidden');
  }
  if (hudEl) {
    hudEl.classList.remove('hud--menu');
  }

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
      spawnGraceRemaining = CONFIG.spawnGracePeriod;
      bounceValue = 0;
      tryStartBackgroundMusic();
      setModelStatus('游戏进行中');
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
  const sides = 40;
  const tiers = 40;
  const sphereGeometry = new THREE.SphereGeometry(CONFIG.worldRadius, sides, tiers);
  deformGroundSurface(sphereGeometry, sides, tiers);

  rollingGroundSphere = new THREE.Mesh(
    sphereGeometry,
    new THREE.MeshStandardMaterial({
      color: CONFIG.grassColor,
      flatShading: true,
      roughness: 0.92,
    })
  );
  rollingGroundSphere.receiveShadow = true;
  rollingGroundSphere.rotation.z = -Math.PI / 2;
  // 球形底层下沉，避免穿过平面赛道和主角
  rollingGroundSphere.position.set(0, -42, -8);
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
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
      mat
    );
    dome.position.set(0, layer.y, layer.z);
    dome.scale.set(layer.scaleX, layer.scaleY, layer.scaleZ);
    distantForestGroup.add(dome);

    const sideScale = 0.48 + Math.random() * 0.12;
    for (const xOffset of [-22, 22, -34, 34]) {
      const hill = dome.clone();
      hill.position.set(xOffset, layer.y * 0.88, layer.z - 2 - Math.abs(xOffset) * 0.08);
      hill.scale.multiplyScalar(sideScale);
      distantForestGroup.add(hill);
    }
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

  const scale = CONFIG.obstacleHitboxScale ?? 1;
  const { x, y, z } = obstacle.position;
  return {
    type: hitbox.type,
    minX: x - hitbox.halfWidth * scale,
    maxX: x + hitbox.halfWidth * scale,
    minY: hitbox.minY,
    maxY: hitbox.maxY,
    minZ: z - hitbox.halfDepth * scale,
    maxZ: z + hitbox.halfDepth * scale,
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
    const clearFeetY = Math.max(
      obstacleBox.maxY - CONFIG.passMarginGround,
      CONFIG.heroBaseY + CONFIG.lowObstacleHeight * 0.65
    );
    if (heroBox.minY >= clearFeetY) {
      if (obstacle) obstacle.userData.jumpCleared = true;
      return false;
    }
    // 起跳越过障碍后，落地时 Z 盒仍重叠 — 不应再判撞
    if (obstacle?.userData.jumpCleared) {
      return false;
    }
    return true;
  }

  if (obstacleBox.type === 'overhead') {
    const clearHeadY = obstacleBox.clearanceBottom + CONFIG.passMarginOverhead;
    if (heroBox.maxY <= clearHeadY) {
      if (obstacle) obstacle.userData.slideCleared = true;
      return false;
    }
    if (obstacle?.userData.slideCleared) {
      return false;
    }
    return heroBox.minY < obstacleBox.maxY;
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

/** 低空障碍：横倒树干 或 扁平石块（迫使跳跃） */
function buildLowObstacle(group) {
  const trackTop = CONFIG.trackTopY;
  const useLog = Math.random() < 0.55;
  const height = CONFIG.lowObstacleHeight;
  let halfWidth = CONFIG.lowObstacleHalfWidth;
  let halfDepth = CONFIG.lowObstacleHalfDepth;

  if (useLog) {
    const radius = CONFIG.logRadius;
    const length = CONFIG.logLength;
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.05, length, 10),
      new THREE.MeshStandardMaterial({
        color: CONFIG.logColor,
        flatShading: true,
        roughness: 0.92,
      })
    );
    log.rotation.x = Math.PI / 2;
    log.position.y = trackTop + radius;
    log.castShadow = true;
    log.receiveShadow = true;
    group.add(log);

    const knot = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.55, 6, 5),
      new THREE.MeshStandardMaterial({
        color: CONFIG.logBarkColor,
        flatShading: true,
        roughness: 0.95,
      })
    );
    knot.position.set(0, trackTop + radius, length * 0.28);
    group.add(knot);

    halfDepth = length * 0.5;
    group.userData.groundVariant = 'log';
  } else {
    const rock = new THREE.Mesh(
      new THREE.BoxGeometry(CONFIG.rockWidth, CONFIG.rockHeight, CONFIG.rockDepth),
      new THREE.MeshStandardMaterial({
        color: CONFIG.rockColor,
        flatShading: true,
        roughness: 0.88,
      })
    );
    rock.position.y = trackTop + CONFIG.rockHeight * 0.5;
    rock.rotation.y = Math.random() * Math.PI;
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);

    const pebble = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0x8a8a82, flatShading: true })
    );
    pebble.position.set(0.35, trackTop + 0.1, 0.22);
    pebble.scale.set(1.2, 0.55, 1);
    group.add(pebble);

    halfWidth = CONFIG.rockWidth * 0.5;
    halfDepth = CONFIG.rockDepth * 0.5;
    group.userData.groundVariant = 'rock';
  }

  group.userData.hitbox = {
    type: 'ground',
    minY: trackTop,
    maxY: trackTop + height,
    halfWidth,
    halfDepth,
  };
}

/** 高空障碍：悬挂横木 + 枝叶（迫使滑铲；跳跃仍会撞到） */
function buildOverheadObstacle(group) {
  const trackTop = CONFIG.trackTopY;
  const clearanceBottom = trackTop + CONFIG.overheadClearanceBottom;
  const clearanceTop = trackTop + CONFIG.overheadClearanceTop;
  const span = CONFIG.overheadSpan;
  const branchMat = new THREE.MeshStandardMaterial({
    color: CONFIG.branchColor,
    flatShading: true,
    roughness: 0.86,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: CONFIG.branchLeafColor,
    flatShading: true,
    roughness: 0.9,
  });

  const postMat = branchMat.clone();
  const postHeight = clearanceTop - trackTop + 0.08;
  const leftPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, postHeight, 6),
    postMat
  );
  leftPost.position.set(-span * 0.48, trackTop + postHeight * 0.5, 0);
  leftPost.castShadow = true;

  const rightPost = leftPost.clone();
  rightPost.position.x = span * 0.48;

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

  group.add(leftPost, rightPost, beam);

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

  group.userData.hitbox = {
    type: 'overhead',
    minY: clearanceBottom,
    maxY: clearanceTop + CONFIG.overheadBeamRadius * 2,
    clearanceBottom,
    halfWidth: span * 0.5 + 0.12,
    halfDepth: CONFIG.lowObstacleHalfDepth + 0.08,
  };
}

function buildLowOrOverhead(group, type) {
  if (type === 'ground') {
    buildLowObstacle(group);
  } else {
    buildOverheadObstacle(group);
  }
  group.userData.obstacleType = type;
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
  for (let i = 0; i < CONFIG.maxTreesInPool; i += 1) {
    const type = i % 2 === 0 ? 'ground' : 'overhead';
    const obstacle = createPathObstacle(type);
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
 * @param {boolean} inPath  true=赛道障碍  false=两侧装饰林
 * @param {number} row      赛道索引 0|1|2 或圆周角
 * @param {boolean | string} isLeftOrType  装饰林左右侧，或赛道障碍类型 'ground'|'overhead'
 * @param {boolean} [isLeft]
 */
function addTree(inPath, row, isLeftOrType = false, isLeft = false) {
  let tree;

  if (inPath) {
    const obstacleType =
      typeof isLeftOrType === 'string' ? isLeftOrType : nextPathObstacleType;
    tree = popPathObstacle(obstacleType);
    tree.visible = true;
    treesInPath.push(tree);

    const laneX = laneToX(LANE_INDICES[row]);
    const spawnZ =
      CONFIG.obstacleSpawnZMin +
      Math.random() * (CONFIG.obstacleSpawnZMax - CONFIG.obstacleSpawnZMin);
    tree.position.set(laneX, CONFIG.trackY, spawnZ);
    tree.rotation.set(0, 0, 0);
    tree.scale.setScalar(1);
    laneTrackGroup.add(tree);
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

/** 高低障碍交替刷新在左/中/右赛道 */
function addPathTree() {
  if (Math.random() > CONFIG.treeSpawnChance) return;

  const lane = Math.floor(Math.random() * 3);
  addTree(true, lane, nextPathObstacleType);
  nextPathObstacleType = nextPathObstacleType === 'ground' ? 'overhead' : 'ground';

  if (Math.random() < CONFIG.secondTreeChance) {
    const options = [0, 1, 2].filter((index) => index !== lane);
    const secondLane = options[Math.floor(Math.random() * options.length)];
    addTree(true, secondLane, nextPathObstacleType);
    nextPathObstacleType = nextPathObstacleType === 'ground' ? 'overhead' : 'ground';
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
  triggerExplosion(position);
  setModelStatus('撞到障碍物！', true);
  showGameOverPanel();
}

function showGameOverPanel() {
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
  treeSpawnTimer = 0;
  spawnGraceRemaining = CONFIG.spawnGracePeriod;
  nextPathObstacleType = 'ground';
  bounceValue = 0;
  jumpInputBuffer = 0;
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

  setModelStatus('游戏进行中');
}

function updateTrees(delta) {
  if (!isGameActive() || hasCollided) return;

  if (spawnGraceRemaining > 0) {
    spawnGraceRemaining -= delta;
    purgeTreesNearHero();
    doTreeLogic();
    return;
  }

  treeSpawnTimer += delta;
  if (treeSpawnTimer >= CONFIG.treeReleaseInterval) {
    addPathTree();
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
      }

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

/** 去掉 Mixamo 跑步循环里 Hips/Root 位移轨道，避免每圈回到“原点” */
function stripRootMotionTracks(clip) {
  if (!clip?.tracks?.length) return clip;

  const tracks = clip.tracks.filter((track) => {
    if (!track.name.endsWith('.position')) return true;
    const bone = track.name.slice(0, -'.position'.length).toLowerCase();
    return !/(hips|root)/.test(bone);
  });

  if (tracks.length === clip.tracks.length) return clip;
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
  const jumpClip = extraClips.jump || findAnimClip(animations, ['jump']);
  const slideClip = extraClips.slide || findAnimClip(animations, ['slide']);

  if (runClip) {
    heroRunAction = heroMixer.clipAction(runClip);
    heroRunAction.setLoop(THREE.LoopRepeat);
    heroRunAction.timeScale = CONFIG.runAnimTimeScale;
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
    heroRunAction.stop();
  }
}

function resumeHeroRunAnimation() {
  if (!heroRunAction) {
    isJumpAnimPlaying = false;
    isSlideAnimPlaying = false;
    pendingRunResume = false;
    return;
  }

  isJumpAnimPlaying = false;
  isSlideAnimPlaying = false;
  pendingRunResume = false;
  heroJumpAction?.setEffectiveWeight(0);
  heroSlideAction?.setEffectiveWeight(0);

  // 禁止 reset()：会把骨骼瞬间拉回循环第 0 帧（玩家看到的“回到原点”）
  heroRunAction.enabled = true;
  heroRunAction.paused = false;
  heroRunAction.setLoop(THREE.LoopRepeat);
  heroRunAction.setEffectiveTimeScale(CONFIG.runAnimTimeScale);
  heroRunAction.setEffectiveWeight(1);
  if (!heroRunAction.isRunning()) {
    heroRunAction.play();
  }
}

function playHeroJumpAnimation() {
  if (!heroJumpAction || !heroRunAction) return;

  heroRunAction.fadeOut(0.05);
  heroJumpAction.reset();
  heroJumpAction.setEffectiveTimeScale(CONFIG.jumpAnimTimeScale);
  heroJumpAction.setEffectiveWeight(1);
  heroJumpAction.play();
  if (CONFIG.jumpCrossFade > 0) {
    heroJumpAction.crossFadeFrom(heroRunAction, CONFIG.jumpCrossFade, false);
  }
  isJumpAnimPlaying = true;
}

function playHeroSlideAnimation() {
  if (!heroSlideAction || !heroRunAction) {
    return false;
  }

  heroRunAction.fadeOut(0.05);
  heroSlideAction.reset();
  heroSlideAction.setEffectiveTimeScale(CONFIG.slideAnimTimeScale);
  heroSlideAction.setEffectiveWeight(1);
  heroSlideAction.play();
  if (CONFIG.slideCrossFade > 0) {
    heroSlideAction.crossFadeFrom(heroRunAction, CONFIG.slideCrossFade, false);
  }
  isSlideAnimPlaying = true;
  return true;
}

/** 腾空 / 跳跃 / 滑铲期间暂停跑步循环，避免 LoopRepeat 接缝把模型弹回 */
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
  if (heroRunAction.getEffectiveWeight() < 0.5) {
    resumeHeroRunAnimation();
  }
}

function requestRunResumeAfterJump() {
  if (isHeroGrounded() && !isSlideLocked()) {
    resumeHeroRunAnimation();
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
  heroSlideAction?.stop();
  pinHeroToGround();
  slideRecoveryTimer = CONFIG.slideExitDuration;
  resumeHeroRunAnimation();
}

function onHeroMixerFinished(event) {
  if (event.action === heroJumpAction) {
    isJumpAnimPlaying = false;
    requestRunResumeAfterJump();
    return;
  }

  if (event.action === heroSlideAction) {
    finishSlide();
  }
}

async function loadHeroJumpClip() {
  const modelUrl = CONFIG.heroJumpAnimPath;
  const fileExists = await verifyModelFile(modelUrl);
  if (!fileExists) return null;

  const fbx = await new FBXLoader().loadAsync(modelUrl);
  const clip = fbx.animations.find((anim) => /mixamo|jump/i.test(anim.name)) || fbx.animations[0];
  if (!clip) return null;

  clip.name = 'RunningJump';
  return clip;
}

async function loadHeroSlideClip() {
  const modelUrl = CONFIG.heroSlideAnimPath;
  const fileExists = await verifyModelFile(modelUrl);
  if (!fileExists) return null;

  const fbx = await new FBXLoader().loadAsync(modelUrl);
  const clip = fbx.animations.find((anim) => /mixamo|slide/i.test(anim.name)) || fbx.animations[0];
  if (!clip) return null;

  clip.name = 'RunningSlide';
  return clip;
}

/** 主菜单：加载 Tripo3D 静态 hero.glb 作为旋转预览 */
async function loadMenuHeroModel() {
  const modelUrl = CONFIG.menuHeroModelPath;
  const fileExists = await verifyModelFile(modelUrl);
  if (!fileExists) {
    console.warn('[hero] 找不到主菜单模型 hero.glb，仍使用占位球体');
    setModelStatus('占位球预览 · 点击开始游戏', true);
    markHeroModelReady();
    return;
  }

  try {
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(modelUrl);
    mountMenuHeroModel(gltf.scene);
    console.info('[hero] 主菜单 hero.glb 已加载');
    markHeroModelReady('角色预览就绪 · 点击开始游戏');
  } catch (error) {
    console.warn('[hero] 主菜单模型解析失败', error);
    setModelStatus(`主菜单模型加载失败：${error.message}`, true);
    markHeroModelReady();
  }
}

/** 预加载游戏用动画模型（不挂载到场景） */
async function fetchGameplayHeroData() {
  const animatedCandidates = [CONFIG.heroAnimatedPath, '/assets/hero_animated.glb'];

  for (const url of [...new Set(animatedCandidates)]) {
    if (!(await verifyModelFile(url))) continue;

    try {
      await MeshoptDecoder.ready;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(url);

      if (!gltf.animations.length) {
        console.warn('[hero] hero_animated.glb 无动画轨道，尝试 FBX 备用');
        continue;
      }

      const clipNames = gltf.animations.map((clip) => clip.name).join(', ');
      console.info('[hero] 游戏模型 hero_animated.glb 已预加载', clipNames);
      return {
        kind: 'gltf',
        root: gltf.scene,
        animations: gltf.animations,
        rotationY: CONFIG.heroAnimatedRotationY,
      };
    } catch (error) {
      console.warn(`[hero] ${url} 预加载失败`, error);
    }
  }

  const runUrl = CONFIG.heroRunAnimPath;
  if (await verifyModelFile(runUrl)) {
    try {
      const fbx = await new FBXLoader().loadAsync(runUrl);
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
    }
  }

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
    heroMixer = null;
    heroRunAction = null;
    heroJumpAction = null;
    heroSlideAction = null;
    console.info('[hero] 无动画模型，使用主菜单 hero.glb 进行游戏');
    return;
  }

  throw new Error('没有可用的游戏角色模型');
}

/** 确认模型文件存在且不是 404 返回的 HTML */
async function verifyModelFile(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) return false;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) return false;

    const size = Number(response.headers.get('content-length') || 0);
    return size > 12;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 键盘换道
// ---------------------------------------------------------------------------
function handleKeyDown(keyEvent) {
  const key = keyEvent.key.toLowerCase();

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

  if (isHeroAirborne()) return;

  let validMove = true;

  if (code === 37 || key === 'a') {
    if (currentLane === CONFIG.middleLane) currentLane = CONFIG.leftLane;
    else if (currentLane === CONFIG.rightLane) currentLane = CONFIG.middleLane;
    else validMove = false;
  } else if (code === 39 || key === 'd') {
    if (currentLane === CONFIG.middleLane) currentLane = CONFIG.rightLane;
    else if (currentLane === CONFIG.leftLane) currentLane = CONFIG.middleLane;
    else validMove = false;
  } else {
    validMove = false;
  }

  if (validMove) {
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

/** 下滑：前倾贴地冲刺（纯代码动画，不用 position.y 偏移避免结束时弹起） */
function updateSlideAnimation(delta) {
  if (!heroVisualPivot || !isSliding) return;

  pinHeroToGround();
  slideTimer -= delta;

  const exitT =
    slideTimer < CONFIG.slideExitDuration
      ? 1 - slideTimer / CONFIG.slideExitDuration
      : 0;
  const blend = exitT > 0 ? 1 - exitT : 1;

  heroVisualPivot.rotation.x = THREE.MathUtils.degToRad(CONFIG.slideLeanDeg) * blend;
  heroVisualPivot.scale.set(
    THREE.MathUtils.lerp(1, 1.08, blend),
    THREE.MathUtils.lerp(1, CONFIG.slideSquashY, blend),
    THREE.MathUtils.lerp(1, CONFIG.slideStretchZ, blend)
  );
  heroVisualPivot.position.y = 0;

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
      resumeHeroRunAnimation();
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
}

function updateHeroVerticalPhysics(delta) {
  if (isSlideLocked()) {
    pinHeroToGround();
    return;
  }

  if (heroRoot.position.y <= CONFIG.heroBaseY) {
    heroRoot.position.y = CONFIG.heroBaseY;
    if (bounceValue <= 0) {
      bounceValue =
        CONFIG.idleBounceVelocityMin +
        Math.random() * (CONFIG.idleBounceVelocityMax - CONFIG.idleBounceVelocityMin);
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

/** 第三人称：相机跟随主角高度，注视其前方跑道 */
function updateCamera() {
  camera.position.set(
    heroRoot.position.x + CONFIG.cameraOffset.x,
    heroRoot.position.y + CONFIG.cameraOffset.y,
    heroRoot.position.z + CONFIG.cameraOffset.z
  );
  camera.lookAt(
    heroRoot.position.x,
    heroRoot.position.y + CONFIG.cameraLookAhead.y,
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

  rollingGroundSphere.rotation.x += getRollingSpeed();
  updateLanePlatforms(delta);
  updateShadowLight();

  if (gameState === 'GAMEOVER') {
    updateExplosion();
    updateCamera();
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
    heroMixer.update(delta);
  }

  if (isSlideLocked()) {
    pinHeroToGround();
  }

  updateHeroActionAnimation(delta);
  updateTrees(delta);
  updateExplosion();
  updateCamera();
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
