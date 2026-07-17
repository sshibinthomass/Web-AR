import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { apertureLogoUrl, arveniloLockupUrl } from '../../src/ui/brandAssets';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string): Buffer => readFileSync(resolve(repoRoot, path));
const sha256 = (path: string): string => createHash('sha256').update(read(path)).digest('hex').toUpperCase();

const expectedFontHashes = {
  'src/assets/fonts/sora-latin-wght-normal.woff2': 'FA26406EEDA9A3C6EC3D9EA8813C3045D6DC755E30C716D5C094E8EF43BE5A7F',
  'src/assets/fonts/inter-latin-wght-normal.woff2': '3100E775E8616CD2611BEECFA23A4263D7037586789B43F035236A2E6FBD4C62',
  'src/assets/fonts/inter-latin-wght-italic.woff2': '7291B5970DA2237441273C03B424A504B70B18F09791473FAB99687DCC314720',
  'src/assets/fonts/ibm-plex-mono-latin-400-normal.woff2': '08949F728DC52D528E69B1667D15C89A5686A4EE9A296FF90983985F99C380F7',
  'src/assets/fonts/ibm-plex-mono-latin-400-italic.woff2': '0840095FAAE86403735A8C04014B72CB29E7923646B222B360B7E8252932E4E3',
  'src/assets/fonts/ibm-plex-mono-latin-500-normal.woff2': '01D285447409C8A588692162439A038B8CBD7871309EE20267B0D2D91C6E8E22',
  'src/assets/fonts/ibm-plex-mono-latin-500-italic.woff2': '528CC360F6E6F5210526A33B6ED8F2C37084BD0C73B918F25A55F48B40C4AC52',
} as const;

const expectedFontLicenseHashes = {
  'src/assets/fonts/LICENSE-Sora.txt': '1EC9623D38C445EB4DFE5FCC783E0F0EE728CC97CA157CE1F8CB2B3BF9D9B0D9',
  'src/assets/fonts/LICENSE-Inter.txt': '3B0A5FCA3D17942CDE889069889DEDBBBD075E9B599968C82A95F4D944E9B345',
  'src/assets/fonts/LICENSE-IBM-Plex-Mono.txt': '23B0A9D0C6D3F140A0B77E483C5CFA6BBA574325EF5CB189ED9F2FEC4884533F',
} as const;

describe('WebXRify brand assets', () => {
  it('uses byte-identical approved master assets and endorsed metadata', () => {
    expect(sha256('src/assets/brand/00-arvenilo-master-transparent-logo.png')).toBe(
      '919F3CC2A9377A99C0430D3CEEA8490D3B0C44E568BE112CA3854AC9A1BE5D48',
    );
    expect(sha256('src/assets/brand/00-arvenilo-master-transparent.png')).toBe(
      'C163A582BF0F1D9E860938282DAE6C2A1A39E457019D642E6A74E104AB0F7721',
    );
    expect(apertureLogoUrl).toContain('00-arvenilo-master-transparent-logo.png');
    expect(arveniloLockupUrl).toContain('00-arvenilo-master-transparent.png');

    const indexHtml = read('index.html').toString('utf8');
    expect(indexHtml).toContain('<title>WebXRify by Arvenilo</title>');
    expect(indexHtml).toContain('name="application-name" content="WebXRify by Arvenilo"');
    expect(indexHtml).toContain('name="theme-color" content="#F4FBFA"');
    expect(indexHtml).toContain('/src/assets/brand/00-arvenilo-master-transparent-logo.png');

    const packageJson = JSON.parse(read('package.json').toString('utf8')) as {
      name: string;
      description: string;
    };
    expect(packageJson.name).toBe('webxrify');
    expect(packageJson.description).toContain('WebXRify by Arvenilo');

    const interfaceSources = [
      'index.html',
      'src/main.ts',
      'src/ui/ApplicationShell.ts',
      'src/ui/ARHud.ts',
      'src/ui/routes.ts',
    ].map((path) => read(path).toString('utf8')).join('\n');
    expect(interfaceSources).not.toMatch(/Anima You 3D|Arvenilo Agent|WebXRify Agent/i);
  });

  it('keeps the approved local font bundle byte-stable and removes Fontsource dependencies', () => {
    for (const [runtime, expectedHash] of [
      ...Object.entries(expectedFontHashes),
      ...Object.entries(expectedFontLicenseHashes),
    ]) {
      expect(existsSync(resolve(repoRoot, runtime)), `${runtime} should be present`).toBe(true);
      expect(sha256(runtime), `${runtime} should match its approved SHA-256 hash`).toBe(expectedHash);
    }

    expect(read('src/main.ts').toString('utf8')).not.toContain('@fontsource');
    const packageJson = JSON.parse(read('package.json').toString('utf8')) as {
      dependencies?: Record<string, string>;
    };
    for (const dependency of [
      '@fontsource/ibm-plex-mono',
      '@fontsource/sora',
      '@fontsource/source-sans-3',
    ]) {
      expect(packageJson.dependencies).not.toHaveProperty(dependency);
    }
  });
});
