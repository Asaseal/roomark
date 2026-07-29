const rooms = [
  {
    id: "room-default-3m-cube",
    name: "样例房型",
    subtitle: "3m × 3m × 3m · 本地样例房间",
    width: 3,
    depth: 3,
    height: 3,
    plan: "square"
  },
  {
    id: "room-studio-long",
    name: "长条开间",
    subtitle: "4.2m × 2.8m × 3m · 适合床桌动线测试",
    width: 4.2,
    depth: 2.8,
    height: 3,
    plan: "long"
  },
  {
    id: "room-bedroom-window",
    name: "带窗卧室",
    subtitle: "3.6m × 3.2m × 2.9m · 适合采光侧摆放",
    width: 3.6,
    depth: 3.2,
    height: 2.9,
    plan: "window"
  },
  {
    id: "room-living-compact",
    name: "紧凑客厅",
    subtitle: "4.6m × 3.4m × 2.9m · 沙发与收纳试摆",
    width: 4.6,
    depth: 3.4,
    height: 2.9,
    plan: "living"
  }
];

const assets = [
  { id: "bed-single-01", category: "bed", name: "单人床", desc: "约 2m × 1m", footprint: { width: 1, depth: 2 }, color: 0xd9b99b },
  { id: "table-work-01", category: "table", name: "工作桌", desc: "约 1.2m × 0.6m", footprint: { width: 1.2, depth: 0.6 }, color: 0x7f6a52 },
  { id: "chair-daily-01", category: "chair", name: "办公椅", desc: "约 0.48m 宽", footprint: { width: 0.48, depth: 0.52 }, color: 0x8ca59e },
  { id: "sofa-soft-01", category: "sofa", name: "双人沙发", desc: "约 1.55m 宽", footprint: { width: 1.55, depth: 0.82 }, color: 0xa98467 },
  { id: "storage-slim-01", category: "storage", name: "窄柜", desc: "约 0.8m 宽", footprint: { width: 0.8, depth: 0.38 }, color: 0xb8aa92 }
];

const storagePrefix = "roomark:web-furnish:";
const viewport = document.getElementById("viewport");
const assetList = document.getElementById("assetList");
const roomList = document.getElementById("roomList");
const sceneLoading = document.getElementById("sceneLoading");
const sceneToast = document.getElementById("sceneToast");
const floatingActions = document.getElementById("floatingActions");
const lockButton = document.getElementById("lockButton");
const deleteButton = document.getElementById("deleteButton");
const resetButton = document.getElementById("resetButton");
const backButton = document.getElementById("backButton");
const viewJoystick = document.getElementById("viewJoystick");
const statusText = document.getElementById("statusText");
const saveText = document.getElementById("saveText");
const studioRoomTitle = document.getElementById("studioRoomTitle");
const renderButton = document.getElementById("renderButton");
const renderModal = document.getElementById("renderModal");
const renderProgress = document.getElementById("renderProgress");
const renderResult = document.getElementById("renderResult");
const renderSummary = document.getElementById("renderSummary");
const closeRenderButton = document.getElementById("closeRenderButton");
const saveRenderButton = document.getElementById("saveRenderButton");
const isEmbedded = window.parent !== window;

if (isEmbedded) {
  document.body.classList.add("embedded");
  backButton.textContent = "返回房源详情";
}

let activeRoom = rooms[0];
let selectedId = null;
let draggingId = null;
let toastTimer = null;
let roomBounds = { halfWidth: activeRoom.width / 2, halfDepth: activeRoom.depth / 2 };
let previewRenderers = [];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xefe5d7);

const camera = new THREE.PerspectiveCamera(48, viewport.clientWidth / viewport.clientHeight, 0.01, 120);
camera.position.set(4.3, 3.3, 5.3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
viewport.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.9, 0);
controls.minDistance = 2.2;
controls.maxDistance = 10.5;
controls.maxPolarAngle = Math.PI * 0.48;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dropPoint = new THREE.Vector3();
const roomGroup = new THREE.Group();
const furnitureGroup = new THREE.Group();

scene.add(roomGroup, furnitureGroup);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb69e80, 1.45));

const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(2.5, 5, 3);
scene.add(key);

function storageKey(roomId = activeRoom.id) {
  return `${storagePrefix}${roomId}`;
}

function showToast(message) {
  sceneToast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    sceneToast.textContent = "用摇杆看房，拖动家具后自动保存";
  }, 2400);
}

