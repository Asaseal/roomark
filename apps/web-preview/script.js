const titleMap = {
  home: "今天看哪套？",
  scan: "扫描房间",
  map: "我的看房地图",
  library: "房型库",
  detail: "房源详情",
  compare: "房源对比",
  furnish: "软装模拟器"
};

const screenMap = {
  home: document.getElementById("homeScreen"),
  scan: document.getElementById("scanScreen"),
  map: document.getElementById("mapScreen"),
  library: document.getElementById("libraryScreen"),
  detail: document.getElementById("detailScreen"),
  compare: document.getElementById("compareScreen"),
  furnish: document.getElementById("furnishScreen")
};

const screenTitle = document.getElementById("screenTitle");
const tabs = Array.from(document.querySelectorAll(".tab"));
const navButtons = Array.from(document.querySelectorAll("[data-target]"));
const toast = document.getElementById("toast");
const finishScan = document.getElementById("finishScan");
const planInput = document.getElementById("planInput");
const planLabel = document.getElementById("planLabel");
const heightInput = document.getElementById("heightInput");
const simulatePlan = document.getElementById("simulatePlan");
const motionHint = document.getElementById("motionHint");
const uploadScan = document.getElementById("uploadScan");
const uploadRental = document.getElementById("uploadRental");
const planSamples = Array.from(document.querySelectorAll(".plan-sample"));
const generateCommunityModel = document.getElementById("generateCommunityModel");
const generatedCommunityCard = document.getElementById("generatedCommunityCard");
const generatedPlanTitle = document.getElementById("generatedPlanTitle");
const indoorSimulator = document.getElementById("indoorSimulator");
const indoorRoomTitle = document.getElementById("indoorRoomTitle");
const indoorView = document.getElementById("indoorView");
const viewButtons = Array.from(document.querySelectorAll(".view-button"));
const furnitureChips = Array.from(document.querySelectorAll(".furniture-chip"));
const twoBedroomScene = document.getElementById("twoBedroomScene");
const sceneModeButtons = Array.from(document.querySelectorAll(".scene-mode-button"));
const detailTitle = document.getElementById("detailTitle");
const detailSubtitle = document.getElementById("detailSubtitle");
const detailScore = document.getElementById("detailScore");
const detailRent = document.getElementById("detailRent");
const detailDeposit = document.getElementById("detailDeposit");
const detailCommute = document.getElementById("detailCommute");
const detailCost = document.getElementById("detailCost");
const detailRiskTitle = document.getElementById("detailRiskTitle");
const detailRiskText = document.getElementById("detailRiskText");
const detailEvidenceCount = document.getElementById("detailEvidenceCount");
const detailRenderTitle = document.getElementById("detailRenderTitle");
const detailStartFurnish = document.getElementById("detailStartFurnish");
const detailMapButton = document.getElementById("detailMapButton");
const scanResultCard = document.getElementById("scanResultCard");
const scanSavedBanner = document.getElementById("scanSavedBanner");
const openScannedRoom = document.getElementById("openScannedRoom");
const openSavedScan = document.getElementById("openSavedScan");
const furnishFrame = document.querySelector('.furnish-mobile-frame iframe');
let furnishFrameReadyPromise = null;
const placedFurniture = {
  bed: document.querySelector(".placed-bed"),
  sofa: document.querySelector(".placed-sofa"),
  desk: document.querySelector(".placed-desk")
};
let selectedCommunityPlan = planSamples.find((sample) => sample.classList.contains("active"))?.dataset.planName || "一室一厅 42㎡";
let currentDetailRoom = "晨光 L 型两居";
let currentDetailProperty = globalThis.RoomarkPropertyData?.findByTitle(currentDetailRoom) || null;
const renderStatusStorageKey = "roomark:web-preview:render-status";
const scanStateStorageKey = "roomark:web-preview:scan-state";

function saveScanState(source = "lidar", height = 3, planResult = null) {
  const planModel = planResult?.room ? {
    source: planResult.source,
    model: planResult.model,
    summary: planResult.summary,
    room: planResult.room
  } : null;
  try {
    localStorage.setItem(
      scanStateStorageKey,
      JSON.stringify({ saved: true, source, height, savedAt: new Date().toISOString(), planModel })
    );
  } catch {}
}

function loadScanState() {
  try {
    return JSON.parse(localStorage.getItem(scanStateStorageKey) || "null");
  } catch {
    localStorage.removeItem(scanStateStorageKey);
    return null;
  }
}

function getSavedScanRoomModel() {
  return loadScanState()?.planModel?.room || null;
}

