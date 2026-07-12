"use strict";

/* ===== Хранилище товаров (IndexedDB) ===== */
const DB_NAME = "scanner-app";
const STORE = "products";
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("exports")) {
        db.createObjectStore("exports", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function dbExportAdd(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("exports", "readwrite");
    tx.objectStore("exports").put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbExportGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("exports", "readonly");
    const req = tx.objectStore("exports").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbExportDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("exports", "readwrite");
    tx.objectStore("exports").delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbAdd(product) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(product);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetByBarcode(barcode) {
  const all = await dbGetAll();
  return all.find((p) => String(p.barcode) === String(barcode)) || null;
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/* ===== Вспомогательное ===== */
const $ = (sel) => document.querySelector(sel);
const urlCache = new Map();

function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (t.hidden = true), 2500);
}

function getPhotoUrl(blob) {
  if (!blob) return null;
  if (urlCache.has(blob)) return urlCache.get(blob);
  const url = URL.createObjectURL(blob);
  urlCache.set(blob, url);
  return url;
}

/* ===== Срок годности ===== */
function parseDate(str) {
  if (!str) return null;
  const d = new Date(str + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function addMonths(date, n) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + n);
  if (d.getDate() !== day) d.setDate(0);
  return d;
}

function computeExpiryTo(expiry) {
  if (!expiry || !expiry.mode) return null;
  if (expiry.mode === "range") return parseDate(expiry.to);
  if (expiry.mode === "duration") {
    const from = parseDate(expiry.from);
    if (!from || !expiry.durationValue) return null;
    return expiry.durationUnit === "months"
      ? addMonths(from, expiry.durationValue)
      : new Date(from.getTime() + expiry.durationValue * 86400000);
  }
  return null;
}

function daysLeft(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function expiryStatus(date) {
  const left = daysLeft(date);
  if (left === null) return null;
  if (left < 0) return "expired";
  if (left <= 7) return "soon";
  return "ok";
}

function formatDate(date) {
  return date ? date.toLocaleDateString("ru-RU") : "—";
}

/* ===== Вкладки ===== */
function switchTab(name) {
  document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = true));
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name)
  );
  $("#tab-" + name).hidden = false;
  if (name !== "add") stopScanner("add");
  if (name !== "find") {
    stopScanner("find");
    $("#find-message").hidden = true;
  }
  if (name === "products") renderProducts();
  if (name === "expiry") renderExpiry();
  if (name === "history") renderHistory();
  if (name === "backup") {
    $("#backup-message").hidden = true;
    $("#import-file").value = "";
  }
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

/* ===== Отрисовка списка товаров ===== */
async function renderProducts() {
  const list = $("#product-list");
  const empty = $("#empty-products");
  const query = $("#search").value.trim().toLowerCase();
  list.innerHTML = "";

  const products = (await dbGetAll()).sort((a, b) => a.name.localeCompare(b.name));
  const filtered = query
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          String(p.barcode).toLowerCase().includes(query)
      )
    : products;

  empty.hidden = filtered.length > 0;

  for (const p of filtered) {
    const card = document.createElement("div");
    card.className = "product-card";

    const img = document.createElement("img");
    const url = getPhotoUrl(p.photo);
    if (url) img.src = url;
    else img.remove();

    const body = document.createElement("div");
    body.className = "card-body";
    const name = document.createElement("p");
    name.className = "card-name";
    name.textContent = p.name;
    const barcode = document.createElement("p");
    barcode.className = "card-barcode";
    barcode.textContent = p.barcode;
    body.append(name, barcode);

    if (p.expiry && p.expiry.mode) {
      const to = computeExpiryTo(p.expiry);
      if (to) {
        const ex = document.createElement("p");
        ex.className = "card-expiry status-" + expiryStatus(to);
        const left = daysLeft(to);
        ex.textContent = left < 0 ? "просрочен" : "осталось " + left + " дн.";
        body.append(ex);
      }
    }

    const del = document.createElement("button");
    del.className = "card-del";
    del.textContent = "Удалить";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm(`Удалить «${p.name}»?`)) {
        await dbDelete(p.id);
        showToast("Товар удалён");
        renderProducts();
      }
    });

    card.append(img, body, del);
    card.addEventListener("click", () => openFormView(p.id));
    list.append(card);
  }
}

