import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============ 1. KONFIGURASI FIREBASE ============
const FIREBASE_URL = "https://game3d-66134-default-rtdb.asia-southeast1.firebasedatabase.app/";
const DEV_USERNAME = "putzzdev"; 

let playerData = { username: "", isDev: false };
let gameState = 'LOGIN'; 
let gameInitialized = false; 

// ============ 2. SETUP DOM & EVENT LISTENER ============
window.addEventListener('DOMContentLoaded', () => {
  const loginMsg = document.getElementById('login-msg');
  const regMsg = document.getElementById('reg-msg');

  // --- PROSES REGISTRASI (DAFTAR) ---
  document.getElementById('btn-register').addEventListener('click', async () => {
    const username = document.getElementById('reg-username').value.trim();
    const pin = document.getElementById('reg-pin').value.trim();
    const pinConfirm = document.getElementById('reg-pin-confirm').value.trim();

    if (username.length < 3) { regMsg.textContent = "Username minimal 3 karakter!"; regMsg.className = "msg error"; return; }
    if (pin.length !== 6 || isNaN(pin)) { regMsg.textContent = "PIN harus 6 angka!"; regMsg.className = "msg error"; return; }
    if (pin !== pinConfirm) { regMsg.textContent = "PIN tidak cocok!"; regMsg.className = "msg error"; return; }

    regMsg.textContent = "Mendaftarkan...";
    regMsg.className = "msg";
    document.getElementById('btn-register').disabled = true;

    const userKey = username.toLowerCase();
    const firebaseUrl = `${FIREBASE_URL}players/${userKey}.json`;

    try {
      const checkRes = await fetch(firebaseUrl);
      const existing = await checkRes.json();
      if (existing) {
        regMsg.textContent = "Username sudah dipakai!";
        regMsg.className = "msg error";
        document.getElementById('btn-register').disabled = false;
        return;
      }

      await fetch(firebaseUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin, isDev: (userKey === DEV_USERNAME), createdAt: Date.now() })
      });

      regMsg.textContent = "Registrasi berhasil! Silakan Masuk.";
      regMsg.className = "msg success";
      
      // Kosongkan form
      document.getElementById('reg-username').value = '';
      document.getElementById('reg-pin').value = '';
      document.getElementById('reg-pin-confirm').value = '';
      
      // Pindah otomatis ke Tab Login setelah 1.5 detik
      setTimeout(() => { document.getElementById('tab1').checked = true; }, 1500);

    } catch(e) {
      regMsg.textContent = "Gagal daftar. Cek koneksi.";
      regMsg.className = "msg error";
    }
    document.getElementById('btn-register').disabled = false;
  });

  // --- PROSES LOGIN (MASUK) ---
  document.getElementById('btn-login').addEventListener('click', async () => {
    const username = document.getElementById('login-username').value.trim();
    const pin = document.getElementById('login-pin').value.trim();

    if (username.length < 3) { loginMsg.textContent = "Username minimal 3 karakter!"; loginMsg.className = "msg error"; return; }
    if (pin.length !== 6 || isNaN(pin)) { loginMsg.textContent = "PIN harus 6 angka!"; loginMsg.className = "msg error"; return; }

    loginMsg.textContent = "Memproses...";
    loginMsg.className = "msg";
    document.getElementById('btn-login').disabled = true;

    const userKey = username.toLowerCase();
    const firebaseUrl = `${FIREBASE_URL}players/${userKey}.json`;

    try {
      const res = await fetch(firebaseUrl);
      const data = await res.json();

      if (!data) {
        loginMsg.textContent = "Akun tidak ditemukan. Silakan Daftar.";
        loginMsg.className = "msg error";
        document.getElementById('btn-login').disabled = false;
        return;
      }

      if (data.pin !== pin) {
        loginMsg.textContent = "PIN salah! Coba lagi.";
        loginMsg.className = "msg error";
        document.getElementById('btn-login').disabled = false;
        return;
      }

      localStorage.setItem('parkour_user', JSON.stringify({ username, isDev: data.isDev }));
      startGame(username, data.isDev);

    } catch(e) {
      loginMsg.textContent = "Gagal konek ke server.";
      loginMsg.className = "msg error";
      document.getElementById('btn-login').disabled = false;
    }
  });

  // Cek Auto-Login
  const savedSession = localStorage.getItem('parkour_user');
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      startGame(session.username, session.isDev);
    } catch(e) {
      localStorage.removeItem('parkour_user');
    }
  }
});

