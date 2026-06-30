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

export function createProcessorWorker() {
  const blob = new Blob([workerSource], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}