$("#search").addEventListener("input", renderProducts);

/* ===== Универсальный сканер ===== */
const scanners = {
  add: { reader: null, locked: false },
  find: { reader: null, locked: false },
};

async function startScanner(which) {
  const cfg = scanners[which];
  if (!window.ZXing) {
    showToast("Библиотека сканера не загрузилась (нужен интернет)");
    return;
  }
  cfg.locked = false;
  const video = $(`#${which}-video`);
  try {
    cfg.reader = new ZXing.BrowserMultiFormatReader();
    await cfg.reader.decodeFromVideoDevice(undefined, video, (result) => {
      if (result && !cfg.locked) {
        cfg.locked = true;
        const code = result.getText();
        stopScanner(which);
        if (which === "add") openFormAdd(code);
        else handleFind(code);
      }
    });
    $(`#btn-start-${which}`).hidden = true;
    $(`#btn-stop-${which}`).hidden = false;
  } catch (e) {
    console.error(e);
    showToast("Нет доступа к камере. Проверьте разрешения и HTTPS/localhost");
  }
}

function stopScanner(which) {
  const cfg = scanners[which];
  if (cfg.reader && typeof cfg.reader.stopAsync === "function") {
    cfg.reader.stopAsync().catch(() => {});
  }
  cfg.reader = null;
  const video = $(`#${which}-video`);
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
  const startBtn = $(`#btn-start-${which}`);
  const stopBtn = $(`#btn-stop-${which}`);
  if (startBtn) startBtn.hidden = false;
  if (stopBtn) stopBtn.hidden = true;
}

["add", "find"].forEach((which) => {
  $(`#btn-start-${which}`).addEventListener("click", () => startScanner(which));
  $(`#btn-stop-${which}`).addEventListener("click", () => stopScanner(which));
});

function wireManual(which, inputId, handler) {
  $(`#btn-${which}-manual`).addEventListener("click", () => {
    const code = $(`#${inputId}`).value.trim();
    if (!code) {
      showToast("Введите штрихкод");
      return;
    }
    stopScanner(which);
    handler(code);
  });
}
wireManual("add", "add-manual", openFormAdd);
wireManual("find", "find-manual", handleFind);

/* ===== Поиск товара по базе ===== */
async function handleFind(barcode) {
  const msg = $("#find-message");
  const product = await dbGetByBarcode(barcode);
  if (product) {
    msg.hidden = true;
    openFormView(product.id);
  } else {
    msg.hidden = false;
    msg.textContent = `Товар со штрихкодом ${barcode} не найден в базе.`;
  }
}

/* ===== Модальное окно товара ===== */
let currentProduct = null;
let formMode = "add"; // add | view | edit

function setFormMode(mode) {
  formMode = mode;
  const title = $("#form-title");
  const nameInput = $("#form-name");
  const photoInput = $("#form-photo");
  const photoField = $("#photo-field");
  const preview = $("#photo-preview");

  const viewActions = $(".view-actions");
  const editActions = $(".edit-actions");
  const editBtn = $("#btn-edit-form");
  const delBtn = $("#btn-delete-form");
  const saveBtn = $("#btn-save-form");

  if (mode === "add") {
    title.textContent = "Новый товар";
    nameInput.readOnly = false;
    photoInput.hidden = false;
    photoField.hidden = false;
    viewActions.hidden = true;
    editActions.hidden = false;
    saveBtn.hidden = false;
    $("#expiry-edit-fields").hidden = false;
    updateExpiryUI();
  } else if (mode === "view") {
    title.textContent = "Карточка товара";
    nameInput.readOnly = true;
    photoInput.hidden = true;
    photoField.hidden = false;
    viewActions.hidden = false;
    editActions.hidden = false;
    saveBtn.hidden = true;
    showExpirySummary();
  } else if (mode === "edit") {
    title.textContent = "Редактировать товар";
    nameInput.readOnly = false;
    photoInput.hidden = false;
    photoField.hidden = false;
    viewActions.hidden = true;
    editActions.hidden = false;
    saveBtn.hidden = false;
    $("#expiry-edit-fields").hidden = false;
    updateExpiryUI();
  }
  const form = $("#product-form");
  form.classList.toggle("mode-view", mode === "view");
  form.classList.toggle("mode-edit", mode === "edit" || mode === "add");
  $("#btn-scan-name").hidden = mode === "view";
}

