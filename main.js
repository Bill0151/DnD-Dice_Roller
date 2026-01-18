const rendererContainer = document.getElementById("renderer-container");
const resultValueEl = document.getElementById("roll-result-value");
const rollHistoryEl = document.getElementById("roll-history");
const diceColorInput = document.getElementById("dice-color");
const numberColorInput = document.getElementById("number-color");
const diceButtons = document.querySelectorAll(".dice-buttons button");
const rollSelectedButton = document.getElementById("roll-selected");
const playerButtons = document.querySelectorAll(".player-buttons button");
const textureStyleSelect = document.getElementById("texture-style");
const profileSelect = document.getElementById("profile-select");
const profileNameInput = document.getElementById("profile-name");
const applyProfileButton = document.getElementById("apply-profile");
const saveProfileButton = document.getElementById("save-profile");
const clearDiceButton = document.getElementById("clear-dice");
const toggleSettingsButton = document.getElementById("toggle-settings");
const settingsBody = document.getElementById("settings-body");

let diceColor = diceColorInput.value;
let numberColor = numberColorInput.value;
let currentTexture = "solid";

let scene;
let camera;
let renderer;
let world;
let lastTime;
let swipeStart = null;
let swipeVector = null;

const dice = [];

let profiles = {};
let currentProfileName = null;
const rollHistory = [];
const maxHistoryEntries = 20;

const traySize = {
width: 10,
depth: 10,
height: 2.2
};

function init() {
scene = new THREE.Scene();
scene.background = new THREE.Color(0x020617);

const aspect = rendererContainer.clientWidth / rendererContainer.clientHeight || 1;
camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
camera.position.set(0, 11, 13);
camera.lookAt(0, 1.5, 0);

renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(rendererContainer.clientWidth, rendererContainer.clientHeight);
renderer.shadowMap.enabled = true;
rendererContainer.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambientLight);

  const spotLight = new THREE.SpotLight(0xffffff, 1.4, 50, Math.PI / 6, 0.3);
spotLight.position.set(8, 15, 6);
spotLight.castShadow = true;
spotLight.shadow.mapSize.width = 1024;
spotLight.shadow.mapSize.height = 1024;
scene.add(spotLight);

  const rimLight = new THREE.PointLight(0x93c5fd, 0.7, 40);
  rimLight.position.set(-10, 12, 10);
  scene.add(rimLight);

world = new CANNON.World();
world.gravity.set(0, -30, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 15;

const physicsMaterial = new CANNON.Material("diceMaterial");
const contactMaterial = new CANNON.ContactMaterial(physicsMaterial, physicsMaterial, {
friction: 0.7,
restitution: 0.08
});
world.addContactMaterial(contactMaterial);

createTray(physicsMaterial);

window.addEventListener("resize", handleResize);
  renderer.domElement.addEventListener("pointerdown", (e) => { e.preventDefault(); onPointerDown(e); }, { passive: false });
  renderer.domElement.addEventListener("pointerup", (e) => { e.preventDefault(); onPointerUp(e); }, { passive: false });
  renderer.domElement.addEventListener("pointermove", (e) => { e.preventDefault(); }, { passive: false });
  renderer.domElement.addEventListener("pointercancel", () => { swipeStart = null; }, { passive: true });
  renderer.domElement.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.touches && e.touches[0] ? e.touches[0] : null;
    if (!t) return;
    swipeStart = { x: t.clientX, y: t.clientY, t: performance.now() };
  }, { passive: false });
  renderer.domElement.addEventListener("touchmove", (e) => {
    e.preventDefault();
  }, { passive: false });
  renderer.domElement.addEventListener("touchend", (e) => {
    e.preventDefault();
    const t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
    if (!t || !swipeStart) return;
    const dt = Math.max(10, performance.now() - swipeStart.t);
    const dx = t.clientX - swipeStart.x;
    const dy = t.clientY - swipeStart.y;
    const scale = 0.02;
    const vx = THREE.MathUtils.clamp(dx * scale, -6, 6);
    const vz = THREE.MathUtils.clamp(-dy * scale, -8, -2);
    swipeVector = { vx, vz };
    swipeStart = null;
    if (getTotalSelectionCount() > 0) {
      rollSelectedDice();
    }
  }, { passive: false });

  diceButtons.forEach(button => {
    button.addEventListener("click", () => {
      const type = button.getAttribute("data-die");
      incrementSelection(type);
    });
  });

  if (rollSelectedButton) {
    rollSelectedButton.addEventListener("click", () => {
      rollSelectedDice();
    });
  }

  playerButtons.forEach(button => {
    button.addEventListener("click", () => {
      const player = button.getAttribute("data-player");
      if (!player) {
        return;
      }
      const profileName = player + "'s dice";
      applyProfile(profileName);
      refreshProfileSelect(profileName);
    });
  });

