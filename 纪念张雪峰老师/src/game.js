import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// ---------------------------------------------------------------------------
// 核心参数（保留原 GitHub 跑酷项目的滚动 / 换道数学）
// ---------------------------------------------------------------------------
const CONFIG = {
  rollingSpeed: 0.008,
  worldRadius: 26,
  heroRadius: 0.2,
  heroBaseY: 1.8,
  bounceValue: 0.1,
  gravity: 0.005,
  leftLane: -1,
  middleLane: 0,
  rightLane: 1,
  /** 三条赛道的横向间距（越大换道越明显） */
  laneWidth: 2.8,
  laneLerpFactor: 10,
  /** 三条平面赛道分段长度 / 数量（贴在滚动球面上） */
  laneSegmentLength: 7,
  laneSegmentCount: 14,
  lanePlatformHeight: 0.16,
  grassColor: 0x2d8a4e,
  dirtColor: 0x8b5a2b,
  fogColor: 0xc8e6c9,
  treeSides: 8,
  treeTiers: 6,
  particleCount: 20,
  explosionPowerStart: 1.07,
  /** Tripo3D 导出的 GLB 放 public/models/hero.glb */
  heroModelPath: '/models/hero.glb',
  heroTargetHeight: 1.65,
  /** 主角世界坐标：中央赛道、踩在跑道上方 */
  heroPosition: { x: 0, y: 1.8, z: 4.8 },
  /** 摄像机相对主角的偏移（正后方偏上） */
  cameraOffset: { x: 0, y: 2.8, z: 2.4 },
  /** 相机注视点：跑道前方（越肩视角，看到人物背部） */
  cameraLookAhead: { y: 1.1, z: -5 },
  /** 模型默认朝 +X；+90° 后面向 -Z（背对镜头、朝跑道跑） */
  heroModelRotationY: Math.PI / 2,
  /** 左 / 中 / 右 三赛道在球面上的角度 */
  pathAngleValues: [1.46, 1.57, 1.68],
  /** 每隔多久尝试生成一次障碍（秒） */
  treeReleaseInterval: 2.4,
  /** 每次尝试真正生成障碍的概率 */
  treeSpawnChance: 0.48,
  /** 同一批再生成第二棵树的概率 */
  secondTreeChance: 0.22,
  /** 开局 / 重开后留给玩家的反应时间（秒） */
  spawnGracePeriod: 3,
  maxTreesInPool: 14,
  collisionRadius: 0.65,
  sideTreeCount: 36,
};

// ---------------------------------------------------------------------------
// 运行时状态
// ---------------------------------------------------------------------------
let sceneWidth;
let sceneHeight;
let camera;
let scene;
let renderer;
let rollingGroundSphere;
/** @type {THREE.Group} 主角根节点（位置 / 换道 / 跳跃） */
let heroRoot;
/** @type {THREE.Mesh | null} 加载失败时的占位球 */
let heroPlaceholder = null;
/** @type {THREE.Object3D | null} Tripo3D 英雄模型 */
let heroModel = null;
/** @type {THREE.AnimationMixer | null} */
let heroMixer = null;
let heroRollingSpeed;
let currentLane = CONFIG.middleLane;
let clock;
let jumping = false;
let bounceValue = CONFIG.bounceValue;

let particleGeometry;
let particles;
let explosionPower = CONFIG.explosionPowerStart;

const sphericalHelper = new THREE.Spherical();
const treeWorldPos = new THREE.Vector3();
const treesInPath = [];
const treesPool = [];
const lanePlatforms = [[], [], []];
const LANE_INDICES = [CONFIG.leftLane, CONFIG.middleLane, CONFIG.rightLane];
let treeSpawnTimer = 0;
let spawnGraceRemaining = CONFIG.spawnGracePeriod;
let hasCollided = false;

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
  scene.fog = new THREE.FogExp2(CONFIG.fogColor, 0.14);

  camera = new THREE.PerspectiveCamera(60, sceneWidth / sceneHeight, 0.1, 1000);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0xb8dfc0, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(sceneWidth, sceneHeight);
  container.appendChild(renderer.domElement);

  addWorld();
  addHero();
  addLight();
  addExplosion();
  setupCamera();

  window.addEventListener('resize', onWindowResize);
  window.addEventListener('keydown', handleKeyDown);

  loadHeroModel().catch(console.error);
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
  rollingGroundSphere.position.set(0, -24, 2);
  scene.add(rollingGroundSphere);

  addTrackLanes();
  createTreesPool();
  addWorldTrees();
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
  initLanePlatforms();
}