function renderRoomCards() {
  roomList.innerHTML = rooms
    .map((room) => {
      const project = loadProjectMeta(room.id);
      const count = project.placedFurniture.length;
      const hasLayout = count > 0;
      const hasRender = Boolean(project.renderPreview?.savedAt);
      const active = room.id === activeRoom.id;
      return `
        <section class="room-card compact ${active ? "is-active" : ""}" data-room-id="${room.id}">
          <div class="room-preview">
            <div class="room-preview-three" data-preview-room-id="${room.id}"></div>
            <span class="furniture-chip ${hasLayout ? "is-visible" : ""}"></span>
          </div>
          <div class="room-copy">
            <div class="room-title-row">
              <h2>${room.name}</h2>
              <span class="room-badge ${hasLayout || hasRender ? "is-active" : ""}">${hasRender ? "已生成 Mock 效果图" : hasLayout ? `已摆放 ${count} 件家具` : roomSize(room)}</span>
            </div>
            <p>${room.subtitle}</p>
            <div class="save-line">
              <span class="save-dot ${hasLayout || hasRender ? "is-active" : ""}"></span>
              <span>${hasRender ? `${formatTime(project.renderPreview.savedAt)} 已保存 Mock 效果图` : hasLayout ? `${formatTime(project.updatedAt)} 已自动保存` : "尚未摆放家具"}</span>
            </div>
            <button class="primary-button" type="button">${hasLayout ? "继续自由布置" : "开始自由布置"}</button>
          </div>
        </section>
      `;
    })
    .join("");
  renderRoomThumbnails();
}

function renderRoomThumbnails() {
  if (isEmbedded) return;
  previewRenderers.forEach((item) => item.renderer.dispose());
  previewRenderers = [];
  document.querySelectorAll("[data-preview-room-id]").forEach((container) => {
    const room = rooms.find((item) => item.id === container.dataset.previewRoomId);
    if (!room) return;
    const previewScene = new THREE.Scene();
    previewScene.background = new THREE.Color(0xe8dccb);
    const group = new THREE.Group();
    previewScene.add(group);
    addRoomShell(group, room, { includeLabels: false });
    previewScene.add(new THREE.HemisphereLight(0xffffff, 0xb69e80, 1.5));
    const previewLight = new THREE.DirectionalLight(0xffffff, 1);
    previewLight.position.set(2, 4, 3);
    previewScene.add(previewLight);
    const previewCamera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.01, 50);
    previewCamera.position.set(room.width / 2 + 1.8, 2.5, room.depth / 2 + 2.4);
    previewCamera.lookAt(0, 0.65, 0);
    const previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    previewRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(previewRenderer.domElement);
    previewRenderer.render(previewScene, previewCamera);
    previewRenderers.push({ renderer: previewRenderer, scene: previewScene });
  });
}

function loadProjectMeta(roomId) {
  const raw = localStorage.getItem(storageKey(roomId));
  if (!raw) {
    return { placedFurniture: [], updatedAt: null, renderPreview: null };
  }
  try {
    return { placedFurniture: [], updatedAt: null, renderPreview: null, ...JSON.parse(raw) };
  } catch {
    localStorage.removeItem(storageKey(roomId));
    return { placedFurniture: [], updatedAt: null, renderPreview: null };
  }
}

function roomSize(room) {
  return `${room.width}m × ${room.depth}m × ${room.height}m`;
}

function createRoom(room) {
  roomGroup.clear();
  roomBounds = { halfWidth: room.width / 2, halfDepth: room.depth / 2 };
  addRoomShell(roomGroup, room, { includeLabels: true });
}

