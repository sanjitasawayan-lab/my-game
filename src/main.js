import * as THREE from 'three';
// 若后续拿到 .glb / .gltf 三维模型，可改用 GLTFLoader 替换贴图平面方案
// import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// 基础配置
// ---------------------------------------------------------------------------
const CONFIG = {
  laneWidth: 2.2,
  laneCount: 3,
  runSpeed: 12,
  laneSwitchSpeed: 14,
  segmentLength: 8,
  segmentCount: 12,
  trackWidth: 7,
  trackColor: 0x4a5568,
  groundColor: 0x2d3748,
  playerHeight: 2.1,
  jumpForce: 9.5,
  gravity: 28,
  slideDuration: 0.85,
  obstacleSpawnInterval: 1.35,
  maxObstacles: 14,
};

const container = document.getElementById('game-container');
const scoreEl = document.getElementById('score');
const statusEl = document.getElementById('status');

function getPublicAsset(path) {
  if (typeof import.meta.env !== 'undefined') {
    return `/${path}`;
  }
  return `./public/${path}`;
}

// ---------------------------------------------------------------------------
// 1. 场景、相机、灯光、渲染器
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 20, 80);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(0, 5.5, 8);
camera.lookAt(0, 1, -6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
sunLight.position.set(6, 12, 4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 50;
sunLight.shadow.camera.left = -12;
sunLight.shadow.camera.right = 12;
sunLight.shadow.camera.top = 12;
sunLight.shadow.camera.bottom = -12;
scene.add(sunLight);

// ---------------------------------------------------------------------------
// 2. 无限赛道
// ---------------------------------------------------------------------------
const trackGroup = new THREE.Group();
scene.add(trackGroup);

const segmentMaterial = new THREE.MeshStandardMaterial({
  color: CONFIG.trackColor,
  roughness: 0.85,
  metalness: 0.05,
});

const groundMaterial = new THREE.MeshStandardMaterial({
  color: CONFIG.groundColor,
  roughness: 0.95,
});

const segments = [];

function createTrackSegment(z) {
  const segment = new THREE.Group();

  const road = new THREE.Mesh(
    new THREE.BoxGeometry(CONFIG.trackWidth, 0.35, CONFIG.segmentLength),
    segmentMaterial
  );
  road.position.y = -0.175;
  road.receiveShadow = true;
  segment.add(road);

  const leftRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.6, CONFIG.segmentLength),
    groundMaterial
  );
  leftRail.position.set(-CONFIG.trackWidth / 2 - 0.15, 0.05, 0);
  leftRail.castShadow = true;
  leftRail.receiveShadow = true;
  segment.add(leftRail);

  const rightRail = leftRail.clone();
  rightRail.position.x = CONFIG.trackWidth / 2 + 0.15;
  segment.add(rightRail);

  segment.position.z = z;
  trackGroup.add(segment);
  return segment;
}

for (let i = 0; i < CONFIG.segmentCount; i += 1) {
  segments.push(createTrackSegment(-i * CONFIG.segmentLength));
}

function updateTrack(delta) {
  const moveDistance = CONFIG.runSpeed * delta;

  for (const segment of segments) {
    segment.position.z += moveDistance;

    if (segment.position.z > CONFIG.segmentLength) {
      let minZ = Infinity;
      for (const other of segments) {
        minZ = Math.min(minZ, other.position.z);
      }
      segment.position.z = minZ - CONFIG.segmentLength;
    }
  }
}

// ---------------------------------------------------------------------------
// 3. 主角
// ---------------------------------------------------------------------------
const playerGroup = new THREE.Group();
scene.add(playerGroup);
playerGroup.position.set(0, 0, 2);

let playerVisual = null;
let playerVisualBaseY = CONFIG.playerHeight / 2;
let currentLane = 1;
let targetLaneX = 0;
const pressedKeys = new Set();
let runPhase = 0;

let jumpHeight = 0;
let jumpVelocity = 0;
let isGrounded = true;
let isSliding = false;
let slideTimer = 0;

let gameOver = false;
let score = 0;
let spawnTimer = 0;

function laneToX(laneIndex) {
  const centerOffset = (CONFIG.laneCount - 1) / 2;
  return (laneIndex - centerOffset) * CONFIG.laneWidth;
}

function trySwitchLane(direction) {
  if (gameOver) return;

  const nextLane = THREE.MathUtils.clamp(
    currentLane + direction,
    0,
    CONFIG.laneCount - 1
  );

  if (nextLane !== currentLane) {
    currentLane = nextLane;
    targetLaneX = laneToX(currentLane);
  }
}

