"use strict";

/* ===== Хранилище товаров (IndexedDB) ===== */
const DB_NAME = "scanner-app";
const STORE = "products";
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
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
  } else if (mode === "view") {
    title.textContent = "Карточка товара";
    nameInput.readOnly = true;
    photoInput.hidden = true;
    photoField.hidden = false;
    viewActions.hidden = false;
    editActions.hidden = false;
    saveBtn.hidden = true;
  } else if (mode === "edit") {
    title.textContent = "Редактировать товар";
    nameInput.readOnly = false;
    photoInput.hidden = false;
    photoField.hidden = false;
    viewActions.hidden = true;
    editActions.hidden = false;
    saveBtn.hidden = false;
  }
  const form = $("#product-form");
  form.classList.toggle("mode-view", mode === "view");
  form.classList.toggle("mode-edit", mode === "edit" || mode === "add");
}

function openFormAdd(barcode) {
  currentProduct = null;
  $("#form-barcode").value = barcode;
  $("#form-name").value = "";
  $("#photo-preview").innerHTML = "";
  $("#form-photo").value = "";
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
  setFormMode("view");
  $("#form-overlay").hidden = false;
}

function closeModal() {
  $("#form-overlay").hidden = true;
  currentProduct = null;
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
      createdAt: Date.now(),
    };
    await dbAdd(product);
    showToast("Товар сохранён");
  } else if (formMode === "edit" && currentProduct) {
    currentProduct.name = name;
    if (file) currentProduct.photo = file;
    await dbAdd(currentProduct);
    showToast("Изменения сохранены");
  }

  closeModal();
  switchTab("products");
});

/* ===== Старт ===== */
renderProducts();