diceColorInput.addEventListener("input", () => {
diceColor = diceColorInput.value;
});

numberColorInput.addEventListener("input", () => {
numberColor = numberColorInput.value;
resultValueEl.style.color = numberColor;
});

textureStyleSelect.addEventListener("change", () => {
currentTexture = textureStyleSelect.value;
});

applyProfileButton.addEventListener("click", () => {
const name = profileSelect.value;
if (name) {
applyProfile(name);
}
});

saveProfileButton.addEventListener("click", () => {
const name = profileNameInput.value.trim() || profileSelect.value.trim();
if (!name) {
return;
}
profiles[name] = {
diceColor,
numberColor,
texture: currentTexture
};
saveProfiles();
refreshProfileSelect(name);
});

clearDiceButton.addEventListener("click", () => {
clearAllDice();
});

toggleSettingsButton.addEventListener("click", () => {
const isHidden = settingsBody.classList.toggle("settings-body-hidden");
toggleSettingsButton.textContent = isHidden ? "Customize" : "Hide";
});

loadProfiles();

resultValueEl.style.color = numberColor;

lastTime = performance.now();
requestAnimationFrame(loop);
}

const selectionCounts = {
  d4: 0,
  d6: 0,
  d8: 0,
  d10: 0,
  d12: 0,
  d20: 0,
  d100: 0
};
const maxDicePerRoll = 20;

function getTotalSelectionCount() {
  let total = 0;
  const keys = Object.keys(selectionCounts);
  for (let i = 0; i < keys.length; i += 1) {
    total += selectionCounts[keys[i]];
  }
  return total;
}

function updateDiceButtonLabels() {
  diceButtons.forEach(button => {
    const type = button.getAttribute("data-die");
    const count = selectionCounts[type] || 0;
    button.textContent = count > 0 ? (type + " × " + count) : type;
  });
}

function incrementSelection(type) {
  const total = getTotalSelectionCount();
  if (total >= maxDicePerRoll) {
    return;
  }
  selectionCounts[type] = (selectionCounts[type] || 0) + 1;
  updateDiceButtonLabels();
}

function clearSelection() {
  const keys = Object.keys(selectionCounts);
  for (let i = 0; i < keys.length; i += 1) {
    selectionCounts[keys[i]] = 0;
  }
  updateDiceButtonLabels();
}

function rollSelectedDice() {
  const total = getTotalSelectionCount();
  if (total === 0) {
    return;
  }
  const rollId = "r" + Math.floor(Math.random() * 1e9).toString(36);
  const keys = Object.keys(selectionCounts);
  for (let i = 0; i < keys.length; i += 1) {
    const type = keys[i];
    const count = selectionCounts[type];
    for (let j = 0; j < count; j += 1) {
      spawnDie(type, swipeVector, rollId);
    }
  }
  clearSelection();
  swipeVector = null;
}

function onPointerDown(ev) {
  swipeStart = {
    x: ev.clientX,
    y: ev.clientY,
    t: performance.now()
  };
}

function onPointerUp(ev) {
  if (!swipeStart) {
    return;
  }
  const dt = Math.max(10, performance.now() - swipeStart.t);
  const dx = ev.clientX - swipeStart.x;
  const dy = ev.clientY - swipeStart.y;
  const scale = 0.02;
  const vx = THREE.MathUtils.clamp(dx * scale, -8, 8);
  const vz = THREE.MathUtils.clamp(-dy * scale, -10, -2);
  swipeVector = { vx, vz };
  swipeStart = null;
}

