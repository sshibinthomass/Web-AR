import './styles.css';
import { WebARApp } from './app/WebARApp';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Missing #app root element.');
}

const app = new WebARApp(root);
void app.start();
