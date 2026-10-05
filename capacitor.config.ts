import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.terraforge.mobile",
  appName: "terraForge",
  webDir: "dist-mobile",
  server: {
    // Serve the app from http://localhost (not https) so the WebView doesn't
    // block ws:// connections to the plotter as mixed content.
    androidScheme: "http",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // We call CapacitorHttp explicitly (src/mobile/http.ts); leave global
    // fetch/XHR patching off so multipart upload progress keeps working.
    CapacitorHttp: { enabled: false },
  },
};

export default config;