function addRoomShell(targetGroup, room, options = {}) {
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xdac6ac, roughness: 0.85 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.92 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x9fc6c5, roughness: 0.62 });
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x8f7658 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.05, room.depth), floorMaterial);
  floor.position.y = -0.025;
  targetGroup.add(floor);

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(room.width, room.height, 0.06), wallMaterial);
  backWall.position.set(0, room.height / 2, -room.depth / 2);
  targetGroup.add(backWall);

  const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.06, room.height, room.depth), wallMaterial);
  sideWall.position.set(-room.width / 2, room.height / 2, 0);
  targetGroup.add(sideWall);

  const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(room.width * 0.34, room.height * 0.28, 0.025), accentMaterial);
  const windowX = room.plan === "window" ? 0 : room.width * 0.18;
  windowFrame.position.set(windowX, room.height * 0.58, -room.depth / 2 + 0.035);
  targetGroup.add(windowFrame);

  if (room.plan === "living") {
    const halfWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, room.depth * 0.38), wallMaterial);
    halfWall.position.set(room.width * 0.18, 0.525, room.depth * 0.16);
    targetGroup.add(halfWall);
  }

  if (room.plan === "long") {
    const doorMark = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.025, 0.08), new THREE.MeshStandardMaterial({ color: 0x8f7658, roughness: 0.8 }));
    doorMark.position.set(room.width * 0.28, 0.02, room.depth / 2 - 0.04);
    targetGroup.add(doorMark);
  }

  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(room.width, 0.04, room.depth));
  const floorLines = new THREE.LineSegments(edges, lineMaterial);
  floorLines.position.y = 0.015;
  targetGroup.add(floorLines);

  if (options.includeLabels) {
    addDimensionLabel(targetGroup, `${room.width}m`, 0, 0.02, room.depth / 2 + 0.14);
    addDimensionLabel(targetGroup, `${room.depth}m`, room.width / 2 + 0.16, 0.02, 0);
    addDimensionLabel(targetGroup, `${room.height}m`, -room.width / 2 - 0.12, room.height / 2, -room.depth / 2);
  }
}

function addDimensionLabel(targetGroup, text, x, y, z) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(255, 250, 242, 0.92)";
  roundRect(context, 16, 18, 224, 58, 24);
  context.fill();
  context.fillStyle = "#4b3f31";
  context.font = "700 34px sans-serif";
  context.textAlign = "center";
  context.fillText(text, 128, 58);
  const texture = new THREE.CanvasTexture(canvas);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  label.position.set(x, y + 0.08, z);
  label.scale.set(0.78, 0.29, 1);
  targetGroup.add(label);
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function createSelectionRing() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.49, 64),
    new THREE.MeshBasicMaterial({ color: 0x2f2a22, transparent: true, opacity: 0.72, side: THREE.DoubleSide })
  );
  ring.name = "selectionRing";
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.018;
  ring.visible = false;
  return ring;
}

function createFurnitureModel(asset) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: asset.color, roughness: 0.76, metalness: 0.02 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.82 });
  const { width, depth } = asset.footprint;

  const addBox = (name, boxWidth, height, boxDepth, x, y, z, boxMaterial = material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(boxWidth, height, boxDepth), boxMaterial);
    mesh.name = name;
    mesh.position.set(x, y, z);
    group.add(mesh);
  };

  if (asset.category === "bed") {
    addBox("bedBase", width, 0.22, depth, 0, 0.11, 0);
    addBox("pillow", width * 0.72, 0.12, depth * 0.18, 0, 0.32, -depth * 0.34, accent);
    addBox("blanket", width * 0.86, 0.08, depth * 0.52, 0, 0.32, depth * 0.12, new THREE.MeshStandardMaterial({ color: 0xcfa98a, roughness: 0.8 }));
  } else if (asset.category === "sofa") {
    addBox("sofaSeat", width, 0.28, depth, 0, 0.14, 0);
    addBox("sofaBack", width, 0.52, 0.16, 0, 0.42, -depth * 0.42);
    addBox("sofaLeftArm", 0.16, 0.42, depth, -width * 0.46, 0.34, 0);
    addBox("sofaRightArm", 0.16, 0.42, depth, width * 0.46, 0.34, 0);
  } else if (asset.category === "table") {
    addBox("tableTop", width, 0.08, depth, 0, 0.74, 0);
    addBox("leg1", 0.07, 0.74, 0.07, -width * 0.38, 0.37, -depth * 0.34);
    addBox("leg2", 0.07, 0.74, 0.07, width * 0.38, 0.37, -depth * 0.34);
    addBox("leg3", 0.07, 0.74, 0.07, -width * 0.38, 0.37, depth * 0.34);
    addBox("leg4", 0.07, 0.74, 0.07, width * 0.38, 0.37, depth * 0.34);
  } else if (asset.category === "chair") {
    addBox("chairSeat", width, 0.12, depth, 0, 0.46, 0);
    addBox("chairBack", width, 0.58, 0.08, 0, 0.76, -depth * 0.42);
    addBox("chairLegs", width * 0.72, 0.46, depth * 0.72, 0, 0.23, 0, new THREE.MeshStandardMaterial({ color: 0x6f7f79, roughness: 0.78 }));
  } else {
    addBox("storageBody", width, 1.25, depth, 0, 0.625, 0);
    addBox("storageDoor", width * 0.88, 0.9, 0.035, 0, 0.68, depth / 2 + 0.02, accent);
  }

  group.add(createSelectionRing());
  group.userData.asset = asset;
  return group;
}

