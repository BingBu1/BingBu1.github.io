import { canvasToBlob, loadImage, nextFrame } from "../utils/canvas.js";
import { isConstrainedDevice } from "../utils/file-types.js";
import { createProcessorWorker } from "./worker.js";
import { gilbertIndices } from "./gilbert.js";

export function createImageProcessor({ state, renderQueue, updateItemView, updateSummary, toast }) {
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
      worker.postMessage({ file: item.file, mode: state.mode, maxPixels: isConstrainedDevice() ? 16000000 : 32000000 });
    });
  }

  async function processOnMainThread(item) {
    const image = await loadImage(item.file);
    const width = item.width = image.naturalWidth;
    const height = item.height = image.naturalHeight;
    const total = width * height;
    if (!width || !height) throw new Error("无法读取图片尺寸");
    const maxPixels = isConstrainedDevice() ? 16000000 : 32000000;
    if (total > maxPixels) throw new Error("图片像素过大，请先缩小尺寸或改用电脑处理");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器无法创建画布");
    context.drawImage(image, 0, 0);
    const source = context.getImageData(0, 0, width, height);
    const output = context.createImageData(width, height);
    const curve = gilbertIndices(width, height);
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
    if (!state.items.length || state.running || state.importing || state.merging) return;
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

  return { processOne, processAll };
}
