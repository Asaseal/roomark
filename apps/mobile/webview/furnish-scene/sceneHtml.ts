function escapeInlineScript(source: string) {
  return source.replace(/<\/script/gi, "<\\/script");
}

export function getFurnishSceneHtml(runtimeSource: string) {
  const inlineRuntime = escapeInlineScript(runtimeSource);

  return String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <title>Roomark Soft Furnish Studio</title>
    <style>
      html,
      body,
      #app {
        background: #efe5d7;
        height: 100%;
        margin: 0;
        overflow: hidden;
        touch-action: none;
        width: 100%;
      }

      body {
        color: #2f2a22;
        font-family: ui-rounded, "SF Pro Rounded", "Avenir Next Rounded", "Nunito", sans-serif;
      }

      canvas {
        display: block;
        touch-action: none;
      }

      .hint {
        background: rgba(255, 250, 242, 0.9);
        border: 1px solid rgba(214, 196, 171, 0.9);
        border-radius: 999px;
        bottom: 148px;
        box-shadow: 0 14px 36px rgba(94, 68, 40, 0.14);
        color: #6f6254;
        font-size: 12px;
        font-weight: 800;
        left: 50%;
        padding: 8px 13px;
        pointer-events: none;
        position: fixed;
        transform: translateX(-50%);
        white-space: nowrap;
        z-index: 4;
      }

      .floating-actions {
        display: none;
        gap: 7px;
        pointer-events: auto;
        position: fixed;
        transform: translate(-50%, -112%);
        z-index: 6;
      }

      .floating-actions.is-visible {
        display: flex;
      }

      .floating-actions button {
        background: #fffaf2;
        border: 1px solid #dfd0ba;
        border-radius: 16px;
        box-shadow: 0 12px 26px rgba(74, 55, 34, 0.18);
        color: #2f2a22;
        font: 900 12px ui-rounded, "SF Pro Rounded", sans-serif;
        min-height: 42px;
        min-width: 78px;
        padding: 0 12px;
      }

      .floating-actions button.delete {
        background: #fff0e8;
        border-color: #efc3b3;
        color: #a4432e;
      }

      .floating-actions button.locked {
        background: #dceade;
        border-color: #bfd5c3;
        color: #31533d;
      }

      .loading {
        align-items: center;
        background: linear-gradient(145deg, #f5ecde, #e9dac6);
        display: flex;
        inset: 0;
        justify-content: center;
        position: fixed;
        z-index: 10;
      }

      .loading-card {
        background: rgba(255, 250, 242, 0.92);
        border: 1px solid #dfd0ba;
        border-radius: 26px;
        box-shadow: 0 18px 48px rgba(94, 68, 40, 0.16);
        padding: 20px 22px;
        text-align: center;
      }

      .loading-card::before {
        background: #2f2a22;
        border-radius: 18px;
        content: "";
        display: block;
        height: 36px;
        margin: 0 auto 12px;
        width: 52px;
      }

      .loading-card strong {
        display: block;
        font-size: 16px;
        margin-bottom: 5px;
      }

      .loading-card span {
        color: #766a5d;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <div class="hint">选择家具 · 拖动摆放 · 固定选中 · 删除选中</div>
    <div class="floating-actions" id="floatingActions">
      <button id="lockButton" type="button">固定选中</button>
      <button class="delete" id="deleteButton" type="button">删除选中</button>
    </div>
    <div class="loading" id="loading">
      <div class="loading-card">
        <strong>正在搭建 3D 房间</strong>
        <span>Roomark 软装模拟器</span>
      </div>
    </div>

    <script>${inlineRuntime}</script>
    <script>
      const app = document.getElementById("app");
      const loading = document.getElementById("loading");
      const floatingActions = document.getElementById("floatingActions");
      const lockButton = document.getElementById("lockButton");
      const deleteButton = document.getElementById("deleteButton");

      window.addEventListener("error", (event) => {
        emit({ type: "SCENE_ERROR", message: "3D 场景脚本加载失败，请点击重试" });
      });

      if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
          const nextRadius = Math.min(radius, width / 2, height / 2);
          this.beginPath();
          this.moveTo(x + nextRadius, y);
          this.arcTo(x + width, y, x + width, y + height, nextRadius);
          this.arcTo(x + width, y + height, x, y + height, nextRadius);
          this.arcTo(x, y + height, x, y, nextRadius);
          this.arcTo(x, y, x + width, y, nextRadius);
          this.closePath();
          return this;
        };
      }

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xefe5d7);

      const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.01, 120);
      camera.position.set(4.2, 3.2, 5.2);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      app.appendChild(renderer.domElement);

      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.target.set(0, 0.9, 0);
      controls.minDistance = 2.2;
      controls.maxDistance = 9.5;
      controls.maxPolarAngle = Math.PI * 0.48;

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const dropPoint = new THREE.Vector3();
      const furnitureGroup = new THREE.Group();
      const roomGroup = new THREE.Group();
      const loader = new THREE.GLTFLoader();

      let project = null;
      let assets = [];
      let selectedId = null;
      let draggingId = null;
      let roomBounds = { halfWidth: 1.5, halfDepth: 1.5 };

      scene.add(roomGroup);
      scene.add(furnitureGroup);

      const ambient = new THREE.HemisphereLight(0xffffff, 0xb69e80, 1.45);
      scene.add(ambient);

      const key = new THREE.DirectionalLight(0xffffff, 1.2);
      key.position.set(2.5, 5, 3);
      scene.add(key);

        function emit(message) {
          window.ReactNativeWebView?.postMessage(JSON.stringify(message));
        }

      function notice(message) {
        emit({ type: "SCENE_NOTICE", message });
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

      function createRoom(roomMesh) {
        roomGroup.clear();
        const width = roomMesh?.width || 3;
        const depth = roomMesh?.depth || 3;
        const height = roomMesh?.height || 3;
        roomBounds = { halfWidth: width / 2, halfDepth: depth / 2 };

        const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xdac6ac, roughness: 0.85 });
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.92 });
        const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x9fc6c5, roughness: 0.62 });
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x8f7658 });

        const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, depth), floorMaterial);
        floor.position.y = -0.025;
        roomGroup.add(floor);

        const backWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.06), wallMaterial);
        backWall.position.set(0, height / 2, -depth / 2);
        roomGroup.add(backWall);

        const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.06, height, depth), wallMaterial);
        sideWall.position.set(-width / 2, height / 2, 0);
        roomGroup.add(sideWall);

        const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(width * 0.34, height * 0.28, 0.025), accentMaterial);
        windowFrame.position.set(width * 0.18, height * 0.58, -depth / 2 + 0.035);
        roomGroup.add(windowFrame);

        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, 0.04, depth));
        const floorLines = new THREE.LineSegments(edges, lineMaterial);
        floorLines.position.y = 0.015;
        roomGroup.add(floorLines);

        addDimensionLabel(width + "m", 0, 0.02, depth / 2 + 0.14);
        addDimensionLabel(depth + "m", width / 2 + 0.16, 0.02, 0, Math.PI / 2);
        addDimensionLabel(height + "m", -width / 2 - 0.12, height / 2, -depth / 2, 0, true);
      }

      function addDimensionLabel(text, x, y, z, rotateY = 0, vertical = false) {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 96;
        const context = canvas.getContext("2d");
        context.fillStyle = "rgba(255, 250, 242, 0.92)";
        context.roundRect(16, 18, 224, 58, 24);
        context.fill();
        context.fillStyle = "#4b3f31";
        context.font = "700 34px sans-serif";
        context.textAlign = "center";
        context.fillText(text, 128, 58);
        const texture = new THREE.CanvasTexture(canvas);
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
        label.position.set(x, y + 0.08, z);
        label.scale.set(vertical ? 0.58 : 0.78, 0.29, 1);
        roomGroup.add(label);
      }

      function createTextSprite(text, options = {}) {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 120;
        const context = canvas.getContext("2d");
        context.fillStyle = options.background || "rgba(255, 250, 242, 0.94)";
        context.roundRect(18, 20, 284, 72, 28);
        context.fill();
        context.fillStyle = options.color || "#3f3428";
        context.font = "800 32px sans-serif";
        context.textAlign = "center";
        context.fillText(text, 160, 66);
        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
        sprite.scale.set(options.width || 0.72, options.height || 0.27, 1);
        return sprite;
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

      function createPlaceholder(asset, placed) {
        const footprint = asset?.footprint || { width: 0.8, depth: 0.55 };
        const heightByCategory = {
          sofa: 0.72,
          table: 0.74,
          chair: 0.82,
          bed: 0.44,
          storage: 1.25
        };
        const colorByCategory = {
          sofa: 0xa98467,
          table: 0x7f6a52,
          chair: 0x8ca59e,
          bed: 0xd9b99b,
          storage: 0xb8aa92
        };
        const category = asset?.category || "storage";
        const height = heightByCategory[category] || 0.68;
        const material = new THREE.MeshStandardMaterial({
          color: colorByCategory[category] || 0xa98467,
          roughness: 0.76,
          metalness: 0.02
        });
        const accent = new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.82 });
        const group = new THREE.Group();

        const addBox = (name, width, boxHeight, depth, x, y, z, boxMaterial = material) => {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, boxHeight, depth), boxMaterial);
          mesh.name = name;
          mesh.position.set(x, y, z);
          group.add(mesh);
          return mesh;
        };

        if (category === "bed") {
          addBox("bedBase", footprint.width, 0.22, footprint.depth, 0, 0.11, 0);
          addBox("pillow", footprint.width * 0.72, 0.12, footprint.depth * 0.18, 0, 0.32, -footprint.depth * 0.34, accent);
          addBox("blanket", footprint.width * 0.86, 0.08, footprint.depth * 0.52, 0, 0.32, footprint.depth * 0.12, new THREE.MeshStandardMaterial({ color: 0xcfa98a, roughness: 0.8 }));
        } else if (category === "sofa") {
          addBox("sofaSeat", footprint.width, 0.28, footprint.depth, 0, 0.14, 0);
          addBox("sofaBack", footprint.width, 0.52, 0.16, 0, 0.42, -footprint.depth * 0.42);
          addBox("sofaLeftArm", 0.16, 0.42, footprint.depth, -footprint.width * 0.46, 0.34, 0);
          addBox("sofaRightArm", 0.16, 0.42, footprint.depth, footprint.width * 0.46, 0.34, 0);
        } else if (category === "table") {
          addBox("tableTop", footprint.width, 0.08, footprint.depth, 0, height, 0);
          const legOffsetX = footprint.width * 0.38;
          const legOffsetZ = footprint.depth * 0.34;
          addBox("leg1", 0.07, height, 0.07, -legOffsetX, height / 2, -legOffsetZ);
          addBox("leg2", 0.07, height, 0.07, legOffsetX, height / 2, -legOffsetZ);
          addBox("leg3", 0.07, height, 0.07, -legOffsetX, height / 2, legOffsetZ);
          addBox("leg4", 0.07, height, 0.07, legOffsetX, height / 2, legOffsetZ);
        } else if (category === "chair") {
          addBox("chairSeat", footprint.width, 0.12, footprint.depth, 0, 0.46, 0);
          addBox("chairBack", footprint.width, 0.58, 0.08, 0, 0.76, -footprint.depth * 0.42);
          addBox("chairLegs", footprint.width * 0.72, 0.46, footprint.depth * 0.72, 0, 0.23, 0, new THREE.MeshStandardMaterial({ color: 0x6f7f79, roughness: 0.78 }));
        } else {
          addBox("storageBody", footprint.width, height, footprint.depth, 0, height / 2, 0);
          addBox("storageDoor", footprint.width * 0.88, height * 0.72, 0.035, 0, height * 0.55, footprint.depth / 2 + 0.02, accent);
        }

        const label = createTextSprite(asset?.name || "家具占位", { width: 0.74, height: 0.28 });
        label.name = "fallbackLabel";
        label.position.set(0, height + 0.28, 0);
        group.add(label);
        group.add(createSelectionRing());
        group.userData.placeholder = true;
        group.userData.assetName = asset?.name || "家具";
        return group;
      }

      function normalizeModel(object) {
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxSide = Math.max(size.x, size.y, size.z) || 1;
        const targetSize = 1;
        const scale = targetSize / maxSide;
        object.scale.multiplyScalar(scale);
        object.position.x -= center.x * scale;
        object.position.z -= center.z * scale;

        const nextBox = new THREE.Box3().setFromObject(object);
        object.position.y -= nextBox.min.y;
      }

      function addFurniture(asset, placed, restoreOnly = false) {
        const id = placed?.id || "furn-" + Date.now() + "-" + Math.round(Math.random() * 10000);
        const fallbackPlaced = {
          id,
          assetId: asset.id,
          category: asset.category,
          modelUri: asset.sourceModelUri || asset.modelUri,
          position: placed?.position || [0, 0, 0],
          rotation: placed?.rotation || [0, 0, 0],
          scale: placed?.scale || asset.defaultScale || [1, 1, 1],
          locked: placed?.locked || false,
          createdAt: placed?.createdAt || new Date().toISOString()
        };

        const attach = (object) => {
          object.userData.placed = fallbackPlaced;
          object.position.set(fallbackPlaced.position[0], fallbackPlaced.position[1], fallbackPlaced.position[2]);
          object.rotation.set(fallbackPlaced.rotation[0], fallbackPlaced.rotation[1], fallbackPlaced.rotation[2]);
          object.scale.multiply(new THREE.Vector3(fallbackPlaced.scale[0], fallbackPlaced.scale[1], fallbackPlaced.scale[2]));
          if (!object.getObjectByName("selectionRing")) {
            object.add(createSelectionRing());
          }
          object.traverse((child) => {
            child.userData.parentFurnitureId = id;
            if (child.material) {
              child.material = child.material.clone();
            }
          });
          furnitureGroup.add(object);
          if (!restoreOnly) {
            selectFurniture(id);
            saveProject();
            notice("已添加" + (asset.name || "家具") + "，请拖动摆放");
          }
        };

        if (!asset.modelUri) {
          emit({ type: "SCENE_NOTICE", message: (asset.name || "家具") + " 使用占位模型，可继续布置" });
          attach(createPlaceholder(asset, fallbackPlaced));
          return;
        }

        loader.load(
          asset.modelUri,
          (gltf) => {
            const object = gltf.scene;
            normalizeModel(object);
            attach(object);
            emit({ type: "SCENE_NOTICE", message: (asset.name || "家具") + "模型已加载" });
          },
          undefined,
          () => {
            emit({ type: "SCENE_NOTICE", message: (asset.name || "家具") + " GLB 未找到，已使用占位模型" });
            attach(createPlaceholder(asset, fallbackPlaced));
          }
        );
      }

      function furnitureById(id) {
        return furnitureGroup.children.find((child) => child.userData.placed?.id === id);
      }

      function selectFurniture(id) {
        selectedId = id;
        furnitureGroup.children.forEach((object) => {
          const selected = object.userData.placed?.id === id;
          applyFurnitureVisualState(object, selected);
        });
        updateFloatingActions();
        emit({ type: "FURNITURE_SELECTED", furnitureId: id });
      }

      function applyFurnitureVisualState(object, selected) {
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

      function lockSelected() {
        const object = furnitureById(selectedId);
        if (!object) {
          notice("请先点选家具，再点击固定选中");
          return;
        }
        object.userData.placed.locked = !object.userData.placed.locked;
        applyFurnitureVisualState(object, true);
        saveProject();
        updateFloatingActions();
        notice(object.userData.placed.locked ? "家具已固定，不能继续拖动" : "家具已解除固定，可以继续拖动");
      }

      function deleteSelected() {
        const object = furnitureById(selectedId);
        if (!object) {
          notice("请先点选家具，再点击删除");
          return;
        }
        furnitureGroup.remove(object);
        selectedId = null;
        saveProject();
        updateFloatingActions();
        emit({ type: "FURNITURE_SELECTED", furnitureId: null });
        notice("已删除选中家具");
      }

      function saveProject() {
        if (!project) return;
        const placedFurniture = furnitureGroup.children.map((object) => {
          const placed = object.userData.placed;
          return {
            ...placed,
            position: [Number(object.position.x.toFixed(3)), 0, Number(object.position.z.toFixed(3))],
            rotation: [Number(object.rotation.x.toFixed(3)), Number(object.rotation.y.toFixed(3)), Number(object.rotation.z.toFixed(3))],
            scale: placed.scale
          };
        });

        project = {
          ...project,
          placedFurniture,
          updatedAt: new Date().toISOString(),
          syncState: "local"
        };
        emit({ type: "PROJECT_CHANGED", project });
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
        const x = (world.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-world.y * 0.5 + 0.5) * window.innerHeight;
        floatingActions.style.left = x + "px";
        floatingActions.style.top = y + "px";
        floatingActions.classList.add("is-visible");
        lockButton.textContent = object.userData.placed.locked ? "已固定" : "固定选中";
        lockButton.classList.toggle("locked", object.userData.placed.locked);
      }

      function findFurnitureFromHit(hit) {
        const id = hit?.object?.userData?.parentFurnitureId;
        return id ? furnitureById(id) : null;
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
          saveProject();
        }
        draggingId = null;
        controls.enabled = true;
        try {
          renderer.domElement.releasePointerCapture(event.pointerId);
        } catch {}
      });

      lockButton.addEventListener("click", lockSelected);
      deleteButton.addEventListener("click", deleteSelected);

      function resetCamera(shouldNotice = true) {
        camera.position.set(roomBounds.halfWidth + 2.8, 3.2, roomBounds.halfDepth + 3.4);
        controls.target.set(0, 0.9, 0);
        controls.update();
        if (shouldNotice) {
          notice("视角已重置");
        }
      }

      function initProject(nextProject, nextAssets) {
        project = nextProject;
        assets = nextAssets || [];
        furnitureGroup.clear();
        selectedId = null;
        createRoom(project.roomMesh);
        resetCamera(false);
        project.placedFurniture.forEach((placed) => {
          const asset = assets.find((item) => item.id === placed.assetId) || {
            id: placed.assetId,
            category: placed.category,
            name: placed.category,
            modelUri: placed.modelUri,
            defaultScale: placed.scale,
            footprint: { width: 0.8, depth: 0.6 }
          };
          addFurniture(asset, placed, true);
        });
        updateFloatingActions();
        loading.style.display = "none";
      }

      function handleNativeMessage(raw) {
        try {
          const message = JSON.parse(raw.data || raw);

          if (message.type === "INIT_PROJECT") {
            initProject(message.project, message.assets);
          }

          if (message.type === "ADD_FURNITURE") {
            addFurniture(message.asset);
          }

          if (message.type === "LOCK_SELECTED") {
            lockSelected();
          }

          if (message.type === "DELETE_SELECTED") {
            deleteSelected();
          }

          if (message.type === "RESET_CAMERA") {
            resetCamera();
          }
        } catch (error) {
          emit({ type: "SCENE_ERROR", message: "3D 场景无法处理 App 消息" });
        }
      }

      window.addEventListener("message", handleNativeMessage);
      document.addEventListener("message", handleNativeMessage);

      window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });

      function animate() {
        controls.update();
        updateFloatingActions();
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }

      animate();
      emit({ type: "SCENE_READY" });
    </script>
  </body>
</html>`;
}
