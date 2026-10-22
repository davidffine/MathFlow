@echo off
setlocal EnableExtensions
cd /d "%~dp0.." || exit /b 1

if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined ANDROID_HOME (
  echo Android SDK not found. Open Android Studio and install SDK Platform 35 and Platform Tools.
  exit /b 1
)
if not exist "%ANDROID_HOME%\platform-tools\adb.exe" (
  echo adb.exe not found under %ANDROID_HOME%.
  exit /b 1
)

if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" (
  set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
  set "PATH=%ProgramFiles%\Android\Android Studio\jbr\bin;%PATH%"
)
set "PATH=%ANDROID_HOME%\platform-tools;%PATH%"
set "SDK_SLASH=%ANDROID_HOME:\=/%"
>"android\local.properties" echo sdk.dir=%SDK_SLASH%

"%ANDROID_HOME%\platform-tools\adb.exe" get-state >nul 2>nul
if errorlevel 1 (
  echo No single connected Android device was found. Check Wi-Fi debugging and run adb devices.
  "%ANDROID_HOME%\platform-tools\adb.exe" devices
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  call npm ci || exit /b 1
)
call npm run cap:sync || exit /b 1
pushd android || exit /b 1
call gradlew.bat assembleDebug --no-daemon
set "BUILD_RESULT=%ERRORLEVEL%"
popd
if not "%BUILD_RESULT%"=="0" exit /b %BUILD_RESULT%

"%ANDROID_HOME%\platform-tools\adb.exe" install -r "android\app\build\outputs\apk\debug\app-debug.apk" || exit /b 1
"%ANDROID_HOME%\platform-tools\adb.exe" shell am start -n app.mathflow.mobile/.MainActivity || exit /b 1
echo MathFlow is running on the connected phone.
