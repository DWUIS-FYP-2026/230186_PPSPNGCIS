/**
 * PMS — inline field validation UI (highlight, messages, scroll/focus, live clear).
 */
const PMSFieldValidation = (() => {
  const INVALID_GROUP = 'pms-field-invalid';
  const INVALID_CONTROL = 'pms-field-invalid-control';
  const ERROR_MSG = 'pms-field-error-msg';
  const DEFAULT_REQUIRED = 'This field is required.';

  const boundRoots = new WeakSet();

  function $(id, root) {
    if (!id) return null;
    return (root || document).getElementById(id) || document.getElementById(id);
  }

  function isEmptyValue(value) {
    if (value == null) return true;
    if (typeof value === 'boolean') return false;
    if (typeof value === 'number') return Number.isNaN(value);
    return String(value).trim() === '';
  }

  function findGroup(el) {
    if (!el) return null;
    return el.closest('.form-group, .field, .form1-simple__section, .officer-auth, .ppr-form-card, .gov-doc__notify-fields, .modal-form .form-group');
  }

  function resolveControl(issue, root) {
    if (issue.element) return issue.element;
    if (issue.fieldId) {
      const el = $(issue.fieldId, root);
      if (el) return el;
      const byName = (root || document).querySelector(`[name="${CSS.escape(issue.fieldId)}"]`);
      if (byName) return byName;
    }
    if (issue.name) {
      return (root || document).querySelector(`[name="${CSS.escape(issue.name)}"]`);
    }
    if (issue.selector) {
      return (root || document).querySelector(issue.selector);
    }
    return null;
  }

  function getMessageEl(group, key) {
    const id = `pms-error-${key}`;
    let el = group.querySelector(`#${id}`);
    if (!el) {
      el = document.createElement('p');
      el.id = id;
      el.className = ERROR_MSG;
      el.setAttribute('role', 'alert');
      group.appendChild(el);
    }
    return el;
  }

  function clearGroup(group) {
    if (!group) return;
    group.classList.remove(INVALID_GROUP);
    group.querySelectorAll(`.${INVALID_CONTROL}`).forEach((el) => el.classList.remove(INVALID_CONTROL));
    group.querySelectorAll(`.${ERROR_MSG}`).forEach((el) => el.remove());
  }

  function clearControl(control) {
    if (!control) return;
    const group = findGroup(control);
    if (!group || !group.classList.contains(INVALID_GROUP)) {
      control.classList.remove(INVALID_CONTROL);
      return;
    }

    let fixed = false;
    if (control.type === 'radio') {
      const name = control.name;
      fixed = name
        ? [...group.querySelectorAll(`[name="${CSS.escape(name)}"]`)].some((r) => r.checked)
        : control.checked;
    } else if (control.type === 'checkbox') {
      const name = control.name;
      fixed = name
        ? [...group.querySelectorAll(`[name="${CSS.escape(name)}"]`)].some((c) => c.checked)
        : control.checked;
    } else {
      fixed = !isEmptyValue(control.value);
    }

    if (fixed) clearGroup(group);
    else control.classList.remove(INVALID_CONTROL);
  }

  function clearAll(root) {
    (root || document).querySelectorAll(`.${INVALID_GROUP}`).forEach((g) => clearGroup(g));
    (root || document).querySelectorAll(`.${INVALID_CONTROL}`).forEach((el) => {
      el.classList.remove(INVALID_CONTROL);
    });
    (root || document).querySelectorAll(`.${ERROR_MSG}`).forEach((el) => el.remove());
  }

  function markInvalid(control, message, key) {
    const group = findGroup(control) || control.parentElement;
    if (!group) return;
    group.classList.add(INVALID_GROUP);
    if (control.classList) control.classList.add(INVALID_CONTROL);

    if (control.type === 'radio' || control.type === 'checkbox') {
      const name = control.name;
      if (name && group) {
        group.querySelectorAll(`[name="${CSS.escape(name)}"]`).forEach((input) => {
          input.classList.add(INVALID_CONTROL);
          const lbl = input.closest('label');
          if (lbl) lbl.classList.add(INVALID_CONTROL);
        });
      }
    }

    const msgEl = getMessageEl(group, key || control.id || control.name || 'field');
    msgEl.textContent = message || DEFAULT_REQUIRED;
  }

  function applyIssues(root, issues, { scroll = true, focus = true, clearExisting = true } = {}) {
    if (clearExisting) clearAll(root);
    const list = (issues || []).filter((i) => i && i.message);
    let firstControl = null;

    list.forEach((issue, index) => {
      const control = resolveControl(issue, root);
      if (!control) return;
      const key = issue.fieldId || issue.name || issue.selector || `issue-${index}`;
      markInvalid(control, issue.message, key);
      if (!firstControl) firstControl = control;
    });

    if (firstControl && scroll) {
      scrollToControl(firstControl, focus);
    }

    return { valid: list.length === 0, count: list.length, firstControl };
  }

  function scrollToControl(control, focus = true) {
    const group = findGroup(control) || control;
    group.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!focus) return;
    const focusable = group.querySelector?.(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
    ) || control;
    if (focusable && typeof focusable.focus === 'function') {
      try {
        focusable.focus({ preventScroll: true });
      } catch (_) {
        focusable.focus();
      }
    }
  }

  function bindLiveClear(root) {
    if (!root || boundRoots.has(root)) return;
    boundRoots.add(root);
    const handler = (e) => {
      const t = e.target;
      if (!t || !t.matches('input, select, textarea')) return;
      clearControl(t);
    };
    root.addEventListener('input', handler, true);
    root.addEventListener('change', handler, true);
  }

  function validateRequiredData(data, specs, root, options = {}) {
    const issues = typeof PMSValidation !== 'undefined'
      ? PMSValidation.collectRequiredFieldIssues(data, specs, options)
      : [];
    return applyIssues(root, issues, options);
  }

  function validateControls(root, specs) {
    const issues = [];
    specs.forEach((spec) => {
      const control = resolveControl(spec, root);
      if (!control) return;
      let empty = false;
      if (control.type === 'radio' || (control.type === 'checkbox' && spec.name)) {
        const name = spec.name || control.name;
        empty = name
          ? ![...(root || document).querySelectorAll(`[name="${CSS.escape(name)}"]`)].some((r) => r.checked)
          : !control.checked;
      } else if (control.type === 'checkbox' && spec.requireChecked) {
        empty = !control.checked;
      } else {
        empty = isEmptyValue(control.value);
      }
      if (empty) {
        issues.push({
          fieldId: spec.fieldId,
          name: spec.name,
          selector: spec.selector,
          element: control,
          message: spec.message || DEFAULT_REQUIRED,
        });
      }
    });
    return applyIssues(root, issues);
  }

  return {
    DEFAULT_REQUIRED,
    clearAll,
    clearControl,
    applyIssues,
    scrollToControl,
    bindLiveClear,
    validateRequiredData,
    validateControls,
    isEmptyValue,
  };
})();