function tryJump() {
  if (gameOver || !isGrounded || isSliding) return;
  jumpVelocity = CONFIG.jumpForce;
  isGrounded = false;
}

function trySlide() {
  if (gameOver || !isGrounded || isSliding) return;
  isSliding = true;
  slideTimer = CONFIG.slideDuration;
  applySlideVisual(true);
}

function applySlideVisual(sliding) {
  if (!playerVisual) return;

  if (sliding) {
    playerVisual.scale.y = 0.48;
    playerVisual.position.y = (CONFIG.playerHeight * 0.48) / 2;
  } else {
    playerVisual.scale.y = 1;
    playerVisual.position.y = playerVisualBaseY;
  }
}

function getPlayerHitbox() {
  const x = playerGroup.position.x;
  const z = playerGroup.position.z;
  const baseY = playerGroup.position.y;
  const halfWidth = 0.42;

  if (isSliding) {
    return {
      minX: x - halfWidth,
      maxX: x + halfWidth,
      minY: baseY,
      maxY: baseY + 0.82,
      minZ: z - 0.45,
      maxZ: z + 0.45,
    };
  }

  return {
    minX: x - halfWidth,
    maxX: x + halfWidth,
    minY: baseY,
    maxY: baseY + CONFIG.playerHeight * 0.88,
    minZ: z - 0.45,
    maxZ: z + 0.45,
  };
}

function boxesOverlap(a, b) {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();

  if (gameOver && key === 'r') {
    resetGame();
    return;
  }

  if (['arrowleft', 'a', 'arrowright', 'd'].includes(key)) {
    pressedKeys.add(key);
  }

  if (['arrowup', 'w'].includes(key)) {
    tryJump();
  }

  if (['arrowdown', 's'].includes(key)) {
    trySlide();
  }
}

function onKeyUp(event) {
  pressedKeys.delete(event.key.toLowerCase());
}

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);

function handleLaneInput() {
  if (pressedKeys.has('arrowleft') || pressedKeys.has('a')) {
    trySwitchLane(-1);
    pressedKeys.delete('arrowleft');
    pressedKeys.delete('a');
  }

  if (pressedKeys.has('arrowright') || pressedKeys.has('d')) {
    trySwitchLane(1);
    pressedKeys.delete('arrowright');
    pressedKeys.delete('d');
  }
}

function updatePlayer(delta) {
  if (gameOver) return;

  handleLaneInput();

  const diff = targetLaneX - playerGroup.position.x;
  if (Math.abs(diff) > 0.001) {
    const step = CONFIG.laneSwitchSpeed * delta;
    playerGroup.position.x +=
      Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
  } else {
    playerGroup.position.x = targetLaneX;
  }

  const tiltTarget = -(playerGroup.position.x - targetLaneX) * 0.35;
  playerGroup.rotation.z = THREE.MathUtils.lerp(
    playerGroup.rotation.z,
    tiltTarget,
    1 - Math.exp(-10 * delta)
  );

  if (isSliding) {
    slideTimer -= delta;
    if (slideTimer <= 0) {
      isSliding = false;
      applySlideVisual(false);
    }
  }

  if (!isGrounded) {
    jumpVelocity -= CONFIG.gravity * delta;
    jumpHeight += jumpVelocity * delta;

    if (jumpHeight <= 0) {
      jumpHeight = 0;
      jumpVelocity = 0;
      isGrounded = true;
    }
  }

  let bob = 0;
  if (isGrounded && !isSliding) {
    runPhase += delta * CONFIG.runSpeed * 0.9;
    bob = Math.sin(runPhase) * 0.06;
  }

  playerGroup.position.y = jumpHeight + bob;
}

// ---------------------------------------------------------------------------
// 4. 障碍物
// ---------------------------------------------------------------------------
const obstacles = [];
const obstacleGroup = new THREE.Group();
scene.add(obstacleGroup);

const lowObstacleMaterial = new THREE.MeshStandardMaterial({
  color: 0xff6b35,
  roughness: 0.7,
});

const highObstacleMaterial = new THREE.MeshStandardMaterial({
  color: 0x6366f1,
  roughness: 0.7,
});