function openFormAdd(barcode) {
  currentProduct = null;
  $("#form-barcode").value = barcode;
  $("#form-name").value = "";
  $("#photo-preview").innerHTML = "";
  $("#form-photo").value = "";
  $("#form-expiry-mode").value = "";
  $("#form-expiry-from").value = "";
  $("#form-expiry-to").value = "";
  $("#form-expiry-duration").value = "";
  $("#form-expiry-unit").value = "days";
  setFormMode("add");
  $("#form-overlay").hidden = false;
  $("#form-name").focus();
  showToast("Штрихкод: " + barcode);
}

async function openFormView(id) {
  const all = await dbGetAll();
  currentProduct = all.find((p) => p.id === id) || null;
  if (!currentProduct) return;
  $("#form-barcode").value = currentProduct.barcode;
  $("#form-name").value = currentProduct.name;
  const preview = $("#photo-preview");
  preview.innerHTML = "";
  const url = getPhotoUrl(currentProduct.photo);
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    preview.append(img);
  }
  $("#form-photo").value = "";
  const ex = currentProduct.expiry || null;
  $("#form-expiry-mode").value = ex && ex.mode ? ex.mode : "";
  $("#form-expiry-from").value = ex && ex.from ? ex.from : "";
  $("#form-expiry-to").value = ex && ex.mode === "range" && ex.to ? ex.to : "";
  $("#form-expiry-duration").value =
    ex && ex.mode === "duration" && ex.durationValue ? ex.durationValue : "";
  $("#form-expiry-unit").value = ex && ex.durationUnit ? ex.durationUnit : "days";
  setFormMode("view");
  $("#form-overlay").hidden = false;
}

function closeModal() {
  $("#form-overlay").hidden = true;
  currentProduct = null;
}

function updateExpiryUI() {
  const mode = $("#form-expiry-mode").value;
  const editFields = $("#expiry-edit-fields");
  const toField = $("#expiry-to-field");
  const durField = $("#expiry-duration-field");
  const preview = $("#expiry-preview");
  if (!mode) {
    editFields.hidden = true;
    preview.textContent = "";
    return;
  }
  editFields.hidden = false;
  toField.hidden = mode !== "range";
  durField.hidden = mode !== "duration";
  const from = parseDate($("#form-expiry-from").value);
  let to = null;
  let text = "";
  if (mode === "range") {
    to = parseDate($("#form-expiry-to").value);
    text = `Годен: ${formatDate(from)} — ${formatDate(to)}`;
  } else {
    const val = parseInt($("#form-expiry-duration").value, 10);
    const unit = $("#form-expiry-unit").value;
    if (val > 0 && from) {
      to = computeExpiryTo({
        mode,
        from: $("#form-expiry-from").value,
        durationValue: val,
        durationUnit: unit,
      });
      const u = unit === "months" ? "мес." : "дн.";
      text = `С ${formatDate(from)} + ${val} ${u} → до ${formatDate(to)}`;
    } else {
      text = "Укажите дату начала и срок.";
    }
  }
  if (to) {
    const left = daysLeft(to);
    text += `  (осталось ${left} дн.)`;
  }
  preview.textContent = text;
}

function showExpirySummary() {
  const ex = currentProduct && currentProduct.expiry;
  $("#expiry-edit-fields").hidden = true;
  const preview = $("#expiry-preview");
  if (ex && ex.mode) {
    const to = computeExpiryTo(ex);
    const left = daysLeft(to);
    const status =
      expiryStatus(to) === "expired"
        ? "просрочен"
        : expiryStatus(to) === "soon"
        ? "скоро истекает"
        : "в порядке";
    preview.textContent = `Годен до ${formatDate(to)} — ${status} (осталось ${left} дн.)`;
  } else {
    preview.textContent = "Срок годности не указан.";
  }
}

function readExpiryFromForm() {
  const mode = $("#form-expiry-mode").value;
  if (!mode) return null;
  const ex = { mode };
  ex.from = $("#form-expiry-from").value || null;
  if (mode === "range") {
    ex.to = $("#form-expiry-to").value || null;
  } else {
    ex.durationValue = parseInt($("#form-expiry-duration").value, 10) || null;
    ex.durationUnit = $("#form-expiry-unit").value;
  }
  return ex;
}

