
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aivirtuallawyer.app',
  appName: 'AI Virtual Lawyer',
  webDir: '.',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: true
  },
  ios: {
    contentInset: 'always'
  }
};

export default config;
