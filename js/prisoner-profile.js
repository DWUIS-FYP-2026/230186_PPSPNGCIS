(async () => {
  await PMSStorage.ensureLoaded();
  const session = PMSStorage.getSession();
  if (!session) {
    window.location.replace('index.html');
    return;
  }

  const actor = PMSStorage.getUserById(session.id) || session;
  actor.role = PMSAuth.normalizeRole(actor.role);

  const params = new URLSearchParams(window.location.search);
  const prisonerId = params.get('id');
  if (!prisonerId) {
    PMSAuth.redirectAccessDenied('No prisoner record specified.');
    return;
  }

  const prisoner = PMSRBAC.requirePrisonerView(actor, prisonerId);
  if (!prisoner) return;

  PMSStorage.logAudit(actor, 'READ', 'Prisoner', prisoner.id, `Viewed case file ${prisoner.prisonerNumber}`);

  const canEdit = PMSRBAC.canModifyPrisoner(actor);
  const root = document.getElementById('case-file-root');
  function renderCase() {
    root.innerHTML = PMSPrisonerUI.renderCaseFile(prisoner, { showEditLink: canEdit, actor });
    document.getElementById('btn-print-case')?.addEventListener('click', () => window.print());
  }
  renderCase();
  PMSUI.bindApplicationActionHandlers(renderCase);

  PMSPageChrome.init({ basePath: '' });

  PMSSidebar.init({
    user: actor,
    activePanel: 'prisoners',
    onNavigate: (panel) => {
      window.location.href = `${PMSAuth.getDashboardForRole(actor.role)}?panel=${panel}`;
    },
  });
  PMSBrand?.upgradeCommandBadges?.();
  PMSUI.initShell(actor);
})();
