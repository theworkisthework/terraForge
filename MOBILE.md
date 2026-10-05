# terraForge Mobile (Android, via Capacitor)

The mobile app is the existing React renderer + G-code Web Worker wrapped in a
Capacitor WebView. Electron's main process is replaced by `src/mobile/`, which
implements the same `window.terraForge` API in the WebView.

| Desktop (Electron main)            | Mobile (`src/mobile/`)                              |
| ---------------------------------- | --------------------------------------------------- |
| `machine/fluidnc.ts` (Node http/ws)| `fluidncWeb.ts` (CapacitorHttp / XHR / WebSocket)   |
| native open/save dialogs           | `files.ts` (file picker + share sheet, virtual paths)|
| JSON files in userData             | `persistence.ts` (localStorage)                      |
| native menus                       | `window.terraForgeMobile` + "More" menu              |
| mouse canvas gestures              | `touchBridge.ts` (touch → mouse/wheel events)        |
| 3-panel layout                     | `components/MobileShell.tsx` (bottom tabs, <768px)   |

## Commands

    npm install
    npm run mobile:dev      # run in a browser (use devtools device mode)
    npm run mobile:android  # build, sync, open Android Studio
    npm run mobile:apk      # debug APK (needs JDK 17+ and Android SDK)

## Not supported yet
- USB serial (Wi-Fi only)
- iOS (add with `npx cap add ios` on macOS)
