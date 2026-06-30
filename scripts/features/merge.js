import { canvasToPngBlob, loadImage, nextFrame } from "../utils/canvas.js";
import { triggerDownload } from "../utils/download.js";
import { formatBytes } from "../utils/format.js";
import { isConstrainedDevice } from "../utils/file-types.js";

export function createMergeController({
  state,
  els,
  addFiles,
  processOne,
  renderQueue,
  updateSummary,
  toast,
  closePreview
}) {
  function clearMergeResult() {
    if (state.mergeUrl) URL.revokeObjectURL(state.mergeUrl);
    state.mergeBlob = null;
    state.mergeUrl = null;
    state.mergeWidth = 0;
    state.mergeHeight = 0;
    els.mergePreview.removeAttribute("src");
    els.mergePreview.hidden = true;
    els.mergeDownload.disabled = true;
    els.mergeAdd.disabled = true;
    els.mergeProcess.disabled = true;
  }

  function setMerging(merging) {
    state.merging = merging;
    els.mergeLoading.hidden = !merging;
    els.mergeDirectionButtons.forEach(button => { button.disabled = merging; });
    els.mergeDownload.disabled = merging || !state.mergeBlob;
    els.mergeAdd.disabled = merging || !state.mergeBlob;
    els.mergeProcess.disabled = merging || !state.mergeBlob;
    updateSummary();
  }

  async function generateLongImage(direction = state.mergeDirection) {
    if (state.items.length < 2) return;
    const generation = ++state.mergeGeneration;
    clearMergeResult();
    setMerging(true);
    els.mergeSummary.textContent = "正在读取图片…";
    els.mergeMeta.textContent = "保持队列顺序，自动统一尺寸";

    try {
      const images = [];
      for (const item of state.items) {
        images.push(await loadImage(item.file));
        if (generation !== state.mergeGeneration) return;
      }
      if (images.some(image => !image.naturalWidth || !image.naturalHeight)) throw new Error("部分图片无法读取尺寸");

      const mobileLike = isConstrainedDevice();
      const maxPixels = mobileLike ? 16000000 : 32000000;
      const maxDimension = mobileLike ? 16380 : 32760;
      let width;
      let height;
      let pieces;
      let scale = 1;

      if (direction === "vertical") {
        const baseWidth = Math.min(...images.map(image => image.naturalWidth));
        const rawHeight = images.reduce((sum, image) => sum + image.naturalHeight * baseWidth / image.naturalWidth, 0);
        scale = Math.min(1, maxDimension / rawHeight, Math.sqrt(maxPixels / (baseWidth * rawHeight)));
        width = Math.max(1, Math.floor(baseWidth * scale));
        pieces = images.map(image => ({
          image,
          width,
          height: Math.max(1, Math.round(image.naturalHeight * width / image.naturalWidth))
        }));
        height = pieces.reduce((sum, piece) => sum + piece.height, 0);
        if (width < 64) throw new Error("图片数量过多，合成长图后会过窄，请分批合并");
      } else {
        const baseHeight = Math.min(...images.map(image => image.naturalHeight));
        const rawWidth = images.reduce((sum, image) => sum + image.naturalWidth * baseHeight / image.naturalHeight, 0);
        scale = Math.min(1, maxDimension / rawWidth, Math.sqrt(maxPixels / (baseHeight * rawWidth)));
        height = Math.max(1, Math.floor(baseHeight * scale));
        pieces = images.map(image => ({
          image,
          width: Math.max(1, Math.round(image.naturalWidth * height / image.naturalHeight)),
          height
        }));
        width = pieces.reduce((sum, piece) => sum + piece.width, 0);
        if (height < 64) throw new Error("图片数量过多，合成长图后会过矮，请分批合并");
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("浏览器无法创建长图画布");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      let x = 0;
      let y = 0;
      for (let index = 0; index < pieces.length; index++) {
        const piece = pieces[index];
        context.drawImage(piece.image, x, y, piece.width, piece.height);
        if (direction === "vertical") y += piece.height;
        else x += piece.width;
        if (index % 4 === 3) await nextFrame();
        if (generation !== state.mergeGeneration) return;
      }

      const blob = await canvasToPngBlob(canvas);
      if (generation !== state.mergeGeneration) return;
      state.mergeBlob = blob;
      state.mergeUrl = URL.createObjectURL(blob);
      state.mergeWidth = width;
      state.mergeHeight = height;
      els.mergePreviewShell.classList.toggle("vertical", direction === "vertical");
      els.mergePreviewShell.classList.toggle("horizontal", direction === "horizontal");
      els.mergePreview.src = state.mergeUrl;
      els.mergePreview.hidden = false;
      els.mergeSummary.textContent = `${state.items.length} 张图片 · ${width} × ${height}`;
      els.mergeMeta.textContent = scale < .999
        ? `为兼容设备画布，已等比缩小至 ${Math.round(scale * 100)}% · ${formatBytes(blob.size)}`
        : `按最小${direction === "vertical" ? "宽度" : "高度"}对齐，无放大 · ${formatBytes(blob.size)}`;
    } catch (error) {
      if (generation === state.mergeGeneration) {
        els.mergeSummary.textContent = "长图生成失败";
        els.mergeMeta.textContent = error?.message || "请减少图片数量后重试";
        toast(error?.message || "长图生成失败");
      }
    } finally {
      if (generation === state.mergeGeneration) setMerging(false);
    }
  }

  function setMergeDirection(direction) {
    if (state.merging || direction === state.mergeDirection) return;
    state.mergeDirection = direction;
    els.mergeDirectionButtons.forEach(button => {
      const active = button.dataset.mergeDirection === direction;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    generateLongImage(direction);
  }

  function openMerge(trigger) {
    if (state.items.length < 2 || state.running || state.importing || state.merging) return;
    closePreview();
    state.mergeTrigger = trigger || null;
    state.mergeDirection = "vertical";
    els.mergeDirectionButtons.forEach(button => {
      const active = button.dataset.mergeDirection === "vertical";
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    els.mergeProcessLabel.textContent = state.mode === "encrypt" ? "加入并混淆" : "加入并解混淆";
    els.mergeModal.hidden = false;
    document.body.classList.add("merge-open");
    generateLongImage("vertical");
    requestAnimationFrame(() => els.mergeClose.focus());
  }

  function closeMerge() {
    if (els.mergeModal.hidden) return;
    state.mergeGeneration++;
    state.merging = false;
    els.mergeModal.hidden = true;
    document.body.classList.remove("merge-open");
    clearMergeResult();
    const trigger = state.mergeTrigger;
    state.mergeTrigger = null;
    updateSummary();
    if (trigger?.isConnected) trigger.focus();
  }

  function downloadMergedImage() {
    if (!state.mergeBlob) return;
    const direction = state.mergeDirection === "vertical" ? "vertical" : "horizontal";
    triggerDownload(state.mergeBlob, `merged_${direction}_${state.items.length}.png`);
  }

  async function addMergedImage(processNow = false) {
    if (!state.mergeBlob || state.merging) return;
    const blob = state.mergeBlob;
    const direction = state.mergeDirection === "vertical" ? "vertical" : "horizontal";
    const file = new File([blob], `merged_${direction}_${Date.now()}.png`, { type: "image/png", lastModified: Date.now() });
    closeMerge();
    addFiles([file], { quiet: true });
    const item = state.items.find(candidate => candidate.file === file);
    if (!item) return;
    if (!processNow) {
      toast("长图已加入队列");
      return;
    }
    state.running = true;
    renderQueue();
    await processOne(item);
    state.running = false;
    renderQueue();
    toast(item.status === "done" ? `长图已${state.mode === "encrypt" ? "混淆" : "解混淆"}` : item.error || "长图处理失败");
  }

  return {
    clearMergeResult,
    setMerging,
    generateLongImage,
    setMergeDirection,
    openMerge,
    closeMerge,
    downloadMergedImage,
    addMergedImage
  };
}
