const GRID_PRESETS = [4, 8, 9, 12, 16, 32];
const DEFAULT_SIZE = 9;
const REFERENCE_SIZE = 9;
const VIEWBOX_MIN = -6;
const VIEWBOX_SIZE = 112;
const VOLUME_PRESETS = [
  { id: "flat", label: "Плоско" },
  { id: "convex", label: "выпукло" },
];

const app = document.querySelector("#app");

const state = {
  rows: DEFAULT_SIZE,
  cols: DEFAULT_SIZE,
  tileScale: 1,
  volume: 150,
  volumePreset: "convex",
  gap: 1.35,
  activeColor: "#303032",
  inactiveColor: "#ededeb",
  radius: 28,
  mode: "draw",
  isPointerDown: false,
  dragValue: true,
  cells: createInitialCells(DEFAULT_SIZE, DEFAULT_SIZE),
};

function createCells(rows = state.rows, cols = state.cols, fill = false) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

function createInitialCells(rows, cols) {
  const cells = createCells(rows, cols, false);
const referenceTiles = [
  [0, 1], [0, 4],

  [1, 2], [1, 3], [1, 4], [1, 7],

  [2, 3], [2, 4], [2, 6],

  [3, 4], [3, 6], [3, 7],

  [4, 1], [4, 2], [4, 4], [4, 5], [4, 8],

  [5, 0], [5, 2], [5, 3], [5, 4],

  [6, 3], [6, 4],

  [7, 4], [7, 5],

  [8, 3], [8, 4], [8, 5],
];



  referenceTiles.forEach(([refRow, refCol]) => {
    const row = Math.round((refRow / (REFERENCE_SIZE - 1)) * (rows - 1));
    const col = Math.round((refCol / (REFERENCE_SIZE - 1)) * (cols - 1));
    if (isVisibleTile(row, col, rows, cols)) cells[row][col] = true;
  });

  return cells;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function setCssVariables() {
  document.documentElement.style.setProperty("--active-cell", state.activeColor);
  document.documentElement.style.setProperty("--inactive-cell", state.inactiveColor);
}

function normalizedPosition(row, col, rows = state.rows, cols = state.cols) {
  const halfRows = Math.max(1, (rows - 1) / 2);
  const halfCols = Math.max(1, (cols - 1) / 2);

  return {
    x: (col - (cols - 1) / 2) / halfCols,
    y: (row - (rows - 1) / 2) / halfRows,
  };
}

function distanceFromCenter(row, col, rows = state.rows, cols = state.cols) {
  const { x, y } = normalizedPosition(row, col, rows, cols);
  return Math.sqrt(x * x + y * y);
}

function sphereStrength(rows = state.rows, cols = state.cols) {
  const size = Math.min(rows, cols);
  const volume = state.volume / 100;
  if (size <= 4) return 0;
  if (size <= 9) return ((size - 4) / 10) * volume;
  return volume;
}

function convexVolumeForSize(rows = state.rows, cols = state.cols) {
  const size = Math.min(rows, cols);
  if (size <= 4) return 0;
  if (size <= 9) return 150;
  return Math.max(45, Math.round(75 - (size - 9) * 4));
}

function volumeForPreset(presetId, rows = state.rows, cols = state.cols) {
  if (presetId === "flat") return 0;
  if (presetId === "convex") return convexVolumeForSize(rows, cols);
  return state.volume;
}

function isVisibleTile(row, col, rows = state.rows, cols = state.cols) {
  if (Math.min(rows, cols) <= 9) return true;
  return distanceFromCenter(row, col, rows, cols) <= 1.42;
}

function edgeScaleFor(distance) {
  // return Math.max(0.86, 1 - Math.max(0, distance - 0.58) * 0.1);
  // return Math.max(0.68, 1 - Math.max(0, distance - 0.45) * 0.22);
  return Math.max(0.90, 1 - Math.max(0, distance - 0.45) * 0.1);
  // return Math.max(0.88, 1 - Math.max(0, distance - 0.9) * 14);
}

function outerRowPull(row, slot) {
  const strength = sphereStrength();
  if (strength === 0) return 0;

  const { y } = normalizedPosition(row, 0);
  const edgeAmount = Math.max(0, Math.abs(y) - 0.68);
  return Math.sign(y) * edgeAmount * slot * 0.42 * strength;
}

function outerColPull(col, slot) {
  const strength = sphereStrength();
  if (strength === 0) return 0;

  const { x } = normalizedPosition(0, col);
  const edgeAmount = Math.max(0, Math.abs(x) - 0.68);
  return Math.sign(x) * edgeAmount * slot * 0.42 * strength;
}

function projectPoint(x, y) {
  const strength = sphereStrength();
  const nx = (x - 50) / 50;
  const ny = (y - 50) / 50;

  const sx = nx * Math.sqrt(Math.max(0, 1 - 0.64 * strength * ny * ny));
  const sy = ny * Math.sqrt(Math.max(0, 1 - 0.64 * strength * nx * nx));

  return {
    x: 50 + sx * 50,
    y: 50 + sy * 50,
  };
}

function tileOpacity(row, col, active) {
  if (active) return 1;

  const strength = sphereStrength();
  const distance = distanceFromCenter(row, col);
  return Math.max(0.58, 1 - Math.max(0, distance - 0.65) * 0.55 * strength);
}

function squeezeParams(row, col) {
  const strength = sphereStrength();
  const { x, y } = normalizedPosition(row, col);
  const distance = Math.sqrt(x * x + y * y);

  const edgeFactor = Math.min(1, Math.max(0, (distance - 0.35) / 0.85));
  const maxSqueeze = 0.23;
  const squeeze = edgeFactor * maxSqueeze * strength;

  const absX = Math.abs(x);
  const absY = Math.abs(y);
  const sum = Math.max(0.0001, absX + absY);

  const xWeight = absX / sum;
  const yWeight = absY / sum;

  return {
    distance,
    edgeFactor,
    scaleX: 1 - squeeze * xWeight,
    scaleY: 1 - squeeze * yWeight,
  };
}

function squeezeTileByDistance(layout, row, col) {
  const { scaleX, scaleY } = squeezeParams(row, col);
  const center = layout.center;

  function transformPoint(p) {
    return {
      x: center.x + (p.x - center.x) * scaleX,
      y: center.y + (p.y - center.y) * scaleY,
    };
  }

  return {
    ...layout,
    p1: transformPoint(layout.p1),
    p2: transformPoint(layout.p2),
    p3: transformPoint(layout.p3),
    p4: transformPoint(layout.p4),
  };
}


function responsiveTileGap(slot, rows = state.rows, cols = state.cols) {
  const size = Math.max(rows, cols);
  if (size <= DEFAULT_SIZE) return state.gap;

  const progress = Math.min(1, (size - DEFAULT_SIZE) / (32 - DEFAULT_SIZE));
  const maxGapRatio = 0.34 - progress * 0.14;
  return Math.min(state.gap, slot * maxGapRatio);
}

function responsiveTileScale(rows = state.rows, cols = state.cols) {
  const size = Math.max(rows, cols);
  if (size <= DEFAULT_SIZE) return 1;

  const progress = Math.min(1, (size - DEFAULT_SIZE) / (32 - DEFAULT_SIZE));
  return 1 + progress * 0.12;
}

function tileLayout(row, col) {
  const padding = 7;
  const horizontalSlot = (100 - padding * 2) / state.cols;
  const verticalSlot = (100 - padding * 2) / state.rows;
  const slot = Math.min(horizontalSlot, verticalSlot);
  const gap = responsiveTileGap(slot);
  const sizeScale = state.tileScale * responsiveTileScale();

  const offsetX = (100 - slot * state.cols) / 2;
  const offsetY = (100 - slot * state.rows) / 2;

  const baseLeft = offsetX + col * slot - outerColPull(col, slot);
  const baseTop = offsetY + row * slot - outerRowPull(row, slot);

  const { distance, edgeFactor, scaleX, scaleY } = squeezeParams(row, col);

  // Чем ближе к краю, тем меньше отступ между плитками
  const dynamicGap = gap * (1 - edgeFactor * 0.75 * sphereStrength());

  const scale = edgeScaleFor(distance);

  // Компенсация сжатия:
  // если потом плитка сожмётся по X, заранее делаем её чуть шире;
  // если сожмётся по Y, заранее делаем её чуть выше.
  const compensationX = Math.min(1, 1 / scaleX);
  const compensationY = Math.min(1, 1 / scaleY);

  const sizeX = Math.max(0, (slot - dynamicGap) * scale * sizeScale * compensationX);
  const sizeY = Math.max(0, (slot - dynamicGap) * scale * sizeScale * compensationY);

  const left = baseLeft + (slot - sizeX) / 2;
  const top = baseTop + (slot - sizeY) / 2;

  const layout = {
    p1: projectPoint(left, top),
    p2: projectPoint(left + sizeX, top),
    p3: projectPoint(left + sizeX, top + sizeY),
    p4: projectPoint(left, top + sizeY),
    center: projectPoint(left + sizeX / 2, top + sizeY / 2),
    distance,
    rotate: 0,
  };

  return squeezeTileByDistance(layout, row, col);
}
function resizeGrid(rows, cols) {
  const nextCells = createCells(rows, cols, false);

  for (let row = 0; row < Math.min(rows, state.rows); row += 1) {
    for (let col = 0; col < Math.min(cols, state.cols); col += 1) {
      nextCells[row][col] = isVisibleTile(row, col, rows, cols) ? state.cells[row][col] : false;
    }
  }

  state.rows = rows;
  state.cols = cols;
  state.cells = nextCells;
  if (state.volumePreset !== "custom") {
    state.volume = volumeForPreset(state.volumePreset, rows, cols);
  }
  renderApp();
}

function setEveryCell(value) {
  state.cells = createCells(state.rows, state.cols, false);

  visibleTiles().forEach(([row, col]) => {
    state.cells[row][col] = value;
  });

  renderGridOnly();
}

function invertCells() {
  state.cells = state.cells.map((row, rowIndex) =>
    row.map((cell, colIndex) => (isVisibleTile(rowIndex, colIndex) ? !cell : false)),
  );
  renderGridOnly();
}

function setCell(row, col, value) {
  if (!isVisibleTile(row, col)) return;
  state.cells[row][col] = value;
}

function syncCellVisual(cell) {
  const row = Number.parseInt(cell.dataset.row, 10);
  const col = Number.parseInt(cell.dataset.col, 10);
  const active = state.cells[row][col];

  cell.classList.toggle("is-active", active);
  cell.setAttribute("fill", active ? state.activeColor : state.inactiveColor);
  cell.setAttribute("opacity", tileOpacity(row, col, active));
  cell.setAttribute("aria-pressed", String(active));
}

function applyPointerToCell(cell) {
  const row = Number.parseInt(cell.dataset.row, 10);
  const col = Number.parseInt(cell.dataset.col, 10);
  setCell(row, col, state.dragValue);
  syncCellVisual(cell);
}

function cellFromPointer(event) {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const cell = target?.closest(".cell");
  return cell && app.contains(cell) ? cell : null;
}

function Cell(row, col) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const layout = tileLayout(row, col);

  path.classList.add("cell");
  path.dataset.row = row;
  path.dataset.col = col;
  path.setAttribute("d", roundedTilePath(layout));
  path.setAttribute("role", "button");
  path.setAttribute("tabindex", "0");
  path.setAttribute("aria-label", `Ячейка ${row + 1}, ${col + 1}`);
  syncCellVisual(path);

  return path;
}

