import { formatBytes } from "../utils/format.js";

export function createPreviewController({ state, els }) {
  function setPreviewView(view) {
    state.previewView = view;
    els.previewTabs.forEach(button => {
      const active = button.dataset.previewView === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    els.previewPanes.forEach(pane => pane.classList.toggle("active", pane.dataset.previewPane === view));
    if (view === "before") {
      els.previewTitle.textContent = "原图大图预览";
    } else {
      els.previewTitle.textContent = state.mode === "encrypt" ? "混淆结果大图预览" : "解混淆结果大图预览";
    }
  }

  function openPreview(item, trigger) {
    if (item.status !== "done" || !item.outputUrl) return;
    state.previewItemId = item.id;
    state.previewTrigger = trigger || null;
    const isEncrypt = state.mode === "encrypt";
    els.beforeCaption.textContent = isEncrypt ? "原始图片" : "待还原图片";
    els.afterLabel.textContent = isEncrypt ? "混淆后" : "解混淆后";
    els.afterTabLabel.textContent = isEncrypt ? "混淆后" : "解混淆后";
    els.beforePreview.src = item.previewUrl;
    els.beforePreview.alt = `${item.file.name} 处理前预览`;
    els.afterPreview.src = item.outputUrl;
    els.afterPreview.alt = `${item.file.name} ${isEncrypt ? "混淆后" : "解混淆后"}预览`;
    els.previewFilename.textContent = item.file.name;
    els.previewMeta.textContent = `${item.width} × ${item.height} · 处理前 ${formatBytes(item.file.size)} · 处理后 ${formatBytes(item.outputBlob?.size || 0)}`;

    const aspect = item.width && item.height ? item.height / item.width : 1;
    els.previewModal.classList.toggle("preview-long-vertical", aspect >= 2.2);
    els.previewModal.classList.toggle("preview-long-horizontal", aspect <= 0.45);
    if (aspect >= 2.2) els.beforeCaption.textContent = `${isEncrypt ? "原始" : "待还原"}长图 · 上下滑动`;

    setPreviewView("before");
    els.previewModal.hidden = false;
    document.body.classList.add("preview-open");
    requestAnimationFrame(() => els.previewClose.focus());
  }

  function closePreview() {
    if (els.previewModal.hidden) return;
    els.previewModal.hidden = true;
    els.previewModal.classList.remove("preview-long-vertical", "preview-long-horizontal");
    document.body.classList.remove("preview-open");
    els.beforePreview.removeAttribute("src");
    els.afterPreview.removeAttribute("src");
    const trigger = state.previewTrigger;
    state.previewItemId = null;
    state.previewTrigger = null;
    if (trigger?.isConnected) trigger.focus();
  }

  return { setPreviewView, openPreview, closePreview };
}
