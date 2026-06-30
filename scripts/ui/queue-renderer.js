import { $ } from "../app/dom.js";
import { formatBytes } from "../utils/format.js";

const statusText = {
  queued: "待处理",
  processing: "处理中",
  done: "已完成",
  error: "失败"
};

export function createQueueRenderer({ state, els, actions }) {
  function itemMeta(item) {
    const size = formatBytes(item.file.size);
    return item.width && item.height ? `${item.width} × ${item.height} · ${size}` : size;
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
      if (item.status === "done") image.title = "查看原图大图";
      image.addEventListener("click", event => actions.openPreview(item, event.currentTarget));

      $(".item-index", fragment).textContent = String(index + 1).padStart(2, "0");
      $(".item-name", fragment).textContent = item.file.name;
      $(".item-meta", fragment).textContent = itemMeta(item);
      $(".item-progress span", fragment).style.width = `${item.progress}%`;
      $(".status-progress", fragment).textContent = `${item.progress}%`;
      $(".status-pill", fragment).textContent = statusText[item.status];

      const error = $(".item-error", fragment);
      error.hidden = !item.error;
      error.textContent = item.error;

      const downloadButton = $(".download-item", fragment);
      downloadButton.hidden = item.status !== "done";
      downloadButton.addEventListener("click", () => actions.downloadItem(item));

      const previewButton = $(".preview-item", fragment);
      previewButton.hidden = item.status !== "done";
      previewButton.addEventListener("click", event => actions.openPreview(item, event.currentTarget));

      const removeButton = $(".remove-item", fragment);
      removeButton.disabled = state.running || state.importing || state.merging;
      removeButton.addEventListener("click", () => actions.removeItem(item.id));

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
    $(".status-pill", article).textContent = statusText[item.status];

    const error = $(".item-error", article);
    error.hidden = !item.error;
    error.textContent = item.error;

    if (item.outputUrl) $(".thumbnail", article).src = item.outputUrl;
    $(".thumbnail", article).classList.toggle("is-previewable", item.status === "done");
    $(".thumbnail", article).title = item.status === "done" ? "查看原图大图" : "";
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
    els.clearAll.disabled = !total || state.running || state.importing || state.merging;
    els.mergeAll.disabled = total < 2 || state.running || state.importing || state.merging;
    els.summaryCard.hidden = total === 0;
    els.summaryCard.style.setProperty("--progress", `${progress}%`);
    els.summaryCount.textContent = `${done + failed} / ${total}`;

    if (state.merging) {
      els.summaryTitle.textContent = "正在合成长图";
      els.summaryDetail.textContent = "按队列顺序统一尺寸并拼接…";
      els.dockLabel.textContent = "正在生成长图";
      els.dockDetail.textContent = "使用高清 PNG 输出";
    } else if (state.importing) {
      els.summaryTitle.textContent = "正在读取 ZIP";
      els.summaryDetail.textContent = "正在安全地提取图片…";
      els.dockLabel.textContent = "正在导入 ZIP";
      els.dockDetail.textContent = "图片将在本地解压，不会上传";
    } else if (!total) {
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

    els.processLabel.textContent = state.merging ? "正在合成长图…" : state.importing ? "正在读取 ZIP…" : state.running ? "正在处理…" : `开始批量${modeLabel}`;
    els.processAll.disabled = !total || state.running || state.importing || state.merging;
    els.downloadAll.hidden = done === 0 || state.running || state.importing || state.merging;
    els.downloadAll.disabled = done === 0 || state.running || state.importing || state.merging;
  }

  return { renderQueue, updateItemView, updateSummary };
}