function createTray(physicsMaterial) {
const floorGeometry = new THREE.PlaneGeometry(traySize.width, traySize.depth, 1, 1);
const floorMaterial = new THREE.MeshStandardMaterial({
color: 0x020617,
metalness: 0.2,
roughness: 0.9
});
const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
floorMesh.receiveShadow = true;
floorMesh.rotation.x = -Math.PI / 2;
scene.add(floorMesh);

const edgeGeometry = new THREE.PlaneGeometry(traySize.width, traySize.depth, 10, 10);
const edgeMaterial = new THREE.MeshBasicMaterial({
color: 0x111827,
wireframe: true,
opacity: 0.35,
transparent: true
});
const edgeMesh = new THREE.Mesh(edgeGeometry, edgeMaterial);
edgeMesh.rotation.x = -Math.PI / 2;
edgeMesh.position.y = 0.01;
scene.add(edgeMesh);

const floorBody = new CANNON.Body({
mass: 0,
shape: new CANNON.Plane(),
material: physicsMaterial
});
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(floorBody);

const halfW = traySize.width / 2;
const halfD = traySize.depth / 2;
const wallThickness = 0.6;
const wallHeight = traySize.height;

const wallGeometry = new THREE.BoxGeometry(traySize.width + wallThickness * 2, wallHeight, wallThickness);
const wallMaterial = new THREE.MeshStandardMaterial({
color: 0x020617,
metalness: 0.4,
roughness: 0.7
});

const backWallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
backWallMesh.castShadow = true;
backWallMesh.receiveShadow = true;
backWallMesh.position.set(0, wallHeight / 2, -halfD);
scene.add(backWallMesh);

const frontWallMesh = backWallMesh.clone();
frontWallMesh.position.set(0, wallHeight / 2, halfD);
scene.add(frontWallMesh);

const sideWallGeometry = new THREE.BoxGeometry(traySize.depth + wallThickness * 2, wallHeight, wallThickness);

const leftWallMesh = new THREE.Mesh(sideWallGeometry, wallMaterial);
leftWallMesh.castShadow = true;
leftWallMesh.receiveShadow = true;
leftWallMesh.rotation.y = Math.PI / 2;
leftWallMesh.position.set(-halfW, wallHeight / 2, 0);
scene.add(leftWallMesh);

const rightWallMesh = leftWallMesh.clone();
rightWallMesh.position.set(halfW, wallHeight / 2, 0);
scene.add(rightWallMesh);

function addWallBody(px, py, pz, sx, sy, sz, rotationY) {
const shape = new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2));
const body = new CANNON.Body({
mass: 0,
shape,
material: physicsMaterial
});
body.position.set(px, py, pz);
if (rotationY) {
body.quaternion.setFromEuler(0, rotationY, 0);
}
world.addBody(body);
}

addWallBody(0, wallHeight / 2, -halfD - wallThickness / 2, traySize.width + wallThickness * 2, wallHeight, wallThickness, 0);
addWallBody(0, wallHeight / 2, halfD + wallThickness / 2, traySize.width + wallThickness * 2, wallHeight, wallThickness, 0);
addWallBody(-halfW - wallThickness / 2, wallHeight / 2, 0, traySize.depth + wallThickness * 2, wallHeight, wallThickness, Math.PI / 2);
addWallBody(halfW + wallThickness / 2, wallHeight / 2, 0, traySize.depth + wallThickness * 2, wallHeight, wallThickness, Math.PI / 2);

  const lipThickness = 0.4;
  const lipHeight = 0.2;
  function addLip(px, pz, width, rotationY) {
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, lipHeight / 2, lipThickness / 2));
    const body = new CANNON.Body({ mass: 0, shape, material: physicsMaterial });
    body.position.set(px, wallHeight - lipHeight / 2, pz);
    if (rotationY) body.quaternion.setFromEuler(0, rotationY, 0);
    world.addBody(body);
  }
  addLip(0, -halfD - wallThickness / 2, traySize.width + wallThickness * 1.5, 0);
  addLip(0, halfD + wallThickness / 2, traySize.width + wallThickness * 1.5, 0);
  addLip(-halfW - wallThickness / 2, 0, traySize.depth + wallThickness * 1.5, Math.PI / 2);
  addLip(halfW + wallThickness / 2, 0, traySize.depth + wallThickness * 1.5, Math.PI / 2);
}

