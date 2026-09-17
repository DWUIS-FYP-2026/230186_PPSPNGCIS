/**
 * PMS — Officer Authorization (6-digit PIN + digital signature block).
 * Reusable across parole forms; mount once per form page.
 */
const PMSFormOfficerAuth = (() => {
  const DEMO_IP = '10.0.4.122';

  function qs(root, selector) {
    return (root || document).querySelector(selector);
  }

  async function sha256Hex(text) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381;
    for (let i = 0; i < text.length; i += 1) {
      h = ((h << 5) + h) ^ text.charCodeAt(i);
    }
    return `fallback${(h >>> 0).toString(16).padStart(8, '0')}`;
  }

  function formatTimestamp(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  function shortenHash(hash) {
    if (!hash || hash.length < 16) return hash || '—';
    return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
  }

  function lockSvg(className) {
    return `<svg class="${className}" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 1 1 6 0v3H9z"/></svg>`;
  }

  function renderMarkup(options = {}) {
    const heading = options.heading || 'OFFICER AUTHORIZATION';
    return `
<section class="officer-auth no-print" aria-label="${heading}">
  <h2 class="officer-auth__heading">${heading}</h2>
  <div class="officer-auth__layout">
    <div class="officer-auth__pin-panel">
      <div class="officer-auth__pin-box">
        <div class="officer-auth__pin-header">
          ${lockSvg('officer-auth__lock-icon')}
          <span>Enter Confidential PIN to Sign</span>
        </div>
        <p class="officer-auth__instruction">By entering your unique PIN, you are electronically signing this document. This action is legally binding and equivalent to your handwritten signature.</p>
        <p class="officer-auth__officer-info">Officer: <strong class="officer-auth__officer-name">—</strong> <span class="officer-auth__officer-id">(ID: <span class="officer-auth__officer-id-value">—</span>)</span></p>
        <div class="officer-auth__input-group">
          <input type="password" class="officer-auth__pin-input" maxlength="6" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="••••••" aria-label="6-digit signing PIN">
          <button type="button" class="officer-auth__verify-btn">Verify &amp; Sign</button>
        </div>
        <div class="officer-auth__success hidden" role="status">Identity verified successfully.</div>
        <div class="officer-auth__error hidden" role="alert">Invalid PIN. Please try again.</div>
      </div>
    </div>
    <aside class="officer-auth__id-block" aria-live="polite">
      <div class="officer-auth__id-status">
        ${lockSvg('officer-auth__id-lock')}
        <span class="officer-auth__id-status-text">Awaiting Verification</span>
      </div>
      <dl class="officer-auth__id-details">
        <div><dt>Officer Name</dt><dd class="officer-auth__id-name">—</dd></div>
        <div><dt>Role</dt><dd class="officer-auth__id-role">—</dd></div>
        <div><dt>Timestamp</dt><dd class="officer-auth__id-timestamp">—</dd></div>
        <div><dt>IP Address</dt><dd class="officer-auth__id-ip">${DEMO_IP}</dd></div>
      </dl>
      <p class="officer-auth__hash">SHA-256: —</p>
    </aside>
  </div>
</section>`;
  }

  function create(options) {
    const {
      mount = '#officer-auth-mount',
      actor,
      applicationId = '',
      formNumber = 1,
      payloadSeed = '',
      readOnly = false,
      savedRecord = null,
      onVerified = null,
    } = options;

    const mountEl = typeof mount === 'string' ? document.querySelector(mount) : mount;
    if (!mountEl) throw new Error('Officer auth mount element not found');

    mountEl.innerHTML = renderMarkup(options);

    const root = mountEl.querySelector('.officer-auth') || mountEl;
    const pinInput = qs(root, '.officer-auth__pin-input');
    const verifyBtn = qs(root, '.officer-auth__verify-btn');
    const successMsg = qs(root, '.officer-auth__success');
    const errorMsg = qs(root, '.officer-auth__error');
    const idBlock = qs(root, '.officer-auth__id-block');

    let verified = false;
    let record = null;

    const officerName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : '—';
    const officerId = actor?.officerId || actor?.employeeNumber || actor?.id || '—';

    qs(root, '.officer-auth__officer-name').textContent = officerName;
    qs(root, '.officer-auth__officer-id-value').textContent = officerId;
    qs(root, '.officer-auth__id-name').textContent = officerName;
    qs(root, '.officer-auth__id-role').textContent = actor?.role || '—';

    function hideMessages() {
      successMsg?.classList.add('hidden');
      errorMsg?.classList.add('hidden');
    }

    function showSuccess() {
      hideMessages();
      successMsg?.classList.remove('hidden');
    }

    function showError() {
      hideMessages();
      errorMsg?.classList.remove('hidden');
      pinInput?.classList.add('is-error');
      pinInput?.classList.remove('officer-auth__shake');
      void pinInput?.offsetWidth;
      pinInput?.classList.add('officer-auth__shake');
    }

    async function buildRecord() {
      const timestamp = new Date().toISOString();
      const hashInput = [
        applicationId,
        formNumber,
        actor?.id,
        officerId,
        timestamp,
        payloadSeed,
      ].join('|');
      const fullHash = await sha256Hex(hashInput);
      return {
        verified: true,
        officerId,
        officerName,
        role: actor?.role || '',
        userId: actor?.id || '',
        timestamp,
        ipAddress: DEMO_IP,
        sha256: fullHash,
        formNumber,
        applicationId,
      };
    }

    function applySignerLabels(source) {
      const name = source?.officerName || officerName;
      const id = source?.officerId || officerId;
      const role = source?.role || actor?.role || '—';
      qs(root, '.officer-auth__officer-name').textContent = name;
      qs(root, '.officer-auth__officer-id-value').textContent = id;
      qs(root, '.officer-auth__id-name').textContent = name;
      qs(root, '.officer-auth__id-role').textContent = role;
    }

    function applyVerifiedState(nextRecord) {
      record = nextRecord;
      verified = true;
      applySignerLabels(record);
      idBlock?.classList.add('verified');
      qs(root, '.officer-auth__id-status-text').textContent = 'Digitally Verified';
      qs(root, '.officer-auth__id-timestamp').textContent = formatTimestamp(record.timestamp);
      qs(root, '.officer-auth__hash').textContent = `SHA-256: ${shortenHash(record.sha256)}`;
      pinInput.disabled = true;
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Signed ✓';
      verifyBtn.classList.add('is-signed');
      pinInput?.classList.remove('is-error');
      const otherSigner = record?.userId && actor?.id && record.userId !== actor.id;
      if (successMsg) {
        successMsg.textContent = otherSigner
          ? `Already verified by ${record.officerName || 'the assigned officer'}.`
          : 'Identity verified successfully.';
      }
      showSuccess();
      onVerified?.(record);
    }

    async function verifyPin() {
      if (readOnly || verified) return;
      hideMessages();
      pinInput?.classList.remove('is-error', 'officer-auth__shake');

      const pin = (pinInput?.value || '').trim();
      if (!/^\d{6}$/.test(pin)) {
        showError();
        return;
      }

      const originalLabel = verifyBtn.textContent;
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying…';

      await new Promise((r) => { setTimeout(r, 450); });

      const ok = typeof PMSStorage !== 'undefined'
        && PMSStorage.verifySigningPin(actor, pin);

      if (ok) {
        applyVerifiedState(await buildRecord());
      } else {
        showError();
        verifyBtn.disabled = false;
        verifyBtn.textContent = originalLabel;
        pinInput?.focus();
      }
    }

    verifyBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      verifyPin();
    });

    pinInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        verifyPin();
      }
    });

    pinInput?.addEventListener('input', () => {
      pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 6);
      pinInput.classList.remove('is-error');
      errorMsg?.classList.add('hidden');
    });

    if (readOnly) {
      pinInput.disabled = true;
      verifyBtn.disabled = true;
    }

    if (savedRecord?.verified) {
      applyVerifiedState(savedRecord);
    }

    return {
      isVerified: () => verified,
      getRecord: () => (verified ? { ...record } : null),
      getMount: () => mountEl,
      focus: () => {
        root.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (!readOnly && !verified) pinInput?.focus();
      },
      restore: (saved) => {
        if (saved?.verified) applyVerifiedState(saved);
      },
      lock: () => {
        pinInput.disabled = true;
        verifyBtn.disabled = true;
      },
      reset: () => {
        verified = false;
        record = null;
        idBlock?.classList.remove('verified');
        applySignerLabels(actor ? { officerName, officerId, role: actor.role } : null);
        qs(root, '.officer-auth__id-status-text').textContent = 'Awaiting Verification';
        qs(root, '.officer-auth__id-timestamp').textContent = '—';
        qs(root, '.officer-auth__hash').textContent = 'SHA-256: —';
        if (successMsg) successMsg.textContent = 'Identity verified successfully.';
        pinInput.value = '';
        pinInput.disabled = readOnly;
        verifyBtn.disabled = readOnly;
        verifyBtn.textContent = 'Verify & Sign';
        verifyBtn.classList.remove('is-signed');
        hideMessages();
      },
    };
  }

  function requireVerified(auth, options = {}) {
    if (auth?.isVerified()) return true;
    if (typeof auth?.focus === 'function') {
      auth.focus();
    } else {
      const section = auth?.getMount?.()?.querySelector('.officer-auth')
        || document.querySelector('.officer-auth');
      section?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      section?.querySelector('.officer-auth__pin-input')?.focus();
    }
    const msg = options.message
      || 'Enter your 6-digit PIN and click Verify & Sign before submitting.';
    if (typeof options.showToast === 'function') {
      options.showToast(msg, options.type || 'error');
    }
    return false;
  }

  function gateSubmitButtons(auth, buttonIds = [], options = {}) {
    const pinTitle = options.pinTitle || '6-digit PIN verification required before submit';
    const canEnable = typeof options.canEnable === 'function' ? options.canEnable : () => true;
    const getDisabledReason = typeof options.getDisabledReason === 'function' ? options.getDisabledReason : null;

    function resolveButtons() {
      return buttonIds
        .map((id) => (typeof id === 'string' ? document.getElementById(id) : id))
        .filter(Boolean);
    }

    function applyDisabledState(btn, reason) {
      btn.disabled = true;
      if (reason) {
        btn.title = reason;
        btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.removeAttribute('title');
        btn.removeAttribute('aria-disabled');
      }
    }

    function sync() {
      const verified = !!auth?.isVerified();
      resolveButtons().forEach((btn) => {
        if (!canEnable(btn)) {
          applyDisabledState(btn, getDisabledReason?.(btn) || 'Complete required steps before continuing');
          return;
        }
        if (!verified) {
          applyDisabledState(btn, pinTitle);
          return;
        }
        btn.disabled = false;
        btn.removeAttribute('title');
        btn.removeAttribute('aria-disabled');
      });
    }

    return { sync, require: (opts) => requireVerified(auth, opts) };
  }

  return { create, renderMarkup, sha256Hex, requireVerified, gateSubmitButtons };
})();