// ============ 3. FUNGSI MULAI GAME & LOGOUT ============
function startGame(username, isDev) {
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('game-ui').style.display = 'block';

  playerData.username = username;
  playerData.isDev = isDev;
  gameState = 'PLAYING';

  document.getElementById('hud-username').textContent = username;
  if (isDev) document.getElementById('hud-verified').style.display = 'flex';

  if (!gameInitialized) {
    init3DGame(); // Panggil setup 3D hanya sekali
    gameInitialized = true;
  }

  updateCharacterNameSprite(username, isDev);
  requestFullscreenAndLock();
}

document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'l' && gameState === 'PLAYING') {
    localStorage.removeItem('parkour_user');
    location.reload();
  }
});

function requestFullscreenAndLock() {
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen().then(() => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(e => console.log(e));
    }).catch(e => console.log(e));
  }
}

// ============ 4. SETUP GAME 3D ============
let scene, camera, renderer, character, nameSprite, controls;
let platforms = [], physics, lavaMat;
let leftLegPivot, rightLegPivot, leftArmPivot, rightArmPivot, headGroup;
let joystickVector = new THREE.Vector2(0, 0);
let isRunning = false;

function init3DGame() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a24);
  scene.fog = new THREE.Fog(0x1a1a24, 20, 120);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(10, 30, 10);
  sun.castShadow = true;
  scene.add(sun);

  const lavaLight = new THREE.PointLight(0xff3300, 2, 50);
  lavaLight.position.set(0, -5, -40);
  scene.add(lavaLight);

  lavaMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), lavaMat);
  lava.rotation.x = -Math.PI / 2;
  lava.position.y = -8;
  scene.add(lava);

  // --- PLATFORMS ---
  const platformMat = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.8 });
  const breakableMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 });
  const movingMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.7 });

  function createPlatform(x, y, z, width, depth, type = 'static') {
    const height = 0.5;
    const geo = new THREE.BoxGeometry(width, height, depth);
    let mat = platformMat;
    if (type === 'breaking') mat = breakableMat;
    if (type.includes('moving')) mat = movingMat;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true; mesh.castShadow = true;
    scene.add(mesh);

    platforms.push({ mesh, width, depth, type, startX: x, startY: y, startZ: z, range: 2, speed: 1.5, phase: Math.random() * Math.PI * 2, isBreaking: false, breakTimer: 0, isFallen: false });
  }

  createPlatform(0, 0, 0, 8, 8, 'static');
  createPlatform(0, 0, -7, 5, 5, 'static');
  createPlatform(3, 1, -13, 5, 5, 'moving_x');
  createPlatform(0, 2, -19, 6, 6, 'static');
  createPlatform(-3, 2.5, -25, 5, 5, 'moving_y');
  createPlatform(0, 3.5, -31, 5, 5, 'breaking');
  createPlatform(0, 4.5, -37, 8, 8, 'static');
  createPlatform(0, 5.5, -44, 6, 6, 'moving_x');
  createPlatform(0, 6.5, -50, 5, 5, 'static');
  createPlatform(0, 7.5, -56, 8, 8, 'static');

  const finishLine = new THREE.Mesh(new THREE.BoxGeometry(7, 0.1, 7), new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 1 }));
  finishLine.position.set(0, 7.8, -56); scene.add(finishLine);

  const poleMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  const leftPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6), poleMat); leftPole.position.set(-4, 10.5, -56); scene.add(leftPole);
  const rightPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6), poleMat); rightPole.position.set(4, 10.5, -56); scene.add(rightPole);

  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 15; ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.font = 'bold 80px sans-serif'; ctx.fillStyle = '#00ff00'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PUTZZDEV MENGAKUI', canvas.width / 2, canvas.height / 2 - 40);
  ctx.font = 'bold 90px sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText('KAMU JAGO!', canvas.width / 2, canvas.height / 2 + 50);

  const texture = new THREE.CanvasTexture(canvas); texture.needsUpdate = true;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, emissive: 0x00ff00, emissiveIntensity: 0.2 }));
  board.position.set(0, 11.5, -56); scene.add(board);

  const finishLight = new THREE.PointLight(0x00ff00, 3, 15); finishLight.position.set(0, 9, -56); scene.add(finishLight);

  // --- KARAKTER ---
  character = new THREE.Group();
  character.position.set(0, 0.25, 0);
  scene.add(character);

  physics = { velocityY: 0, isGrounded: true, gravity: -32, jumpForce: 13, coyoteTime: 0, jumpCount: 0, maxJumps: 2 };

  const matSkin = new THREE.MeshStandardMaterial({ color: 0xffd1b3 });
  const matShirt = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
  const matPants = new THREE.MeshStandardMaterial({ color: 0x1a1a1c });
  const matShoe = new THREE.MeshStandardMaterial({ color: 0xa61c2b });
  const matEyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const matPupil = new THREE.MeshStandardMaterial({ color: 0x000000 });
  const matHair = new THREE.MeshStandardMaterial({ color: 0xd1d1d6, roughness: 0.6 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.8, 4, 16), matShirt); torso.position.y = 1.4; torso.castShadow = true; character.add(torso);
  headGroup = new THREE.Group(); headGroup.position.y = 2.2; character.add(headGroup);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), matSkin); head.castShadow = true; headGroup.add(head);

  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), matEyeWhite); leftEye.position.set(-0.1, 0.05, 0.27); headGroup.add(leftEye);
  const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 16), matPupil); leftPupil.position.set(-0.1, 0.05, 0.31); headGroup.add(leftPupil);
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), matEyeWhite); rightEye.position.set(0.1, 0.05, 0.27); headGroup.add(rightEye);
  const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 16), matPupil); rightPupil.position.set(0.1, 0.05, 0.31); headGroup.add(rightPupil);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 16), matSkin); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.02, 0.3); headGroup.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), matPupil); mouth.position.set(0, -0.12, 0.28); headGroup.add(mouth);

  const hairGroup = new THREE.Group(); headGroup.add(hairGroup);
  const baseHair = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16, 0, Math.PI * 2, 0, Math.PI / 1.6), matHair); baseHair.position.y = 0.02; baseHair.castShadow = true; hairGroup.add(baseHair);
  const bangGeo = new THREE.ConeGeometry(0.08, 0.25, 4);
  const bangLeft = new THREE.Mesh(bangGeo, matHair); bangLeft.position.set(-0.15, 0.15, 0.24); bangLeft.rotation.set(0.2, 0, -0.3); hairGroup.add(bangLeft);
  const bangCenter = new THREE.Mesh(bangGeo, matHair); bangCenter.position.set(0, 0.2, 0.27); bangCenter.rotation.set(0.1, 0, 0); bangCenter.scale.set(1.2, 1, 1.2); hairGroup.add(bangCenter);
  const bangRight = new THREE.Mesh(bangGeo, matHair); bangRight.position.set(0.15, 0.15, 0.24); bangRight.rotation.set(0.2, 0, 0.3); hairGroup.add(bangRight);

  leftArmPivot = new THREE.Group(); leftArmPivot.position.set(-0.4, 1.8, 0); character.add(leftArmPivot);
  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.6, 4, 8), matShirt); leftArm.position.y = -0.4; leftArm.castShadow = true; leftArmPivot.add(leftArm);
  rightArmPivot = new THREE.Group(); rightArmPivot.position.set(0.4, 1.8, 0); character.add(rightArmPivot);
  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.6, 4, 8), matShirt); rightArm.position.y = -0.4; rightArm.castShadow = true; rightArmPivot.add(rightArm);

  leftLegPivot = new THREE.Group(); leftLegPivot.position.set(-0.15, 0.9, 0); character.add(leftLegPivot);
  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7, 4, 8), matPants); leftLeg.position.y = -0.4; leftLeg.castShadow = true; leftLegPivot.add(leftLeg);
  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.35), matShoe); leftShoe.position.set(0, -0.8, 0.05); leftLegPivot.add(leftShoe);

  rightLegPivot = new THREE.Group(); rightLegPivot.position.set(0.15, 0.9, 0); character.add(rightLegPivot);
  const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7, 4, 8), matPants); rightLeg.position.y = -0.4; rightLeg.castShadow = true; rightLegPivot.add(rightLeg);
  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.35), matShoe); rightShoe.position.set(0, -0.8, 0.05); rightLegPivot.add(rightShoe);

  // --- KAMERA ---
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.minDistance = 5; controls.maxDistance = 15;
  controls.maxPolarAngle = Math.PI / 2 - 0.1;
  camera.position.set(0, 4, 8);
  controls.target.set(0, 1.5, 0);

  controls.domElement.addEventListener('pointerdown', function(e) {
    const x = e.clientX, y = e.clientY;
    const w = window.innerWidth, h = window.innerHeight;
    if ((x < 180 && y > h - 180) || (x > w - 220 && y > h - 160)) e.stopImmediatePropagation();
  }, { capture: true });

  // --- INPUT ---
  const joystickArea = document.getElementById('joystick-area');
  const joystickKnob = document.getElementById('joystick-knob');
  let joystickActive = false;
  const maxDist = 40;

  function updateKnob(x, y) {
    const dist = Math.sqrt(x*x + y*y);
    if (dist > maxDist) { x = (x / dist) * maxDist; y = (y / dist) * maxDist; }
    joystickKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    joystickVector.x = x / maxDist; joystickVector.y = -y / maxDist;
  }

  const handleStart = (e) => { e.preventDefault(); joystickActive = true; handleMove(e); };
  const handleMove = (e) => {
    if (!joystickActive) return;
    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    const rect = joystickArea.getBoundingClientRect();
    updateKnob(touch.clientX - (rect.left + rect.width/2), touch.clientY - (rect.top + rect.height/2));
  };
  const handleEnd = () => { joystickActive = false; joystickVector.set(0,0); joystickKnob.style.transform = `translate(-50%, -50%)`; };

  joystickArea.addEventListener('touchstart', handleStart, { passive: false });
  joystickArea.addEventListener('touchmove', handleMove, { passive: false });
  joystickArea.addEventListener('touchend', handleEnd);
  joystickArea.addEventListener('mousedown', handleStart);
  window.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleEnd);

  document.getElementById('btn-jump').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (physics.isGrounded) {
      physics.jumpCount = 1; physics.velocityY = physics.jumpForce; physics.isGrounded = false;
    } else if (physics.jumpCount < physics.maxJumps) {
      physics.jumpCount++; physics.velocityY = physics.jumpForce;
    }
  });

  const btnRun = document.getElementById('btn-run');
  btnRun.addEventListener('touchstart', (e) => { e.preventDefault(); isRunning = true; });
  btnRun.addEventListener('touchend', (e) => { e.preventDefault(); isRunning = false; });
  btnRun.addEventListener('pointerdown', (e) => { isRunning = true; });
  btnRun.addEventListener('pointerup', (e) => { isRunning = false; });
  btnRun.addEventListener('pointerleave', (e) => { isRunning = false; });

  document.getElementById('btn-restart').addEventListener('click', () => { location.reload(); });
  document.getElementById('overlay').style.display = 'none';

  animate();
}

