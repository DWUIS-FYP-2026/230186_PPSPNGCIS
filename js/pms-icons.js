/**
 * PMS — Central Flaticon Uicons map (Regular Rounded).
 * Use fi fi-rr-* everywhere for a uniform look.
 */
const PMSIcons = (() => {
  const I = {
    dashboard: 'fi fi-rr-dashboard',
    users: 'fi fi-rr-users',
    user: 'fi fi-rr-user',
    userAdd: 'fi fi-rr-user-add',
    userLock: 'fi fi-rr-user-lock',
    idBadge: 'fi fi-rr-id-badge',
    idCard: 'fi fi-rr-id-card',
    addressCard: 'fi fi-rr-address-card',
    building: 'fi fi-rr-building',
    bell: 'fi fi-rr-bell',
    chart: 'fi fi-rr-chart-line-up',
    book: 'fi fi-rr-book',
    journal: 'fi fi-rr-journal',
    settings: 'fi fi-rr-settings',
    profile: 'fi fi-rr-user',
    document: 'fi fi-rr-document',
    file: 'fi fi-rr-file',
    fileExcel: 'fi fi-rr-file-excel',
    fileCsv: 'fi fi-rr-file-csv',
    search: 'fi fi-rr-search',
    calendar: 'fi fi-rr-calendar',
    checkCircle: 'fi fi-rr-check-circle',
    circle: 'fi fi-rr-circle',
    lock: 'fi fi-rr-lock',
    shield: 'fi fi-rr-shield',
    gavel: 'fi fi-rr-gavel',
    scale: 'fi fi-rr-scale',
    history: 'fi fi-rr-time-past',
    menu: 'fi fi-rr-menu-burger',
    clock: 'fi fi-rr-clock',
    close: 'fi fi-rr-cross',
    send: 'fi fi-rr-paper-plane',
    eye: 'fi fi-rr-eye',
    eyeOff: 'fi fi-rr-eye-crossed',
    key: 'fi fi-rr-key',
    arrowRight: 'fi fi-rr-arrow-right',
    arrowLeft: 'fi fi-rr-arrow-left',
    arrowUpRight: 'fi fi-rr-arrow-up-right',
    chevronRight: 'fi fi-rr-angle-right',
    edit: 'fi fi-rr-edit',
    pencil: 'fi fi-rr-pencil',
    print: 'fi fi-rr-print',
    calculator: 'fi fi-rr-calculator',
    paperclip: 'fi fi-rr-paperclip',
    info: 'fi fi-rr-info',
    warning: 'fi fi-rr-triangle-warning',
    exclamation: 'fi fi-rr-exclamation',
    hourglass: 'fi fi-rr-hourglass',
    thumbsUp: 'fi fi-rr-thumbs-up',
    check: 'fi fi-rr-check',
    folder: 'fi fi-rr-folder',
  };

  function html(name, extraClass = '') {
    const cls = I[name] || name;
    return `<i class="${cls}${extraClass ? ` ${extraClass}` : ''}" aria-hidden="true"></i>`;
  }

  return { I, html };
})();
