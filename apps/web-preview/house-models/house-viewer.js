(function () {
  const list = document.getElementById("modelList");
  const app = document.querySelector(".app");

  if (!list || !app || !window.THREE || !window.HOUSE_MODELS?.length) {
    return;
  }

  const palette = {
    wall: 0xd8d6cc,
    wallSide: 0xc8c6bd,
    warmFloor: 0xd8c6a5,
    carpetFloor: 0xcfc4b0,
    tileFloor: 0xc9c4b9,
    stoneFloor: 0xbdbbb3,
    concreteFloor: 0xb9bab4,
    gardenFloor: 0x8da27b,
    wood: 0xc7a878,
    darkWood: 0x8a735b,
    fabric: 0xe7dfce,
    fabricDark: 0xb9ad9d,
    black: 0x262b2c,
    glass: 0x93a8ad,
    metal: 0x7f8788,
    white: 0xf9f8f2,
    brass: 0xb58f4d,
    plant: 0x456f46
  };

  const mats = {};

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (error) {
    list.classList.add("is-webgl-unavailable");
    list.innerHTML = window.HOUSE_MODELS.map((model) => `
      <article class="model-card model-card-fallback">
        <div class="model-card-canvas-slot">
          <span class="model-card-preview-state">当前设备暂时无法显示 3D</span>
        </div>
        <div class="model-card-body">
          <div class="model-card-copy"><div><strong>${model.title}</strong><span>${model.area} · ${model.rooms}</span></div><em>${model.id}</em></div>
          <p class="model-card-description">${model.style}</p>
          <button class="model-layout-button" type="button" data-room-title="${model.title}">查看房源详情</button>
        </div>
      </article>
    `).join("");
    list.querySelectorAll(".model-layout-button").forEach((button, index) => {
      button.addEventListener("click", () => window.RoomarkOpenRoomDetail?.(window.HOUSE_MODELS[index]));
    });
    window.HouseViewer = {
      selectModel: (index) => window.RoomarkOpenRoomDetail?.(window.HOUSE_MODELS[index]),
      upsertGeneratedModel: (model) => {
        const index = window.HOUSE_MODELS.findIndex((item) => item.id === model?.id);
        if (index >= 0) window.HOUSE_MODELS[index] = { ...window.HOUSE_MODELS[index], ...model };
      },
      getState: () => ({ webglAvailable: false, activeIndex: 0, visibleModels: [], autoRotate: false, rotations: [] })
    };
    return;
  }
  renderer.domElement.className = "house-card-render-surface";
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.autoClear = false;
  app.appendChild(renderer.domElement);
  window.addEventListener("pagehide", () => {
    renderer.dispose();
    renderer.forceContextLoss?.();
  }, { once: true });
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    list.classList.add("is-webgl-unavailable");
    list.querySelectorAll(".model-card-preview-state").forEach((status) => {
      status.textContent = "3D 显示已暂停，可继续查看房源详情";
    });
  });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const viewers = [];
  let activeIndex = 0;

  function material(name, color, roughness, metalness, transparent, opacity) {
    if (!mats[name]) {
      mats[name] = new THREE.MeshStandardMaterial({
        color,
        roughness: roughness ?? 0.72,
        metalness: metalness ?? 0.04,
        transparent: !!transparent,
        opacity: opacity ?? 1
      });
    }
    return mats[name];
  }

  function box(group, x, y, z, sx, sy, sz, mat, rot) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y + sy / 2, z);
    mesh.rotation.y = rot || 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function cylinder(group, x, y, z, radius, height, mat, segments) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments || 32), mat);
    mesh.position.set(x, y + height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function addFloor(group, floor) {
    const slab = box(
      group,
      floor.x,
      -0.04,
      floor.z,
      floor.w,
      0.08,
      floor.d,
      material(floor.material, palette[floor.material] || palette.warmFloor, 0.86, 0.02)
    );
    slab.receiveShadow = true;

    if (floor.material === "tileFloor" || floor.material === "stoneFloor") {
      addTileGrid(group, floor);
    }
  }

  function addTileGrid(group, floor) {
    const lineMat = material("tileLine", 0xbbb7ad, 0.8, 0.01);
    const step = 0.72;
    for (let x = floor.x - floor.w / 2 + step; x < floor.x + floor.w / 2 - 0.1; x += step) {
      box(group, x, 0.01, floor.z, 0.012, 0.012, floor.d - 0.06, lineMat);
    }
    for (let z = floor.z - floor.d / 2 + step; z < floor.z + floor.d / 2 - 0.1; z += step) {
      box(group, floor.x, 0.01, z, floor.w - 0.06, 0.012, 0.012, lineMat);
    }
  }

  function addWall(group, wall) {
    const [x, z, w, d] = wall;
    const wallMesh = box(group, x, 0, z, w, 1.35, d, material("wall", palette.wall, 0.7, 0.02));
    const cap = box(group, x, 1.35, z, w + 0.02, 0.08, d + 0.02, material("wallCap", 0xffffff, 0.62, 0.02));
    wallMesh.userData.kind = "wall";
    cap.userData.kind = "wall-cap";
  }

  function addWindow(group, item) {
    const frameMat = material("windowFrame", palette.black, 0.48, 0.18);
    const glassMat = material("windowGlass", palette.glass, 0.12, 0.05, true, 0.42);
    const horizontal = item.w > item.d;
    const pane = box(group, item.x, 0.62, item.z, item.w, 0.46, item.d, glassMat);
    pane.castShadow = false;
    if (horizontal) {
      box(group, item.x, 0.58, item.z, item.w, 0.06, 0.055, frameMat);
      box(group, item.x, 1.07, item.z, item.w, 0.06, 0.055, frameMat);
      box(group, item.x - item.w / 2, 0.58, item.z, 0.055, 0.52, 0.055, frameMat);
      box(group, item.x + item.w / 2, 0.58, item.z, 0.055, 0.52, 0.055, frameMat);
    } else {
      box(group, item.x, 0.58, item.z, 0.055, 0.06, item.d, frameMat);
      box(group, item.x, 1.07, item.z, 0.055, 0.06, item.d, frameMat);
      box(group, item.x, 0.58, item.z - item.d / 2, 0.055, 0.52, 0.055, frameMat);
      box(group, item.x, 0.58, item.z + item.d / 2, 0.055, 0.52, 0.055, frameMat);
    }
  }

  function addDoor(group, item) {
    const doorMat = material("door", 0xb99662, 0.58, 0.02);
    const panel = box(group, item.x, 0, item.z, 0.76, 1.08, 0.055, doorMat, item.r);
    panel.rotation.y += 0.34;
    const knob = cylinder(group, item.x + Math.cos(item.r) * 0.24, 0.55, item.z - Math.sin(item.r) * 0.24, 0.035, 0.035, material("knob", palette.brass, 0.34, 0.55), 16);
    knob.rotation.z = Math.PI / 2;
  }

  function addBed(group, item) {
    const g = new THREE.Group();
    const s = item.scale || 1;
    box(g, 0, 0.08, 0, 1.55 * s, 0.22, 2.05 * s, material("bedBase", palette.wood, 0.64, 0.02));
    box(g, 0, 0.32, 0.08 * s, 1.42 * s, 0.22, 1.62 * s, material("bedDuvet", palette.fabric, 0.9, 0.01));
    box(g, -0.38 * s, 0.56, -0.76 * s, 0.58 * s, 0.16, 0.42 * s, material("pillow", palette.white, 0.86, 0));
    box(g, 0.38 * s, 0.56, -0.76 * s, 0.58 * s, 0.16, 0.42 * s, material("pillow", palette.white, 0.86, 0));
    box(g, 0, 0.14, -1.12 * s, 1.7 * s, 0.65, 0.18 * s, material("headboard", palette.darkWood, 0.58, 0.02));
    place(g, group, item);
  }

  function addSofa(group, item) {
    const g = new THREE.Group();
    const s = item.scale || 1;
    box(g, 0, 0.18, 0, 2.05 * s, 0.28, 0.82 * s, material("sofaSeat", palette.fabric, 0.92, 0));
    box(g, 0, 0.48, 0.42 * s, 2.15 * s, 0.6, 0.24 * s, material("sofaBack", palette.fabricDark, 0.88, 0));
    box(g, -1.12 * s, 0.3, 0, 0.2 * s, 0.48, 0.85 * s, material("sofaBack", palette.fabricDark, 0.88, 0));
    box(g, 1.12 * s, 0.3, 0, 0.2 * s, 0.48, 0.85 * s, material("sofaBack", palette.fabricDark, 0.88, 0));
    place(g, group, item);
  }

  function addCoffee(group, item) {
    const g = new THREE.Group();
    const s = item.scale || 1;
    box(g, 0, 0.28, 0, 1.1 * s, 0.1, 0.62 * s, material("tableTop", palette.wood, 0.54, 0.02));
    [["-", "-"], ["-", "+"], ["+", "-"], ["+", "+"]].forEach(([sx, sz]) => {
      box(g, (sx === "-" ? -0.43 : 0.43) * s, 0, (sz === "-" ? -0.2 : 0.2) * s, 0.07 * s, 0.28, 0.07 * s, material("tableLeg", palette.darkWood, 0.55, 0.02));
    });
    place(g, group, item);
  }

  function addDining(group, item) {
    const g = new THREE.Group();
    const s = item.scale || 1;
    box(g, 0, 0.48, 0, 1.35 * s, 0.1, 0.9 * s, material("tableTop", palette.wood, 0.54, 0.02));
    box(g, -0.42 * s, 0, -0.26 * s, 0.08, 0.48, 0.08, material("tableLeg", palette.darkWood, 0.55, 0.02));
    box(g, 0.42 * s, 0, -0.26 * s, 0.08, 0.48, 0.08, material("tableLeg", palette.darkWood, 0.55, 0.02));
    box(g, -0.42 * s, 0, 0.26 * s, 0.08, 0.48, 0.08, material("tableLeg", palette.darkWood, 0.55, 0.02));
    box(g, 0.42 * s, 0, 0.26 * s, 0.08, 0.48, 0.08, material("tableLeg", palette.darkWood, 0.55, 0.02));
    addChair(g, -1.0 * s, 0, -0.34 * s, 0);
    addChair(g, 1.0 * s, 0, 0.34 * s, Math.PI);
    addChair(g, -0.35 * s, 0, 0.78 * s, -Math.PI / 2);
    addChair(g, 0.35 * s, 0, -0.78 * s, Math.PI / 2);
    place(g, group, item);
  }

  function addChair(group, x, y, z, r) {
    const chair = new THREE.Group();
    box(chair, 0, 0.27, 0, 0.34, 0.1, 0.34, material("chairSeat", palette.wood, 0.58, 0.02));
    box(chair, 0, 0.48, 0.16, 0.36, 0.36, 0.08, material("chairSeat", palette.wood, 0.58, 0.02));
    chair.position.set(x, y, z);
    chair.rotation.y = r;
    group.add(chair);
  }

  function addWardrobe(group, item) {
    const g = new THREE.Group();
    const s = item.scale || 1;
    box(g, 0, 0, 0, 1.58 * s, 1.15 * s, 0.46 * s, material("cabinet", palette.wood, 0.58, 0.02));
    box(g, -0.27 * s, 0.58 * s, -0.24 * s, 0.025, 0.72 * s, 0.035, material("knob", palette.brass, 0.34, 0.55));
    box(g, 0.27 * s, 0.58 * s, -0.24 * s, 0.025, 0.72 * s, 0.035, material("knob", palette.brass, 0.34, 0.55));
    place(g, group, item);
  }

  function addKitchen(group, item) {
    const g = new THREE.Group();
    const s = item.scale || 1;
    box(g, 0, 0, 0, 2.15 * s, 0.78 * s, 0.48 * s, material("cabinet", palette.wood, 0.58, 0.02));
    box(g, -0.78 * s, 0.78 * s, -0.02 * s, 0.56 * s, 0.08, 0.38 * s, material("stove", palette.black, 0.3, 0.2));
    box(g, 0.72 * s, 0.8 * s, -0.02 * s, 0.62 * s, 0.06, 0.36 * s, material("sink", palette.metal, 0.18, 0.6));
    box(g, 0, 0, 0.56 * s, 2.15 * s, 0.72 * s, 0.42 * s, material("counterBack", 0xbda27b, 0.58, 0.02));
    place(g, group, item);
  }

  function addBath(group, item) {
    const g = new THREE.Group();
    const s = item.scale || 1;
    box(g, -0.45 * s, 0, 0.25 * s, 0.72 * s, 0.26 * s, 1.0 * s, material("ceramic", palette.white, 0.38, 0.02));
    cylinder(g, 0.5 * s, 0, -0.22 * s, 0.22 * s, 0.32 * s, material("ceramic", palette.white, 0.38, 0.02), 28);
    box(g, 0.5 * s, 0.32 * s, -0.22 * s, 0.44 * s, 0.08 * s, 0.44 * s, material("ceramic", palette.white, 0.38, 0.02));
    box(g, 0.45 * s, 0.55 * s, 0.55 * s, 0.68 * s, 0.16 * s, 0.34 * s, material("ceramic", palette.white, 0.38, 0.02));
    place(g, group, item);
  }

  function addTv(group, item) {
    const g = new THREE.Group();
    const s = item.scale || 1;
    box(g, 0, 0, 0, 1.5 * s, 0.35 * s, 0.34 * s, material("cabinet", palette.wood, 0.58, 0.02));
    box(g, 0, 0.46 * s, -0.04 * s, 1.3 * s, 0.74 * s, 0.07 * s, material("screen", palette.black, 0.18, 0.35));
    place(g, group, item);
  }

  function addDesk(group, item) {
    const g = new THREE.Group();
    const s = item.scale || 1;
    box(g, 0, 0.45 * s, 0, 1.08 * s, 0.08 * s, 0.55 * s, material("tableTop", palette.wood, 0.54, 0.02));
    box(g, 0.37 * s, 0, 0.16 * s, 0.08 * s, 0.45 * s, 0.08 * s, material("tableLeg", palette.darkWood, 0.55, 0.02));
    box(g, -0.37 * s, 0, 0.16 * s, 0.08 * s, 0.45 * s, 0.08 * s, material("tableLeg", palette.darkWood, 0.55, 0.02));
    box(g, 0, 0.57 * s, -0.18 * s, 0.5 * s, 0.36 * s, 0.035 * s, material("screen", palette.black, 0.18, 0.35));
    place(g, group, item);
  }

  function addPlant(group, item) {
    const g = new THREE.Group();
    const s = item.scale || 1;
    cylinder(g, 0, 0, 0, 0.22 * s, 0.34 * s, material("pot", 0xbda27b, 0.72, 0.03), 24);
    const leafMat = material("leaf", palette.plant, 0.78, 0.01);
    [[0, 0.38, 0], [0.16, 0.52, 0.03], [-0.12, 0.5, -0.06], [0.05, 0.62, -0.13]].forEach((p) => {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2 * s, 16, 12), leafMat);
      leaf.position.set(p[0] * s, p[1] * s, p[2] * s);
      leaf.scale.set(1.0, 0.75, 1.0);
      leaf.castShadow = true;
      g.add(leaf);
    });
    place(g, group, item);
  }

  function place(localGroup, targetGroup, item) {
    localGroup.position.set(item.x, 0, item.z);
    localGroup.rotation.y = item.r || 0;
    targetGroup.add(localGroup);
  }

  const furnitureMap = {
    bed: addBed,
    sofa: addSofa,
    coffee: addCoffee,
    dining: addDining,
    wardrobe: addWardrobe,
    kitchen: addKitchen,
    bath: addBath,
    tv: addTv,
    desk: addDesk,
    plant: addPlant
  };

  function buildModelGroup(model) {
    const modelGroup = new THREE.Group();
    model.floors.forEach((floor) => addFloor(modelGroup, floor));
    model.walls.forEach((wall) => addWall(modelGroup, wall));
    model.windows.forEach((windowItem) => addWindow(modelGroup, windowItem));
    model.doors.forEach((door) => addDoor(modelGroup, door));
    model.furniture.forEach((item) => furnitureMap[item.type]?.(modelGroup, item));
    modelGroup.rotation.y = -0.16;
    return modelGroup;
  }

  function createScene(model, slot, index) {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xc6d0ca, 22, 38);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb9b3a4, 0.78);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(6, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 24;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      material("ground", 0xb9c3bd, 0.96, 0.18)
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.035;
    ground.receiveShadow = true;
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const [x, y, z] = model.camera.position;
    const [tx, ty, tz] = model.camera.target;
    camera.position.set(x, y, z);
    camera.lookAt(tx, ty, tz);

    const group = buildModelGroup(model);
    scene.add(group);

    const state = {
      index,
      model,
      slot,
      scene,
      camera,
      group,
      visible: index < 2,
      rendered: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      lastX: 0,
      gesture: null,
      resumeAt: 0
    };
    state.slot.dataset.rotation = state.group.rotation.y.toFixed(4);

    bindRotationGesture(state);
    return state;
  }

  function bindRotationGesture(state) {
    const finishGesture = (event) => {
      if (state.pointerId !== event.pointerId) return;
      if (state.gesture === "rotate") {
        state.resumeAt = performance.now() + 5000;
      }
      state.pointerId = null;
      state.gesture = null;
      state.slot.classList.remove("is-rotating");
    };

    state.slot.addEventListener("pointerdown", (event) => {
      state.pointerId = event.pointerId;
      state.startX = event.clientX;
      state.startY = event.clientY;
      state.lastX = event.clientX;
      state.gesture = null;
    });

    state.slot.addEventListener("pointermove", (event) => {
      if (state.pointerId !== event.pointerId) return;
      const totalX = event.clientX - state.startX;
      const totalY = event.clientY - state.startY;

      if (!state.gesture && Math.hypot(totalX, totalY) > 8) {
        state.gesture = Math.abs(totalX) > Math.abs(totalY) * 1.15 ? "rotate" : "scroll";
        if (state.gesture === "rotate") {
          state.slot.setPointerCapture?.(event.pointerId);
          state.slot.classList.add("is-rotating");
        }
      }

      if (state.gesture !== "rotate") return;
      event.preventDefault();
      const deltaX = event.clientX - state.lastX;
      state.group.rotation.y += deltaX * 0.009;
      state.slot.dataset.rotation = state.group.rotation.y.toFixed(4);
      state.lastX = event.clientX;
      state.resumeAt = Number.POSITIVE_INFINITY;
    });

    state.slot.addEventListener("pointerup", finishGesture);
    state.slot.addEventListener("pointercancel", finishGesture);
  }

  function renderList() {
    const statusRows = window.HOUSE_MODELS.map((model, index) => {
      const property = globalThis.RoomarkPropertyData?.findById(model.id);
      if (!property) return [`¥${4_900 + index * 100}/月`, `风险 ${Math.min(index + 1, 5)}`, "待完善记录"];
      return [
        property.price,
        `风险 ${property.riskCount}`,
        property.hasFurnishLayout ? "已模拟软装" : property.hasScan ? "已完成扫描" : property.statusLabel
      ];
    });

    list.innerHTML = window.HOUSE_MODELS.map((model, index) => `
      <article class="model-card${index === 0 ? " is-active" : ""}" data-index="${index}">
        <div class="model-card-canvas-slot" role="img" aria-label="${model.title} 可旋转 3D 房型预览" tabindex="0">
          <span class="model-card-preview-state">正在准备 3D 房型</span>
        </div>
        <div class="model-card-body">
          <div class="model-card-copy">
            <div>
              <strong>${model.title}</strong>
              <span>${model.area} · ${model.rooms}</span>
            </div>
            <em>${model.id}</em>
          </div>
          <p class="model-card-description">${model.style}</p>
          <div class="model-card-status">
            ${statusRows[index].map((item) => `<span>${item}</span>`).join("")}
          </div>
          <button class="model-layout-button" type="button" data-room-title="${model.title}">查看房源详情</button>
        </div>
      </article>
    `).join("");

    list.querySelectorAll(".model-card-canvas-slot").forEach((slot, index) => {
      viewers.push(createScene(window.HOUSE_MODELS[index], slot, index));
    });

    list.querySelectorAll(".model-layout-button").forEach((button, index) => {
      button.addEventListener("click", () => {
        selectModel(index, false);
        window.RoomarkOpenRoomDetail?.(window.HOUSE_MODELS[index]);
      });
    });
  }

  function selectModel(index, scrollIntoView = true) {
    activeIndex = index;
    list.querySelectorAll(".model-card").forEach((card, cardIndex) => {
      card.classList.toggle("is-active", cardIndex === index);
    });
    if (scrollIntoView) {
      viewers[index]?.slot.closest(".model-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function observeVisibility() {
    if (!("IntersectionObserver" in window)) {
      viewers.forEach((viewer) => { viewer.visible = true; });
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const index = Number(entry.target.closest(".model-card")?.dataset.index);
        if (viewers[index]) viewers[index].visible = entry.isIntersecting;
      });
    }, {
      root: document.getElementById("libraryScreen"),
      rootMargin: "240px 0px",
      threshold: 0.01
    });

    viewers.forEach((viewer) => observer.observe(viewer.slot));
  }

  function resizeRenderer() {
    const width = app.clientWidth;
    const height = app.clientHeight;
    const pixelRatio = renderer.getPixelRatio();
    const targetWidth = Math.floor(width * pixelRatio);
    const targetHeight = Math.floor(height * pixelRatio);
    if (renderer.domElement.width !== targetWidth || renderer.domElement.height !== targetHeight) {
      renderer.setSize(width, height, false);
    }
  }

  function renderViewer(viewer, canvasRect, libraryRect, now) {
    const rect = viewer.slot.getBoundingClientRect();
    const viewportBuffer = 240;
    const isNearViewport = rect.bottom >= canvasRect.top - viewportBuffer
      && rect.top <= canvasRect.bottom + viewportBuffer;
    viewer.visible = isNearViewport;
    if (!isNearViewport) return;
    const left = Math.max(rect.left, canvasRect.left, libraryRect.left);
    const right = Math.min(rect.right, canvasRect.right, libraryRect.right);
    const top = Math.max(rect.top, canvasRect.top, libraryRect.top);
    const bottom = Math.min(rect.bottom, canvasRect.bottom, libraryRect.bottom);
    if (right <= left || bottom <= top) return;

    const width = right - left;
    const height = bottom - top;
    const x = left - canvasRect.left;
    const y = canvasRect.bottom - bottom;

    viewer.camera.aspect = rect.width / rect.height;
    viewer.camera.updateProjectionMatrix();
    if (!reduceMotion && now >= viewer.resumeAt) {
      viewer.group.rotation.y += 0.00145;
      viewer.slot.dataset.rotation = viewer.group.rotation.y.toFixed(4);
    }

    renderer.setViewport(x, y, width, height);
    renderer.setScissor(x, y, width, height);
    renderer.render(viewer.scene, viewer.camera);

    if (!viewer.rendered) {
      viewer.rendered = true;
      viewer.slot.classList.add("is-ready");
    }
  }

  function animate(now) {
    resizeRenderer();
    const libraryScreen = document.getElementById("libraryScreen");
    if (!libraryScreen?.classList.contains("active")) {
      renderer.setScissorTest(false);
      renderer.clear(true, true, true);
      requestAnimationFrame(animate);
      return;
    }
    const canvasRect = renderer.domElement.getBoundingClientRect();
    const libraryRect = libraryScreen.getBoundingClientRect();
    renderer.setScissorTest(false);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);
    viewers.forEach((viewer) => renderViewer(viewer, canvasRect, libraryRect, now));
    renderer.setScissorTest(false);
    requestAnimationFrame(animate);
  }

  function upsertGeneratedModel(model) {
    if (!model?.id) return;
    const index = window.HOUSE_MODELS.findIndex((item) => item.id === model.id);
    const targetIndex = index >= 0 ? index : window.HOUSE_MODELS.length;
    window.HOUSE_MODELS[targetIndex] = { ...(window.HOUSE_MODELS[targetIndex] || {}), ...model };
    viewers.length = 0;
    renderList();
    observeVisibility();
    selectModel(targetIndex, false);
  }

  window.HouseViewer = {
    selectModel,
    upsertGeneratedModel,
    getState: () => ({
      webglAvailable: true,
      activeIndex,
      visibleModels: viewers.filter((viewer) => viewer.visible).map((viewer) => viewer.model.id),
      autoRotate: !reduceMotion,
      rotations: viewers.map((viewer) => Number(viewer.group.rotation.y.toFixed(4)))
    })
  };

  renderList();
  observeVisibility();
  requestAnimationFrame(animate);
})();
