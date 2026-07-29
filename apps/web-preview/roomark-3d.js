import * as THREE from "./vendor/three/three.module.js?v=20260613";

const canvas = document.getElementById("roomarkThreeCanvas");
const status = document.getElementById("threeStatus");
const furnitureButtons = Array.from(document.querySelectorAll(".furniture-data-card"));
const joystickButtons = Array.from(document.querySelectorAll(".walk-joystick button"));

if (canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x183134);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.position.set(4.8, 5.2, 6.4);
  camera.lookAt(0, 0, 0);

  const roomGroup = new THREE.Group();
  scene.add(roomGroup);

  const ambient = new THREE.HemisphereLight(0xf8fff8, 0x203033, 2.3);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(4, 8, 5);
  sun.castShadow = true;
  scene.add(sun);

  const materials = {
    floor: new THREE.MeshStandardMaterial({ color: 0xf7ead0, roughness: 0.82 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xe8f2ee, roughness: 0.78 }),
    living: new THREE.MeshStandardMaterial({ color: 0xfff2cd, roughness: 0.72 }),
    master: new THREE.MeshStandardMaterial({ color: 0xcfeaf8, roughness: 0.74 }),
    second: new THREE.MeshStandardMaterial({ color: 0xd8f0e8, roughness: 0.74 }),
    bath: new THREE.MeshStandardMaterial({ color: 0xe5f4fa, roughness: 0.74 }),
    kitchen: new THREE.MeshStandardMaterial({ color: 0xffe5b8, roughness: 0.74 }),
    furniture: new THREE.MeshStandardMaterial({ color: 0x9fd7f2, roughness: 0.62 }),
    sofa: new THREE.MeshStandardMaterial({ color: 0xf7d8a8, roughness: 0.64 }),
    desk: new THREE.MeshStandardMaterial({ color: 0x9ee2d1, roughness: 0.64 }),
    table: new THREE.MeshStandardMaterial({ color: 0xd7c6a8, roughness: 0.64 })
  };

  const roomSpecs = [
    { name: "客厅", x: -1.15, z: 0.8, w: 3.9, d: 2.5, material: materials.living },
    { name: "主卧", x: -1.9, z: -1.25, w: 2.6, d: 1.9, material: materials.master },
    { name: "次卧", x: 1.15, z: -1.25, w: 2.1, d: 1.8, material: materials.second },
    { name: "卫生间", x: 0.92, z: 0.42, w: 1.25, d: 1.15, material: materials.bath },
    { name: "厨房", x: 2.05, z: 0.52, w: 1.35, d: 1.35, material: materials.kitchen },
    { name: "阳台", x: -0.1, z: -2.35, w: 2.7, d: 0.72, material: materials.second }
  ];

  function box(width, height, depth, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    roomGroup.add(mesh);
    return mesh;
  }

  function addRoom(spec) {
    box(spec.w, 0.08, spec.d, spec.material, spec.x, 0, spec.z);
    box(spec.w, 0.42, 0.08, materials.wall, spec.x, 0.25, spec.z - spec.d / 2);
    box(0.08, 0.42, spec.d, materials.wall, spec.x - spec.w / 2, 0.25, spec.z);
  }

  roomSpecs.forEach(addRoom);

  const furnitureMeshes = {
    bed: box(1.5, 0.28, 2.0, materials.furniture, -2.05, 0.2, -1.22),
    sofa: box(1.8, 0.32, 0.82, materials.sofa, -1.45, 0.22, 1.15),
    desk: box(1.2, 0.3, 0.6, materials.desk, 1.3, 0.22, -1.36),
    table: box(1.4, 0.32, 0.8, materials.table, -0.1, 0.24, 0.86)
  };

  Object.entries(furnitureMeshes).forEach(([key, mesh]) => {
    mesh.visible = key === "bed" || key === "sofa";
  });

  const grid = new THREE.GridHelper(7, 14, 0x8fb4aa, 0x44615d);
  grid.position.y = -0.05;
  scene.add(grid);

  let walkMode = false;
  const walkPosition = new THREE.Vector3(0, 1.25, 4.5);
  let yaw = Math.PI;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function updateWalkCamera() {
    camera.position.copy(walkPosition);
    camera.lookAt(
      walkPosition.x + Math.sin(yaw),
      walkPosition.y,
      walkPosition.z + Math.cos(yaw)
    );
  }

  furnitureButtons.forEach((button) => {
    button.addEventListener("click", () => {
      furnitureButtons.forEach((item) => item.classList.toggle("active", item === button));
      const selected = button.dataset.furnitureId;
      if (furnitureMeshes[selected]) {
        furnitureMeshes[selected].visible = true;
      }
      if (status) {
        status.textContent = `${button.querySelector("strong")?.textContent || "家具"}已放入房间`;
      }
    });
  });

  joystickButtons.forEach((button) => {
    button.addEventListener("click", () => {
      walkMode = true;
      const step = 0.28;
      if (button.dataset.move === "left") yaw += 0.22;
      if (button.dataset.move === "right") yaw -= 0.22;
      if (button.dataset.move === "forward") {
        walkPosition.x += Math.sin(yaw) * step;
        walkPosition.z += Math.cos(yaw) * step;
      }
      if (button.dataset.move === "back") {
        walkPosition.x -= Math.sin(yaw) * step;
        walkPosition.z -= Math.cos(yaw) * step;
      }
      walkPosition.x = THREE.MathUtils.clamp(walkPosition.x, -3.1, 3.1);
      walkPosition.z = THREE.MathUtils.clamp(walkPosition.z, -2.9, 3.1);
      updateWalkCamera();
      if (status) status.textContent = "室内漫游模式";
    });
  });

  window.addEventListener("resize", resize);
  resize();

  const clock = new THREE.Clock();
  function animate() {
    const elapsed = clock.getElapsedTime();
    if (!walkMode) {
      roomGroup.rotation.y = THREE.MathUtils.degToRad(Math.sin(elapsed * 0.55) * 30);
      camera.position.set(4.8, 5.2, 6.4);
      camera.lookAt(0, 0, 0);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
}
