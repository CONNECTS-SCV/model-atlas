import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'**/*.spec.ts',fullyParallel:false,workers:1,use:{baseURL:process.env.TEST_BASE_URL||'http://localhost:3000',viewport:{width:1512,height:982},trace:'retain-on-failure'},reporter:'list'});
