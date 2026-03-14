/**
 * Accessibility: Hover-to-speak for visually impaired users.
 * Speaks the label of any button with class "speak-btn" on mouseenter
 * after a 400ms delay. Cancels speech on mouseleave.
 * Uses MutationObserver so dynamically added buttons are handled automatically.
 */

(function () {
  const HOVER_DELAY_MS = 400;

  function speakText(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }

  function attachListener(btn) {
    if (btn._speakAttached) return; // prevent duplicate listeners
    btn._speakAttached = true;

    let timer = null;

    btn.addEventListener('mouseenter', () => {
      const label = btn.getAttribute('aria-label') || btn.innerText.trim();
      if (!label) return;
      timer = setTimeout(() => speakText(label), HOVER_DELAY_MS);
    });

    btn.addEventListener('mouseleave', () => {
      clearTimeout(timer);
    });
  }

  function attachAll() {
    document.querySelectorAll('.speak-btn').forEach(attachListener);
  }

  // Observe DOM for dynamically added buttons (React renders async)
  const observer = new MutationObserver(() => attachAll());

  function init() {
    attachAll();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