function addFurniture(asset, placed = null, restoreOnly = false) {
  const id = placed?.id || `furn-${Date.now()}-${Math.round(Math.random() * 10000)}`;
  const object = createFurnitureModel(asset);
  object.userData.placed = {
    id,
    assetId: asset.id,
    category: asset.category,
    modelUri: "",
    position: placed?.position || [0, 0, 0],
    rotation: placed?.rotation || [0, 0, 0],
    scale: placed?.scale || [1, 1, 1],
    locked: placed?.locked || false,
    createdAt: placed?.createdAt || new Date().toISOString()
  };
  object.position.set(object.userData.placed.position[0], 0, object.userData.placed.position[2]);
  object.rotation.y = object.userData.placed.rotation[1] || 0;
  object.traverse((child) => {
    child.userData.parentFurnitureId = id;
    if (child.material) child.material = child.material.clone();
  });
  furnitureGroup.add(object);
  if (!restoreOnly) {
    selectFurniture(id);
    saveLayout();
    showToast(`${asset.name} 已添加`);
  }
}

function selectFurniture(id) {
  selectedId = id;
  furnitureGroup.children.forEach((object) => {
    const selected = object.userData.placed?.id === id;
    applyVisualState(object, selected);
  });
  updateFloatingActions();
}

function applyVisualState(object, selected) {
  const locked = Boolean(object.userData.placed?.locked);
  const ring = object.getObjectByName("selectionRing");
  if (ring) {
    ring.visible = selected;
    ring.material.color.setHex(locked ? 0x6d9b70 : 0x2f2a22);
  }
  object.traverse((child) => {
    if (child.material?.emissive) {
      child.material.emissive.setHex(selected ? (locked ? 0x203d26 : 0x3b2f20) : 0x000000);
      child.material.emissiveIntensity = selected ? 0.2 : 0;
    }
    if (child.material?.opacity !== undefined && child.name !== "selectionRing") {
      child.material.transparent = locked;
      child.material.opacity = locked ? 0.82 : 1;
    }
  });
}

function furnitureById(id) {
  return furnitureGroup.children.find((child) => child.userData.placed?.id === id);
}