function createDieMesh(type) {
let geometry;
let radius;

switch (type) {
    case "d2":
      radius = 0.5;
      geometry = new THREE.CylinderGeometry(0.1, 0.1, 1.2, 4);
      geometry.scale(1.2, 0.2, 1.2);
      break;
    case "d3":
      radius = 0.6;
      geometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 3);
      break;
    case "d5":
      radius = 0.6;
      geometry = new THREE.DodecahedronGeometry(radius);
      break;
case "d4":
radius = 0.5;
geometry = new THREE.TetrahedronGeometry(radius);
break;
case "d6":
radius = 0.6;
geometry = new THREE.BoxGeometry(radius * 2, radius * 2, radius * 2);
break;
case "d8":
radius = 0.55;
geometry = new THREE.OctahedronGeometry(radius);
break;
case "d10":
      radius = 0.6;
      geometry = null;
break;
case "d12":
radius = 0.6;
geometry = new THREE.DodecahedronGeometry(radius);
break;
case "d20":
radius = 0.6;
geometry = new THREE.IcosahedronGeometry(radius);
break;
    case "d100":
      radius = 0.6;
      geometry = new THREE.IcosahedronGeometry(radius);
      break;
default:
radius = 0.6;
geometry = new THREE.BoxGeometry(radius * 2, radius * 2, radius * 2);
}

  if (type === "d10") {
    const material = createMaterialForCurrentStyle();
    const heightHalf = radius * 1.1;
    const coneGeometry = new THREE.ConeGeometry(radius * 0.9, heightHalf, 5);
    const top = new THREE.Mesh(coneGeometry, material);
    const bottom = new THREE.Mesh(coneGeometry, material);
    top.position.y = heightHalf / 2;
    bottom.position.y = -heightHalf / 2;
    bottom.rotation.x = Math.PI;
    top.castShadow = true;
    top.receiveShadow = true;
    bottom.castShadow = true;
    bottom.receiveShadow = true;
    const group = new THREE.Group();
    group.add(top);
    group.add(bottom);
    return { mesh: group, radius };
  }

  let material;
  if (type === "d6") {
    // Switch d6 to dynamic atlas too for consistency
    material = createMaterialForCurrentStyle();
  } else {
    material = type === "d2" || type === "d3" || type === "d5"
      ? new THREE.MeshStandardMaterial({ color: new THREE.Color(diceColor), metalness: 0.8, roughness: 0.2 })
      : createMaterialForCurrentStyle();
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  if (type !== "d2" && type !== "d3" && type !== "d5") {
    const faceCount = getSidesForType(type);
    const atlas = createNumberAtlas(faceCount, numberColor);
    applyAtlasUVs(mesh.geometry, faceCount, atlas.tiles, type);
    mesh.material.map = atlas.texture;
    mesh.material.needsUpdate = true;
  }

  return { mesh, radius };
}

function spawnDie(type, velocityOverride, rollId) {
const style = {
diceColor,
numberColor,
texture: currentTexture,
profileName: currentProfileName
};
const { mesh, radius } = createDieMesh(type);
scene.add(mesh);

  const halfD = traySize.depth / 2;
const laneIndex = Math.floor(Math.random() * 3);
  const laneOffset = (laneIndex - 1) * (traySize.width / 6);
  const spawnX = laneOffset + (Math.random() - 0.5) * (traySize.width * 0.2);
  const frontThirdCenter = halfD - traySize.depth / 6;
  const spawnZ = frontThirdCenter + (Math.random() - 0.5) * (traySize.depth / 12);

let bodyShape;
if (type === "d6") {
bodyShape = new CANNON.Box(new CANNON.Vec3(radius, radius, radius));
} else if (type === "d2") {
  bodyShape = new CANNON.Cylinder(0.1, 0.1, 1.2, 4);
} else if (type === "d3") {
  bodyShape = new CANNON.Cylinder(0.5, 0.5, 1.5, 3);
} else {
bodyShape = new CANNON.Sphere(radius);
}

const body = new CANNON.Body({
mass: 1,
shape: bodyShape
});

  body.linearDamping = 0.25;
  body.angularDamping = 0.3;

body.position.set(spawnX, traySize.height + 3, spawnZ);

const baseStrength = 7;
let forwardSpeed = -baseStrength * (0.8 + Math.random() * 0.3);
let sideways = (laneIndex - 1) * 2 + (Math.random() - 0.5) * 1.5;
const upward = 1.5 + Math.random() * 1.5;

if (velocityOverride) {
  sideways = velocityOverride.vx;
  forwardSpeed = velocityOverride.vz;
}

body.velocity.set(
sideways,
upward,
forwardSpeed
);

body.angularVelocity.set(
(Math.random() - 0.5) * 15,
(Math.random() - 0.5) * 15,
(Math.random() - 0.5) * 15
);

world.addBody(body);

const die = {
type,
mesh,
body,
sides: getSidesForType(type),
hasResult: false,
settledTime: 0,
radius,
value: null,
diceColor: style.diceColor,
numberColor: style.numberColor,
texture: style.texture,
  profileName: style.profileName,
  rollId: rollId || null
};

  // Face numbers via dynamic canvas texture atlas are applied in createDieMesh

dice.push(die);
}

