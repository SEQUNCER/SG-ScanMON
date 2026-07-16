"use strict";

/* ===== Хранилище товаров (IndexedDB) ===== */
const DB_NAME = "scanner-app";
const STORE = "products";
const SUPPLIERS_STORE = "suppliers";
const RECEIVING_STORE = "receiving";
const WRITEOFFS_STORE = "writeoffs";
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SUPPLIERS_STORE)) {
        db.createObjectStore(SUPPLIERS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(RECEIVING_STORE)) {
        db.createObjectStore(RECEIVING_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(WRITEOFFS_STORE)) {
        db.createObjectStore(WRITEOFFS_STORE, { keyPath: "id" });
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

/* ===== Поставщики ===== */
async function dbSupplierAdd(supplier) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SUPPLIERS_STORE, "readwrite");
    tx.objectStore(SUPPLIERS_STORE).put(supplier);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbSupplierGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SUPPLIERS_STORE, "readonly");
    const req = tx.objectStore(SUPPLIERS_STORE).getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => a.name.localeCompare(b.name)));
    req.onerror = () => reject(req.error);
  });
}

async function dbSupplierDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SUPPLIERS_STORE, "readwrite");
    tx.objectStore(SUPPLIERS_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/* ===== Приёмка ===== */
async function dbReceivingAdd(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECEIVING_STORE, "readwrite");
    tx.objectStore(RECEIVING_STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbReceivingGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECEIVING_STORE, "readonly");
    const req = tx.objectStore(RECEIVING_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/* ===== Списания ===== */
async function dbWriteoffAdd(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WRITEOFFS_STORE, "readwrite");
    tx.objectStore(WRITEOFFS_STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbWriteoffGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WRITEOFFS_STORE, "readonly");
    const req = tx.objectStore(WRITEOFFS_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
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
  if (name !== "accounting") {
    stopReceivingScanner();
    stopWriteoffScanner();
  }
  if (name === "products") renderProducts();
  if (name === "expiry") renderExpiry();
  if (name === "history") renderHistory();
  if (name === "backup") {
    $("#backup-message").hidden = true;
    $("#import-file").value = "";
  }
  if (name === "accounting") switchSubtab("receiving");
}

function switchSubtab(name) {
  document.querySelectorAll(".subtab-panel").forEach((p) => (p.hidden = true));
  document.querySelectorAll(".subtab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.subtab === name)
  );
  const el = $("#subtab-" + name);
  if (el) el.hidden = false;
  if (name === "goods") renderGoodsAccounting();
}

async function renderGoodsAccounting() {
  const tbody = $("#goods-table-body");
  const empty = $("#empty-goods");
  if (!tbody) return;
  tbody.innerHTML = "";
  const receiving = await dbReceivingGetAll();
  const writeoffs = await dbWriteoffGetAll();
  const suppliers = await dbSupplierGetAll();
  const products = await dbGetAll();
  const supplierMap = {};
  for (const s of suppliers) supplierMap[s.id] = s.name;
  const productMap = {};
  for (const p of products) productMap[p.barcode] = p;
  const rows = [];
  for (const r of receiving) {
    const product = productMap[r.barcode];
    rows.push({
      productName: r.productName,
      barcode: r.barcode,
      quantity: r.quantity,
      type: "Приёмка",
      supplier: supplierMap[r.supplierId] || "—",
      date: r.date,
      purchasePrice: product ? product.purchasePrice : null,
      sellingPrice: product ? product.sellingPrice : null,
    });
  }
  for (const w of writeoffs) {
    const product = productMap[w.barcode];
    rows.push({
      productName: w.productName,
      barcode: w.barcode,
      quantity: -w.quantity,
      type: w.type === "defect" ? "Брак" : "Просрок",
      supplier: "—",
      date: w.date,
      purchasePrice: product ? product.purchasePrice : null,
      sellingPrice: product ? product.sellingPrice : null,
    });
  }
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!rows.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const r of rows) {
    const tr = document.createElement("tr");
    const dateStr = r.date ? new Date(r.date).toLocaleString("ru-RU") : "—";
    const purchasePriceStr = r.purchasePrice != null ? r.purchasePrice.toFixed(2) : "—";
    const sellingPriceStr = r.sellingPrice != null ? r.sellingPrice.toFixed(2) : "—";
    tr.innerHTML = `<td>${escapeHtml(r.productName || "")}</td><td>${escapeHtml(r.barcode || "")}</td><td>${r.quantity}</td><td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.supplier)}</td><td>${dateStr}</td><td>${purchasePriceStr}</td><td>${sellingPriceStr}</td>`;
    tbody.append(tr);
  }
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

document.querySelectorAll(".subtab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchSubtab(btn.dataset.subtab));
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

/* ===== Универсальный сканер (ZXing) ===== */
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
  releaseAllVideoTracks();
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
    const msg =
      (e && e.name) === "NotAllowedError"
        ? "Нет доступа к камере. Разрешите доступ в настройках браузера."
        : (e && e.name) === "NotFoundError"
        ? "Камера не найдена."
        : "Не удалось запустить сканер. Проверьте камеру и разрешения.";
    showToast(msg);
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

function releaseAllVideoTracks() {
  ["add-video", "find-video", "receiving-video"].forEach((id) => {
    const video = $("#" + id);
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  });
}

["add", "find"].forEach((which) => {
  $(`#btn-start-${which}`).addEventListener("click", () => startScanner(which));
  $(`#btn-stop-${which}`).addEventListener("click", () => stopScanner(which));
});

$("#btn-start-receiving-scan").addEventListener("click", startReceivingScanner);
$("#btn-stop-receiving-scan").addEventListener("click", stopReceivingScanner);

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
let formMode = "add";

function setFormMode(mode) {
  formMode = mode;
  const title = $("#form-title");
  const nameInput = $("#form-name");
  const quantityInput = $("#form-quantity");
  const purchasePriceInput = $("#form-purchase-price");
  const sellingPriceInput = $("#form-selling-price");
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
    quantityInput.readOnly = false;
    purchasePriceInput.readOnly = false;
    sellingPriceInput.readOnly = false;
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
    quantityInput.readOnly = true;
    purchasePriceInput.readOnly = true;
    sellingPriceInput.readOnly = true;
    photoInput.hidden = true;
    photoField.hidden = false;
    viewActions.hidden = false;
    editActions.hidden = false;
    saveBtn.hidden = true;
    showExpirySummary();
  } else if (mode === "edit") {
    title.textContent = "Редактировать товар";
    nameInput.readOnly = false;
    quantityInput.readOnly = false;
    purchasePriceInput.readOnly = false;
    sellingPriceInput.readOnly = false;
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
}

function openFormAdd(barcode) {
  currentProduct = null;
  $("#form-barcode").value = barcode;
  $("#form-name").value = "";
  $("#form-quantity").value = "0";
  $("#form-purchase-price").value = "";
  $("#form-selling-price").value = "";
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
  $("#form-quantity").value = String(currentProduct.quantity || 0);
  $("#form-purchase-price").value = currentProduct.purchasePrice != null ? String(currentProduct.purchasePrice) : "";
  $("#form-selling-price").value = currentProduct.sellingPrice != null ? String(currentProduct.sellingPrice) : "";
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

function updateReceivingExpiryUI() {
  const mode = $("#receiving-form-expiry-mode").value;
  const editFields = $("#receiving-expiry-edit-fields");
  const toField = $("#receiving-expiry-to-field");
  const durField = $("#receiving-expiry-duration-field");
  const preview = $("#receiving-expiry-preview");
  if (!mode) {
    editFields.hidden = true;
    preview.textContent = "";
    return;
  }
  editFields.hidden = false;
  toField.hidden = mode !== "range";
  durField.hidden = mode !== "duration";
  const from = parseDate($("#receiving-form-expiry-from").value);
  let to = null;
  let text = "";
  if (mode === "range") {
    to = parseDate($("#receiving-form-expiry-to").value);
    text = `Годен: ${formatDate(from)} — ${formatDate(to)}`;
  } else {
    const val = parseInt($("#receiving-form-expiry-duration").value, 10);
    const unit = $("#receiving-form-expiry-unit").value;
    if (val > 0 && from) {
      to = computeExpiryTo({
        mode,
        from: $("#receiving-form-expiry-from").value,
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

function readReceivingExpiryFromForm() {
  const mode = $("#receiving-form-expiry-mode").value;
  if (!mode) return null;
  const from = $("#receiving-form-expiry-from").value;
  const to = $("#receiving-form-expiry-to").value;
  const durationValue = $("#receiving-form-expiry-duration").value;
  const durationUnit = $("#receiving-form-expiry-unit").value;
  return {
    mode,
    from: from || null,
    to: to || null,
    durationValue: durationValue ? parseInt(durationValue, 10) : null,
    durationUnit: durationUnit || "days",
  };
}

["receiving-form-expiry-mode", "receiving-form-expiry-from", "receiving-form-expiry-to", "receiving-form-expiry-duration", "receiving-form-expiry-unit"].forEach(
  (id) => {
    const el = $("#" + id);
    el.addEventListener("input", updateReceivingExpiryUI);
    el.addEventListener("change", updateReceivingExpiryUI);
  }
);

$("#btn-cancel-receiving-product").addEventListener("click", closeReceivingModal);

function closeReceivingModal() {
  $("#receiving-area").hidden = true;
  $("#btn-start-receiving").hidden = false;
  $("#receiving-step-supplier").hidden = false;
  $("#receiving-step-scan").hidden = true;
  $("#receiving-step-product").hidden = true;
  $("#receiving-product-overlay").hidden = true;
  $("#btn-receiving-cancel").hidden = true;
  $("#receiving-manual").value = "";
  receivingBarcode = null;
  receivingProduct = null;
  receivingSupplier = null;
  stopReceivingScanner();
}

$("#btn-receiving-cancel").addEventListener("click", closeReceivingModal);

$("#btn-start-receiving").addEventListener("click", async () => {
  await refreshReceivingSuppliers();
  $("#btn-start-receiving").hidden = true;
  $("#receiving-area").hidden = false;
});

$("#receiving-form-photo").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  const preview = $("#receiving-photo-preview");
  preview.innerHTML = "";
  if (!file) return;
  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);
  preview.append(img);
});


/* ===== Вкладка «Сроки годности» ===== */

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

async function renderExpiry() {
  const list = $("#expiry-list");
  const empty = $("#empty-expiry");
  list.innerHTML = "";
  const products = await dbGetAll();
  const items = [];
  for (const p of products) {
    if (!p.expiry || !p.expiry.mode) continue;
    const to = computeExpiryTo(p.expiry);
    const left = to ? daysLeft(to) : null;
    const status = to ? expiryStatus(to) : null;
    items.push({ p, to, left, status });
  }
  items.sort((a, b) => {
    if (!a.to && !b.to) return 0;
    if (!a.to) return 1;
    if (!b.to) return -1;
    return a.to - b.to;
  });
  empty.hidden = items.length > 0;

  for (const it of items) {
    const row = document.createElement("div");
    row.className = "expiry-row status-" + (it.status || "ok");

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
    if (it.status === "expired") {
      badge.textContent = `просрочен на ${Math.abs(it.left)} дн.`;
    } else if (it.status === "soon") {
      badge.textContent = `осталось ${it.left} дн.`;
    } else if (it.status === "ok") {
      badge.textContent = `осталось ${it.left} дн.`;
    } else {
      badge.textContent = "срок не определен";
    }

    row.append(info, badge);
    row.addEventListener("click", () => openFormView(it.p.id));
    list.append(row);
  }
}

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
  const quantity = Math.max(0, parseInt($("#form-quantity").value || "0", 10) || 0);
  const purchasePrice = parseFloat($("#form-purchase-price").value) || null;
  const sellingPrice = parseFloat($("#form-selling-price").value) || null;
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
      quantity,
      purchasePrice,
      sellingPrice,
      photo: file || null,
      expiry: readExpiryFromForm(),
      createdAt: Date.now(),
    };
    await dbAdd(product);
    showToast("Товар сохранён");
  } else if (formMode === "edit" && currentProduct) {
    currentProduct.name = name;
    currentProduct.quantity = quantity;
    currentProduct.purchasePrice = purchasePrice;
    currentProduct.sellingPrice = sellingPrice;
    if (file) currentProduct.photo = file;
    currentProduct.expiry = readExpiryFromForm();
    await dbAdd(currentProduct);
    showToast("Изменения сохранены");
  }

  closeModal();
  switchTab("products");
});

/* ===== Поставщики ===== */
const receivingScanners = { receiving: { reader: null, locked: false } };

async function startReceivingScanner() {
  const cfg = receivingScanners.receiving;
  if (!window.ZXing) {
    showToast("Библиотека сканера не загрузилась (нужен интернет)");
    return;
  }
  stopScanner("add");
  stopScanner("find");
  cfg.locked = false;
  const video = $("#receiving-video");
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
  try {
    cfg.reader = new ZXing.BrowserMultiFormatReader();
    await cfg.reader.decodeFromVideoDevice(undefined, video, (result) => {
      if (result && !cfg.locked) {
        cfg.locked = true;
        const code = result.getText();
        stopReceivingScanner();
        $("#receiving-manual").value = code;
        handleReceivingBarcode(code);
      }
    });
    $("#btn-start-receiving-scan").hidden = true;
    $("#btn-stop-receiving-scan").hidden = false;
  } catch (e) {
    console.error(e);
    const msg =
      (e && e.name) === "NotAllowedError"
        ? "Нет доступа к камере. Разрешите доступ в настройках браузера."
        : (e && e.name) === "NotFoundError"
        ? "Камера не найдена."
        : "Не удалось запустить сканер. Проверьте камеру и разрешения.";
    showToast(msg);
  }
}

function stopReceivingScanner() {
  const cfg = receivingScanners.receiving;
  if (cfg.reader && typeof cfg.reader.stopAsync === "function") {
    cfg.reader.stopAsync().catch(() => {});
  }
  cfg.reader = null;
  const video = $("#receiving-video");
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
  $("#btn-start-receiving-scan").hidden = false;
  $("#btn-stop-receiving-scan").hidden = true;
}

let receivingBarcode = null;
let receivingProduct = null;
let receivingSupplier = null;

async function openSupplierModal() {
  $("#supplier-overlay").hidden = false;
  $("#supplier-name").value = "";
  $("#supplier-name").focus();
}

function closeSupplierModal() {
  $("#supplier-overlay").hidden = true;
}

$("#btn-cancel-supplier").addEventListener("click", closeSupplierModal);

$("#supplier-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#supplier-name").value.trim();
  if (!name) {
    showToast("Укажите название поставщика");
    return;
  }
  const supplier = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name,
    createdAt: Date.now(),
  };
  await dbSupplierAdd(supplier);
  closeSupplierModal();
  showToast("Поставщик добавлен");
  await refreshReceivingSuppliers();
  $("#receiving-supplier").value = supplier.id;
  $("#btn-next-to-scan").disabled = false;
});

