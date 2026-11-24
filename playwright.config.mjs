import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'*.spec.mjs',timeout:30000,workers:1,
 use:{baseURL:'http://127.0.0.1:4301',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'node scripts/dev-server.mjs',env:{PORT:'4301'},url:'http://127.0.0.1:4301',reuseExistingServer:false},
});