function getSidesForType(type) {
switch (type) {
    case "d2":
      return 2;
    case "d3":
      return 3;
    case "d5":
      return 5;
case "d4":
return 4;
case "d6":
return 6;
case "d8":
return 8;
case "d10":
return 10;
    case "d100":
      return 100;
case "d12":
return 12;
case "d20":
return 20;
default:
return 6;
}
}

function loop(now) {
const dt = Math.min((now - lastTime) / 1000, 1 / 30);
lastTime = now;

world.step(1 / 60, dt, 3);

for (let i = 0; i < dice.length; i += 1) {
const die = dice[i];
die.mesh.position.copy(die.body.position);
die.mesh.quaternion.copy(die.body.quaternion);
}

updateSettledDice(now);

renderer.render(scene, camera);
requestAnimationFrame(loop);
}

function updateSettledDice(now) {
if (!dice.length) {
return;
}

  const settleVelocityThreshold = 0.15;
  const settleAngularThreshold = 0.4;
  const settleDelay = 700;

for (let i = 0; i < dice.length; i += 1) {
const die = dice[i];

if (die.hasResult) {
continue;
}

const v = die.body.velocity;
const w = die.body.angularVelocity;

const linearSpeed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
const angularSpeed = Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z);

if (linearSpeed < settleVelocityThreshold && angularSpeed < settleAngularThreshold) {
if (!die.settledTime) {
die.settledTime = now;
} else if (now - die.settledTime > settleDelay) {
die.hasResult = true;
          die.value = getDieValue(die);
          die.body.velocity.set(0, 0, 0);
          die.body.angularVelocity.set(0, 0, 0);
          die.body.linearDamping = 0.7;
          die.body.angularDamping = 0.7;
          updateResultDisplay(die, die.value);
}
} else {
die.settledTime = 0;
}
}
}

function updateResultDisplay(die, value) {
resultValueEl.textContent = value.toString();
addRollToHistory(die, value);
  const header = document.querySelector(".roll-result");
  if (header) {
    header.classList.add("highlight");
    setTimeout(() => header.classList.remove("highlight"), 350);
  }
}

function updateDiceMaterials() {
for (let i = 0; i < dice.length; i += 1) {
const die = dice[i];
    if (!die.mesh || !die.mesh.isMesh) {
      continue;
    }
    if (Array.isArray(die.mesh.material)) {
      for (let j = 0; j < die.mesh.material.length; j += 1) {
        if (die.mesh.material[j]) {
          die.mesh.material[j].dispose();
        }
      }
    } else if (die.mesh.material) {
      die.mesh.material.dispose();
    }
    if (die.type === "d2" || die.type === "d3" || die.type === "d5") {
      die.mesh.material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(diceColor),
        metalness: 0.8,
        roughness: 0.2
      });
    } else {
      die.mesh.material = createMaterialForCurrentStyle();
      const faceCount = getSidesForType(die.type);
      const atlas = createNumberAtlas(faceCount, numberColor);
      applyAtlasUVs(die.mesh.geometry, faceCount, atlas.tiles, die.type);
      die.mesh.material.map = atlas.texture;
      die.mesh.material.needsUpdate = true;
    }
}
}

function getDieValue(die) {
  if (die.type === "d6") {
    return getD6ValueFromOrientation(die.body);
  }
  const up = new CANNON.Vec3(0, 1, 0);
  if (die.type === "d2") {
    const dot = die.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).dot(up);
    return dot >= 0 ? 1 : 2;
  }
  if (die.type === "d3") {
    return 1 + Math.floor(Math.random() * 3);
  }
  if (die.type === "d5") {
    return 1 + Math.floor(Math.random() * 5);
  }
  if (die.type === "d4") {
    const normals = [
      { normal: new CANNON.Vec3(0, 1, 0), value: 1 },
      { normal: new CANNON.Vec3(0.94, -0.33, 0), value: 2 },
      { normal: new CANNON.Vec3(-0.47, -0.33, 0.82), value: 3 },
      { normal: new CANNON.Vec3(-0.47, -0.33, -0.82), value: 4 }
    ];
    let maxDot = -Infinity;
    let bestValue = 1;
    for (let i = 0; i < normals.length; i += 1) {
      const worldNormal = die.body.quaternion.vmult(normals[i].normal);
      const dot = worldNormal.dot(up);
      if (dot > maxDot) {
        maxDot = dot;
        bestValue = normals[i].value;
      }
    }
    return bestValue;
  }
  if (die.type === "d8" || die.type === "d10" || die.type === "d12" || die.type === "d20") {
    return 1 + Math.floor(Math.random() * die.sides);
  }
  if (die.type === "d100") {
    return 1 + Math.floor(Math.random() * 100);
  }
  return 1 + Math.floor(Math.random() * die.sides);
}