function pointerToNdc(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getGroundPoint(event) {
  pointerToNdc(event);
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(groundPlane, dropPoint);
  dropPoint.x = THREE.MathUtils.clamp(dropPoint.x, -roomBounds.halfWidth + 0.15, roomBounds.halfWidth - 0.15);
  dropPoint.z = THREE.MathUtils.clamp(dropPoint.z, -roomBounds.halfDepth + 0.15, roomBounds.halfDepth - 0.15);
  dropPoint.y = 0;
  return dropPoint;
}

function findFurnitureFromHit(hit) {
  const id = hit?.object?.userData?.parentFurnitureId;
  return id ? furnitureById(id) : null;
}

function updateFloatingActions() {
  const object = furnitureById(selectedId);
  if (!object) {
    floatingActions.classList.remove("is-visible");
    return;
  }

  const world = new THREE.Vector3();
  object.getWorldPosition(world);
  world.y += 0.85;
  world.project(camera);
  const x = (world.x * 0.5 + 0.5) * viewport.clientWidth;
  const y = (-world.y * 0.5 + 0.5) * viewport.clientHeight;
  floatingActions.style.left = `${x}px`;
  floatingActions.style.top = `${y}px`;
  floatingActions.classList.add("is-visible");
  lockButton.textContent = object.userData.placed.locked ? "已锁定" : "锁定位置";
  lockButton.classList.toggle("locked", object.userData.placed.locked);
}

function saveLayout() {
  const placedFurniture = furnitureGroup.children.map((object) => {
    const placed = object.userData.placed;
    return {
      ...placed,
      position: [Number(object.position.x.toFixed(3)), 0, Number(object.position.z.toFixed(3))],
      rotation: [0, Number(object.rotation.y.toFixed(3)), 0]
    };
  });
  const previousProject = loadProjectMeta(activeRoom.id);
  const project = {
    roomId: activeRoom.id,
    placedFurniture,
    updatedAt: new Date().toISOString(),
    renderPreview: previousProject.renderPreview
  };
  localStorage.setItem(storageKey(), JSON.stringify(project));
  renderRoomCards();
  updateFooter(project);
}

function loadLayout() {
  furnitureGroup.clear();
  selectedId = null;
  const project = loadProjectMeta(activeRoom.id);
  project.placedFurniture.forEach((placed) => {
    const asset = assets.find((item) => item.id === placed.assetId) || assets[0];
    addFurniture(asset, placed, true);
  });
  updateFooter(project);
  showToast(project.placedFurniture.length > 0 ? "已恢复这个房间的软装布局" : "选择家具开始自由布置");
}

function updateFooter(project) {
  const count = project.placedFurniture?.length || 0;
  statusText.textContent = count > 0 ? `${activeRoom.name} 已摆放 ${count} 件家具` : `${activeRoom.name} 待添加家具`;
  saveText.textContent = count > 0 ? `${formatTime(project.updatedAt)} 已自动保存` : "本地自动保存已开启";
}

function formatTime(value) {
  const date = value ? new Date(value) : new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function switchRoom(roomId) {
  const nextRoom = rooms.find((room) => room.id === roomId);
  if (!nextRoom) return;
  activeRoom = nextRoom;
  studioRoomTitle.textContent = `${activeRoom.name} · ${roomSize(activeRoom)}`;
  createRoom(activeRoom);
  loadLayout();
  resetCamera();
  renderRoomCards();
}

function externalRoomId(title) {
  let hash = 0;
  for (const character of title) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }
  return `room-property-${hash.toString(36)}`;
}

function openExternalRoom(room = {}) {
  const title = String(room.title || room.name || "当前房型").trim();
  const id = externalRoomId(title);
  let targetRoom = rooms.find((item) => item.id === id);

  if (!targetRoom) {
    targetRoom = {
      id,
      name: title,
      subtitle: "已从房源详情同步 · 本地空间 3m × 3m × 3m",
      width: 3,
      depth: 3,
      height: 3,
      plan: "square"
    };
    rooms.push(targetRoom);
  }

  switchRoom(targetRoom.id);
  showToast(`${title} · 已进入自由布置`);
}

function resetCamera() {
  camera.position.set(activeRoom.width / 2 + 2.8, 3.3, activeRoom.depth / 2 + 3.4);
  controls.target.set(0, 0.9, 0);
  controls.update();
}

function bindUi() {
  assetList.innerHTML = assets
    .map(
      (asset) => `
    <button class="asset-button" type="button" data-asset-id="${asset.id}">
      <span class="asset-icon">${asset.name.slice(0, 1)}</span>
      <span>
        <span class="asset-name">${asset.name}</span>
        <span class="asset-desc">${asset.desc}</span>
      </span>
      <span class="asset-add">放入</span>
    </button>
  `
    )
    .join("");

  assetList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-asset-id]");
    if (!button) return;
    const asset = assets.find((item) => item.id === button.dataset.assetId);
    if (asset) addFurniture(asset);
  });

  roomList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-room-id]");
    if (!card) return;
    switchRoom(card.dataset.roomId);
    document.querySelector(".studio-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  resetButton.addEventListener("click", () => {
    resetCamera();
    showToast("视角已重置");
  });

  viewJoystick.addEventListener("click", (event) => {
    const button = event.target.closest("[data-camera-move]");
    if (!button) return;
    moveCamera(button.dataset.cameraMove);
  });

  backButton.addEventListener("click", () => {
    saveLayout();
    if (isEmbedded) {
      window.parent.postMessage({ type: "roomark:furnish-back", roomName: activeRoom.name }, window.location.origin);
      return;
    }
    document.querySelector(".library-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("已返回房型库，状态已刷新");
  });

  renderButton.addEventListener("click", () => {
    openRenderPreview();
  });

  closeRenderButton.addEventListener("click", () => {
    renderModal.hidden = true;
  });

  saveRenderButton.addEventListener("click", () => {
    saveRenderPreview();
  });

  lockButton.addEventListener("click", () => {
    const object = furnitureById(selectedId);
    if (!object) return;
    object.userData.placed.locked = !object.userData.placed.locked;
    applyVisualState(object, true);
    saveLayout();
    updateFloatingActions();
    showToast(object.userData.placed.locked ? "家具已锁定位置" : "家具已解除锁定");
  });

  deleteButton.addEventListener("click", () => {
    const object = furnitureById(selectedId);
    if (!object) return;
    furnitureGroup.remove(object);
    selectedId = null;
    saveLayout();
    updateFloatingActions();
    showToast("已移除选中家具");
  });
}

