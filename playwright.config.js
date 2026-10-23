// @ts-check
// Pruebas de navegador (E2E) de Poké Tactics con Playwright.
// Levanta su propio servidor en el puerto 3100 con una base de datos temporal (nunca toca Neon).
const { defineConfig, devices } = require('@playwright/test');
const os = require('os');
const path = require('path');

const PORT = 3100;

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 860 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } }],
  webServer: {
    command: 'node server.js',
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      DATABASE_URL: '',
      AUTH_IP_LIMIT: '1000', // cada prueba registra una cuenta: el tope de 30 intentos por IP se agotaba a media tanda
      QUEUE_FILL_MS: '2000', // la cola se completa con bots a los 2 s en las pruebas
      PT_TEST_FAST: '1', // solo en pruebas: «listo» (act ready) adelanta el combate; en el juego ya no hay botón
      DB_FILE: path.join(os.tmpdir(), `poke-tactics-e2e-${process.pid}.json`),
    },
  },
});