function createNumberAtlas(faceCount, colorHex) {
  const cols = Math.ceil(Math.sqrt(faceCount));
  const rows = Math.ceil(faceCount / cols);
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  const cellW = size / cols;
  const cellH = size / rows;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold " + Math.floor(Math.min(cellW, cellH) * 0.6) + "px system-ui";
  ctx.fillStyle = colorHex;
  const tiles = [];
  for (let i = 0; i < faceCount; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = row * cellH;
    tiles.push({
      u0: x / size,
      v0: y / size,
      u1: (x + cellW) / size,
      v1: (y + cellH) / size
    });
    ctx.fillText(String(i + 1), x + cellW / 2, y + cellH / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return { canvas, texture, tiles, cols, rows };
}

function groupTrianglesByNormal(geometry, tolerance) {
  const pos = geometry.attributes.position;
  const index = geometry.index ? geometry.index.array : null;
  const triCount = index ? index.length / 3 : pos.count / 3;
  const groups = [];
  const normals = [];
  for (let t = 0; t < triCount; t += 1) {
    let i0, i1, i2;
    if (index) {
      i0 = index[t * 3 + 0];
      i1 = index[t * 3 + 1];
      i2 = index[t * 3 + 2];
    } else {
      i0 = t * 3 + 0;
      i1 = t * 3 + 1;
      i2 = t * 3 + 2;
    }
    const p0 = new THREE.Vector3().fromBufferAttribute(pos, i0);
    const p1 = new THREE.Vector3().fromBufferAttribute(pos, i1);
    const p2 = new THREE.Vector3().fromBufferAttribute(pos, i2);
    const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)).normalize();
    let gid = -1;
    for (let g = 0; g < normals.length; g += 1) {
      if (n.dot(normals[g]) > 1 - tolerance) {
        gid = g;
        break;
      }
    }
    if (gid === -1) {
      normals.push(n.clone());
      groups.push([]);
      gid = groups.length - 1;
    }
    groups[gid].push(t);
  }
  return groups;
}

function applyAtlasUVs(geometry, faceCount, tiles, type) {
  const pos = geometry.attributes.position;
  const index = geometry.index ? geometry.index.array : null;
  const triCount = index ? index.length / 3 : pos.count / 3;
  let uvAttr = geometry.attributes.uv;
  if (!uvAttr || uvAttr.count !== pos.count) {
    const uv = new Float32Array(pos.count * 2);
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    uvAttr = geometry.attributes.uv;
  }
  const setUV = (vi, u, v) => {
    uvAttr.setXY(vi, u, v);
  };
  if (type === "d6") {
    for (let t = 0; t < triCount; t += 1) {
      const tileIndex = Math.min(faceCount - 1, Math.floor(t / 2));
      const tile = tiles[tileIndex];
      const u0 = tile.u0, v0 = tile.v0, u1 = tile.u1, v1 = tile.v1;
      let i0, i1, i2;
      if (index) {
        i0 = index[t * 3 + 0];
        i1 = index[t * 3 + 1];
        i2 = index[t * 3 + 2];
      } else {
        i0 = t * 3 + 0;
        i1 = t * 3 + 1;
        i2 = t * 3 + 2;
      }
      setUV(i0, u0, v0);
      setUV(i1, u1, v0);
      setUV(i2, u0, v1);
    }
  } else if (type === "d4" || type === "d8" || type === "d20") {
    for (let t = 0; t < triCount; t += 1) {
      const tileIndex = Math.min(faceCount - 1, t % faceCount);
      const tile = tiles[tileIndex];
      const u0 = tile.u0, v0 = tile.v0, u1 = tile.u1, v1 = tile.v1;
      let i0, i1, i2;
      if (index) {
        i0 = index[t * 3 + 0];
        i1 = index[t * 3 + 1];
        i2 = index[t * 3 + 2];
      } else {
        i0 = t * 3 + 0;
        i1 = t * 3 + 1;
        i2 = t * 3 + 2;
      }
      setUV(i0, u0, v0);
      setUV(i1, u1, v0);
      setUV(i2, u0, v1);
    }
  } else if (type === "d12") {
    const groups = groupTrianglesByNormal(geometry, 1e-5);
    for (let g = 0; g < groups.length; g += 1) {
      const tileIndex = Math.min(faceCount - 1, g);
      const tile = tiles[tileIndex];
      const u0 = tile.u0, v0 = tile.v0, u1 = tile.u1, v1 = tile.v1;
      const tris = groups[g];
      for (let k = 0; k < tris.length; k += 1) {
        const t = tris[k];
        let i0, i1, i2;
        if (index) {
          i0 = index[t * 3 + 0];
          i1 = index[t * 3 + 1];
          i2 = index[t * 3 + 2];
        } else {
          i0 = t * 3 + 0;
          i1 = t * 3 + 1;
          i2 = t * 3 + 2;
        }
        setUV(i0, u0, v0);
        setUV(i1, u1, v0);
        setUV(i2, u0, v1);
      }
    }
  } else {
    for (let t = 0; t < triCount; t += 1) {
      const tileIndex = Math.min(faceCount - 1, t % faceCount);
      const tile = tiles[tileIndex];
      const u0 = tile.u0, v0 = tile.v0, u1 = tile.u1, v1 = tile.v1;
      let i0, i1, i2;
      if (index) {
        i0 = index[t * 3 + 0];
        i1 = index[t * 3 + 1];
        i2 = index[t * 3 + 2];
      } else {
        i0 = t * 3 + 0;
        i1 = t * 3 + 1;
        i2 = t * 3 + 2;
      }
      setUV(i0, u0, v0);
      setUV(i1, u1, v0);
      setUV(i2, u0, v1);
    }
  }
  uvAttr.needsUpdate = true;
}

