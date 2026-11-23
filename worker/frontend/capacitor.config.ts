import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ru.soyuz.app",
  appName: "СОЮЗ",
  webDir: "../assets/next",
  bundledWebRuntime: false,
  plugins: {
    Keyboard: {
      resize: "body",
      style: "light",
    },
    Haptics: {},
  },
};

export default config;
