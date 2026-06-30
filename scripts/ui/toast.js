export function createToast({ state, els }) {
  return function toast(message) {
    clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    state.toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
  };
}
