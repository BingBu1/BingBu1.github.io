export function isImageFile(file) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|bmp|gif|avif)$/i.test(file.name);
}

export function isZipFile(file) {
  return /\.zip$/i.test(file.name) || /^(application\/zip|application\/x-zip-compressed)$/i.test(file.type);
}

export function imageMimeType(name) {
  const extension = name.split(".").pop()?.toLowerCase();
  return {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    bmp: "image/bmp",
    gif: "image/gif",
    avif: "image/avif"
  }[extension] || "application/octet-stream";
}

export function isConstrainedDevice() {
  return matchMedia("(max-width: 780px)").matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);
}
