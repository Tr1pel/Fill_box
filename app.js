const GRID_PRESETS = [2, 4, 8, 12, 16];
const DEFAULT_SIZE = 16;

const app = document.querySelector("#app");

const state = {
  rows: DEFAULT_SIZE,
  cols: DEFAULT_SIZE,
  tileScale: 1,
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
    [0, 1],
    [0, 4],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 8],
    [2, 3],
    [2, 4],
    [2, 7],
    [3, 4],
    [3, 7],
    [3, 8],
    [4, 1],
    [4, 2],
    [4, 4],
    [4, 5],
    [4, 9],
    [5, 0],
    [5, 2],
    [5, 3],
    [5, 4],
    [6, 3],
    [6, 4],
    [7, 4],
    [7, 5],
    [8, 3],
    [8, 4],
    [8, 5],
  ];

  referenceTiles.forEach(([refRow, refCol]) => {
    const row = Math.round((refRow / 9) * (rows - 1));
    const col = Math.round((refCol / 9) * (cols - 1));
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

function isVisibleTile(row, col, rows = state.rows, cols = state.cols) {
  if (rows <= 4 || cols <= 4) return true;
  return distanceFromCenter(row, col, rows, cols) <= 1.33;
}

function edgeScaleFor(distance) {
  return Math.max(0.86, 1 - Math.max(0, distance - 0.58) * 0.1);
}

function tileOpacity(row, col, active) {
  if (active) return 1;

  const distance = distanceFromCenter(row, col);
  return Math.max(0.42, 1 - Math.max(0, distance - 0.62) * 1.12);
}

function tileLayout(row, col) {
  const padding = 7;
  const horizontalSlot = (100 - padding * 2) / state.cols;
  const verticalSlot = (100 - padding * 2) / state.rows;
  const slot = Math.min(horizontalSlot, verticalSlot);
  const offsetX = (100 - slot * state.cols) / 2;
  const offsetY = (100 - slot * state.rows) / 2;
  const baseLeft = offsetX + col * slot;
  const baseTop = offsetY + row * slot;
  const distance = distanceFromCenter(row, col);
  const scale = edgeScaleFor(distance);
  const size = Math.max(0, (slot - state.gap) * scale * state.tileScale);
  const left = baseLeft + (slot - size) / 2;
  const top = baseTop + (slot - size) / 2;

  return {
    left,
    top,
    width: size,
    height: size,
    rotate: 0,
  };
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
  cell.style.opacity = tileOpacity(row, col, active);
  cell.setAttribute("aria-pressed", String(active));
}

function applyPointerToCell(cell) {
  const row = Number.parseInt(cell.dataset.row, 10);
  const col = Number.parseInt(cell.dataset.col, 10);
  setCell(row, col, state.dragValue);
  syncCellVisual(cell);
  updateStatusLine();
}

function cellFromPointer(event) {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const cell = target?.closest(".cell");
  return cell && app.contains(cell) ? cell : null;
}

function Cell(row, col) {
  const button = document.createElement("button");
  const layout = tileLayout(row, col);

  button.type = "button";
  button.className = "cell";
  button.dataset.row = row;
  button.dataset.col = col;
  button.style.left = `${layout.left}%`;
  button.style.top = `${layout.top}%`;
  button.style.width = `${layout.width}%`;
  button.style.height = `${layout.height}%`;
  button.style.borderRadius = `${state.radius}%`;
  button.setAttribute("aria-label", `Ячейка ${row + 1}, ${col + 1}`);
  syncCellVisual(button);

  return button;
}

function GridEditor() {
  const workspace = document.createElement("section");
  const grid = document.createElement("div");
  const fragment = document.createDocumentFragment();

  workspace.className = "workspace";
  workspace.setAttribute("aria-label", "Рабочая область");
  grid.id = "gridEditor";
  grid.className = "grid-editor";
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

function ColorInput(value, onInput) {
  const input = document.createElement("input");
  input.type = "color";
  input.value = value;
  input.addEventListener("input", () => {
    onInput(input.value);
    setCssVariables();
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

  group.className = "control-group";
  legend.textContent = "Плитки";
  colorFields.className = "field-row";
  shapeFields.className = "field-row";

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
  );

  return group;
}

function DrawingControls() {
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const modes = document.createElement("div");
  const status = document.createElement("p");

  group.className = "control-group";
  legend.textContent = "Рисование";
  modes.className = "mode-row";
  status.className = "status-line";
  status.textContent = statusText();

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
    status,
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

function countActiveCells() {
  return visibleTiles().filter(([row, col]) => state.cells[row][col]).length;
}

function statusText() {
  return `${state.rows}×${state.cols}, видимых плиток: ${visibleTiles().length}, активных: ${countActiveCells()}`;
}

function updateStatusLine() {
  const status = document.querySelector(".status-line");
  if (status) status.textContent = statusText();
}

function renderGridOnly() {
  const currentGrid = document.querySelector("#gridEditor");
  if (!currentGrid) {
    renderApp();
    return;
  }

  currentGrid.replaceWith(GridEditor().querySelector("#gridEditor"));
  updateStatusLine();
}

function renderApp() {
  setCssVariables();
  app.replaceChildren(GridEditor(), ControlPanel());
}

function roundedRectPath(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  return [
    `M ${x + r} ${y}`,
    `H ${x + width - r}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `V ${y + height - r}`,
    `Q ${x + width} ${y + height} ${x + width - r} ${y + height}`,
    `H ${x + r}`,
    `Q ${x} ${y + height} ${x} ${y + height - r}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
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

  visibleTiles().forEach(([row, col]) => {
    const layout = tileLayout(row, col);
    const x = (layout.left / 100) * canvasSize;
    const y = (layout.top / 100) * canvasSize;
    const width = (layout.width / 100) * canvasSize;
    const height = (layout.height / 100) * canvasSize;
    const active = state.cells[row][col];

    ctx.globalAlpha = tileOpacity(row, col, active);
    ctx.fillStyle = active ? state.activeColor : state.inactiveColor;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, Math.min(width, height) * (state.radius / 100));
    ctx.fill();
  });

  ctx.globalAlpha = 1;
  downloadFile(canvas.toDataURL("image/png"), `fill-box-${state.rows}x${state.cols}.png`);
}

function exportSvg() {
  const size = 1000;
  const cells = visibleTiles().map(([row, col]) => {
    const layout = tileLayout(row, col);
    const x = (layout.left / 100) * size;
    const y = (layout.top / 100) * size;
    const width = (layout.width / 100) * size;
    const height = (layout.height / 100) * size;
    const radius = Math.min(width, height) * (state.radius / 100);
    const active = state.cells[row][col];
    const color = active ? state.activeColor : state.inactiveColor;
    const opacity = tileOpacity(row, col, active);

    return `<path d="${roundedRectPath(x, y, width, height, radius)}" fill="${color}" opacity="${opacity}"/>`;
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<rect width="100%" height="100%" fill="#fbfbfa"/>`,
    cells.join(""),
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
