import { button } from "./components.mjs";

/** Owns transient DOM effects: accessible dialogs, focus return and status messages. */
export class DemoFeedback {
  #returnFocus;
  #timer;
  constructor(dialog, status) {
    this.dialog = dialog;
    this.status = status;
  }

  open(title, body) {
    if (!this.dialog.open)
      this.#returnFocus = this.dialog.ownerDocument.activeElement;
    this.dialog.innerHTML = `<div class="dialoghead"><h2 id="dialog-title">${title}</h2>${button("×", "close-dialog", 'aria-label="Close dialog"', "iconbutton")}</div><div class="dialogbody"><p id="dialog-error" class="callout warning" role="alert" hidden></p>${body}</div>`;
    if (!this.dialog.open) this.dialog.showModal();
  }

  close() {
    this.dialog.close();
    this.dialog.innerHTML = "";
    if (this.#returnFocus?.isConnected) this.#returnFocus.focus();
  }

  toast(message) {
    this.status.textContent = message;
    this.status.classList.add("show");
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.status.classList.remove("show"), 5500);
  }

  error(message) {
    if (!this.dialog.open) return this.toast(message);
    const box = this.dialog.querySelector("#dialog-error");
    box.hidden = false;
    box.textContent = message;
  }

  dispose() {
    clearTimeout(this.#timer);
    if (this.dialog.open) this.close();
    this.status.classList.remove("show");
  }
}