async function refreshReceivingSuppliers() {
  const suppliers = await dbSupplierGetAll();
  const select = $("#receiving-supplier");
  select.innerHTML = '<option value="">Выберите поставщика</option>';
  for (const s of suppliers) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    select.append(opt);
  }
}

$("#receiving-supplier").addEventListener("change", (e) => {
  $("#btn-next-to-scan").disabled = !e.target.value;
});

$("#btn-add-supplier").addEventListener("click", openSupplierModal);

$("#btn-next-to-scan").addEventListener("click", () => {
  const supplierId = $("#receiving-supplier").value;
  if (!supplierId) return;
  receivingSupplier = supplierId;
  $("#receiving-step-supplier").hidden = true;
  $("#receiving-step-scan").hidden = false;
  $("#btn-receiving-cancel").hidden = false;
});

$("#btn-receiving-manual").addEventListener("click", () => {
  const code = $("#receiving-manual").value.trim();
  if (!code) {
    showToast("Введите штрихкод");
    return;
  }
  stopReceivingScanner();
  handleReceivingBarcode(code);
});

async function handleReceivingBarcode(barcode) {
  receivingBarcode = barcode;
  const product = await dbGetByBarcode(barcode);
  receivingProduct = product;
  if (product) {
    showReceivingProductStep(product, false);
  } else {
    showReceivingProductStep(null, true);
  }
}

