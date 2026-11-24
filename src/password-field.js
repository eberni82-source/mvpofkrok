// The same tilted ivory eyes as the Cursor mascot, drawn for a small control.
const eye = () => `<svg class="password-mascot" viewBox="0 0 64 52" width="34" height="28" aria-hidden="true" focusable="false">
  <g fill="#fff9e9" stroke="#201e1a" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="20" cy="25" rx="12" ry="21" transform="rotate(15 20 25)"/>
    <ellipse cx="44" cy="28" rx="12" ry="19" transform="rotate(-13 44 28)"/>
  </g>
  <g class="password-pupils">
    <g fill="#201e1a"><ellipse cx="23" cy="26" rx="4.5" ry="9" transform="rotate(12 23 26)"/><ellipse cx="47" cy="29" rx="4.5" ry="8" transform="rotate(-12 47 29)"/></g>
    <g fill="#fff9e9"><ellipse cx="22" cy="23" rx="1.5" ry="2"/><ellipse cx="46" cy="26" rx="1.4" ry="1.8"/></g>
  </g>
  <g class="password-lids" fill="none" stroke="#201e1a" stroke-width="4" stroke-linecap="round"><path d="M12 25q7 7 15-1"/><path d="M37 28q7 7 15-1"/></g>
</svg>`;

export function enhancePasswordFields(root) {
  for (const input of root.querySelectorAll('input[type="password"]')) {
    if (input.closest('.password-control')) continue;
    const wrap = document.createElement('div');
    wrap.className = 'password-control';
    input.before(wrap);
    wrap.append(input);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'password-toggle';
    toggle.setAttribute('aria-label', 'Показать пароль');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.innerHTML = eye();
    toggle.addEventListener('click', () => {
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      toggle.setAttribute('aria-label', visible ? 'Скрыть пароль' : 'Показать пароль');
      toggle.setAttribute('aria-pressed', String(visible));
    });
    wrap.append(toggle);
  }
}