/** 单条平面赛道分段（独立平台，段间露出底层滚动球面） */
function createLanePlatformSegment(laneIndex) {
  const w = CONFIG.laneWidth * 0.84;
  const len = CONFIG.laneSegmentLength;
  const h = CONFIG.lanePlatformHeight;
  const group = new THREE.Group();

  const topColors = [0x7a4f2c, 0x9a6840, 0x7a4f2c];
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.07, len),
    new THREE.MeshStandardMaterial({
      color: topColors[laneIndex],
      flatShading: true,
      roughness: 0.88,
    })
  );
  top.position.y = h;
  top.receiveShadow = true;
  group.add(top);

  const rimMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, flatShading: true });
  for (const side of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.11, h * 0.85, len), rimMat);
    rim.position.set(side * (w / 2 + 0.05), h * 0.42, 0);
    group.add(rim);
  }

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.025, len * 0.85),
    new THREE.MeshStandardMaterial({ color: 0xf2e8d8, flatShading: true })
  );
  dash.position.y = h + 0.04;
  group.add(dash);

  group.userData.laneIndex = laneIndex;
  return group;
}

function placeLanePlatform(segment, laneX, zOffset) {
  segment.position.set(laneX, CONFIG.worldRadius - 0.03, zOffset);
}

function initLanePlatforms() {
  const len = CONFIG.laneSegmentLength;

  for (let li = 0; li < 3; li += 1) {
    const laneX = laneToX(LANE_INDICES[li]);
    for (let i = 0; i < CONFIG.laneSegmentCount; i += 1) {
      const segment = createLanePlatformSegment(li);
      placeLanePlatform(segment, laneX, -i * len);
      rollingGroundSphere.add(segment);
      lanePlatforms[li].push(segment);
    }
  }
}

/** 赛道分段随球体滚动，越界后循环到最前方 */
function updateLanePlatforms() {
  const len = CONFIG.laneSegmentLength;
  const recycleWorldPos = new THREE.Vector3();

  for (let li = 0; li < 3; li += 1) {
    const segments = lanePlatforms[li];
    let minLocalZ = Infinity;

    for (const segment of segments) {
      minLocalZ = Math.min(minLocalZ, segment.position.z);
    }

    for (const segment of segments) {
      segment.getWorldPosition(recycleWorldPos);
      if (recycleWorldPos.z > 9) {
        segment.position.z = minLocalZ - len;
        minLocalZ = segment.position.z;
      }
    }
  }
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
    new THREE.MeshStandardMaterial({ color: 0x33ff33, flatShading: true })
  );
  treeTop.castShadow = true;
  treeTop.position.y = 0.9;
  treeTop.rotation.y = Math.random() * Math.PI;

  const treeTrunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x886633, flatShading: true })
  );
  treeTrunk.position.y = 0.25;

  const tree = new THREE.Group();
  tree.add(treeTrunk, treeTop);
  tree.userData.isObstacle = false;
  return tree;
}