function showReceivingProductStep(product, isNew) {
  $("#receiving-step-scan").hidden = true;
  if (isNew) {
    $("#receiving-step-product").hidden = true;
    $("#receiving-product-overlay").hidden = false;
    $("#receiving-product-title").textContent = "Новый товар";
    $("#receiving-new-fields").hidden = false;
    $("#receiving-form-barcode").value = receivingBarcode;
    $("#receiving-form-name").value = "";
    $("#receiving-form-quantity").value = "1";
    $("#receiving-form-purchase-price").value = "";
    $("#receiving-form-selling-price").value = "";
    $("#receiving-photo-preview").innerHTML = "";
    $("#receiving-form-photo").value = "";
    $("#receiving-form-expiry-mode").value = "";
    $("#receiving-form-expiry-from").value = "";
    $("#receiving-form-expiry-to").value = "";
    $("#receiving-form-expiry-duration").value = "";
    $("#receiving-form-expiry-unit").value = "days";
    updateReceivingExpiryUI();
  } else {
    $("#receiving-product-overlay").hidden = true;
    $("#receiving-step-product").hidden = false;
    const info = $("#receiving-product-info");
    info.innerHTML = `<p><strong>${escapeHtml(product.name)}</strong><br><span class="muted">Штрихкод: ${escapeHtml(product.barcode)}</span><br><span class="muted">На складе: ${product.quantity || 0}</span></p>`;
    $("#receiving-quantity").value = "1";
  }
}

function escapeHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

$("#btn-receiving-save").addEventListener("click", async () => {
  const quantity = Math.max(1, parseInt($("#receiving-quantity").value || "1", 10) || 1);
  receivingProduct.quantity = (receivingProduct.quantity || 0) + quantity;
  await dbAdd(receivingProduct);

  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    supplierId: receivingSupplier,
    barcode: receivingBarcode,
    productName: receivingProduct.name,
    quantity,
    date: new Date().toISOString(),
  };
  await dbReceivingAdd(record);

  showToast(`Принято: ${quantity} шт.`);
  closeReceivingModal();
  switchSubtab("goods");
});

$("#btn-cancel-receiving-product").addEventListener("click", closeReceivingModal);

$("#receiving-product-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#receiving-form-name").value.trim();
  const quantity = Math.max(1, parseInt($("#receiving-form-quantity").value || "1", 10) || 1);
  const purchasePrice = parseFloat($("#receiving-form-purchase-price").value) || null;
  const sellingPrice = parseFloat($("#receiving-form-selling-price").value) || null;
  const barcode = receivingBarcode;
  const file = $("#receiving-form-photo").files && $("#receiving-form-photo").files[0];

  if (!name) {
    showToast("Укажите название товара");
    return;
  }
  const product = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    barcode,
    name,
    quantity,
    purchasePrice,
    sellingPrice,
    photo: file || null,
    expiry: readReceivingExpiryFromForm(),
    createdAt: Date.now(),
  };
  await dbAdd(product);
  receivingProduct = product;

  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    supplierId: receivingSupplier,
    barcode,
    productName: product.name,
    quantity,
    date: new Date().toISOString(),
  };
  await dbReceivingAdd(record);

  showToast(`Принято: ${quantity} шт.`);
  $("#receiving-product-overlay").hidden = true;
  closeReceivingModal();
  switchSubtab("goods");
});

