/**
 * PMS — Automatic unique ID generation (localStorage now; database-ready later).
 * Format: PREFIX-000001 (6-digit zero-padded sequence per entity type).
 */
const PMSIdGenerator = (() => {
  const ENTITY_PREFIX = {
    prisoner: 'PR',
    officer: 'OFF',
    user: 'USR',
    application: 'APP',
    institution: 'INS',
    form1: 'F1',
    form2: 'F2',
    form3: 'F3',
    form4: 'F4',
    form5: 'F5',
    hearing: 'HRG',
    notification: 'NOT',
    audit: 'AUD',
    report: 'RPT',
    document: 'DOC',
    employee: 'EMP',
  };

  const PAD_LENGTH = 6;

  function prefixFor(entityType) {
    return ENTITY_PREFIX[entityType] || String(entityType).toUpperCase();
  }

  function format(prefix, sequence) {
    return `${prefix}-${String(sequence).padStart(PAD_LENGTH, '0')}`;
  }

  function extractSequence(id, prefix) {
    if (!id || typeof id !== 'string') return 0;
    const value = id.trim().toUpperCase();
    if (value.startsWith(`${prefix}-`)) {
      const n = parseInt(value.slice(prefix.length + 1), 10);
      return Number.isFinite(n) ? n : 0;
    }
    const legacy = {
      USR: /^USR_(\d+)$/i.test(id) ? parseInt(id.match(/^USR_(\d+)$/i)[1], 10)
        : /^usr_(?:cmd_)?(\d+)$/i.test(id) ? parseInt(id.match(/^usr_(?:cmd_)?(\d+)$/i)[1], 10) : 0,
      INS: /^inst_(\d+)$/i.test(id) ? parseInt(id.match(/^inst_(\d+)$/i)[1], 10) : 0,
      PR: /^pris_(\d+)$/i.test(id) ? parseInt(id.match(/^pris_(\d+)$/i)[1], 10)
        : /^P(\d+)$/i.test(id) ? parseInt(id.match(/^P(\d+)$/i)[1], 10) : 0,
      APP: /^app_(\d+)$/i.test(id) ? parseInt(id.match(/^app_(\d+)$/i)[1], 10) : 0,
      HRG: /^hear_(\d+)$/i.test(id) ? parseInt(id.match(/^hear_(\d+)$/i)[1], 10) : 0,
      NOT: /^notif_(\d+)$/i.test(id) ? parseInt(id.match(/^notif_(\d+)$/i)[1], 10) : 0,
      AUD: /^audit_(\d+)$/i.test(id) ? parseInt(id.match(/^audit_(\d+)$/i)[1], 10) : 0,
      DOC: /^doc_(\d+)$/i.test(id) ? parseInt(id.match(/^doc_(\d+)$/i)[1], 10) : 0,
    };
    if (legacy[prefix]) return legacy[prefix];
    if (prefix === 'OFF' && /^OFF-(\d+)$/i.test(id)) return parseInt(id.split('-')[1], 10);
    if (prefix === 'EMP' && /^EMP-(\d+)$/i.test(id)) return parseInt(id.split('-')[1], 10);
    return 0;
  }

  function bump(counters, prefix, seq) {
    if (seq > (counters[prefix] || 0)) counters[prefix] = seq;
  }

  function ensureCounters(data) {
    if (!data.idCounters) data.idCounters = {};
    const c = data.idCounters;

    data.users?.forEach((u) => {
      bump(c, 'USR', extractSequence(u.id, 'USR'));
      if (u.officerId) bump(c, 'OFF', extractSequence(u.officerId, 'OFF'));
      if (u.employeeNumber) bump(c, 'EMP', extractSequence(u.employeeNumber, 'EMP'));
    });
    data.institutions?.forEach((i) => {
      bump(c, 'INS', extractSequence(i.id, 'INS'));
      if (i.code) bump(c, 'INS', extractSequence(i.code, 'INS'));
    });
    data.prisoners?.forEach((p) => {
      bump(c, 'PR', extractSequence(p.id, 'PR'));
      if (p.prisonerNumber) bump(c, 'PR', extractSequence(p.prisonerNumber, 'PR'));
      (p.documents || []).forEach((d) => bump(c, 'DOC', extractSequence(d.id, 'DOC')));
    });
    data.applications?.forEach((a) => {
      bump(c, 'APP', extractSequence(a.id, 'APP'));
      const fd = a.formData || {};
      for (let n = 1; n <= 5; n += 1) {
        const form = fd[`form${n}`];
        if (form?.formId) bump(c, `F${n}`, extractSequence(form.formId, `F${n}`));
      }
    });
    data.hearings?.forEach((h) => bump(c, 'HRG', extractSequence(h.id, 'HRG')));
    data.notifications?.forEach((n) => bump(c, 'NOT', extractSequence(n.id, 'NOT')));
    data.auditLogs?.forEach((a) => bump(c, 'AUD', extractSequence(a.id, 'AUD')));
    data.reports?.forEach((r) => bump(c, 'RPT', extractSequence(r.id, 'RPT')));

    return c;
  }

  function next(data, entityType) {
    const prefix = prefixFor(entityType);
    ensureCounters(data);
    data.idCounters[prefix] = (data.idCounters[prefix] || 0) + 1;
    return format(prefix, data.idCounters[prefix]);
  }

  function preview(data, entityType) {
    const prefix = prefixFor(entityType);
    ensureCounters(data);
    return format(prefix, (data.idCounters[prefix] || 0) + 1);
  }

  function isOfficerRole(role) {
    return !!role && role !== 'System Administrator';
  }

  function assignFormId(data, formKey, formData) {
    const n = parseInt(String(formKey).replace('form', ''), 10);
    if (!Number.isFinite(n) || n < 1 || n > 5) return formData;
    const entityType = `form${n}`;
    if (formData.formId) return formData;
    return { ...formData, formId: next(data, entityType) };
  }

  return {
    ENTITY_PREFIX,
    format,
    extractSequence,
    ensureCounters,
    next,
    preview,
    isOfficerRole,
    assignFormId,
  };
})();