// ============ 5. LOGIKA COLLISION & ANIMASI ============
function checkGroundCollision(x, z, y) {
  const feetY = y; const tolerance = 0.3;
  for (let p of platforms) {
    if (p.isFallen) continue;
    if (x > p.mesh.position.x - p.width/2 && x < p.mesh.position.x + p.width/2 &&
        z > p.mesh.position.z - p.depth/2 && z < p.mesh.position.z + p.depth/2) {
      const topY = p.mesh.position.y + 0.25;
      if (feetY >= topY - tolerance && feetY <= topY + 0.5) return { y: topY, platform: p };
    }
  }
  return null;
}

function checkWallCollision(x, z, y) {
  const radius = 0.35; const feetY = y;
  for (let p of platforms) {
    if (p.isFallen) continue;
    const topY = p.mesh.position.y + 0.25;
    const bottomY = p.mesh.position.y - 0.25;
    if (feetY < topY - 0.1 && feetY > bottomY - 1) {
      if (x + radius > p.mesh.position.x - p.width/2 && x - radius < p.mesh.position.x + p.width/2 &&
          z + radius > p.mesh.position.z - p.depth/2 && z - radius < p.mesh.position.z + p.depth/2) return true;
    }
  }
  return false;
}

function showOverlay(title, desc, color) {
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-title').style.color = color;
  document.getElementById('overlay-desc').textContent = desc;
  document.getElementById('overlay').style.display = 'flex';
}