/* ===== Коррекция / Списания ===== */
const writeoffScanners = { writeoff: { reader: null, locked: false } };
let writeoffType = null;
let writeoffBarcode = null;
let writeoffProduct = null;

async function startWriteoffScanner() {
  const cfg = writeoffScanners.writeoff;
  if (!window.ZXing) {
    showToast("Библиотека сканера не загрузилась (нужен интернет)");
    return;
  }
  stopScanner("add");
  stopScanner("find");
  stopReceivingScanner();
  cfg.locked = false;
  const video = $("#writeoff-video");
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
  try {
    cfg.reader = new ZXing.BrowserMultiFormatReader();
    await cfg.reader.decodeFromVideoDevice(undefined, video, (result) => {
      if (result && !cfg.locked) {
        cfg.locked = true;
        const code = result.getText();
        stopWriteoffScanner();
        $("#writeoff-manual").value = code;
        handleWriteoffBarcode(code);
      }
    });
    $("#btn-start-writeoff-scan").hidden = true;
    $("#btn-stop-writeoff-scan").hidden = false;
  } catch (e) {
    console.error(e);
    const msg =
      (e && e.name) === "NotAllowedError"
        ? "Нет доступа к камере. Разрешите доступ в настройках браузера."
        : (e && e.name) === "NotFoundError"
        ? "Камера не найдена."
        : "Не удалось запустить сканер. Проверьте камеру и разрешения.";
    showToast(msg);
  }
}