["form-expiry-mode", "form-expiry-from", "form-expiry-to", "form-expiry-duration", "form-expiry-unit"].forEach(
  (id) => {
    const el = $("#" + id);
    el.addEventListener("input", updateExpiryUI);
    el.addEventListener("change", updateExpiryUI);
  }
);

$("#btn-edit-form").addEventListener("click", () => {
  if (formMode === "view") {
    setFormMode("edit");
    showToast("Редактирование включено");
  }
  $("#form-name").focus();
});

$("#btn-cancel-form").addEventListener("click", closeModal);

$("#btn-delete-form").addEventListener("click", async () => {
  if (!currentProduct) return;
  if (confirm(`Удалить «${currentProduct.name}»?`)) {
    await dbDelete(currentProduct.id);
    closeModal();
    showToast("Товар удалён");
    renderProducts();
    renderExpiry();
  }
});

$("#form-photo").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  const preview = $("#photo-preview");
  preview.innerHTML = "";
  if (!file) return;
  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);
  preview.append(img);
});

$("#product-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const barcode = $("#form-barcode").value.trim();
  const name = $("#form-name").value.trim();
  if (!name) {
    showToast("Укажите название товара");
    return;
  }
  const file = $("#form-photo").files && $("#form-photo").files[0];

  if (formMode === "add") {
    const product = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      barcode,
      name,
      photo: file || null,
      expiry: readExpiryFromForm(),
      createdAt: Date.now(),
    };
    await dbAdd(product);
    showToast("Товар сохранён");
  } else if (formMode === "edit" && currentProduct) {
    currentProduct.name = name;
    if (file) currentProduct.photo = file;
    currentProduct.expiry = readExpiryFromForm();
    await dbAdd(currentProduct);
    showToast("Изменения сохранены");
  }

  closeModal();
  switchTab("products");
});

/* ===== Распознавание названия (OCR) ===== */
let nameStream = null;

async function openNameCapture() {
  const overlay = $("#name-capture-overlay");
  overlay.hidden = false;
  try {
    nameStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    const video = $("#name-video");
    video.srcObject = nameStream;
    await video.play();
  } catch (e) {
    console.error(e);
    showToast("Нет доступа к камере");
    closeNameCapture();
  }
}

function closeNameCapture() {
  if (nameStream) {
    nameStream.getTracks().forEach((t) => t.stop());
    nameStream = null;
  }
  const video = $("#name-video");
  if (video) video.srcObject = null;
  $("#name-capture-overlay").hidden = true;
  $("#capture-status").hidden = true;
}

/* Предобработка: оттенки серого -> лёгкое размытие -> адаптивная
   (локальная) бинаризация -> увеличение.
   Глобальный порог (Отсу) плохо работает на фото с тенями и перепадами
   яркости, поэтому используем локальный порог по окрестности каждого пикселя. */
function boxBlurGray(gray, w, h, r) {
  const iw = w + 1;
  const integral = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)] + rowSum;
    }
  }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * iw + (x1 + 1)] -
        integral[(y1 + 1) * iw + x0] -
        integral[y0 * iw + (x1 + 1)] +
        integral[y0 * iw + x0];
      out[y * w + x] = sum / area;
    }
  }
  return out;
}

