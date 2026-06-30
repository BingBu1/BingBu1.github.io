export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unit);
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function stripExtension(name) {
  return name.replace(/\.[^.]+$/, "");
}

export function safeName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 160);
}

export function outputName(item, mode) {
  const suffix = mode === "encrypt" ? "_mixed" : "_restored";
  return `${safeName(stripExtension(item.file.name))}${suffix}.jpg`;
}
