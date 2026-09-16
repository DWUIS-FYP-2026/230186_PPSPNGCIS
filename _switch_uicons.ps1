$root = "c:\Users\ID230186\OneDrive\Desktop\PMS"
$utf8 = New-Object System.Text.UTF8Encoding $false
$faLinkRe = '[ \t]*<link[^>]*font-awesome[^>]*>\r?\n?'

$pairs = @(
  @('fa-solid fa-file-excel', 'fi fi-rr-file-excel'),
  @('fa-solid fa-file-csv', 'fi fi-rr-file-csv'),
  @('fa-solid fa-circle-arrow-right', 'fi fi-rr-arrow-right'),
  @('fa-solid fa-file-circle-check', 'fi fi-rr-file'),
  @('fa-solid fa-scale-balanced', 'fi fi-rr-scale'),
  @('fa-solid fa-shield-halved', 'fi fi-rr-shield'),
  @('fa-solid fa-circle-exclamation', 'fi fi-rr-exclamation'),
  @('fa-solid fa-hourglass-half', 'fi fi-rr-hourglass'),
  @('fa-solid fa-triangle-exclamation', 'fi fi-rr-triangle-warning'),
  @('fa-solid fa-clock-rotate-left', 'fi fi-rr-time-past'),
  @('fa-solid fa-pen-to-square', 'fi fi-rr-edit'),
  @('fa-solid fa-circle-user', 'fi fi-rr-user'),
  @('fa-solid fa-address-card', 'fi fi-rr-address-card'),
  @('fa-solid fa-user-lock', 'fi fi-rr-user-lock'),
  @('fa-solid fa-user-plus', 'fi fi-rr-user-add'),
  @('fa-solid fa-hand-thumbs-up', 'fi fi-rr-thumbs-up'),
  @('fa-solid fa-arrow-up-right', 'fi fi-rr-arrow-up-right'),
  @('fa-solid fa-calendar-days', 'fi fi-rr-calendar'),
  @('fa-solid fa-chart-line', 'fi fi-rr-chart-line-up'),
  @('fa-solid fa-gauge-high', 'fi fi-rr-dashboard'),
  @('fa-solid fa-circle-check', 'fi fi-rr-check-circle'),
  @('fa-solid fa-circle-info', 'fi fi-rr-info'),
  @('fa-solid fa-chevron-right', 'fi fi-rr-angle-right'),
  @('fa-solid fa-eye-slash', 'fi fi-rr-eye-crossed'),
  @('fa-solid fa-magnifying-glass', 'fi fi-rr-search'),
  @('fa-solid fa-file-lines', 'fi fi-rr-document'),
  @('fa-solid fa-paper-plane', 'fi fi-rr-paper-plane'),
  @('fa-solid fa-id-badge', 'fi fi-rr-id-badge'),
  @('fa-solid fa-id-card', 'fi fi-rr-id-card'),
  @('fa-solid fa-person-lines-fill', 'fi fi-rr-address-card'),
  @('fa-solid fa-check-circle-fill', 'fi fi-rr-check-circle'),
  @('fa-solid fa-lock-fill', 'fi fi-rr-lock'),
  @('fa-solid fa-pencil-square', 'fi fi-rr-edit'),
  @('fa-solid fa-check-lg', 'fi fi-rr-check'),
  @('fa-regular fa-circle', 'fi fi-rr-circle'),
  @('fa-solid fa-users', 'fi fi-rr-users'),
  @('fa-solid fa-clock', 'fi fi-rr-clock'),
  @('fa-solid fa-bell', 'fi fi-rr-bell'),
  @('fa-solid fa-gear', 'fi fi-rr-settings'),
  @('fa-solid fa-book', 'fi fi-rr-book'),
  @('fa-solid fa-journal-text', 'fi fi-rr-journal'),
  @('fa-solid fa-gavel', 'fi fi-rr-gavel'),
  @('fa-solid fa-bars', 'fi fi-rr-menu-burger'),
  @('fa-solid fa-user', 'fi fi-rr-user'),
  @('fa-solid fa-lock', 'fi fi-rr-lock'),
  @('fa-solid fa-eye', 'fi fi-rr-eye'),
  @('fa-solid fa-key', 'fi fi-rr-key'),
  @('fa-solid fa-pencil', 'fi fi-rr-pencil'),
  @('fa-solid fa-print', 'fi fi-rr-print'),
  @('fa-solid fa-arrow-left', 'fi fi-rr-arrow-left'),
  @('fa-solid fa-calculator', 'fi fi-rr-calculator'),
  @('fa-solid fa-paperclip', 'fi fi-rr-paperclip'),
  @('fa-solid fa-xmark', 'fi fi-rr-cross'),
  @('fa-solid fa-building', 'fi fi-rr-building'),
  @('fa-solid fa-exclamation-circle', 'fi fi-rr-exclamation'),
  @('fa-solid fa-exclamation-triangle', 'fi fi-rr-triangle-warning'),
  @('fa-solid fa-info-circle', 'fi fi-rr-info'),
  @('fa-solid fa-check-circle', 'fi fi-rr-check-circle'),
  @('fa-solid fa-person-badge', 'fi fi-rr-id-badge'),
  @('fa-solid fa-person-vcard', 'fi fi-rr-id-card'),
  @('fa-solid fa-person-lock', 'fi fi-rr-user-lock'),
  @('fa-solid fa-calendar-event', 'fi fi-rr-calendar'),
  @('fa-solid fa-calendar-range', 'fi fi-rr-calendar'),
  @('fa-solid fa-file-earmark-text', 'fi fi-rr-document'),
  @('fa-solid fa-send', 'fi fi-rr-paper-plane'),
  @('bi-shield-lock', 'fi fi-rr-shield'),
  @('bi bi-file-earmark-text', 'fi fi-rr-document'),
  @('bi bi-info-circle', 'fi fi-rr-info'),
  @('bi bi-person-lines-fill', 'fi fi-rr-address-card'),
  @('bi bi-check-circle-fill', 'fi fi-rr-check-circle'),
  @('bi bi-lock-fill', 'fi fi-rr-lock'),
  @('bi bi-shield-lock', 'fi fi-rr-shield'),
  @('bi bi-hourglass-split', 'fi fi-rr-hourglass'),
  @('bi bi-pencil-square', 'fi fi-rr-edit'),
  @('bi bi-circle', 'fi fi-rr-circle'),
  @('📁', '<i class="fi fi-rr-folder" aria-hidden="true"></i>')
)