function GridEditor() {
  const workspace = document.createElement("section");
  const grid = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const fragment = document.createDocumentFragment();

  workspace.className = "workspace";
  workspace.setAttribute("aria-label", "Рабочая область");
  grid.id = "gridEditor";
  grid.classList.add("grid-editor");
  grid.setAttribute("viewBox", `${VIEWBOX_MIN} ${VIEWBOX_MIN} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`);
  grid.setAttribute("preserveAspectRatio", "xMidYMid meet");
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", "Регулярная сетка для рисования");

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      if (isVisibleTile(row, col)) fragment.append(Cell(row, col));
    }
  }

  grid.append(fragment);
  workspace.append(grid);

  grid.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell) return;

    event.preventDefault();
    state.isPointerDown = true;
    state.dragValue = state.mode === "erase" ? false : !cell.classList.contains("is-active");
    grid.setPointerCapture(event.pointerId);
    applyPointerToCell(cell);
  });

  grid.addEventListener("pointermove", (event) => {
    if (!state.isPointerDown) return;
    const cell = cellFromPointer(event);
    if (cell) applyPointerToCell(cell);
  });

  function finishDrawing(event) {
    state.isPointerDown = false;
    if (grid.hasPointerCapture(event.pointerId)) {
      grid.releasePointerCapture(event.pointerId);
    }
  }

  grid.addEventListener("pointerup", finishDrawing);
  grid.addEventListener("pointercancel", finishDrawing);

  return workspace;
}

