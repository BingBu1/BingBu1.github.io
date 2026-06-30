import { getElements } from "./dom.js";
import { createInitialState } from "./state.js";
import { bindEvents } from "./events.js";
import { createFileQueueController } from "../features/file-queue.js";
import { createMergeController } from "../features/merge.js";
import { createDownloadController } from "../features/downloads.js";
import { createImageProcessor } from "../processing/image-processor.js";
import { createPreviewController } from "../ui/preview.js";
import { createQueueRenderer } from "../ui/queue-renderer.js";
import { createToast } from "../ui/toast.js";

export function createApp() {
  const els = getElements();
  const state = createInitialState();
  const toast = createToast({ state, els });
  let nextId = 1;
  let fileQueue;
  let downloads;
  let preview;

  const queue = createQueueRenderer({
    state,
    els,
    actions: {
      openPreview: (item, trigger) => preview.openPreview(item, trigger),
      downloadItem: item => downloads.downloadItem(item),
      removeItem: id => fileQueue.removeItem(id)
    }
  });

  preview = createPreviewController({ state, els });
  fileQueue = createFileQueueController({
    state,
    els,
    getNextId: () => nextId++,
    renderQueue: queue.renderQueue,
    updateSummary: queue.updateSummary,
    toast,
    closePreview: preview.closePreview
  });

  const processor = createImageProcessor({
    state,
    renderQueue: queue.renderQueue,
    updateItemView: queue.updateItemView,
    updateSummary: queue.updateSummary,
    toast
  });

  const merge = createMergeController({
    state,
    els,
    addFiles: fileQueue.addFiles,
    processOne: processor.processOne,
    renderQueue: queue.renderQueue,
    updateSummary: queue.updateSummary,
    toast,
    closePreview: preview.closePreview
  });

  downloads = createDownloadController({ state, els, toast });

  bindEvents({ state, els, fileQueue, processor, downloads, preview, merge });

  return {
    init() {
      queue.renderQueue();
    }
  };
}
