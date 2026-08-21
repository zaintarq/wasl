/** Tap English Wasl → crossfade to second logo, then return. */
(function () {
  const HOLD_MS = 1500;

  document.querySelectorAll('[data-logo-tap]').forEach((root) => {
    const stack = root.querySelector('.logo-stack');
    if (!stack) return;

    let busy = false;
    let timer = null;

    root.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      if (timer) clearTimeout(timer);

      stack.classList.remove('is-revealing');
      void stack.offsetWidth;
      stack.classList.add('is-revealing');

      timer = setTimeout(() => {
        stack.classList.remove('is-revealing');
        busy = false;
        timer = null;
      }, HOLD_MS);
    });
  });
})();
