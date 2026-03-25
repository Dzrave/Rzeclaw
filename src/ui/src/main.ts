import './styles/tokens.css';
import { initI18n } from './i18n/index.js';
import { initRouter } from './lib/router.js';
import { GatewayClient } from './lib/gateway-client.js';
import { renderApp } from './components/shell/app-shell.js';

async function bootstrap() {
  // 1. Initialize i18n
  await initI18n();

  // 2. Initialize Gateway RPC client
  GatewayClient.init();

  // 3. Render application shell
  renderApp();

  // 4. Initialize router (hash-based SPA routing)
  initRouter();

  console.log('[Rzeclaw UI] Bootstrap complete');
}

bootstrap().catch(console.error);