function restoreSavedScan() {
  const scanState = loadScanState();
  const saved = Boolean(scanState?.saved);
  scanResultCard.hidden = !saved;
  scanSavedBanner.hidden = !saved;
  if (scanState?.planModel?.room) {
    globalThis.HouseViewer?.upsertGeneratedModel?.(scanState.planModel.room);
  }
}

function loadRenderStatuses() {
  try {
    return JSON.parse(localStorage.getItem(renderStatusStorageKey) || "{}");
  } catch {
    localStorage.removeItem(renderStatusStorageKey);
    return {};
  }
}

const renderStatuses = loadRenderStatuses();

const propertyProfiles = {
  "晨光 L 型两居": {
    score: "86",
    rent: "¥4,800",
    deposit: "¥4,800",
    commute: "18 分钟",
    cost: "约 ¥14,400",
    riskTitle: "2 项待确认 · 1 项高风险",
    riskText: "卫生间墙角有潮痕，签约前建议让房东确认维修记录。",
    evidence: "已记录 6 项",
    render: "已保存 1 张软装效果图"
  },
  "北岛中庭公寓": {
    score: "82",
    rent: "¥5,600",
    deposit: "¥5,600",
    commute: "26 分钟",
    cost: "约 ¥16,800",
    riskTitle: "3 项待确认 · 0 项高风险",
    riskText: "中庭采光好，但厨房通风和水电表读数需要补拍。",
    evidence: "已记录 5 项",
    render: "暂未生成效果图"
  },
  "海岸双卧套房": {
    score: "79",
    rent: "¥5,200",
    deposit: "¥5,200",
    commute: "34 分钟",
    cost: "约 ¥15,600",
    riskTitle: "4 项待确认 · 1 项高风险",
    riskText: "靠近主路，夜间噪音需要二次确认。",
    evidence: "已记录 7 项",
    render: "暂未生成效果图"
  },
  "都市 Loft 小宅": {
    score: "88",
    rent: "¥4,350",
    deposit: "¥4,350",
    commute: "15 分钟",
    cost: "约 ¥13,050",
    riskTitle: "1 项待确认 · 0 项高风险",
    riskText: "层高适合软装试摆，但收纳空间需要模拟验证。",
    evidence: "已记录 4 项",
    render: "已保存 1 张软装效果图"
  },
  "现场扫描房型": {
    score: "83",
    rent: "待补充",
    deposit: "待补充",
    commute: "待确认",
    cost: "待计算",
    riskTitle: "2 项待确认 · 0 项高风险",
    riskText: "已保存尺寸节点和家具识别标签，建议补充水电表、门窗和噪音记录。",
    evidence: "已记录 3 项",
    render: "暂未生成效果图"
  }
};

function profileFromProperty(property) {
  if (!property) return null;
  return {
    score: String(property.score),
    rent: property.price.replace("/月", ""),
    deposit: property.deposit,
    commute: `${property.commuteMinutes} 分钟`,
    cost: property.moveInCost,
    riskTitle: `${property.riskCount} 项待确认 · ${property.highRiskCount} 项高风险`,
    riskText: property.riskSummary,
    evidence: `已记录 ${property.evidenceCount} 项`,
    render: property.hasFurnishLayout ? "已保存软装布局" : "暂未生成效果图"
  };
}

function showScreen(target) {
  Object.entries(screenMap).forEach(([key, element]) => {
    element.classList.toggle("active", key === target);
  });

  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.target === target);
  });

  screenTitle.textContent = titleMap[target] || titleMap.home;

}

window.RoomarkShowScreen = showScreen;

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 1600);
}

window.RoomarkShowToast = showToast;

function showMotionHint() {
  motionHint.classList.add("visible");
  window.clearTimeout(showMotionHint.timer);
  showMotionHint.timer = window.setTimeout(() => {
    motionHint.classList.remove("visible");
  }, 620);
}

function openIndoorSimulator(roomTitle, focusFurniture = false) {
  indoorRoomTitle.textContent = roomTitle;
  indoorSimulator.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast(focusFurniture ? "已进入软装模拟" : "已进入室内漫游");
}

function syncFurnishRoom(roomTitle = currentDetailRoom) {
  furnishFrame?.contentWindow?.postMessage(
    {
      type: "roomark:open-room",
      room: { title: roomTitle }
    },
    window.location.origin
  );
}

