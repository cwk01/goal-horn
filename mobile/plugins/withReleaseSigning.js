// Signs release builds with the Goal Horn upload key when the build passes one in:
//   ./gradlew assembleRelease -PGOALHORN_STORE_FILE=/path/goal-horn.jks \
//     -PGOALHORN_STORE_PASSWORD=... -PGOALHORN_KEY_ALIAS=goal-horn -PGOALHORN_KEY_PASSWORD=...
// Without those, release builds fall back to the debug key, like a fresh Expo project.
// Phones only install an update signed with the same key as the copy they have, so
// every published APK must use the same upload key.
const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING = `
        release {
            if (project.hasProperty('GOALHORN_STORE_FILE')) {
                storeFile file(GOALHORN_STORE_FILE)
                storePassword GOALHORN_STORE_PASSWORD
                keyAlias GOALHORN_KEY_ALIAS
                keyPassword GOALHORN_KEY_PASSWORD
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, cfg => {
    let g = cfg.modResults.contents;
    if (g.includes('GOALHORN_STORE_FILE')) return cfg;
    // Add a release signing config next to the debug one.
    g = g.replace(/signingConfigs\s*\{/, m => m + SIGNING);
    // Point the release build type at it when the key was passed in.
    g = g.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
      "$1signingConfig project.hasProperty('GOALHORN_STORE_FILE') ? signingConfigs.release : signingConfigs.debug");
    cfg.modResults.contents = g;
    return cfg;
  });
};
