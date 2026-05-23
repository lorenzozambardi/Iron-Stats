import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.algorithmicbodybuilding.app',
  appName: 'Algorithmic Bodybuilding',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
