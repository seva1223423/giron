---
name: Реферат Кудриной — видео на Google Drive
description: Setup для повторных загрузок mp4 видео реферата на Drive с заменой существующего файла
type: project
originSessionId: caeaef3a-f4b7-4735-9135-9e3e891d1dc3
---
Видео реферата Кудриной по теме «Образы будущего общества в мировом художественном кинематографе» лежит локально на Рабочем столе и зеркалится в папку на Google Drive пользователя. Пользователь хочет уметь по запросу перезаливать новые версии в ту же папку с заменой.

**Файлы и пути:**
- Локальный pptx: `C:\Users\sevka\Desktop\ZiOF_referat_Kudrina_KTs-24-09.pptx` (~739 МБ, 21 слайд)
- Локальный mp4 (последняя сборка от 2026-05-11): `C:\Users\sevka\Desktop\ZiOF_referat_Kudrina_KTs-24-09.mp4` (~590 МБ, 31:13, 1080p H.264 Constrained Baseline + AAC LC, faststart)
- Целевая папка на Drive: `gdrive:ZiOF_Referat_Kudrina_Video`
- Текущая ссылка на папку: https://drive.google.com/drive/folders/1mZ8rIXrdBZGCo7EC4tB7-RCbhASrIrIV (доступ "у кого есть ссылка — может просматривать")

**Команда для перезаливки (заменяет существующий файл):**
```
"C:\Users\sevka\AppData\Local\Microsoft\WinGet\Packages\Rclone.Rclone_Microsoft.Winget.Source_8wekyb3d8bbwe\rclone-v1.74.1-windows-amd64\rclone.exe" copy "C:\Users\sevka\Desktop\ZiOF_referat_Kudrina_KTs-24-09.mp4" gdrive:ZiOF_Referat_Kudrina_Video --progress --stats=10s --stats-one-line --drive-chunk-size=64M
```
`rclone copy` по умолчанию перезаписывает файл с тем же именем при разнице в размере или mtime. Для принудительной перезаписи добавить `--ignore-times`.

**Why:** пользователь будет пересобирать видео из pptx через PowerPoint CreateVideo (PowerPoint неактивирован, но через GetActiveObject COM сценарий работает после ручного закрытия Activation Wizard). Каждая новая сборка должна попадать на тот же Drive-линк, чтобы преподаватель видел актуальную версию по той же ссылке.

**How to apply:** при просьбе «обнови видео на Drive» / «залей заново» / «replace на гугл диске» — сразу выполнить rclone copy выше, без переспроса о папке/имени. Если видео ещё не пересобрано — сначала перегенерировать mp4 через PowerPoint COM (см. историю — скрипт `_export_video2.ps1` использовал GetActiveObject + Try-Com retry на RPC_E_CALL_REJECTED).

**Установленный софт под эту задачу:**
- ffmpeg (Gyan.FFmpeg) — для faststart-remux и проверки кодеков
- rclone (Rclone.Rclone) — конфиг `gdrive` уже создан в `C:\Users\sevka\AppData\Roaming\rclone\rclone.conf`
- VLC (VideoLAN.VLC) — локальный плеер (у пользователя сломана ассоциация .mp4 со старым WMP)
