; Extra steps for the installer / uninstaller.
; Deskly can start with Windows (a "Run" entry written by the app). Remove it when Deskly is uninstalled,
; so Windows is not left looking for a program that is gone.
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Deskly"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Deskly"
!macroend