function updateCharacterNameSprite(username, isDev) {
  if (nameSprite) { scene.remove(nameSprite); nameSprite.material.map.dispose(); nameSprite.material.dispose(); }

  const canvasName = document.createElement('canvas');
  canvasName.width = 512; canvasName.height = 128;
  const ctxName = canvasName.getContext('2d');

  ctxName.clearRect(0, 0, canvasName.width, canvasName.height);
  ctxName.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctxName.beginPath(); ctxName.roundRect(10, 20, 492, 88, 20); ctxName.fill();

  ctxName.font = 'bold 50px sans-serif'; ctxName.fillStyle = '#ffffff'; ctxName.textAlign = 'center'; ctxName.textBaseline = 'middle';
  ctxName.fillText(username, 256, 64);

  if (isDev) {
    ctxName.beginPath(); ctxName.arc(430, 64, 28, 0, Math.PI * 2); ctxName.fillStyle = '#1DA1F2'; ctxName.fill();
    ctxName.strokeStyle = '#ffffff'; ctxName.lineWidth = 4; ctxName.stroke();
    ctxName.beginPath(); ctxName.moveTo(418, 64); ctxName.lineTo(426, 74); ctxName.lineTo(444, 54); ctxName.strokeStyle = '#ffffff'; ctxName.lineWidth = 6; ctxName.lineCap = 'round'; ctxName.lineJoin = 'round'; ctxName.stroke();
  }

  const textureName = new THREE.CanvasTexture(canvasName);
  textureName.needsUpdate = true;
  nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textureName, depthTest: false, depthWrite: false }));
  nameSprite.position.set(0, 3.2, 0);
  nameSprite.scale.set(2, 0.5, 1);
  character.add(nameSprite);
}

