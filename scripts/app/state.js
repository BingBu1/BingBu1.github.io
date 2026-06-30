export function createInitialState() {
  return {
    mode: "encrypt",
    items: [],
    running: false,
    importing: false,
    merging: false,
    mergeDirection: "vertical",
    mergeBlob: null,
    mergeUrl: null,
    mergeWidth: 0,
    mergeHeight: 0,
    mergeGeneration: 0,
    mergeTrigger: null,
    previewItemId: null,
    previewTrigger: null,
    previewView: "before",
    toastTimer: 0
  };
}