function Field(labelText, input) {
  const label = document.createElement("label");
  const labelSpan = document.createElement("span");

  label.className = "field";
  labelSpan.textContent = labelText;
  label.append(labelSpan, input);

  return label;
}

function NumberInput(value, min, max, onChange) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = min;
  input.max = max;
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  return input;
}

function RangeInput(value, min, max, onInput) {
  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

function setVolume(value) {
  state.volume = clampNumber(value, 0, 180, state.volume);
  state.volumePreset = "custom";
  renderGridOnly();
}

function setVolumePreset(presetId) {
  state.volumePreset = presetId;
  state.volume = volumeForPreset(presetId);
  renderApp();
}

function ColorInput(value, onInput) {
  const input = document.createElement("input");
  input.type = "color";
  input.value = value;
  input.addEventListener("input", () => {
    onInput(input.value);
    setCssVariables();
    renderGridOnly();
  });
  return input;
}

function Button(text, onClick, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button${options.primary ? " button-primary" : ""}${options.full ? " button-full" : ""}`;
  button.textContent = text;
  button.addEventListener("click", onClick);
  if (options.selected) button.classList.add("is-selected");
  if (options.label) button.setAttribute("aria-label", options.label);
  return button;
}

function ControlPanel() {
  const panel = document.createElement("aside");
  const header = document.createElement("div");
  const kicker = document.createElement("p");
  const title = document.createElement("h1");
  const form = document.createElement("form");

  panel.className = "control-panel";
  panel.setAttribute("aria-label", "Панель управления");
  header.className = "panel-header";
  kicker.className = "panel-kicker";
  kicker.textContent = "Fill Box";
  title.textContent = "Сферическая мозаика";
  form.className = "settings-form";

  form.append(GridSettings(), TileSettings(), DrawingControls(), ExportButtons());
  form.addEventListener("submit", (event) => event.preventDefault());

  header.append(kicker, title);
  panel.append(header, form);
  return panel;
}

function GridSettings() {
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const presets = document.createElement("div");
  const fields = document.createElement("div");

  group.className = "control-group";
  legend.textContent = "Размер сетки";
  presets.className = "preset-row";
  fields.className = "field-row";

  GRID_PRESETS.forEach((size) => {
    presets.append(
      Button(`${size}×${size}`, () => resizeGrid(size, size), {
        selected: state.rows === size && state.cols === size,
      }),
    );
  });

  fields.append(
    Field(
      "Строки",
      NumberInput(state.rows, 2, 32, (value) => {
        resizeGrid(clampNumber(value, 2, 32, state.rows), state.cols);
      }),
    ),
    Field(
      "Столбцы",
      NumberInput(state.cols, 2, 32, (value) => {
        resizeGrid(state.rows, clampNumber(value, 2, 32, state.cols));
      }),
    ),
  );

  group.append(legend, presets, fields);
  return group;
}

function TileSettings() {
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const colorFields = document.createElement("div");
  const shapeFields = document.createElement("div");
  const volumePresets = document.createElement("div");

  group.className = "control-group";
  legend.textContent = "Плитки";
  colorFields.className = "field-row";
  shapeFields.className = "field-row";
  volumePresets.className = "volume-row";

  colorFields.append(
    Field(
      "Активный цвет",
      ColorInput(state.activeColor, (value) => {
        state.activeColor = value;
      }),
    ),
    Field(
      "Фон плитки",
      ColorInput(state.inactiveColor, (value) => {
        state.inactiveColor = value;
      }),
    ),
  );

  shapeFields.append(
    Field(
      "Отступ",
      NumberInput(Math.round(state.gap * 10), 4, 28, (value) => {
        state.gap = clampNumber(value, 4, 28, Math.round(state.gap * 10)) / 10;
        renderApp();
      }),
    ),
    Field(
      "Скругление",
      NumberInput(state.radius, 18, 42, (value) => {
        state.radius = clampNumber(value, 18, 42, state.radius);
        renderApp();
      }),
    ),
  );

  VOLUME_PRESETS.forEach((preset) => {
    volumePresets.append(
      Button(preset.label, () => setVolumePreset(preset.id), {
        selected: state.volumePreset === preset.id,
      }),
    );
  });

  group.append(
    legend,
    colorFields,
    shapeFields,
    Field(
      "Масштаб плиток",
      NumberInput(Math.round(state.tileScale * 100), 70, 130, (value) => {
        state.tileScale = clampNumber(value, 70, 130, Math.round(state.tileScale * 100)) / 100;
        renderApp();
      }),
    ),
    Field(
      "Объём",
      RangeInput(state.volume, 0, 180, (value) => {
        setVolume(value);
      }),
    ),
    volumePresets,
  );

  return group;
}

function DrawingControls() {
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const modes = document.createElement("div");

  group.className = "control-group";
  legend.textContent = "Рисование";
  modes.className = "mode-row";

  modes.append(
    Button(
      "Рисовать",
      () => {
        state.mode = "draw";
        renderApp();
      },
      { selected: state.mode === "draw" },
    ),
    Button(
      "Стирать",
      () => {
        state.mode = "erase";
        renderApp();
      },
      { selected: state.mode === "erase" },
    ),
  );

  group.append(
    legend,
    modes,
    Button("Очистить", () => setEveryCell(false), { full: true }),
    Button("Заполнить всё", () => setEveryCell(true), { full: true }),
    Button("Инвертировать", invertCells, { full: true }),
  );

  return group;
}

function ExportButtons() {
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const row = document.createElement("div");

  group.className = "control-group";
  legend.textContent = "Экспорт";
  row.className = "export-row";
  row.append(
    Button("PNG", exportPng, { primary: true, label: "Скачать PNG" }),
    Button("SVG", exportSvg, { label: "Скачать SVG" }),
  );
  group.append(legend, row);

  return group;
}

function visibleTiles() {
  const tiles = [];

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      if (isVisibleTile(row, col)) tiles.push([row, col]);
    }
  }

  return tiles;
}

function renderGridOnly() {
  const currentGrid = document.querySelector("#gridEditor");
  if (!currentGrid) {
    renderApp();
    return;
  }

  currentGrid.replaceWith(GridEditor().querySelector("#gridEditor"));
}

function renderApp() {
  setCssVariables();
  app.replaceChildren(GridEditor(), ControlPanel());
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointToward(from, to, distance) {
  const length = distanceBetween(from, to);
  if (length === 0) return { ...from };
  const ratio = Math.min(0.48, distance / length);

  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  };
}

function roundedTilePath(layout) {
  const points = [layout.p1, layout.p2, layout.p3, layout.p4];
  const corners = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const radius = Math.min(distanceBetween(point, previous), distanceBetween(point, next)) * (state.radius / 100);

    return {
      point,
      inPoint: pointToward(point, previous, radius),
      outPoint: pointToward(point, next, radius),
    };
  });

  return [
    `M ${corners[0].outPoint.x} ${corners[0].outPoint.y}`,
    `L ${corners[1].inPoint.x} ${corners[1].inPoint.y}`,
    `Q ${corners[1].point.x} ${corners[1].point.y} ${corners[1].outPoint.x} ${corners[1].outPoint.y}`,
    `L ${corners[2].inPoint.x} ${corners[2].inPoint.y}`,
    `Q ${corners[2].point.x} ${corners[2].point.y} ${corners[2].outPoint.x} ${corners[2].outPoint.y}`,
    `L ${corners[3].inPoint.x} ${corners[3].inPoint.y}`,
    `Q ${corners[3].point.x} ${corners[3].point.y} ${corners[3].outPoint.x} ${corners[3].outPoint.y}`,
    `L ${corners[0].inPoint.x} ${corners[0].inPoint.y}`,
    `Q ${corners[0].point.x} ${corners[0].point.y} ${corners[0].outPoint.x} ${corners[0].outPoint.y}`,
    "Z",
  ].join(" ");
}

function exportPng() {
  const canvasSize = 1600;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  ctx.fillStyle = "#fbfbfa";
  ctx.fillRect(0, 0, canvasSize, canvasSize);
  ctx.scale(canvasSize / VIEWBOX_SIZE, canvasSize / VIEWBOX_SIZE);
  ctx.translate(-VIEWBOX_MIN, -VIEWBOX_MIN);

  visibleTiles().forEach(([row, col]) => {
    const layout = tileLayout(row, col);
    const active = state.cells[row][col];

    ctx.globalAlpha = tileOpacity(row, col, active);
    ctx.fillStyle = active ? state.activeColor : state.inactiveColor;
    ctx.fill(new Path2D(roundedTilePath(layout)));
  });

  ctx.globalAlpha = 1;
  downloadFile(canvas.toDataURL("image/png"), `fill-box-${state.rows}x${state.cols}.png`);
}

function exportSvg() {
  const size = 1000;
  const cells = visibleTiles().map(([row, col]) => {
    const layout = tileLayout(row, col);
    const active = state.cells[row][col];
    const color = active ? state.activeColor : state.inactiveColor;
    const opacity = tileOpacity(row, col, active);

    return `<path d="${roundedTilePath(layout)}" fill="${color}" opacity="${opacity}"/>`;
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${VIEWBOX_MIN} ${VIEWBOX_MIN} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}">`,
    `<rect x="${VIEWBOX_MIN}" y="${VIEWBOX_MIN}" width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" fill="#fbfbfa"/>`,
    "<g>",
    cells.join(""),
    "</g>",
    "</svg>",
  ].join("");

  downloadFile(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, `fill-box-${state.rows}x${state.cols}.svg`);
}

function downloadFile(href, filename) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

renderApp();
