$root = "c:\Users\ID230186\OneDrive\Desktop\PMS"
$faLink = '  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.1/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">'
$utf8 = New-Object System.Text.UTF8Encoding $false

$pairs = @(
  @('bi bi-file-earmark-spreadsheet', 'fa-solid fa-file-excel'),
  @('bi bi-arrow-right-circle', 'fa-solid fa-circle-arrow-right'),
  @('bi bi-file-earmark-check', 'fa-solid fa-file-circle-check'),
  @('bi bi-file-earmark-text', 'fa-solid fa-file-lines'),
  @('bi bi-person-lines-fill', 'fa-solid fa-address-card'),
  @('bi bi-check-circle-fill', 'fa-solid fa-circle-check'),
  @('bi bi-hourglass-split', 'fa-solid fa-hourglass-half'),
  @('bi bi-exclamation-triangle', 'fa-solid fa-triangle-exclamation'),
  @('bi bi-exclamation-circle', 'fa-solid fa-circle-exclamation'),
  @('bi bi-arrow-up-right', 'fa-solid fa-arrow-up-right'),
  @('bi bi-calendar-event', 'fa-solid fa-calendar-days'),
  @('bi bi-calendar-range', 'fa-solid fa-calendar-week'),
  @('bi bi-clock-history', 'fa-solid fa-clock-rotate-left'),
  @('bi bi-pencil-square', 'fa-solid fa-pen-to-square'),
  @('bi bi-person-circle', 'fa-solid fa-circle-user'),
  @('bi bi-person-badge', 'fa-solid fa-id-badge'),
  @('bi bi-person-vcard', 'fa-solid fa-id-card'),
  @('bi bi-person-lock', 'fa-solid fa-user-lock'),
  @('bi bi-person-plus', 'fa-solid fa-user-plus'),
  @('bi bi-shield-lock', 'fa-solid fa-shield-halved'),
  @('bi bi-hand-thumbs-up', 'fa-solid fa-thumbs-up'),
  @('bi bi-filetype-csv', 'fa-solid fa-file-csv'),
  @('bi bi-bar-chart-line', 'fa-solid fa-chart-line'),
  @('bi bi-journal-text', 'fa-solid fa-book'),
  @('bi bi-speedometer2', 'fa-solid fa-gauge-high'),
  @('bi bi-check-circle', 'fa-solid fa-circle-check'),
  @('bi bi-info-circle', 'fa-solid fa-circle-info'),
  @('bi bi-chevron-right', 'fa-solid fa-chevron-right'),
  @('bi bi-arrow-left', 'fa-solid fa-arrow-left'),
  @('bi bi-eye-slash', 'fa-solid fa-eye-slash'),
  @('bi bi-lock-fill', 'fa-solid fa-lock'),
  @('bi bi-check-lg', 'fa-solid fa-check'),
  @('bi bi-calculator', 'fa-solid fa-calculator'),
  @('bi bi-paperclip', 'fa-solid fa-paperclip'),
  @('bi bi-building', 'fa-solid fa-building'),
  @('bi bi-printer', 'fa-solid fa-print'),
  @('bi bi-pencil', 'fa-solid fa-pencil'),
  @('bi bi-hammer', 'fa-solid fa-gavel'),
  @('bi bi-search', 'fa-solid fa-magnifying-glass'),
  @('bi bi-scales', 'fa-solid fa-scale-balanced'),
  @('bi bi-people', 'fa-solid fa-users'),
  @('bi bi-clock', 'fa-solid fa-clock'),
  @('bi bi-circle', 'fa-regular fa-circle'),
  @('bi bi-send', 'fa-solid fa-paper-plane'),
  @('bi bi-list', 'fa-solid fa-bars'),
  @('bi bi-bell', 'fa-solid fa-bell'),
  @('bi bi-gear', 'fa-solid fa-gear'),
  @('bi bi-key', 'fa-solid fa-key'),
  @('bi bi-x-lg', 'fa-solid fa-xmark'),
  @('bi bi-lock', 'fa-solid fa-lock'),
  @('bi bi-eye', 'fa-solid fa-eye'),
  @('bi bi-person', 'fa-solid fa-user')
)

$iconVals = @(
  @("'bi-file-earmark-spreadsheet'", "'fa-solid fa-file-excel'"),
  @("'bi-file-earmark-check'", "'fa-solid fa-file-circle-check'"),
  @("'bi-file-earmark-text'", "'fa-solid fa-file-lines'"),
  @("'bi-check-circle-fill'", "'fa-solid fa-circle-check'"),
  @("'bi-hourglass-split'", "'fa-solid fa-hourglass-half'"),
  @("'bi-exclamation-triangle'", "'fa-solid fa-triangle-exclamation'"),
  @("'bi-exclamation-circle'", "'fa-solid fa-circle-exclamation'"),
  @("'bi-calendar-event'", "'fa-solid fa-calendar-days'"),
  @("'bi-clock-history'", "'fa-solid fa-clock-rotate-left'"),
  @("'bi-pencil-square'", "'fa-solid fa-pen-to-square'"),
  @("'bi-person-lock'", "'fa-solid fa-user-lock'"),
  @("'bi-check-circle'", "'fa-solid fa-circle-check'"),
  @("'bi-info-circle'", "'fa-solid fa-circle-info'"),
  @("'bi-hand-thumbs-up'", "'fa-solid fa-thumbs-up'"),
  @("'bi-journal-text'", "'fa-solid fa-book'"),
  @("'bi-lock-fill'", "'fa-solid fa-lock'"),
  @("'bi-paperclip'", "'fa-solid fa-paperclip'"),
  @("'bi-building'", "'fa-solid fa-building'"),
  @("'bi-people'", "'fa-solid fa-users'"),
  @("'bi-circle'", "'fa-regular fa-circle'"),
  @("'bi-person'", "'fa-solid fa-user'"),
  @("'bi-bell'", "'fa-solid fa-bell'")
)

$files = Get-ChildItem -Path $root -Recurse -Include *.html,*.js,*.css |
  Where-Object { $_.FullName -notmatch '\\(\.git|node_modules|server)\\' -and $_.Name -ne '_switch_fa.ps1' }

foreach ($file in $files) {
  $text = [System.IO.File]::ReadAllText($file.FullName, $utf8)
  $orig = $text
  if ($file.Extension -eq '.html') {
    if ($text -notmatch 'font-awesome/7\.3\.1/css/all\.min\.css') {
      if ($text -match '<link[^>]*bootstrap-icons[^>]*>') {
        $text = [regex]::Replace($text, '[ \t]*<link[^>]*bootstrap-icons[^>]*>\r?\n?', ($faLink + "`n"), 1)
      } elseif ($text -match 'bootstrap@5\.3\.3/dist/css/bootstrap\.min\.css') {
        $text = $text.Replace(
          '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">',
          '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">' + "`n" + $faLink,
          1
        )
      } else {
        $text = $text.Replace('</head>', $faLink + "`n</head>", 1)
      }
    } else {
      $text = [regex]::Replace($text, '[ \t]*<link[^>]*bootstrap-icons[^>]*>\r?\n?', '')
    }
  }
  $text = $text.Replace('class="bi ${', 'class="${')
  foreach ($p in $iconVals) { $text = $text.Replace($p[0], $p[1]) }
  foreach ($p in $pairs) { $text = $text.Replace($p[0], $p[1]) }
  if ($text -ne $orig) {
    [System.IO.File]::WriteAllText($file.FullName, $text, $utf8)
    Write-Output $file.FullName
  }
}
