const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.toString()));

  await page.goto('http://localhost:5173');
  
  // Wait for the app to load
  await page.waitForTimeout(2000);
  
  // Click on Dashboard tab
  console.log("Clicking Dashboard...");
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.tab-btn');
    for (let tab of tabs) {
      if (tab.textContent.includes('Dashboard')) {
        tab.click();
        return;
      }
    }
  });

  await page.waitForTimeout(2000);
  await browser.close();
})();
