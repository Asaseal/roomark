(function () {
  const maxInlineImageBytes = 3 * 1024 * 1024;

  function normalizeHeight(value) {
    const height = Number(value || 3);
    if (!Number.isFinite(height)) return 3;
    return Math.max(2.2, Math.min(4.5, height));
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", () => reject(reader.error || new Error("File read failed")));
      reader.readAsDataURL(file);
    });
  }

  function createLocalFallback(payload = {}) {
    const height = normalizeHeight(payload.height);
    return {
      ok: true,
      source: "local",
      model: "browser-room-generator",
      summary: "已生成本地 3D 房型。",
      room: {
        id: "H05",
        title: "AI 平面图生成房型",
        category: "AI 生成",
        area: "约 68 m²",
        rooms: "2 室 1 厅 1 厨 1 卫",
        style: `本地生成模式 · 层高 ${height.toFixed(1)}m`,
        camera: { position: [6.3, 8.2, 6.8], target: [0, 0, 0] },
        floors: [
          { x: 0, z: 0, w: 7.2, d: 6.1, material: "warmFloor" },
          { x: 2.1, z: 1.7, w: 2.1, d: 1.8, material: "tileFloor" },
          { x: -2.2, z: 1.6, w: 2.2, d: 2.0, material: "carpetFloor" }
        ],
        walls: [
          [0, -3.05, 7.2, 0.18],
          [-3.6, 0, 0.18, 6.1],
          [3.6, 0, 0.18, 6.1],
          [0, 3.05, 7.2, 0.18],
          [-1.1, 0.9, 0.18, 3.7],
          [1.2, 0.85, 0.18, 3.5],
          [0, -0.7, 4.8, 0.18],
          [-2.2, 1.45, 2.1, 0.18],
          [2.2, 1.35, 2.2, 0.18]
        ],
        windows: [
          { x: -1.8, z: -3.07, w: 1.7, d: 0.08 },
          { x: 1.9, z: -3.07, w: 1.7, d: 0.08 },
          { x: -3.62, z: 1.5, w: 0.08, d: 1.3 },
          { x: 3.62, z: 1.4, w: 0.08, d: 1.3 }
        ],
        doors: [
          { x: 0, z: -2.97, r: 0 },
          { x: -1.1, z: -0.1, r: 1.57 },
          { x: 1.2, z: -0.1, r: 1.57 },
          { x: -2.2, z: 1.45, r: 0 },
          { x: 2.2, z: 1.35, r: 0 }
        ],
        furniture: []
      }
    };
  }

  async function generate(options = {}) {
    const file = options.file || null;
    const payload = {
      height: normalizeHeight(options.height),
      fileName: file?.name || "",
      mimeType: file?.type || "",
      size: file?.size || 0
    };

    if (file && file.type.startsWith("image/") && file.size <= maxInlineImageBytes) {
      payload.dataUrl = await readFileAsDataUrl(file);
    }

    try {
      const response = await fetch("/api/plan-to-3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      return result?.room ? result : createLocalFallback(payload);
    } catch (error) {
      return {
        ...createLocalFallback(payload),
        summary: `本地兜底已接管：${error.message}`
      };
    }
  }

  window.RoomarkPlanTo3D = {
    generate,
    createLocalFallback
  };
})();
