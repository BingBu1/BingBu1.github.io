import { isImageFile, isZipFile } from "../utils/file-types.js";

export function bindEvents({ state, els, fileQueue, processor, downloads, preview, merge }) {
  els.modeButtons.forEach(button => button.addEventListener("click", () => fileQueue.setMode(button.dataset.mode)));
  els.selectFiles.addEventListener("click", () => els.fileInput.click());
  els.emptySelect.addEventListener("click", () => els.fileInput.click());
  els.dropZone.addEventListener("click", () => { if (!state.importing) els.fileInput.click(); });
  els.dropZone.addEventListener("keydown", event => {
    if (!state.importing && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      els.fileInput.click();
    }
  });
  els.selectFolder.addEventListener("click", () => els.folderInput.click());
  els.selectZip.addEventListener("click", () => els.zipInput.click());
  els.fileInput.addEventListener("change", event => { fileQueue.handleIncomingFiles(event.target.files); event.target.value = ""; });
  els.folderInput.addEventListener("change", event => { fileQueue.handleIncomingFiles(event.target.files); event.target.value = ""; });
  els.zipInput.addEventListener("change", event => { fileQueue.handleIncomingFiles(event.target.files); event.target.value = ""; });
  els.clearAll.addEventListener("click", fileQueue.clearAll);
  els.mergeAll.addEventListener("click", event => merge.openMerge(event.currentTarget));
  els.processAll.addEventListener("click", processor.processAll);
  els.downloadAll.addEventListener("click", downloads.downloadAll);
  els.previewClose.addEventListener("click", preview.closePreview);
  els.previewBackdrop.addEventListener("click", preview.closePreview);
  els.previewTabs.forEach(button => button.addEventListener("click", () => preview.setPreviewView(button.dataset.previewView)));
  els.mergeClose.addEventListener("click", merge.closeMerge);
  els.mergeBackdrop.addEventListener("click", merge.closeMerge);
  els.mergeDirectionButtons.forEach(button => button.addEventListener("click", () => merge.setMergeDirection(button.dataset.mergeDirection)));
  els.mergeDownload.addEventListener("click", merge.downloadMergedImage);
  els.mergeAdd.addEventListener("click", () => merge.addMergedImage(false));
  els.mergeProcess.addEventListener("click", () => merge.addMergedImage(true));
  els.previewDownload.addEventListener("click", () => {
    const item = state.items.find(candidate => candidate.id === state.previewItemId);
    if (item) downloads.downloadItem(item);
  });

  ["dragenter", "dragover"].forEach(type => els.dropZone.addEventListener(type, event => {
    event.preventDefault();
    if (!state.running && !state.importing) els.dropZone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach(type => els.dropZone.addEventListener(type, event => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
  }));
  els.dropZone.addEventListener("drop", event => {
    if (!state.running && !state.importing) fileQueue.handleIncomingFiles(event.dataTransfer.files);
  });
  document.addEventListener("paste", event => {
    const files = [...(event.clipboardData?.files || [])].filter(file => isImageFile(file) || isZipFile(file));
    if (files.length) fileQueue.handleIncomingFiles(files);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !els.previewModal.hidden) preview.closePreview();
    if (event.key === "Escape" && !els.mergeModal.hidden) merge.closeMerge();
    if (!els.previewModal.hidden && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      preview.setPreviewView(event.key === "ArrowLeft" ? "before" : "after");
    }
  });
  window.addEventListener("beforeunload", () => {
    state.items.forEach(fileQueue.cleanupItem);
    if (state.mergeUrl) URL.revokeObjectURL(state.mergeUrl);
  });
}