function ensureFurnishFrameLoaded() {
  if (!furnishFrame || furnishFrame.dataset.loaded === "true") {
    return Promise.resolve(Boolean(furnishFrame));
  }

  if (furnishFrameReadyPromise) {
    return furnishFrameReadyPromise;
  }

  furnishFrameReadyPromise = new Promise((resolve) => {
    furnishFrame.addEventListener(
      "load",
      () => {
        furnishFrame.dataset.loaded = "true";
        resolve(true);
      },
      { once: true }
    );
    furnishFrame.src = furnishFrame.dataset.src;
  });

  return furnishFrameReadyPromise;
}

function enterFurnishMode(roomTitle = "当前房型") {
  currentDetailRoom = roomTitle;
  showScreen("furnish");
  ensureFurnishFrameLoaded().then(() => syncFurnishRoom(roomTitle));
  showToast(`${roomTitle} · 已进入自由布置`);
}

window.RoomarkEnterFurnishMode = enterFurnishMode;

function openRoomDetail(model = {}) {
  const title = model.title || model.name || model.roomTitle || "晨光 L 型两居";
  const property = globalThis.RoomarkPropertyData?.findById(model.id) || globalThis.RoomarkPropertyData?.findByTitle(title);
  const profile = profileFromProperty(property) || propertyProfiles[title] || {
    score: "80",
    rent: "¥4,900",
    deposit: "¥4,900",
    commute: "28 分钟",
    cost: "约 ¥14,700",
    riskTitle: "2 项待确认 · 0 项高风险",
    riskText: "基础条件稳定，建议进入软装模拟确认家具和动线。",
    evidence: "已记录 4 项",
    render: "暂未生成效果图"
  };

  currentDetailRoom = title;
  currentDetailProperty = property || { ...model, title };
  detailTitle.textContent = title;
  detailSubtitle.textContent = [model.area, model.rooms, model.style].filter(Boolean).join(" · ") || "已扫描房型 · 可进入 3D 软装模拟";
  detailScore.textContent = profile.score;
  detailRent.textContent = profile.rent;
  detailDeposit.textContent = profile.deposit;
  detailCommute.textContent = profile.commute;
  detailCost.textContent = profile.cost;
  detailRiskTitle.textContent = profile.riskTitle;
  detailRiskText.textContent = profile.riskText;
  detailEvidenceCount.textContent = profile.evidence;
  detailRenderTitle.textContent = renderStatuses[title]?.label || profile.render;
  showScreen("detail");
  showToast(`${title} · 已打开房源详情`);
}

function updateLibraryRenderState(roomTitle, renderPreview) {
  const label = "已保存 1 张 AI 软装效果图";
  renderStatuses[roomTitle] = {
    label,
    savedAt: renderPreview?.savedAt || new Date().toISOString()
  };
  localStorage.setItem(renderStatusStorageKey, JSON.stringify(renderStatuses));

  document.querySelectorAll(`[data-room-title="${CSS.escape(roomTitle)}"]`).forEach((button) => {
    const card = button.closest(".model-card, .library-card");
    if (!card) return;
    card.classList.add("has-ai-render");
    let badge = card.querySelector(".ai-render-status");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "ai-render-status";
      card.appendChild(badge);
    }
    badge.textContent = "已生成 Mock 效果图";
  });

  if (currentDetailRoom === roomTitle) {
    detailRenderTitle.textContent = label;
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== furnishFrame?.contentWindow || event.origin !== window.location.origin) {
    return;
  }
  if (event.data?.type === "roomark:render-saved") {
    updateLibraryRenderState(currentDetailRoom, event.data.renderPreview);
    showScreen("detail");
    showToast("Mock 效果图已保存，房型库状态已同步");
  }
  if (event.data?.type === "roomark:furnish-back") {
    showScreen("detail");
    showToast("软装布局已自动保存");
  }
});

furnishFrame?.addEventListener("load", () => {
  syncFurnishRoom(currentDetailRoom);
});

Object.entries(renderStatuses).forEach(([roomTitle, status]) => {
  updateLibraryRenderState(roomTitle, status);
});

window.RoomarkOpenRoomDetail = openRoomDetail;
window.RoomarkGetCurrentProperty = () => currentDetailProperty;

function bindRoomActionButtons() {
  document.querySelectorAll(".room-view-button, .room-furnish-button, [data-enter-furnish]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      if (button.classList.contains("room-furnish-button") || button.hasAttribute("data-enter-furnish")) {
        enterFurnishMode(button.dataset.roomTitle || "当前房型");
        return;
      }

      openIndoorSimulator(button.dataset.roomTitle, false);
    });
  });
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.target;
    if (screenMap[target]) {
      showScreen(target);
    }
  });
});