$iconVals = @(
  @("'fa-solid fa-file-excel'", "'fi fi-rr-file-excel'"),
  @("'fa-solid fa-file-csv'", "'fi fi-rr-file-csv'"),
  @("'fa-solid fa-file-lines'", "'fi fi-rr-document'"),
  @("'fa-solid fa-file-circle-check'", "'fi fi-rr-file'"),
  @("'fa-solid fa-check-circle-fill'", "'fi fi-rr-check-circle'"),
  @("'fa-solid fa-hourglass-half'", "'fi fi-rr-hourglass'"),
  @("'fa-solid fa-exclamation-triangle'", "'fi fi-rr-triangle-warning'"),
  @("'fa-solid fa-exclamation-circle'", "'fi fi-rr-exclamation'"),
  @("'fa-solid fa-calendar-event'", "'fi fi-rr-calendar'"),
  @("'fa-solid fa-clock-rotate-left'", "'fi fi-rr-time-past'"),
  @("'fa-solid fa-pencil-square'", "'fi fi-rr-edit'"),
  @("'fa-solid fa-person-lock'", "'fi fi-rr-user-lock'"),
  @("'fa-solid fa-check-circle'", "'fi fi-rr-check-circle'"),
  @("'fa-solid fa-circle-info'", "'fi fi-rr-info'"),
  @("'fa-solid fa-hand-thumbs-up'", "'fi fi-rr-thumbs-up'"),
  @("'fa-solid fa-journal-text'", "'fi fi-rr-journal'"),
  @("'fa-solid fa-lock-fill'", "'fi fi-rr-lock'"),
  @("'fa-solid fa-paperclip'", "'fi fi-rr-paperclip'"),
  @("'fa-solid fa-building'", "'fi fi-rr-building'"),
  @("'fa-solid fa-people'", "'fi fi-rr-users'"),
  @("'fa-solid fa-circle'", "'fi fi-rr-circle'"),
  @("'fa-solid fa-person'", "'fi fi-rr-user'"),
  @("'fa-solid fa-bell'", "'fi fi-rr-bell'"),
  @("'bi-shield-lock'", "'fi fi-rr-shield'")
)

$files = Get-ChildItem -Path $root -Recurse -Include *.html,*.js -File |
  Where-Object { $_.FullName -notmatch '\\(\.git|node_modules|server)\\' -and $_.Name -notmatch '^_' }

foreach ($file in $files) {
  $text = [System.IO.File]::ReadAllText($file.FullName, $utf8)
  $orig = $text
  if ($file.Extension -eq '.html') {
    $text = [regex]::Replace($text, $faLinkRe, '')
  }
  foreach ($p in $iconVals) { $text = $text.Replace($p[0], $p[1]) }
  foreach ($p in $pairs) { $text = $text.Replace($p[0], $p[1]) }
  if ($text -ne $orig) {
    [System.IO.File]::WriteAllText($file.FullName, $text, $utf8)
    Write-Output $file.FullName
  }
}