function createMaterialForCurrentStyle() {
const color = new THREE.Color(diceColor);
if (currentTexture === "crystal") {
return new THREE.MeshPhysicalMaterial({
color,
      metalness: 0.05,
      roughness: 0.1,
      transmission: 0.7,
      thickness: 0.6,
clearcoat: 0.9,
clearcoatRoughness: 0.1
});
}
if (currentTexture === "metal") {
return new THREE.MeshStandardMaterial({
color,
      metalness: 0.9,
      roughness: 0.25
});
}
if (currentTexture === "wood") {
return new THREE.MeshStandardMaterial({
color,
      metalness: 0.15,
      roughness: 0.75
});
}
if (currentTexture === "marble") {
return new THREE.MeshStandardMaterial({
color,
      metalness: 0.2,
      roughness: 0.3
});
}
return new THREE.MeshStandardMaterial({
color,
    metalness: 0.15,
    roughness: 0.35
});
}

function createD6Materials() {
  const baseColor = new THREE.Color(diceColor);
  let metalness;
  let roughness;
  if (currentTexture === "crystal") {
    metalness = 0.05;
    roughness = 0.15;
  } else if (currentTexture === "metal") {
    metalness = 1;
    roughness = 0.25;
  } else if (currentTexture === "wood") {
    metalness = 0.15;
    roughness = 0.75;
  } else if (currentTexture === "marble") {
    metalness = 0.2;
    roughness = 0.3;
  } else {
    metalness = 0.15;
    roughness = 0.35;
  }
  const numbers = [2, 5, 1, 6, 3, 4];
  const materials = [];
  for (let i = 0; i < 6; i += 1) {
    const canvas = document.createElement("canvas");
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#" + baseColor.getHexString();
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = numberColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 144px system-ui";
    ctx.fillText(String(numbers[i]), size / 2, size / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness,
      roughness,
      map: texture
    });
    materials.push(material);
  }
  return materials;
}

function addRollToHistory(die, value) {
if (!rollHistoryEl) {
return;
}
const entry = {
type: die.type,
value,
profileName: die.profileName || "",
    color: die.diceColor,
    rollId: die.rollId || null
};
rollHistory.push(entry);
if (rollHistory.length > maxHistoryEntries) {
rollHistory.shift();
}
renderRollHistory();
}

function renderRollHistory() {
  rollHistoryEl.innerHTML = "";
  const groups = {};
  for (let i = 0; i < rollHistory.length; i += 1) {
    const e = rollHistory[i];
    const gid = e.rollId || ("g" + i);
    if (!groups[gid]) {
      groups[gid] = [];
    }
    groups[gid].push(e);
  }
  const ids = Object.keys(groups);
  for (let i = 0; i < ids.length; i += 1) {
    const gid = ids[i];
    const container = document.createElement("div");
    container.className = "roll-group";
    const items = groups[gid];
    for (let j = 0; j < items.length; j += 1) {
      const entry = items[j];
      const chip = document.createElement("div");
      chip.className = "roll-chip";
      chip.textContent = (entry.profileName ? entry.profileName + " " : "") + entry.type + ": " + entry.value;
      chip.style.borderColor = entry.color;
      chip.style.color = entry.color;
      container.appendChild(chip);
    }
    rollHistoryEl.appendChild(container);
  }
}