const clock = new THREE.Clock();
let walkTime = 0;

function animate() {
  requestAnimationFrame(animate);
  if (gameState !== 'PLAYING' || !renderer) { return; }

  const delta = Math.min(clock.getDelta(), 0.1);
  const t = clock.getElapsedTime();
  const speed = isRunning ? 9 : 5;
  let isMoving = false;

  platforms.forEach(p => {
    if (p.type === 'moving_x') p.mesh.position.x = p.startX + Math.sin(t * p.speed + p.phase) * p.range;
    else if (p.type === 'moving_y') p.mesh.position.y = p.startY + Math.sin(t * p.speed + p.phase) * p.range;
    else if (p.type === 'breaking' && p.isBreaking && !p.isFallen) {
      p.breakTimer -= delta;
      p.mesh.position.x = p.startX + (Math.random() - 0.5) * 0.1;
      p.mesh.position.z = p.startZ + (Math.random() - 0.5) * 0.1;
      if (p.breakTimer <= 0) { p.isFallen = true; p.mesh.position.y -= 20; }
    }
  });

  const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

  let nextX = character.position.x; let nextZ = character.position.z;

  if (Math.abs(joystickVector.x) > 0.1 || Math.abs(joystickVector.y) > 0.1) {
    const moveX = forward.x * joystickVector.y + right.x * joystickVector.x;
    const moveZ = forward.z * joystickVector.y + right.z * joystickVector.x;
    const len = Math.sqrt(moveX*moveX + moveZ*moveZ);
    nextX += (moveX / len) * speed * delta; nextZ += (moveZ / len) * speed * delta;
    isMoving = true; character.rotation.y = Math.atan2(moveX, moveZ);
  }

  if (!checkWallCollision(nextX, character.position.z, character.position.y)) character.position.x = nextX;
  if (!checkWallCollision(character.position.x, nextZ, character.position.y)) character.position.z = nextZ;

  const groundData = checkGroundCollision(character.position.x, character.position.z, character.position.y);
  if (groundData && physics.velocityY <= 0) {
    character.position.y = groundData.y;
    physics.velocityY = 0; physics.isGrounded = true; physics.jumpCount = 0;
    if (groundData.platform.type === 'moving_x') character.position.x = character.position.x;
    else if (groundData.platform.type === 'moving_y') character.position.y = groundData.y;
    if (groundData.platform.type === 'breaking' && !groundData.platform.isBreaking) {
      groundData.platform.isBreaking = true; groundData.platform.breakTimer = 0.7;
    }
  } else {
    physics.isGrounded = false;
  }

  if (!physics.isGrounded) {
    physics.velocityY += physics.gravity * delta;
    character.position.y += physics.velocityY * delta;
    const landingData = checkGroundCollision(character.position.x, character.position.z, character.position.y + 0.5);
    if (landingData && character.position.y <= landingData.y) {
      character.position.y = landingData.y; physics.velocityY = 0; physics.isGrounded = true; physics.jumpCount = 0;
    }
  }

  if (character.position.y < -3) {
    gameState = 'GAMEOVER'; showOverlay('GAME OVER', 'Kamu jatuh ke lava panas!', '#ff3333');
  }

  if (character.position.z < -53 && character.position.y > 6) {
    gameState = 'WIN'; showOverlay('YOU WIN!', 'Putzzdev mengakui kamu jago!', '#00ff00');
  }

  if (!physics.isGrounded) {
    leftLegPivot.rotation.x = THREE.MathUtils.lerp(leftLegPivot.rotation.x, -0.5, 0.2);
    rightLegPivot.rotation.x = THREE.MathUtils.lerp(rightLegPivot.rotation.x, 0.5, 0.2);
    leftArmPivot.rotation.x = THREE.MathUtils.lerp(leftArmPivot.rotation.x, -1.2, 0.2);
    rightArmPivot.rotation.x = THREE.MathUtils.lerp(rightArmPivot.rotation.x, -1.2, 0.2);
  } else if (isMoving) {
    walkTime += delta * speed * 2;
    const swing = Math.sin(walkTime) * 0.8;
    leftLegPivot.rotation.x = swing; rightLegPivot.rotation.x = -swing;
    leftArmPivot.rotation.x = -swing * 0.7; rightArmPivot.rotation.x = swing * 0.7;
  } else {
    leftLegPivot.rotation.x = THREE.MathUtils.lerp(leftLegPivot.rotation.x, 0, 0.1);
    rightLegPivot.rotation.x = THREE.MathUtils.lerp(rightLegPivot.rotation.x, 0, 0.1);
    leftArmPivot.rotation.x = THREE.MathUtils.lerp(leftArmPivot.rotation.x, 0, 0.1);
    rightArmPivot.rotation.x = THREE.MathUtils.lerp(rightArmPivot.rotation.x, 0, 0.1);
    headGroup.rotation.y = Math.sin(t * 0.5) * 0.2;
  }

  const targetPos = character.position.clone(); targetPos.y += 1.5;
  controls.target.lerp(targetPos, 0.1);
  const camDir = camera.position.clone().sub(controls.target).normalize();
  const desiredCamPos = controls.target.clone().add(camDir.multiplyScalar(8));
  if (desiredCamPos.y < character.position.y + 2) desiredCamPos.y = character.position.y + 2;
  camera.position.lerp(desiredCamPos, 0.1);
  controls.update();

  lavaMat.color.setHSL(0.03 + Math.sin(t * 2) * 0.02, 1, 0.5);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  if (camera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => console.log(e)));
}