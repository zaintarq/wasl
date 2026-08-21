/** Tap English Wasl → crossfade + slide to Arabic reveal, then return. */
(function () {
  const HOLD_MS = 1500;
  const AR_SRC = 'assets/wasl-logo-ar.png?v=5';

  function bindLogoTap(root) {
    const stack = root.querySelector('.logo-stack');
    const en = root.querySelector('.logo-en');
    const ar = root.querySelector('.logo-ar');
    if (!stack || !en || !ar) return;

    let busy = false;
    let timer = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const reset = () => {
      stack.classList.remove('is-revealing');
      busy = false;
    };

    root.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      clearTimer();

      // Force reflow so CSS transition runs every tap.
      stack.classList.remove('is-revealing');
      void stack.offsetWidth;
      stack.classList.add('is-revealing');

      timer = setTimeout(reset, HOLD_MS);
    });

    // Preload Arabic layer.
    if (ar.dataset.src) ar.src = ar.dataset.src;
    else ar.src = AR_SRC;
  }

  document.querySelectorAll('[data-logo-tap]').forEach(bindLogoTap);
})();
