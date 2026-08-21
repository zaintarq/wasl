/** Tap default Wasl logo → Arabic وصل slide-in, then auto-return. */
(function () {
  const ALT_MS = 1400;

  function bindLogoTap(root) {
    const stack = root.querySelector('.logo-stack');
    const defaultImg = root.querySelector('.logo-default');
    const arabicImg = root.querySelector('.logo-arabic');
    if (!stack || !defaultImg || !arabicImg) return;

    let busy = false;
    let timer = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const returnDefault = () => {
      stack.classList.remove('animating', 'show-arabic');
      busy = false;
    };

    root.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      clearTimer();
      stack.classList.add('animating', 'show-arabic');
      timer = setTimeout(returnDefault, ALT_MS);
    });
  }

  document.querySelectorAll('[data-logo-tap]').forEach(bindLogoTap);
})();