[screenMap.scan, screenMap.map, screenMap.library, screenMap.detail, screenMap.furnish].forEach((screen) => {
  screen.addEventListener("scroll", showMotionHint, { passive: true });
  screen.addEventListener("touchmove", showMotionHint, { passive: true });
});

detailStartFurnish.addEventListener("click", () => {
  enterFurnishMode(currentDetailRoom);
});

detailMapButton.addEventListener("click", () => {
  globalThis.RoomarkMap?.openProperty(currentDetailProperty || currentDetailRoom);
});

finishScan.addEventListener("click", () => {
  saveScanState("lidar", 3);
  scanResultCard.hidden = false;
  scanSavedBanner.hidden = false;
  scanResultCard.scrollIntoView({ behavior: "smooth", block: "center" });
  showToast("扫描已结束，房型已保存");
});

planInput.addEventListener("change", () => {
  const fileName = planInput.files?.[0]?.name;
  planLabel.textContent = fileName ? fileName.replace(/\.[^.]+$/, "") : "丢入平面图";
});

simulatePlan.addEventListener("click", async () => {
  const height = Number(heightInput.value || 3).toFixed(1);
  simulatePlan.disabled = true;
  showToast("正在解析平面图并生成 3D 空间");
  try {
    const planResult = await globalThis.RoomarkPlanTo3D.generate({
      file: planInput.files?.[0] || null,
      height: Number(height)
    });
    saveScanState("floor-plan", Number(height), planResult);
    globalThis.HouseViewer?.upsertGeneratedModel?.(planResult.room);
    showToast(planResult.source === "openai" ? `已用 GPT 生成 3D 房型 · 层高 ${height}m` : `已生成 3D 房型 · 层高 ${height}m`);
  } finally {
    simulatePlan.disabled = false;
  }
  scanResultCard.hidden = false;
  scanSavedBanner.hidden = false;
  showScreen("library");
  return;
  showToast(`已模拟生成两居室一卫 · 层高 ${height}m`);
});

[openScannedRoom, openSavedScan].forEach((button) => {
  button.addEventListener("click", () => {
    openRoomDetail(getSavedScanRoomModel() || {
      title: "现场扫描房型",
      area: "约 9 m²",
      rooms: "1 个独立房间",
      style: "RoomPlan 模拟扫描结果"
    });
  });
});

uploadScan.addEventListener("click", () => {
  showToast("已准备上传扫描房型");
});

uploadRental.addEventListener("click", () => {
  showToast("已进入房东发布流程");
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    viewButtons.forEach((item) => item.classList.toggle("active", item === button));
    indoorView.dataset.angle = button.dataset.viewAngle;
    showToast(`已切换到${button.textContent}`);
  });
});

furnitureChips.forEach((button) => {
  button.addEventListener("click", () => {
    furnitureChips.forEach((item) => item.classList.toggle("active", item === button));
    const furniture = placedFurniture[button.dataset.furniture];
    furniture.classList.add("visible");
    furniture.animate(
      [
        { transform: "translateY(12px) scale(0.92)", opacity: 0.2 },
        { transform: "translateY(0) scale(1)", opacity: 1 }
      ],
      { duration: 220, easing: "ease-out" }
    );
    showToast(`${button.textContent}已加入房间`);
  });
});

sceneModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    sceneModeButtons.forEach((item) => item.classList.toggle("active", item === button));
    twoBedroomScene.dataset.sceneMode = button.dataset.sceneMode;
    showToast(`已切换到${button.textContent}`);
  });
});

planSamples.forEach((sample) => {
  sample.addEventListener("click", () => {
    planSamples.forEach((item) => item.classList.toggle("active", item === sample));
    selectedCommunityPlan = sample.dataset.planName;
    showToast(`已选择 ${selectedCommunityPlan}`);
  });
});

generateCommunityModel.addEventListener("click", () => {
  generatedPlanTitle.textContent = selectedCommunityPlan;
  generatedCommunityCard.querySelectorAll("[data-room-title]").forEach((button) => {
    button.dataset.roomTitle = selectedCommunityPlan;
  });
  generatedCommunityCard.hidden = false;
  generatedCommunityCard.animate(
    [
      { opacity: 0, transform: "translateY(12px) scale(0.98)" },
      { opacity: 1, transform: "translateY(0) scale(1)" }
    ],
    { duration: 260, easing: "ease-out" }
  );
  showToast("已从平面图生成社区 3D 房型");
  bindRoomActionButtons();
});

bindRoomActionButtons();
restoreSavedScan();
