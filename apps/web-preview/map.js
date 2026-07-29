(() => {
  const map = document.getElementById("roomarkMap");
  const markerLayer = document.getElementById("mapMarkerLayer");
  const filters = Array.from(document.querySelectorAll("[data-map-filter]"));
  const propertySheet = document.getElementById("mapPropertySheet");
  const emptyState = document.getElementById("mapEmptyState");
  const locationButton = document.getElementById("mapLocationButton");
  const addNearbyButton = document.getElementById("mapAddNearby");
  const closeButton = document.getElementById("mapSheetClose");
  const viewDetailButton = document.getElementById("mapViewDetail");
  const startFurnishButton = document.getElementById("mapStartFurnish");
  const storageKey = "roomark:web-preview:map-markers";
  const bounds = {
    north: 31.241,
    south: 31.218,
    east: 121.487,
    west: 121.454
  };

  if (!map || !markerLayer || !propertySheet) return;

  let activeFilter = "all";
  let selectedProperty = null;
  let longPressTimer = null;
  let longPressOrigin = null;

  const fields = {
    status: document.getElementById("mapPropertyStatus"),
    title: document.getElementById("mapPropertyTitle"),
    price: document.getElementById("mapPropertyPrice"),
    address: document.getElementById("mapPropertyAddress"),
    distance: document.getElementById("mapPropertyDistance"),
    commute: document.getElementById("mapPropertyCommute"),
    risk: document.getElementById("mapPropertyRisk"),
    score: document.getElementById("mapPropertyScore"),
    thumb: document.getElementById("mapPropertyThumb")
  };

  function loadCustomProperties() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      localStorage.removeItem(storageKey);
      return [];
    }
  }

  function saveCustomProperties(properties) {
    localStorage.setItem(storageKey, JSON.stringify(properties));
  }

  function allProperties() {
    return [...(globalThis.RoomarkPropertyData?.all() || []), ...loadCustomProperties()];
  }

  function matchesFilter(property) {
    if (activeFilter === "visited") return property.hasVisited;
    if (activeFilter === "scanned") return property.hasScan;
    if (activeFilter === "high-risk") return property.highRiskCount > 0;
    if (activeFilter === "favorite") return property.isFavorite;
    return true;
  }

  function markerStatus(property) {
    if (property.status === "risk") return "risk";
    if (property.hasScan) return "scanned";
    if (property.hasVisited) return "visited";
    return "favorite";
  }

  function project(property) {
    const x = ((property.longitude - bounds.west) / (bounds.east - bounds.west)) * 100;
    const y = ((bounds.north - property.latitude) / (bounds.north - bounds.south)) * 100;
    return {
      x: Math.min(92, Math.max(8, x)),
      y: Math.min(86, Math.max(12, y))
    };
  }

  function renderMarkers() {
    const visibleProperties = allProperties().filter(matchesFilter);
    markerLayer.replaceChildren();
    emptyState.hidden = visibleProperties.length > 0;

    visibleProperties.forEach((property) => {
      const point = project(property);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `map-marker status-${markerStatus(property)}`;
      button.style.left = `${point.x}%`;
      button.style.top = `${point.y}%`;
      button.dataset.propertyId = property.id;
      button.setAttribute("aria-label", `${property.title}，${property.statusLabel}`);
      button.innerHTML = `<span aria-hidden="true"><i></i></span><b>${property.price === "待补充" ? "待补充" : property.price.replace("/月", "")}</b>`;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        selectProperty(property);
      });
      markerLayer.appendChild(button);
    });
  }

  function selectProperty(property) {
    selectedProperty = property;
    markerLayer.querySelectorAll(".map-marker").forEach((marker) => {
      marker.classList.toggle("selected", marker.dataset.propertyId === property.id);
    });
    fields.status.textContent = property.statusLabel;
    fields.title.textContent = property.title;
    fields.price.textContent = property.price;
    fields.address.textContent = property.address;
    fields.distance.textContent = property.distance;
    fields.commute.textContent = `${property.commuteMinutes} 分钟`;
    fields.risk.textContent = `风险 ${property.riskCount}`;
    fields.score.textContent = property.score;
    fields.thumb.className = `map-property-thumb tone-${property.thumbnail || "custom"}`;
    startFurnishButton.textContent = property.hasFurnishLayout ? "继续模拟软装" : "开始模拟软装";
    propertySheet.hidden = false;
    propertySheet.classList.remove("is-visible");
    requestAnimationFrame(() => propertySheet.classList.add("is-visible"));
  }

  function closeSheet() {
    propertySheet.classList.remove("is-visible");
    markerLayer.querySelectorAll(".map-marker").forEach((marker) => marker.classList.remove("selected"));
    window.setTimeout(() => {
      propertySheet.hidden = true;
    }, 180);
  }

  function createNearbyProperty(latitude, longitude) {
    const customProperties = loadCustomProperties();
    const index = customProperties.length + 1;
    const property = {
      id: `CUSTOM-${Date.now()}`,
      title: `新标记房源 ${index}`,
      latitude,
      longitude,
      address: "当前位置附近 · 待补充门牌",
      price: "待补充",
      deposit: "待补充",
      moveInCost: "待计算",
      commuteMinutes: 20,
      distance: "约 300 m",
      riskCount: 0,
      highRiskCount: 0,
      score: 80,
      status: "favorite",
      statusLabel: "新标记 · 已收藏",
      isFavorite: true,
      hasVisited: false,
      hasEvidence: false,
      hasScan: false,
      hasFurnishLayout: false,
      evidenceCount: 0,
      riskSummary: "尚未完成现场看房记录。",
      thumbnail: "custom"
    };
    customProperties.push(property);
    saveCustomProperties(customProperties);
    activeFilter = "all";
    filters.forEach((filter) => filter.classList.toggle("active", filter.dataset.mapFilter === "all"));
    renderMarkers();
    selectProperty(property);
    globalThis.RoomarkShowToast?.("新房源位置已保存");
    return property;
  }

  filters.forEach((filter) => {
    filter.addEventListener("click", () => {
      activeFilter = filter.dataset.mapFilter;
      filters.forEach((item) => item.classList.toggle("active", item === filter));
      propertySheet.hidden = true;
      selectedProperty = null;
      renderMarkers();
    });
  });

  map.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    const rect = map.getBoundingClientRect();
    longPressOrigin = { x: event.clientX, y: event.clientY };
    longPressTimer = window.setTimeout(() => {
      const xRatio = (longPressOrigin.x - rect.left) / rect.width;
      const yRatio = (longPressOrigin.y - rect.top) / rect.height;
      const longitude = bounds.west + xRatio * (bounds.east - bounds.west);
      const latitude = bounds.north - yRatio * (bounds.north - bounds.south);
      createNearbyProperty(latitude, longitude);
      longPressTimer = null;
    }, 650);
  });

  map.addEventListener("pointermove", (event) => {
    if (!longPressTimer || !longPressOrigin) return;
    if (Math.hypot(event.clientX - longPressOrigin.x, event.clientY - longPressOrigin.y) > 10) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
    map.addEventListener(eventName, () => {
      if (longPressTimer) window.clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressOrigin = null;
    });
  });

  locationButton.addEventListener("click", () => {
    map.classList.remove("location-pulse");
    requestAnimationFrame(() => map.classList.add("location-pulse"));
    globalThis.RoomarkShowToast?.("已回到当前位置");
  });

  addNearbyButton.addEventListener("click", () => createNearbyProperty(31.2294, 121.4648));
  closeButton.addEventListener("click", closeSheet);
  viewDetailButton.addEventListener("click", () => globalThis.RoomarkOpenRoomDetail?.(selectedProperty));
  startFurnishButton.addEventListener("click", () => globalThis.RoomarkEnterFurnishMode?.(selectedProperty?.title));

  globalThis.RoomarkMap = {
    openProperty(propertyOrTitle) {
      const property = typeof propertyOrTitle === "string"
        ? allProperties().find((item) => item.title === propertyOrTitle)
        : propertyOrTitle;
      globalThis.RoomarkShowScreen?.("map");
      renderMarkers();
      if (property) window.setTimeout(() => selectProperty(property), 80);
    },
    getProperties: allProperties,
    addNearby: () => createNearbyProperty(31.2294, 121.4648)
  };

  renderMarkers();
})();