function preprocess(srcCanvas) {
  const scale = 3;
  const w = Math.min(srcCanvas.width * scale, 2400);
  const h = Math.round((srcCanvas.height * w) / srcCanvas.width);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(srcCanvas, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;
  const gray = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    gray[i] = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
  }
  const r = Math.max(4, Math.floor(Math.min(w, h) / 32));
  const local = boxBlurGray(gray, w, h, r);
  const C = 14; // запас для тёмного текста на светлом фоне
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const v = gray[i] < local[i] - C ? 0 : 255;
    d[o] = d[o + 1] = d[o + 2] = v;
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Мягкий фильтр допустимых символов для пост-обработки (не блокирует вывод
// движка, а лишь отсекает заведомо лишние знаки при выборе строки).
const OCR_ALLOWED = /[A-Za-zА-Яа-яЁё0-9]/;

function pickProductName(data) {
  let lines = [];
  if (data.lines && data.lines.length) {
    lines = data.lines.map((l) => (typeof l === "string" ? { text: l, conf: 0 } : l));
  } else {
    lines = (data.text || "").split("\n").map((t) => ({ text: t, conf: 0 }));
  }
  lines = lines
    .map((l) => ({ text: String(l.text || "").trim(), conf: l.conf || 0 }))
    .filter((l) => l.text.length >= 2)
    .map((l) => ({ ...l, hasLetters: /[A-Za-zА-Яа-яЁё]/.test(l.text) }));

  if (!lines.length) return { text: "", conf: 0 };
  const pool = lines.filter((l) => l.hasLetters).length
    ? lines.filter((l) => l.hasLetters)
    : lines;
  // лучшее по уверенности, при равенстве — по длине
  pool.sort((a, b) => b.conf - a.conf || b.text.length - a.text.length);
  return { text: pool[0].text, conf: pool[0].conf };
}

async function createOCRWorker() {
  return Tesseract.createWorker("rus", 1);
}

async function recognizePSM(worker, canvas) {
  return worker.recognize(canvas);
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function captureNameShot() {
  const video = $("#name-video");
  if (!video.videoWidth) {
    showToast("Камера ещё не готова");
    return;
  }
  const status = $("#capture-status");
  status.hidden = false;
  status.textContent = "Съёмка нескольких кадров…";

  // Снимаем 3 кадра с небольшим интервалом, пока камера жива
  const frames = [];
  for (let i = 0; i < 3; i++) {
    const raw = document.createElement("canvas");
    raw.width = video.videoWidth;
    raw.height = video.videoHeight;
    raw.getContext("2d").drawImage(video, 0, 0);
    frames.push(preprocess(raw));
    if (i < 2) await delay(250);
  }

  if (nameStream) {
    nameStream.getTracks().forEach((t) => t.stop());
    nameStream = null;
  }
  video.srcObject = null;
  $("#name-capture-overlay").hidden = true;

  status.textContent = "Распознавание текста…";

  try {
    if (!window.Tesseract) {
      showToast("Библиотека OCR не загрузилась (нужен интернет)");
      status.hidden = true;
      return;
    }
    const worker = await createOCRWorker();
    let best = { text: "", conf: -1, frame: null };
    let rawBest = "";

    // Несколько кадров подряд — берём лучший по уверенности распознавания
    for (const f of frames) {
      const data = await recognizePSM(worker, f);
      const cand = pickProductName(data);
      const conf = Math.max(data.confidence || 0, cand.conf || 0);
      if (cand.text && conf > best.conf) best = { text: cand.text, conf, frame: f };
      const raw = (data.text || "").replace(/\s+/g, " ").trim();
      if (raw && raw.length > rawBest.length) rawBest = raw;
    }

    await worker.terminate();

    if (best.text) {
      $("#form-name").value = best.text;
      showToast("Название считано");
    } else if (rawBest) {
      showToast("Распознано: «" + rawBest.slice(0, 40) + "» — проверьте");
      $("#form-name").value = rawBest;
    } else {
      showToast("Текст не распознан — введите вручную");
    }
  } catch (e) {
    console.error(e);
    showToast("Ошибка распознавания");
  }
  status.hidden = true;
}

$("#btn-scan-name").addEventListener("click", openNameCapture);
$("#btn-capture-shot").addEventListener("click", captureNameShot);
$("#btn-capture-cancel").addEventListener("click", closeNameCapture);

/* ===== Вкладка «Сроки годности» ===== */
async function renderExpiry() {
  const list = $("#expiry-list");
  const empty = $("#empty-expiry");
  list.innerHTML = "";
  const products = await dbGetAll();
  const items = [];
  for (const p of products) {
    if (!p.expiry || !p.expiry.mode) continue;
    const to = computeExpiryTo(p.expiry);
    if (!to) continue;
    items.push({ p, to, left: daysLeft(to), status: expiryStatus(to) });
  }
  items.sort((a, b) => a.to - b.to);
  empty.hidden = items.length > 0;

  for (const it of items) {
    const row = document.createElement("div");
    row.className = "expiry-row status-" + it.status;

    const info = document.createElement("div");
    info.className = "expiry-info";
    const name = document.createElement("p");
    name.className = "expiry-name";
    name.textContent = it.p.name;
    const sub = document.createElement("p");
    sub.className = "expiry-sub";
    const fromStr = formatDate(parseDate(it.p.expiry.from));
    if (it.p.expiry.mode === "range") {
      sub.textContent = `с ${fromStr} по ${formatDate(it.to)}`;
    } else {
      const u = it.p.expiry.durationUnit === "months" ? "мес." : "дн.";
      sub.textContent = `с ${fromStr} + ${it.p.expiry.durationValue} ${u} → ${formatDate(it.to)}`;
    }
    info.append(name, sub);

    const badge = document.createElement("div");
    badge.className = "expiry-badge";
    badge.textContent =
      it.left < 0 ? `просрочен на ${Math.abs(it.left)} дн.` : `осталось ${it.left} дн.`;

    row.append(info, badge);
    row.addEventListener("click", () => openFormView(it.p.id));
    list.append(row);
  }
}

/* ===== Выгрузка / Загрузка данных ===== */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return resolve(null);
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function dataURLToBlob(dataURL) {
  if (!dataURL || typeof dataURL !== "string" || !dataURL.startsWith("data:")) return null;
  const [meta, b64] = dataURL.split(",");
  const mime = (meta.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function exportData() {
  const products = await dbGetAll();
  for (const p of products) {
    p.photo = await blobToDataURL(p.photo);
  }
  const payload = {
    app: "scanner-app",
    version: 1,
    exportedAt: new Date().toISOString(),
    products,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const filename = `товары_${todayStr()}.json`;
  await dbExportAdd({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    createdAt: Date.now(),
    filename,
    blob,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Отчёт выгружен");
  if (!$("#tab-history").hidden) renderHistory();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareExport(record) {
  const file = new File([record.blob], record.filename, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "Отчёт по товарам",
        text: "Выгрузка товаров из приложения",
      });
    } catch (e) {
      /* пользователь отменил — ничего не делаем */
    }
  } else if (navigator.share) {
    try {
      await navigator.share({ title: "Отчёт по товарам", text: "Выгрузка товаров из приложения" });
    } catch (e) {
      downloadBlob(record.blob, record.filename);
      showToast("Поделиться недоступно — скачано");
    }
  } else {
    downloadBlob(record.blob, record.filename);
    showToast("Поделиться недоступно — скачано");
  }
}

async function renderHistory() {
  const list = $("#history-list");
  list.innerHTML = "";
  const items = (await dbExportGetAll()).sort((a, b) => b.createdAt - a.createdAt);
  $("#empty-history").hidden = items.length > 0;
  for (const it of items) {
    const row = document.createElement("div");
    row.className = "history-row";

    const info = document.createElement("div");
    info.className = "history-info";
    const name = document.createElement("p");
    name.className = "history-name";
    name.textContent = it.filename;
    const sub = document.createElement("p");
    sub.className = "history-sub";
    sub.textContent = new Date(it.createdAt).toLocaleString("ru-RU");
    info.append(name, sub);

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const shareBtn = document.createElement("button");
    shareBtn.className = "btn btn-primary";
    shareBtn.textContent = "Поделиться";
    shareBtn.addEventListener("click", () => shareExport(it));

    const dlBtn = document.createElement("button");
    dlBtn.className = "btn";
    dlBtn.textContent = "Скачать";
    dlBtn.addEventListener("click", () => downloadBlob(it.blob, it.filename));

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-danger";
    delBtn.textContent = "Удалить";
    delBtn.addEventListener("click", async () => {
      await dbExportDelete(it.id);
      renderHistory();
    });

    actions.append(shareBtn, dlBtn, delBtn);
    row.append(info, actions);
    list.append(row);
  }
}

async function importData(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    showToast("Файл повреждён или не JSON");
    return;
  }
  const list = Array.isArray(payload) ? payload : payload.products;
  if (!Array.isArray(list)) {
    showToast("Нет данных для загрузки");
    return;
  }
  let count = 0;
  for (const p of list) {
    if (!p || !p.id) continue;
    if (p.photo && typeof p.photo === "string") {
      p.photo = dataURLToBlob(p.photo);
    }
    await dbAdd(p);
    count++;
  }
  showToast(`Загружено товаров: ${count}`);
  renderProducts();
  renderExpiry();
}

$("#btn-export").addEventListener("click", exportData);
$("#btn-import").addEventListener("click", () => $("#import-file").click());
$("#import-file").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) importData(f);
  e.target.value = "";
});

/* ===== Старт ===== */
renderProducts();
