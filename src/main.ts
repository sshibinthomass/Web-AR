import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-sans-3/700.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
import { WebARApp } from './app/WebARApp';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Missing #app root element.');
}

const app = new WebARApp(root);
void app.start();
