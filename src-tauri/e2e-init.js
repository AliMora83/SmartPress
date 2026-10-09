// e2e builds only (feature "e2e"): load the test driver from a local listener.
window.addEventListener('load', () => setTimeout(() => {
    fetch('http://127.0.0.1:4100/harness.js').then(r => r.text()).then(t => (0, eval)(t));
}, 4000));
