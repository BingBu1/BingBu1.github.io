import { outputName } from "../utils/format.js";
import { triggerDownload } from "../utils/download.js";
import { makeZip } from "../zip/writer.js";

export function createDownloadController({ state, els, toast }) {
  function downloadItem(item) {
    if (!item.outputBlob) return;
    triggerDownload(item.outputBlob, outputName(item, state.mode));
  }

  async function downloadAll() {
    const doneItems = state.items.filter(item => item.status === "done" && item.outputBlob);
    if (!doneItems.length) return;
    els.downloadAll.disabled = true;
    els.downloadAll.textContent = "正在打包…";
    try {
      const zip = await makeZip(doneItems, state.mode);
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

  return { downloadItem, downloadAll };
}