function stopWriteoffScanner() {
  const cfg = writeoffScanners.writeoff;
  if (cfg.reader && typeof cfg.reader.stopAsync === "function") {
    cfg.reader.stopAsync().catch(() => {});
  }
  cfg.reader = null;
  const video = $("#writeoff-video");
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
  $("#btn-start-writeoff-scan").hidden = false;
  $("#btn-stop-writeoff-scan").hidden = true;
}

function openWriteoff(type) {
  writeoffType = type;
  writeoffBarcode = null;
  writeoffProduct = null;
  $("#writeoff-area").hidden = false;
  $("#writeoff-step-scan").hidden = false;
  $("#writeoff-step-product").hidden = true;
  $("#btn-writeoff-cancel").hidden = false;
  $("#writeoff-manual").value = "";
  $("#writeoff-hint").textContent = type === "defect"
    ? "Отсканируйте штрихкод товара для списания брака:"
    : "Отсканируйте штрихкод товара для списания просрочки:";
}

function closeWriteoffModal() {
  $("#writeoff-area").hidden = true;
  $("#writeoff-step-scan").hidden = true;
  $("#writeoff-step-product").hidden = true;
  $("#btn-writeoff-cancel").hidden = true;
  $("#writeoff-manual").value = "";
  writeoffType = null;
  writeoffBarcode = null;
  writeoffProduct = null;
  stopWriteoffScanner();
}

$("#btn-defect-writeoff").addEventListener("click", () => openWriteoff("defect"));
$("#btn-expiry-writeoff").addEventListener("click", () => openWriteoff("expiry"));
$("#btn-writeoff-cancel").addEventListener("click", closeWriteoffModal);

$("#btn-start-writeoff-scan").addEventListener("click", startWriteoffScanner);
$("#btn-stop-writeoff-scan").addEventListener("click", stopWriteoffScanner);

$("#btn-writeoff-manual").addEventListener("click", () => {
  const code = $("#writeoff-manual").value.trim();
  if (!code) {
    showToast("Введите штрихкод");
    return;
  }
  stopWriteoffScanner();
  handleWriteoffBarcode(code);
});

async function handleWriteoffBarcode(barcode) {
  writeoffBarcode = barcode;
  const product = await dbGetByBarcode(barcode);
  writeoffProduct = product;
  if (!product) {
    showToast("Товар не найден в базе");
    closeWriteoffModal();
    return;
  }
  $("#writeoff-step-scan").hidden = true;
  $("#writeoff-step-product").hidden = false;
  const info = $("#writeoff-product-info");
  info.innerHTML = `<p><strong>${escapeHtml(product.name)}</strong><br><span class="muted">Штрихкод: ${escapeHtml(product.barcode)}</span><br><span class="muted">На складе: ${product.quantity || 0}</span></p>`;
  $("#writeoff-quantity").value = "1";
}

$("#btn-writeoff-confirm").addEventListener("click", async () => {
  if (!writeoffProduct) return;
  const quantity = Math.max(1, parseInt($("#writeoff-quantity").value || "1", 10) || 1);
  const available = writeoffProduct.quantity || 0;
  if (quantity > available) {
    showToast(`Недостаточно на складе. Доступно: ${available}`);
    return;
  }
  writeoffProduct.quantity = available - quantity;
  await dbAdd(writeoffProduct);

  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    barcode: writeoffBarcode,
    productName: writeoffProduct.name,
    quantity,
    type: writeoffType,
    date: new Date().toISOString(),
  };
  await dbWriteoffAdd(record);

  const typeLabel = writeoffType === "defect" ? "брак" : "просрок";
  showToast(`Списано: ${quantity} шт. (${typeLabel})`);
  closeWriteoffModal();
});

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