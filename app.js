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
  if (name === "products") renderProducts();
  if (name === "add") stopScan();
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
    del.addEventListener("click", async () => {
      if (confirm(`Удалить «${p.name}»?`)) {
        await dbDelete(p.id);
        showToast("Товар удалён");
        renderProducts();
      }
    });

    card.append(img, body, del);
    list.append(card);
  }
}

$("#search").addEventListener("input", renderProducts);

/* ===== Сканер штрихкода ===== */
let codeReader = null;
let scanActive = false;
let scannedLocked = false;

async function startScan() {
  if (!window.ZXing) {
    showToast("Библиотека сканера не загрузилась (нужен интернет)");
    return;
  }
  scannedLocked = false;
  try {
    codeReader = new ZXing.BrowserMultiFormatReader();
    await codeReader.decodeFromVideoDevice(
      undefined,
      $("#scanner-video"),
      (result, err, controls) => {
        if (result && !scannedLocked) {
          scannedLocked = true;
          const code = result.getText();
          stopScan();
          openProductForm(code);
        }
      }
    );
    scanActive = true;
    $("#btn-start-scan").hidden = true;
    $("#btn-stop-scan").hidden = false;
  } catch (e) {
    console.error(e);
    showToast("Нет доступа к камере. Проверьте разрешения и HTTPS/localhost");
  }
}

function stopScan() {
  if (codeReader && typeof codeReader.stopAsync === "function") {
    codeReader.stopAsync().catch(() => {});
  }
  scanActive = false;
  $("#btn-start-scan").hidden = false;
  $("#btn-stop-scan").hidden = true;
  const v = $("#scanner-video");
  if (v && v.srcObject) {
    v.srcObject.getTracks().forEach((t) => t.stop());
    v.srcObject = null;
  }
}

$("#btn-start-scan").addEventListener("click", startScan);
$("#btn-stop-scan").addEventListener("click", stopScan);

$("#btn-use-manual").addEventListener("click", () => {
  const code = $("#manual-barcode").value.trim();
  if (!code) {
    showToast("Введите штрихкод");
    return;
  }
  stopScan();
  openProductForm(code);
});

/* ===== Форма товара ===== */
let pendingPhotoBlob = null;

function openProductForm(barcode) {
  $("#form-barcode").value = barcode;
  if ($("#product-form").hidden) {
    $("#form-name").value = "";
    pendingPhotoBlob = null;
    $("#photo-preview").innerHTML = "";
  }
  $("#product-form").hidden = false;
  $("#form-name").focus();
  showToast("Штрихкод: " + barcode);
}

$("#btn-cancel-form").addEventListener("click", () => {
  $("#product-form").hidden = true;
  pendingPhotoBlob = null;
  scannedLocked = false;
});

$("#form-photo").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  const preview = $("#photo-preview");
  preview.innerHTML = "";
  if (!file) {
    pendingPhotoBlob = null;
    return;
  }
  pendingPhotoBlob = file;
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

  const product = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    barcode,
    name,
    photo: pendingPhotoBlob || null,
    createdAt: Date.now(),
  };

  try {
    await dbAdd(product);
    showToast("Товар сохранён");
    $("#product-form").hidden = true;
    pendingPhotoBlob = null;
    scannedLocked = false;
    switchTab("products");
  } catch (err) {
    console.error(err);
    showToast("Ошибка сохранения");
  }
});

/* ===== Старт ===== */
renderProducts();
