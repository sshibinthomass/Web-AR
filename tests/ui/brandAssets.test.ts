import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { apertureLogoUrl, arveniloLockupUrl } from '../../src/ui/brandAssets';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = [repoRoot, resolve(repoRoot, '../..')].find((root) => (
  existsSync(resolve(root, 'Arvenilo-Design-Handoff'))
)) ?? repoRoot;
const read = (path: string): Buffer => readFileSync(resolve(
  path.startsWith('Arvenilo-Design-Handoff/') ? sourceRoot : repoRoot,
  path,
));
const sha256 = (path: string): string => createHash('sha256').update(read(path)).digest('hex').toUpperCase();

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

  it('copies the approved local font bundle and removes Fontsource dependencies', () => {
    const fontPairs = [
      ['Arvenilo-Design-Handoff/04-Fonts/Sora/sora-latin-wght-normal.woff2', 'src/assets/fonts/sora-latin-wght-normal.woff2'],
      ['Arvenilo-Design-Handoff/04-Fonts/Inter/inter-latin-wght-normal.woff2', 'src/assets/fonts/inter-latin-wght-normal.woff2'],
      ['Arvenilo-Design-Handoff/04-Fonts/Inter/inter-latin-wght-italic.woff2', 'src/assets/fonts/inter-latin-wght-italic.woff2'],
      ['Arvenilo-Design-Handoff/04-Fonts/IBM-Plex-Mono/ibm-plex-mono-latin-400-normal.woff2', 'src/assets/fonts/ibm-plex-mono-latin-400-normal.woff2'],
      ['Arvenilo-Design-Handoff/04-Fonts/IBM-Plex-Mono/ibm-plex-mono-latin-400-italic.woff2', 'src/assets/fonts/ibm-plex-mono-latin-400-italic.woff2'],
      ['Arvenilo-Design-Handoff/04-Fonts/IBM-Plex-Mono/ibm-plex-mono-latin-500-normal.woff2', 'src/assets/fonts/ibm-plex-mono-latin-500-normal.woff2'],
      ['Arvenilo-Design-Handoff/04-Fonts/IBM-Plex-Mono/ibm-plex-mono-latin-500-italic.woff2', 'src/assets/fonts/ibm-plex-mono-latin-500-italic.woff2'],
    ] as const;
    for (const [source, runtime] of fontPairs) {
      expect(read(runtime).equals(read(source))).toBe(true);
    }

    const licensePairs = [
      ['Arvenilo-Design-Handoff/04-Fonts/Sora/LICENSE.txt', 'src/assets/fonts/LICENSE-Sora.txt'],
      ['Arvenilo-Design-Handoff/04-Fonts/Inter/LICENSE.txt', 'src/assets/fonts/LICENSE-Inter.txt'],
      ['Arvenilo-Design-Handoff/04-Fonts/IBM-Plex-Mono/LICENSE.txt', 'src/assets/fonts/LICENSE-IBM-Plex-Mono.txt'],
    ] as const;
    for (const [source, runtime] of licensePairs) {
      expect(read(runtime).equals(read(source))).toBe(true);
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