function createObstacle(type) {
  const group = new THREE.Group();

  if (type === 'low') {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.05, 0.85),
      lowObstacleMaterial
    );
    body.position.y = 0.525;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    group.userData.hitbox = {
      minX: -0.75,
      maxX: 0.75,
      minY: 0,
      maxY: 1.05,
      minZ: -0.42,
      maxZ: 0.42,
    };
  } else {
    const leftPost = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 1.55, 0.25),
      highObstacleMaterial
    );
    leftPost.position.set(-0.65, 0.775, 0);
    leftPost.castShadow = true;

    const rightPost = leftPost.clone();
    rightPost.position.x = 0.65;

    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.35, 0.85),
      highObstacleMaterial
    );
    beam.position.y = 1.55;
    beam.castShadow = true;

    group.add(leftPost, rightPost, beam);

    group.userData.hitbox = {
      minX: -0.85,
      maxX: 0.85,
      minY: 1.35,
      maxY: 1.75,
      minZ: -0.42,
      maxZ: 0.42,
    };
  }

  return group;
}

function spawnObstacle() {
  const lane = Math.floor(Math.random() * CONFIG.laneCount);
  const type = Math.random() < 0.5 ? 'low' : 'high';
  const mesh = createObstacle(type);

  mesh.position.set(laneToX(lane), 0, -42 - Math.random() * 18);
  obstacleGroup.add(mesh);

  obstacles.push({
    mesh,
    lane,
    type,
  });
}

function getObstacleWorldHitbox(obstacle) {
  const local = obstacle.mesh.userData.hitbox;
  const { x, y, z } = obstacle.mesh.position;

  return {
    minX: x + local.minX,
    maxX: x + local.maxX,
    minY: y + local.minY,
    maxY: y + local.maxY,
    minZ: z + local.minZ,
    maxZ: z + local.maxZ,
  };
}

function updateObstacles(delta) {
  if (gameOver) return;

  const moveDistance = CONFIG.runSpeed * delta;

  for (let i = obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = obstacles[i];
    obstacle.mesh.position.z += moveDistance;

    if (obstacle.mesh.position.z > 12) {
      obstacleGroup.remove(obstacle.mesh);
      obstacles.splice(i, 1);
      continue;
    }

    if (boxesOverlap(getPlayerHitbox(), getObstacleWorldHitbox(obstacle))) {
      endGame();
      break;
    }
  }

  spawnTimer += delta;
  if (spawnTimer >= CONFIG.obstacleSpawnInterval && obstacles.length < CONFIG.maxObstacles) {
    spawnObstacle();
    spawnTimer = 0;
  }
}

function clearObstacles() {
  for (const obstacle of obstacles) {
    obstacleGroup.remove(obstacle.mesh);
  }
  obstacles.length = 0;
  spawnTimer = 0;
}

function endGame() {
  gameOver = true;
  if (statusEl) {
    statusEl.textContent = '撞到障碍物！按 R 重新开始';
    statusEl.style.color = '#ff8a80';
  }
}

function resetGame() {
  gameOver = false;
  score = 0;
  currentLane = 1;
  targetLaneX = 0;
  jumpHeight = 0;
  jumpVelocity = 0;
  isGrounded = true;
  isSliding = false;
  slideTimer = 0;
  runPhase = 0;

  playerGroup.position.set(0, 0, 2);
  playerGroup.rotation.z = 0;
  applySlideVisual(false);
  clearObstacles();

  if (scoreEl) scoreEl.textContent = '0';
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.style.color = '#fff';
  }
}

function updateScore(delta) {
  if (gameOver) return;
  score += delta * CONFIG.runSpeed * 2;
  if (scoreEl) scoreEl.textContent = Math.floor(score).toString();
}

// ---------------------------------------------------------------------------
// 5. 加载人物贴图
// ---------------------------------------------------------------------------
function removeWhiteBackground(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (r > 235 && g > 235 && b > 235) {
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function loadCharacterTexture(url) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (texture) => resolve(removeWhiteBackground(texture.image)),
      undefined,
      reject
    );
  });
}

async function loadPlayerCharacter() {
  const texture = await loadCharacterTexture(
    getPublicAsset('textures/character/back.png')
  );
  const aspect = texture.image.width / texture.image.height;
  const height = CONFIG.playerHeight;
  const width = height * aspect;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.05,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.y = height / 2;
  mesh.castShadow = true;

  playerVisual = mesh;
  playerVisualBaseY = height / 2;
  playerGroup.add(mesh);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 24),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  playerGroup.add(shadow);
}

loadPlayerCharacter().catch((error) => {
  console.error('人物贴图加载失败:', error);
});

// ---------------------------------------------------------------------------
// 窗口自适应
// ---------------------------------------------------------------------------
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);

  updateTrack(delta);
  updatePlayer(delta);
  updateObstacles(delta);
  updateScore(delta);

  renderer.render(scene, camera);
}

animate();
