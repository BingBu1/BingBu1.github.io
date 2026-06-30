import { $$ } from "../app/dom.js";
import { isImageFile, isZipFile } from "../utils/file-types.js";
import { extractImagesFromZip } from "../zip/reader.js";

export function createFileQueueController({
  state,
  els,
  getNextId,
  renderQueue,
  updateSummary,
  toast,
  closePreview
}) {
  function setImporting(importing) {
    state.importing = importing;
    [els.selectFiles, els.selectFolder, els.selectZip, els.emptySelect, ...els.modeButtons].forEach(control => {
      control.disabled = importing;
    });
    $$(".remove-item", els.queueList).forEach(button => {
      button.disabled = importing || state.running || state.merging;
    });
    els.dropZone.setAttribute("aria-busy", String(importing));
    els.dropZone.classList.toggle("importing", importing);
    updateSummary();
  }

  async function handleIncomingFiles(fileList) {
    if (state.running || state.importing) return;
    const incoming = [...fileList];
    const directImages = incoming.filter(isImageFile);
    const archives = incoming.filter(isZipFile);
    if (!archives.length) {
      addFiles(directImages);
      return;
    }

    setImporting(true);
    toast(`正在读取 ${archives.length} 个 ZIP…`);
    const extracted = [];
    const errors = [];
    let skipped = 0;
    try {
      for (const archive of archives) {
        try {
          const occupiedNames = state.items.map(item => item.file.name);
          const result = await extractImagesFromZip(archive, occupiedNames);
          extracted.push(...result.files);
          skipped += result.skipped;
        } catch (error) {
          errors.push(`${archive.name}：${error?.message || "读取失败"}`);
        }
      }
      const added = addFiles([...directImages, ...extracted], { quiet: true });
      if (added) {
        const detail = archives.length ? `，其中 ZIP 提取 ${extracted.length} 张` : "";
        toast(`已添加 ${added} 张图片${detail}${skipped ? `，跳过 ${skipped} 张` : ""}`);
      } else if (errors.length) {
        toast(errors[0]);
      } else if (archives.length) {
        toast("ZIP 中没有找到支持的图片");
      } else {
        toast("没有找到可处理的图片");
      }
    } finally {
      setImporting(false);
    }
  }

  function addFiles(fileList, { quiet = false } = {}) {
    if (state.running) return 0;
    const incoming = [...fileList];
    const images = incoming.filter(isImageFile);
    const keys = new Set(state.items.map(item => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
    let added = 0;

    for (const file of images) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (keys.has(key)) continue;
      keys.add(key);
      state.items.push({
        id: getNextId(),
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

    if (!quiet) {
      if (incoming.length && !images.length) toast("没有找到可处理的图片");
      else if (!added && images.length) toast("这些图片已经在队列里了");
      else if (added) toast(`已添加 ${added} 张图片`);
    }
    renderQueue();
    return added;
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
    if (state.running || state.importing || state.merging || mode === state.mode) return;
    closePreview();
    state.mode = mode;
    resetResults();
    els.modeButtons.forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    els.mergeProcessLabel.textContent = mode === "encrypt" ? "加入并混淆" : "加入并解混淆";
    renderQueue();
  }

  function removeItem(id) {
    if (state.running || state.importing || state.merging) return;
    const index = state.items.findIndex(item => item.id === id);
    if (index === -1) return;
    if (state.previewItemId === id) closePreview();
    cleanupItem(state.items[index]);
    state.items.splice(index, 1);
    renderQueue();
  }

  function clearAll() {
    if (state.running || state.importing || state.merging) return;
    closePreview();
    state.items.forEach(cleanupItem);
    state.items = [];
    renderQueue();
  }

  return {
    setImporting,
    handleIncomingFiles,
    addFiles,
    cleanupItem,
    resetResults,
    setMode,
    removeItem,
    clearAll
  };
}
