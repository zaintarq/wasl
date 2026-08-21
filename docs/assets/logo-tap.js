/** Tap English Wasl logo → Arabic وصل slides in, then auto-return. */
(function () {
  const ALT_MS = 1400;
  const AR_SRC = 'assets/wasl-logo-ar.png?v=4';

  function bindLogoTap(root) {
    const stack = root.querySelector('.logo-stack');
    const enImg = root.querySelector('.logo-en');
    if (!stack || !enImg) return;

    let busy = false;
    let timer = null;
    let arImg = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const returnEnglish = () => {
      stack.classList.remove('animating', 'show-arabic');
      if (arImg) {
        arImg.remove();
        arImg = null;
      }
      busy = false;
    };

    root.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      clearTimer();

      if (!arImg) {
        arImg = document.createElement('img');
        arImg.className = 'logo-layer logo-ar';
        arImg.src = AR_SRC;
        arImg.alt = '';
        arImg.setAttribute('aria-hidden', 'true');
        arImg.width = 320;
        arImg.height = 248;
        stack.appendChild(arImg);
      }

      requestAnimationFrame(() => {
        stack.classList.add('animating', 'show-arabic');
      });

      timer = setTimeout(returnEnglish, ALT_MS);
    });
  }

  document.querySelectorAll('[data-logo-tap]').forEach(bindLogoTap);
})();
