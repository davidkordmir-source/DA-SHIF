Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!ifndef PROJECT_ROOT
  !error "PROJECT_ROOT is required"
!endif
!ifndef APP_VERSION
  !define APP_VERSION "2.3.0"
!endif
Name "هم‌شیفت"
OutFile "${PROJECT_ROOT}/out/Hamshift-Setup-${APP_VERSION}-x64.exe"
InstallDir "$LOCALAPPDATA\Programs\Hamshift"
InstallDirRegKey HKCU "Software\Hamshift" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 256
SetDatablockOptimize on
BrandingText "Hamshift — Offline Staff Scheduler"
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Hamshift"
VIAddVersionKey /LANG=1033 "FileDescription" "Hamshift Offline Staff Scheduler Setup"
VIAddVersionKey /LANG=1033 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Hamshift"
!define MUI_ICON "${PROJECT_ROOT}/assets/hamshift.ico"
!define MUI_UNICON "${PROJECT_ROOT}/assets/hamshift.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Hamshift.exe"
!define MUI_FINISHPAGE_RUN_TEXT "اجرای هم‌شیفت"
!define MUI_WELCOMEPAGE_TITLE "به نصب هم‌شیفت خوش آمدید"
!define MUI_WELCOMEPAGE_TEXT "مدیریت آفلاین شیفت پرسنل، با تم‌های متنوع و لوگوی دلخواه.$\r$\n$\r$\nبرنامه به اینترنت و مرورگر نیاز ندارد. پیش از نصب یا به‌روزرسانی، هم‌شیفت را ببندید.$\r$\n$\r$\nبرای ادامه، روی بعدی کلیک کنید."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Farsi"
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "این نسخه برای ویندوز ۶۴ بیتی است."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "این نسخه به ویندوز ۱۰ یا جدیدتر نیاز دارد."
    Abort
  ${EndIf}
FunctionEnd

Section "Hamshift" SEC_MAIN
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${PROJECT_ROOT}/out/win-unpacked/*"
  File /oname=راهنمای-لوگوی-شروع.txt "${PROJECT_ROOT}/installer/logo-guide.txt"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Hamshift" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hamshift" "DisplayName" "هم‌شیفت — مدیریت شیفت پرسنل"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hamshift" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hamshift" "Publisher" "Hamshift"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hamshift" "DisplayIcon" "$INSTDIR\Hamshift.exe,0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hamshift" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hamshift" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hamshift" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hamshift" "NoRepair" 1
  CreateDirectory "$SMPROGRAMS\Hamshift"
  CreateShortcut "$SMPROGRAMS\Hamshift\هم‌شیفت.lnk" "$INSTDIR\Hamshift.exe" "" "$INSTDIR\Hamshift.exe" 0
  CreateShortcut "$SMPROGRAMS\Hamshift\حذف هم‌شیفت.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\هم‌شیفت.lnk" "$INSTDIR\Hamshift.exe" "" "$INSTDIR\Hamshift.exe" 0
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION "فایل‌های برنامه حذف می‌شوند. داده‌های پرسنل و پشتیبان‌ها در پوشهٔ کاربری باقی می‌مانند. ادامه می‌دهید؟" IDYES +2
    Abort
  ${EndIf}
  Delete "$DESKTOP\هم‌شیفت.lnk"
  Delete "$SMPROGRAMS\Hamshift\هم‌شیفت.lnk"
  Delete "$SMPROGRAMS\Hamshift\حذف هم‌شیفت.lnk"
  RMDir "$SMPROGRAMS\Hamshift"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hamshift"
  DeleteRegKey HKCU "Software\Hamshift"
  !include "${PROJECT_ROOT}/out/uninstall-files.nsh"
  Delete "$INSTDIR\راهنمای-لوگوی-شروع.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
