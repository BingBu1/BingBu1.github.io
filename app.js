(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const els = {
    modeButtons: $$(".mode-button"),
    dropZone: $("#drop-zone"),
    fileInput: $("#file-input"),
    folderInput: $("#folder-input"),
    selectFiles: $("#select-files"),
    selectFolder: $("#select-folder"),
    emptySelect: $("#empty-select"),
    clearAll: $("#clear-all"),
    emptyState: $("#empty-state"),
    queueList: $("#queue-list"),
    fileCount: $("#file-count"),
    summaryCard: $("#summary-card"),
    summaryProgress: $("#summary-progress"),
    summaryTitle: $("#summary-title"),
    summaryDetail: $("#summary-detail"),
    summaryCount: $("#summary-count"),
    dockLabel: $("#dock-label"),
    dockDetail: $("#dock-detail"),
    processAll: $("#process-all"),
    processLabel: $("#process-label"),
    downloadAll: $("#download-all"),
    template: $("#queue-item-template"),
    previewModal: $("#preview-modal"),
    previewClose: $("#preview-close"),
    previewTitle: $("#preview-title"),
    beforeCaption: $("#before-caption"),
    beforePreview: $("#before-preview"),
    afterLabel: $("#after-label"),
    afterPreview: $("#after-preview"),
    previewFilename: $("#preview-filename"),
    previewMeta: $("#preview-meta"),
    previewDownload: $("#preview-download"),
    previewBackdrop: $("[data-close-preview]"),
    toast: $("#toast")
  };

  const state = {
    mode: "encrypt",
    items: [],
    running: false,
    previewItemId: null,
    previewTrigger: null,
    toastTimer: 0
  };

  let nextId = 1;

  const workerMain = () => {
    function generate2d(x, y, ax, ay, bx, by, width, coordinates, cursor) {
      const w = Math.abs(ax + ay);
      const h = Math.abs(bx + by);
      const dax = Math.sign(ax), day = Math.sign(ay);
      const dbx = Math.sign(bx), dby = Math.sign(by);

      if (h === 1) {
        for (let i = 0; i < w; i++) {
          coordinates[cursor.value++] = x + y * width;
          x += dax;
          y += day;
        }
        return;
      }

      if (w === 1) {
        for (let i = 0; i < h; i++) {
          coordinates[cursor.value++] = x + y * width;
          x += dbx;
          y += dby;
        }
        return;
      }

      let ax2 = Math.floor(ax / 2), ay2 = Math.floor(ay / 2);
      let bx2 = Math.floor(bx / 2), by2 = Math.floor(by / 2);
      const w2 = Math.abs(ax2 + ay2);
      const h2 = Math.abs(bx2 + by2);

      if (2 * w > 3 * h) {
        if ((w2 % 2) && w > 2) {
          ax2 += dax;
          ay2 += day;
        }
        generate2d(x, y, ax2, ay2, bx, by, width, coordinates, cursor);
        generate2d(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by, width, coordinates, cursor);
      } else {
        if ((h2 % 2) && h > 2) {
          bx2 += dbx;
          by2 += dby;
        }
        generate2d(x, y, bx2, by2, ax2, ay2, width, coordinates, cursor);
        generate2d(x + bx2, y + by2, ax, ay, bx - bx2, by - by2, width, coordinates, cursor);
        generate2d(
          x + (ax - dax) + (bx2 - dbx),
          y + (ay - day) + (by2 - dby),
          -bx2,
          -by2,
          -(ax - ax2),
          -(ay - ay2),
          width,
          coordinates,
          cursor
        );
      }
    }

    function gilbertIndices(width, height) {
      const coordinates = new Uint32Array(width * height);
      const cursor = { value: 0 };
      if (width >= height) {
        generate2d(0, 0, width, 0, 0, height, width, coordinates, cursor);
      } else {
        generate2d(0, 0, 0, height, width, 0, width, coordinates, cursor);
      }
      return coordinates;
    }

    self.onmessage = async (event) => {
      const { file, mode, maxPixels } = event.data;
      let bitmap;
      try {
        try {
          bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        } catch {
          bitmap = await createImageBitmap(file);
        }

        const width = bitmap.width;
        const height = bitmap.height;
        const total = width * height;
        if (!width || !height) throw new Error("无法读取图片尺寸");
        if (total > maxPixels) throw new Error("图片像素过大，请先缩小尺寸或改用电脑处理");

        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("浏览器无法创建画布");
        context.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        self.postMessage({ type: "progress", value: 5, width, height });

        const source = context.getImageData(0, 0, width, height);
        const output = new ImageData(width, height);
        const curve = gilbertIndices(width, height);
        const offset = Math.round(((Math.sqrt(5) - 1) / 2) * total);
        self.postMessage({ type: "progress", value: 12, width, height });

        const notifyEvery = Math.max(50000, Math.floor(total / 35));
        for (let i = 0; i < total; i++) {
          const shifted = i + offset >= total ? i + offset - total : i + offset;
          const oldPixel = curve[i] * 4;
          const newPixel = curve[shifted] * 4;
          const from = mode === "encrypt" ? oldPixel : newPixel;
          const to = mode === "encrypt" ? newPixel : oldPixel;
          output.data[to] = source.data[from];
          output.data[to + 1] = source.data[from + 1];
          output.data[to + 2] = source.data[from + 2];
          output.data[to + 3] = source.data[from + 3];

          if (i > 0 && i % notifyEvery === 0) {
            self.postMessage({ type: "progress", value: 12 + Math.round((i / total) * 78), width, height });
          }
        }

        context.putImageData(output, 0, 0);
        self.postMessage({ type: "progress", value: 94, width, height });
        const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 1 });
        self.postMessage({ type: "done", blob, width, height });
      } catch (error) {
        self.postMessage({ type: "error", message: error?.message || "处理失败" });
      }
    };
  };

  const workerSource = `(${workerMain.toString()})()`;

  function createProcessorWorker() {
    const blob = new Blob([workerSource], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    return worker;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** unit);
    return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
  }

  function stripExtension(name) {
    return name.replace(/\.[^.]+$/, "");
  }

  function safeName(name) {
    return name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 160);
  }

  function outputName(item) {
    const suffix = state.mode === "encrypt" ? "_mixed" : "_restored";
    return `${safeName(stripExtension(item.file.name))}${suffix}.jpg`;
  }

  function toast(message) {
    clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    state.toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
  }

  function isImageFile(file) {
    return file.type.startsWith("image/") || /\.(jpe?g|png|webp|bmp|gif|avif)$/i.test(file.name);
  }

  function addFiles(fileList) {
    if (state.running) return;
    const incoming = [...fileList];
    const images = incoming.filter(isImageFile);
    const keys = new Set(state.items.map(item => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
    let added = 0;

    for (const file of images) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (keys.has(key)) continue;
      keys.add(key);
      state.items.push({
        id: nextId++,
        file,
        previewUrl: URL.createObjectURL(file),
        outputBlob: null,
        outputUrl: null,
        width: 0,
        height: 0,
        progress: 0,
        status: "queued",
        error: ""
      });
      added++;
    }

    if (incoming.length && !images.length) toast("没有找到可处理的图片");
    else if (!added && images.length) toast("这些图片已经在队列里了");
    else if (added) toast(`已添加 ${added} 张图片`);
    renderQueue();
  }

  function cleanupItem(item) {
    URL.revokeObjectURL(item.previewUrl);
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
  }

  function resetResults() {
    for (const item of state.items) {
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
      item.outputBlob = null;
      item.outputUrl = null;
      item.progress = 0;
      item.status = "queued";
      item.error = "";
    }
  }

  function setMode(mode) {
    if (state.running || mode === state.mode) return;
    closePreview();
    state.mode = mode;
    resetResults();
    els.modeButtons.forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    renderQueue();
  }

  function removeItem(id) {
    if (state.running) return;
    const index = state.items.findIndex(item => item.id === id);
    if (index === -1) return;
    if (state.previewItemId === id) closePreview();
    cleanupItem(state.items[index]);
    state.items.splice(index, 1);
    renderQueue();
  }

  function clearAll() {
    if (state.running) return;
    closePreview();
    state.items.forEach(cleanupItem);
    state.items = [];
    renderQueue();
  }

  function itemMeta(item) {
    const size = formatBytes(item.file.size);
    return item.width && item.height ? `${item.width} × ${item.height} · ${size}` : size;
  }

  function openPreview(item, trigger) {
    if (item.status !== "done" || !item.outputUrl) return;
    state.previewItemId = item.id;
    state.previewTrigger = trigger || null;
    const isEncrypt = state.mode === "encrypt";
    els.previewTitle.textContent = isEncrypt ? "混淆结果预览" : "解混淆结果预览";
    els.beforeCaption.textContent = isEncrypt ? "原始图片" : "待还原图片";
    els.afterLabel.textContent = isEncrypt ? "混淆后" : "解混淆后";
    els.beforePreview.src = item.previewUrl;
    els.beforePreview.alt = `${item.file.name} 处理前预览`;
    els.afterPreview.src = item.outputUrl;
    els.afterPreview.alt = `${item.file.name} ${isEncrypt ? "混淆后" : "解混淆后"}预览`;
    els.previewFilename.textContent = item.file.name;
    els.previewMeta.textContent = `${item.width} × ${item.height} · 处理前 ${formatBytes(item.file.size)} · 处理后 ${formatBytes(item.outputBlob?.size || 0)}`;
    els.previewModal.hidden = false;
    document.body.classList.add("preview-open");
    requestAnimationFrame(() => els.previewClose.focus());
  }

  function closePreview() {
    if (els.previewModal.hidden) return;
    els.previewModal.hidden = true;
    document.body.classList.remove("preview-open");
    els.beforePreview.removeAttribute("src");
    els.afterPreview.removeAttribute("src");
    const trigger = state.previewTrigger;
    state.previewItemId = null;
    state.previewTrigger = null;
    if (trigger?.isConnected) trigger.focus();
  }

  function renderQueue() {
    els.queueList.innerHTML = "";
    state.items.forEach((item, index) => {
      const fragment = els.template.content.cloneNode(true);
      const article = $(".queue-item", fragment);
      article.dataset.id = item.id;
      article.classList.toggle("processing", item.status === "processing");
      article.classList.toggle("done", item.status === "done");
      article.classList.toggle("error", item.status === "error");
      const image = $(".thumbnail", fragment);
      image.src = item.outputUrl || item.previewUrl;
      image.alt = `${item.file.name} 预览`;
      image.classList.toggle("is-previewable", item.status === "done");
      if (item.status === "done") image.title = "查看处理前后对比";
      image.addEventListener("click", event => openPreview(item, event.currentTarget));
      $(".item-index", fragment).textContent = String(index + 1).padStart(2, "0");
      $(".item-name", fragment).textContent = item.file.name;
      $(".item-meta", fragment).textContent = itemMeta(item);
      $(".item-progress span", fragment).style.width = `${item.progress}%`;
      $(".status-progress", fragment).textContent = `${item.progress}%`;
      const statusText = { queued: "待处理", processing: "处理中", done: "已完成", error: "失败" };
      $(".status-pill", fragment).textContent = statusText[item.status];
      const error = $(".item-error", fragment);
      error.hidden = !item.error;
      error.textContent = item.error;
      const downloadButton = $(".download-item", fragment);
      downloadButton.hidden = item.status !== "done";
      downloadButton.addEventListener("click", () => downloadItem(item));
      const previewButton = $(".preview-item", fragment);
      previewButton.hidden = item.status !== "done";
      previewButton.addEventListener("click", event => openPreview(item, event.currentTarget));
      const removeButton = $(".remove-item", fragment);
      removeButton.disabled = state.running;
      removeButton.addEventListener("click", () => removeItem(item.id));
      els.queueList.append(fragment);
    });
    updateSummary();
  }

  function updateItemView(item) {
    const article = els.queueList.querySelector(`[data-id="${item.id}"]`);
    if (!article) return;
    article.className = `queue-item ${item.status === "queued" ? "" : item.status}`.trim();
    $(".item-progress span", article).style.width = `${item.progress}%`;
    $(".status-progress", article).textContent = `${item.progress}%`;
    $(".item-meta", article).textContent = itemMeta(item);
    const statusText = { queued: "待处理", processing: "处理中", done: "已完成", error: "失败" };
    $(".status-pill", article).textContent = statusText[item.status];
    const error = $(".item-error", article);
    error.hidden = !item.error;
    error.textContent = item.error;
    if (item.outputUrl) $(".thumbnail", article).src = item.outputUrl;
    $(".thumbnail", article).classList.toggle("is-previewable", item.status === "done");
    $(".thumbnail", article).title = item.status === "done" ? "查看处理前后对比" : "";
    $(".preview-item", article).hidden = item.status !== "done";
    $(".download-item", article).hidden = item.status !== "done";
  }

  function updateSummary() {
    const total = state.items.length;
    const done = state.items.filter(item => item.status === "done").length;
    const failed = state.items.filter(item => item.status === "error").length;
    const active = state.items.filter(item => item.status === "processing").length;
    const progress = total ? Math.round(state.items.reduce((sum, item) => sum + item.progress, 0) / total) : 0;
    const modeLabel = state.mode === "encrypt" ? "混淆" : "解混淆";

    els.fileCount.textContent = total;
    els.emptyState.hidden = total > 0;
    els.queueList.hidden = total === 0;
    els.clearAll.disabled = !total || state.running;
    els.summaryCard.hidden = total === 0;
    els.summaryCard.style.setProperty("--progress", `${progress}%`);
    els.summaryCount.textContent = `${done + failed} / ${total}`;

    if (!total) {
      els.summaryTitle.textContent = "准备就绪";
      els.summaryDetail.textContent = "等待添加图片";
      els.dockLabel.textContent = "还没有添加图片";
      els.dockDetail.textContent = "支持一次选择多张";
    } else if (state.running) {
      els.summaryTitle.textContent = `正在批量${modeLabel}`;
      els.summaryDetail.textContent = `${active} 个任务正在处理 · ${progress}%`;
      els.dockLabel.textContent = `正在处理 ${done + failed + active} / ${total}`;
      els.dockDetail.textContent = `整体进度 ${progress}%`;
    } else if (done + failed === total && (done || failed)) {
      els.summaryTitle.textContent = failed ? "处理完成，部分失败" : "全部处理完成";
      els.summaryDetail.textContent = failed ? `${done} 张成功 · ${failed} 张失败` : `${done} 张图片可以下载`;
      els.dockLabel.textContent = failed ? `${done} 张处理成功` : "全部处理完成";
      els.dockDetail.textContent = failed ? `${failed} 张失败，可再次尝试` : "可以单张下载或打包下载";
    } else {
      els.summaryTitle.textContent = `${total} 张图片准备就绪`;
      els.summaryDetail.textContent = `将执行批量${modeLabel}`;
      els.dockLabel.textContent = `已选择 ${total} 张图片`;
      els.dockDetail.textContent = `准备批量${modeLabel}`;
    }

    els.processLabel.textContent = state.running ? "正在处理…" : `开始批量${modeLabel}`;
    els.processAll.disabled = !total || state.running;
    els.downloadAll.hidden = done === 0 || state.running;
    els.downloadAll.disabled = done === 0 || state.running;
  }

  function processWithWorker(item) {
    return new Promise((resolve, reject) => {
      const worker = createProcessorWorker();
      worker.onmessage = (event) => {
        const message = event.data;
        if (message.width) item.width = message.width;
        if (message.height) item.height = message.height;
        if (message.type === "progress") {
          item.progress = Math.max(item.progress, message.value);
          updateItemView(item);
          updateSummary();
        } else if (message.type === "done") {
          worker.terminate();
          resolve(message);
        } else if (message.type === "error") {
          worker.terminate();
          reject(new Error(message.message));
        }
      };
      worker.onerror = () => {
        worker.terminate();
        reject(new Error("后台处理线程启动失败"));
      };
      const mobileLike = matchMedia("(max-width: 780px)").matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);
      worker.postMessage({ file: item.file, mode: state.mode, maxPixels: mobileLike ? 16000000 : 32000000 });
    });
  }

  function generate2dMain(x, y, ax, ay, bx, by, width, coordinates, cursor) {
    const w = Math.abs(ax + ay);
    const h = Math.abs(bx + by);
    const dax = Math.sign(ax), day = Math.sign(ay);
    const dbx = Math.sign(bx), dby = Math.sign(by);
    if (h === 1) {
      for (let i = 0; i < w; i++) {
        coordinates[cursor.value++] = x + y * width;
        x += dax; y += day;
      }
      return;
    }
    if (w === 1) {
      for (let i = 0; i < h; i++) {
        coordinates[cursor.value++] = x + y * width;
        x += dbx; y += dby;
      }
      return;
    }
    let ax2 = Math.floor(ax / 2), ay2 = Math.floor(ay / 2);
    let bx2 = Math.floor(bx / 2), by2 = Math.floor(by / 2);
    const w2 = Math.abs(ax2 + ay2), h2 = Math.abs(bx2 + by2);
    if (2 * w > 3 * h) {
      if ((w2 % 2) && w > 2) { ax2 += dax; ay2 += day; }
      generate2dMain(x, y, ax2, ay2, bx, by, width, coordinates, cursor);
      generate2dMain(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by, width, coordinates, cursor);
    } else {
      if ((h2 % 2) && h > 2) { bx2 += dbx; by2 += dby; }
      generate2dMain(x, y, bx2, by2, ax2, ay2, width, coordinates, cursor);
      generate2dMain(x + bx2, y + by2, ax, ay, bx - bx2, by - by2, width, coordinates, cursor);
      generate2dMain(x + (ax - dax) + (bx2 - dbx), y + (ay - day) + (by2 - dby), -bx2, -by2, -(ax - ax2), -(ay - ay2), width, coordinates, cursor);
    }
  }

  function gilbertIndicesMain(width, height) {
    const coordinates = new Uint32Array(width * height);
    const cursor = { value: 0 };
    if (width >= height) generate2dMain(0, 0, width, 0, 0, height, width, coordinates, cursor);
    else generate2dMain(0, 0, 0, height, width, 0, width, coordinates, cursor);
    return coordinates;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("无法解码这张图片")); };
      image.src = url;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("无法导出图片")), "image/jpeg", 1);
    });
  }

  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

  async function processOnMainThread(item) {
    const image = await loadImage(item.file);
    const width = item.width = image.naturalWidth;
    const height = item.height = image.naturalHeight;
    const total = width * height;
    if (!width || !height) throw new Error("无法读取图片尺寸");
    const mobileLike = matchMedia("(max-width: 780px)").matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);
    const maxPixels = mobileLike ? 16000000 : 32000000;
    if (total > maxPixels) throw new Error("图片像素过大，请先缩小尺寸或改用电脑处理");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const source = context.getImageData(0, 0, width, height);
    const output = context.createImageData(width, height);
    const curve = gilbertIndicesMain(width, height);
    const offset = Math.round(((Math.sqrt(5) - 1) / 2) * total);

    for (let i = 0; i < total; i++) {
      const shifted = i + offset >= total ? i + offset - total : i + offset;
      const oldPixel = curve[i] * 4;
      const newPixel = curve[shifted] * 4;
      const from = state.mode === "encrypt" ? oldPixel : newPixel;
      const to = state.mode === "encrypt" ? newPixel : oldPixel;
      output.data[to] = source.data[from];
      output.data[to + 1] = source.data[from + 1];
      output.data[to + 2] = source.data[from + 2];
      output.data[to + 3] = source.data[from + 3];
      if (i > 0 && i % 150000 === 0) {
        item.progress = 10 + Math.round((i / total) * 82);
        updateItemView(item);
        updateSummary();
        await nextFrame();
      }
    }
    context.putImageData(output, 0, 0);
    return { blob: await canvasToBlob(canvas), width, height };
  }

  async function processOne(item) {
    item.status = "processing";
    item.error = "";
    item.progress = 1;
    updateItemView(item);
    updateSummary();
    try {
      const canUseWorker = "Worker" in window && "OffscreenCanvas" in window && "createImageBitmap" in window;
      let result;
      if (canUseWorker) {
        try {
          result = await processWithWorker(item);
        } catch (error) {
          if (!/后台处理线程/.test(error.message)) throw error;
          result = await processOnMainThread(item);
        }
      } else {
        result = await processOnMainThread(item);
      }
      item.width = result.width;
      item.height = result.height;
      item.outputBlob = result.blob;
      item.outputUrl = URL.createObjectURL(result.blob);
      item.progress = 100;
      item.status = "done";
    } catch (error) {
      item.progress = 0;
      item.status = "error";
      item.error = error?.message || "处理失败，请重试";
    }
    updateItemView(item);
    updateSummary();
  }

  async function processAll() {
    if (!state.items.length || state.running) return;
    state.running = true;
    for (const item of state.items) {
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
      item.outputBlob = null;
      item.outputUrl = null;
      item.progress = 0;
      item.status = "queued";
      item.error = "";
    }
    renderQueue();

    const queue = [...state.items];
    const isWideScreen = matchMedia("(min-width: 900px)").matches;
    const poolSize = isWideScreen && (navigator.hardwareConcurrency || 2) >= 6 ? 2 : 1;
    let cursor = 0;
    async function runner() {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        await processOne(item);
      }
    }
    await Promise.all(Array.from({ length: Math.min(poolSize, queue.length) }, runner));
    state.running = false;
    renderQueue();
    const failed = state.items.filter(item => item.status === "error").length;
    toast(failed ? `处理完成，${failed} 张失败` : `全部 ${state.items.length} 张处理完成`);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function downloadItem(item) {
    if (!item.outputBlob) return;
    triggerDownload(item.outputBlob, outputName(item));
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function write16(view, offset, value) { view.setUint16(offset, value, true); }
  function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

  async function makeZip(items) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    const usedNames = new Map();
    let localOffset = 0;
    const stamp = dosDateTime();

    for (const item of items) {
      const rawName = outputName(item);
      const duplicateIndex = (usedNames.get(rawName) || 0) + 1;
      usedNames.set(rawName, duplicateIndex);
      const uniqueName = duplicateIndex === 1 ? rawName : rawName.replace(/\.jpg$/i, `_${duplicateIndex}.jpg`);
      const name = encoder.encode(uniqueName);
      const data = new Uint8Array(await item.outputBlob.arrayBuffer());
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      write32(lv, 0, 0x04034b50);
      write16(lv, 4, 20);
      write16(lv, 6, 0x0800);
      write16(lv, 8, 0);
      write16(lv, 10, stamp.time);
      write16(lv, 12, stamp.date);
      write32(lv, 14, crc);
      write32(lv, 18, data.length);
      write32(lv, 22, data.length);
      write16(lv, 26, name.length);
      write16(lv, 28, 0);
      local.set(name, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      write32(cv, 0, 0x02014b50);
      write16(cv, 4, 20);
      write16(cv, 6, 20);
      write16(cv, 8, 0x0800);
      write16(cv, 10, 0);
      write16(cv, 12, stamp.time);
      write16(cv, 14, stamp.date);
      write32(cv, 16, crc);
      write32(cv, 20, data.length);
      write32(cv, 24, data.length);
      write16(cv, 28, name.length);
      write16(cv, 30, 0);
      write16(cv, 32, 0);
      write16(cv, 34, 0);
      write16(cv, 36, 0);
      write32(cv, 38, 0);
      write32(cv, 42, localOffset);
      central.set(name, 46);
      centralParts.push(central);
      localOffset += local.length + data.length;
    }

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    write32(ev, 0, 0x06054b50);
    write16(ev, 4, 0);
    write16(ev, 6, 0);
    write16(ev, 8, items.length);
    write16(ev, 10, items.length);
    write32(ev, 12, centralSize);
    write32(ev, 16, localOffset);
    write16(ev, 20, 0);
    return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
  }

  async function downloadAll() {
    const doneItems = state.items.filter(item => item.status === "done" && item.outputBlob);
    if (!doneItems.length) return;
    els.downloadAll.disabled = true;
    els.downloadAll.textContent = "正在打包…";
    try {
      const zip = await makeZip(doneItems);
      const prefix = state.mode === "encrypt" ? "mixed_images" : "restored_images";
      triggerDownload(zip, `${prefix}_${doneItems.length}.zip`);
      toast(`已打包 ${doneItems.length} 张图片`);
    } catch {
      toast("打包失败，请尝试单张下载");
    } finally {
      els.downloadAll.disabled = false;
      els.downloadAll.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4 4-4M5 19h14"/></svg>下载 ZIP';
    }
  }

  els.modeButtons.forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
  els.selectFiles.addEventListener("click", () => els.fileInput.click());
  els.emptySelect.addEventListener("click", () => els.fileInput.click());
  els.dropZone.addEventListener("click", () => els.fileInput.click());
  els.dropZone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      els.fileInput.click();
    }
  });
  els.selectFolder.addEventListener("click", () => els.folderInput.click());
  els.fileInput.addEventListener("change", event => { addFiles(event.target.files); event.target.value = ""; });
  els.folderInput.addEventListener("change", event => { addFiles(event.target.files); event.target.value = ""; });
  els.clearAll.addEventListener("click", clearAll);
  els.processAll.addEventListener("click", processAll);
  els.downloadAll.addEventListener("click", downloadAll);
  els.previewClose.addEventListener("click", closePreview);
  els.previewBackdrop.addEventListener("click", closePreview);
  els.previewDownload.addEventListener("click", () => {
    const item = state.items.find(candidate => candidate.id === state.previewItemId);
    if (item) downloadItem(item);
  });

  ["dragenter", "dragover"].forEach(type => els.dropZone.addEventListener(type, event => {
    event.preventDefault();
    if (!state.running) els.dropZone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach(type => els.dropZone.addEventListener(type, event => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
  }));
  els.dropZone.addEventListener("drop", event => {
    if (!state.running) addFiles(event.dataTransfer.files);
  });
  document.addEventListener("paste", event => {
    const files = [...(event.clipboardData?.files || [])].filter(isImageFile);
    if (files.length) addFiles(files);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !els.previewModal.hidden) closePreview();
  });
  window.addEventListener("beforeunload", () => state.items.forEach(cleanupItem));

  renderQueue();
})();
