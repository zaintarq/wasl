/**
 * Hermes has no DOMException; LiveKit expects it. Runs immediately on require/import.
 */
function installDomExceptionPolyfill() {
  if (typeof globalThis.DOMException !== 'undefined') return;

  class DOMExceptionPolyfill extends Error {
    constructor(message = '', name = 'DOMException') {
      super(String(message));
      this.name = name;
    }
  }

  globalThis.DOMException = DOMExceptionPolyfill;
  if (typeof global !== 'undefined') {
    global.DOMException = DOMExceptionPolyfill;
  }
}

installDomExceptionPolyfill();

export function setupNativeGlobals() {
  installDomExceptionPolyfill();
}