function createTreesPool() {
  for (let i = 0; i < CONFIG.maxTreesInPool; i += 1) {
    const tree = createTree();
    tree.visible = false;
    treesPool.push(tree);
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
 * @param {boolean} inPath  true=赛道障碍树  false=两侧装饰林
 * @param {number} row      赛道索引 0|1|2 或圆周角
 * @param {boolean} [isLeft] 装饰林左右侧
 */
function addTree(inPath, row, isLeft = false) {
  let tree;

  if (inPath) {
    if (treesPool.length === 0) return;
    tree = treesPool.pop();
    tree.visible = true;
    treesInPath.push(tree);

    placeTreeOnSphere(
      tree,
      CONFIG.worldRadius - 0.3,
      CONFIG.pathAngleValues[row],
      -rollingGroundSphere.rotation.x + 4
    );
  } else {
    tree = createTree();
    let forestAreaAngle;
    if (isLeft) {
      forestAreaAngle = 1.68 + Math.random() * 0.1;
    } else {
      forestAreaAngle = 1.46 - Math.random() * 0.1;
    }
    placeTreeOnSphere(tree, CONFIG.worldRadius - 0.3, forestAreaAngle, row);
  }

  tree.userData.isObstacle = inPath;
  rollingGroundSphere.add(tree);
}

/** 两侧静态装饰林，随球体一起滚动 */
function addWorldTrees() {
  const gap = (Math.PI * 2) / CONFIG.sideTreeCount;
  for (let i = 0; i < CONFIG.sideTreeCount; i += 1) {
    addTree(false, i * gap, true);
    addTree(false, i * gap, false);
  }
}

/** 按概率在左/中/右赛道生成障碍树 */
function addPathTree() {
  if (Math.random() > CONFIG.treeSpawnChance) return;

  const options = [0, 1, 2];
  const lane = Math.floor(Math.random() * 3);
  addTree(true, lane);
  options.splice(lane, 1);

  if (Math.random() < CONFIG.secondTreeChance) {
    const secondLane = options[Math.floor(Math.random() * options.length)];
    addTree(true, secondLane);
  }
}

function recycleTree(tree) {
  tree.visible = false;
  rollingGroundSphere.remove(tree);

  const pathIndex = treesInPath.indexOf(tree);
  if (pathIndex >= 0) {
    treesInPath.splice(pathIndex, 1);
  }

  treesPool.push(tree);
}

/** 障碍树越界回收 + 与主角碰撞检测（初步框架） */
function doTreeLogic() {
  const treesToRemove = [];

  for (const tree of treesInPath) {
    if (!tree.visible) continue;

    tree.getWorldPosition(treeWorldPos);

    if (treeWorldPos.z > 6) {
      treesToRemove.push(tree);
      continue;
    }

    if (!hasCollided && tree.userData.isObstacle) {
      const laneMatch =
        Math.abs(treeWorldPos.x - heroRoot.position.x) <= CONFIG.laneWidth * 0.42;
      const distance = treeWorldPos.distanceTo(heroRoot.position);
      if (laneMatch && distance <= CONFIG.collisionRadius) {
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
  triggerExplosion(position);
  setModelStatus('撞到树木！按 R 重新开始', true);
}

function resetGame() {
  hasCollided = false;
  treeSpawnTimer = 0;
  spawnGraceRemaining = CONFIG.spawnGracePeriod;
  jumping = false;
  bounceValue = CONFIG.bounceValue;
  currentLane = CONFIG.middleLane;
  heroRoot.position.set(
    CONFIG.heroPosition.x,
    CONFIG.heroPosition.y,
    CONFIG.heroPosition.z
  );
  heroRoot.rotation.z = 0;

  for (const tree of [...treesInPath]) {
    recycleTree(tree);
  }

  setModelStatus(heroModel ? '人物模型已加载' : '游戏已重置');
}

function updateTrees(delta) {
  if (hasCollided) return;

  if (spawnGraceRemaining > 0) {
    spawnGraceRemaining -= delta;
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
  heroRoot.position.set(
    CONFIG.heroPosition.x,
    CONFIG.heroPosition.y,
    CONFIG.heroPosition.z
  );
  currentLane = CONFIG.middleLane;
  jumping = false;
  scene.add(heroRoot);

  heroPlaceholder = new THREE.Mesh(
    new THREE.DodecahedronGeometry(CONFIG.heroRadius, 1),
    new THREE.MeshStandardMaterial({ color: 0xe5f2f2, flatShading: true })
  );
  heroPlaceholder.receiveShadow = true;
  heroPlaceholder.castShadow = true;
  heroRoot.add(heroPlaceholder);
}

function disposePlaceholder() {
  if (!heroPlaceholder) return;
  heroRoot.remove(heroPlaceholder);
  heroPlaceholder.geometry.dispose();
  heroPlaceholder.material.dispose();
  heroPlaceholder = null;
}

/**
 * 从 Tripo3D 工作台导出 GLB 后放到 public/models/hero.glb
 * 模型页：https://studio.tripo3d.com/3d-model/c7490485-28d4-489a-a0b2-3b250b90399f
 */
async function loadHeroModel() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const modelUrl = CONFIG.heroModelPath;

  const fileExists = await verifyModelFile(modelUrl);
  if (!fileExists) {
    console.warn('[hero] 找不到 hero.glb，仍使用占位球体');
    setModelStatus(
      '当前是占位球：请把 Tripo3D 导出的 hero.glb 放到 public/models/ 或 models/ 文件夹，然后刷新页面',
      true
    );
    return;
  }

  try {
    await MeshoptDecoder.ready;
    const gltf = await loader.loadAsync(modelUrl);
    const model = gltf.scene;

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = CONFIG.heroTargetHeight / size.y;
    model.scale.setScalar(scale);
    model.rotation.set(0, CONFIG.heroModelRotationY, 0);

    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);

    disposePlaceholder();
    heroRoot.add(model);
    heroModel = model;

    if (gltf.animations.length > 0) {
      heroMixer = new THREE.AnimationMixer(model);
      heroMixer.clipAction(gltf.animations[0]).play();
    }

    console.info('[hero] Tripo3D 模型加载成功');
    setModelStatus('人物模型已加载');
  } catch (error) {
    console.warn('[hero] 模型解析失败', error);
    setModelStatus(`hero.glb 解析失败：${error.message}`, true);
  }
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

  if (hasCollided && key === 'r') {
    resetGame();
    return;
  }

  if (hasCollided || jumping) return;

  let validMove = true;
  const code = keyEvent.keyCode;

  if (code === 37 || keyEvent.key === 'a' || keyEvent.key === 'A') {
    if (currentLane === CONFIG.middleLane) currentLane = CONFIG.leftLane;
    else if (currentLane === CONFIG.rightLane) currentLane = CONFIG.middleLane;
    else validMove = false;
  } else if (code === 39 || keyEvent.key === 'd' || keyEvent.key === 'D') {
    if (currentLane === CONFIG.middleLane) currentLane = CONFIG.rightLane;
    else if (currentLane === CONFIG.leftLane) currentLane = CONFIG.middleLane;
    else validMove = false;
  } else if (code === 38 || keyEvent.key === 'w' || keyEvent.key === 'W') {
    bounceValue = 0.1;
    jumping = true;
    validMove = false;
  } else {
    validMove = false;
  }

  if (validMove) {
    jumping = true;
    bounceValue = 0.06;
  }
}

function addLight() {
  scene.add(new THREE.HemisphereLight(0xe8ffe8, 0x2d4a32, 0.9));

  const sun = new THREE.DirectionalLight(0xfff5dc, 0.95);
  sun.position.set(12, 6, -7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(256, 256);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 50;
  scene.add(sun);
}

function setupCamera() {
  updateCamera();
}

/** 第三人称：相机在主角正后方，注视跑道前方，人物背部朝向屏幕 */
function updateCamera() {
  camera.position.set(
    heroRoot.position.x + CONFIG.cameraOffset.x,
    CONFIG.cameraOffset.y,
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

  rollingGroundSphere.rotation.x += CONFIG.rollingSpeed;
  updateLanePlatforms();

  if (heroPlaceholder) {
    heroPlaceholder.rotation.x -= heroRollingSpeed;
  }

  if (heroRoot.position.y <= CONFIG.heroBaseY) {
    jumping = false;
    bounceValue = Math.random() * 0.04 + 0.005;
  }
  heroRoot.position.y += bounceValue;
  bounceValue -= CONFIG.gravity;

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