function getD6ValueFromOrientation(body) {
const up = new CANNON.Vec3(0, 1, 0);
const faces = [
{ normal: new CANNON.Vec3(0, 1, 0), value: 1 },
{ normal: new CANNON.Vec3(0, -1, 0), value: 6 },
{ normal: new CANNON.Vec3(1, 0, 0), value: 2 },
{ normal: new CANNON.Vec3(-1, 0, 0), value: 5 },
{ normal: new CANNON.Vec3(0, 0, 1), value: 3 },
{ normal: new CANNON.Vec3(0, 0, -1), value: 4 }
];
let maxDot = -Infinity;
let bestValue = 1;
for (let i = 0; i < faces.length; i += 1) {
const worldNormal = body.quaternion.vmult(faces[i].normal);
const dot = worldNormal.dot(up);
if (dot > maxDot) {
maxDot = dot;
bestValue = faces[i].value;
}
}
return bestValue;
}

function clearAllDice() {
for (let i = 0; i < dice.length; i += 1) {
const die = dice[i];
scene.remove(die.mesh);
    if (die.mesh && die.mesh.children && die.mesh.children.length) {
      for (let c = die.mesh.children.length - 1; c >= 0; c -= 1) {
        const child = die.mesh.children[c];
        if (child && child.isSprite) {
          if (child.material && child.material.map) {
            child.material.map.dispose();
          }
          if (child.material) {
            child.material.dispose();
          }
          die.mesh.remove(child);
        }
      }
    }
    if (Array.isArray(die.mesh.material)) {
      for (let j = 0; j < die.mesh.material.length; j += 1) {
        if (die.mesh.material[j]) {
          die.mesh.material[j].dispose();
        }
      }
    } else if (die.mesh.material) {
      die.mesh.material.dispose();
    }
world.removeBody(die.body);
}
dice.length = 0;
resultValueEl.textContent = "–";
}

function loadProfiles() {
const stored = window.localStorage ? window.localStorage.getItem("diceProfiles") : null;
profiles = {};
if (stored) {
try {
profiles = JSON.parse(stored) || {};
} catch {
profiles = {};
}
}
if (!profiles["Emp's dice"]) {
profiles["Emp's dice"] = {
diceColor: "#047857",
numberColor: "#020617",
texture: "crystal"
};
}
if (!profiles["Bill's dice"]) {
profiles["Bill's dice"] = {
diceColor: "#ea580c",
numberColor: "#111827",
texture: "marble"
};
}
refreshProfileSelect("Emp's dice");
applyProfile("Emp's dice");
}

function saveProfiles() {
if (!window.localStorage) {
return;
}
try {
window.localStorage.setItem("diceProfiles", JSON.stringify(profiles));
} catch {
}
}

function refreshProfileSelect(selectedName) {
while (profileSelect.firstChild) {
profileSelect.removeChild(profileSelect.firstChild);
}
const names = Object.keys(profiles).sort();
for (let i = 0; i < names.length; i += 1) {
const name = names[i];
const option = document.createElement("option");
option.value = name;
option.textContent = name;
if (selectedName && selectedName === name) {
option.selected = true;
}
profileSelect.appendChild(option);
}
if (selectedName && names.indexOf(selectedName) !== -1) {
currentProfileName = selectedName;
} else if (names.length) {
currentProfileName = names[0];
}
}

function applyProfile(name) {
const profile = profiles[name];
if (!profile) {
return;
}
currentProfileName = name;
diceColor = profile.diceColor;
numberColor = profile.numberColor;
currentTexture = profile.texture || "solid";
diceColorInput.value = diceColor;
numberColorInput.value = numberColor;
textureStyleSelect.value = currentTexture;
resultValueEl.style.color = numberColor;
  setActivePlayerFromProfile(name);
}

function setActivePlayerFromProfile(name) {
  if (!playerButtons || !playerButtons.length) {
    return;
  }
  playerButtons.forEach(button => {
    const player = button.getAttribute("data-player");
    if (name === "Emp's dice" && player === "Emp") {
      button.classList.add("active");
    } else if (name === "Bill's dice" && player === "Bill") {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });
}

function handleResize() {
if (!renderer || !camera) {
return;
}

const width = rendererContainer.clientWidth;
const height = rendererContainer.clientHeight || 1;

camera.aspect = width / height;
camera.updateProjectionMatrix();

renderer.setSize(width, height);
}

if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", init);
} else {
init();
}