window.addEventListener("message", (event) => {
  if (!isEmbedded || event.source !== window.parent || event.origin !== window.location.origin) {
    return;
  }
  if (event.data?.type === "roomark:open-room") {
    openExternalRoom(event.data.room);
  }
});

function openRenderPreview() {
  saveLayout();
  const count = furnitureGroup.children.length;
  renderModal.hidden = false;
  renderResult.hidden = true;
  renderProgress.hidden = false;
  renderProgress.querySelector("strong").textContent = "正在分析家具布局";
  renderProgress.querySelector("span").textContent = "下一步：生成光照与材质";
  renderSummary.textContent = `${activeRoom.name} · ${roomSize(activeRoom)} · 已摆放 ${count} 件家具 · 风格：温暖、现代、适合租房小空间。`;
  showToast("Mock 效果图任务已开始");

  window.clearTimeout(openRenderPreview.timer);
  openRenderPreview.timer = window.setTimeout(() => {
    renderProgress.querySelector("strong").textContent = "正在输出效果图";
    renderProgress.querySelector("span").textContent = "基于当前 3D 布局生成 mock 预览";
  }, 700);

  openRenderPreview.timer = window.setTimeout(() => {
    renderProgress.hidden = true;
    renderResult.hidden = false;
    showToast("Mock 效果图已生成");
  }, 1400);
}

function saveRenderPreview() {
  const project = loadProjectMeta(activeRoom.id);
  const count = furnitureGroup.children.length;
  const nextProject = {
    ...project,
    roomId: activeRoom.id,
    updatedAt: new Date().toISOString(),
    renderPreview: {
      savedAt: new Date().toISOString(),
      summary: `${activeRoom.name} 已生成温暖现代租房小空间效果图`,
      furnitureCount: count
    }
  };
  localStorage.setItem(storageKey(), JSON.stringify(nextProject));
  if (window.parent !== window) {
    window.parent.postMessage(
      {
        type: "roomark:render-saved",
        roomId: activeRoom.id,
        roomName: activeRoom.name,
        renderPreview: nextProject.renderPreview
      },
      window.location.origin
    );
  }
  renderModal.hidden = true;
  renderRoomCards();
  updateFooter(nextProject);
  showToast("效果图已保存到房型库");
}

function moveCamera(direction) {
  const step = 0.22;
  const rotateStep = 0.22;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const offset = new THREE.Vector3();

  if (direction === "forward") offset.copy(forward).multiplyScalar(step);
  if (direction === "back") offset.copy(forward).multiplyScalar(-step);

  if (direction === "left" || direction === "right") {
    const angle = direction === "left" ? rotateStep : -rotateStep;
    camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(controls.target);
    controls.update();
    showToast(direction === "left" ? "视角向左转动" : "视角向右转动");
    return;
  }

  camera.position.add(offset);
  controls.target.add(offset);
  controls.update();
  showToast(direction === "forward" ? "向前查看房间" : "向后查看房间");
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  pointerToNdc(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(furnitureGroup.children, true);
  const object = findFurnitureFromHit(hits[0]);
  if (!object) {
    selectFurniture(null);
    return;
  }
  selectFurniture(object.userData.placed.id);
  if (!object.userData.placed.locked) {
    draggingId = object.userData.placed.id;
    controls.enabled = false;
    renderer.domElement.setPointerCapture(event.pointerId);
  }
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (!draggingId) return;
  const object = furnitureById(draggingId);
  if (!object) return;
  const point = getGroundPoint(event);
  object.position.set(point.x, 0, point.z);
  updateFloatingActions();
});

renderer.domElement.addEventListener("pointerup", (event) => {
  if (draggingId) {
    saveLayout();
    showToast("已自动保存");
  }
  draggingId = null;
  controls.enabled = true;
  try {
    renderer.domElement.releasePointerCapture(event.pointerId);
  } catch {}
});

window.addEventListener("resize", () => {
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  renderRoomThumbnails();
});

function animate() {
  controls.update();
  updateFloatingActions();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

renderRoomCards();
createRoom(activeRoom);
bindUi();
loadLayout();
resetCamera();
animate();
setTimeout(() => sceneLoading.classList.add("is-hidden"), 500);
