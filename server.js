const express = require('express');
const app = express();
const socket = require('socket.io');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const PORT = process.env.PORT || 5000;

puppeteer.use(StealthPlugin());

const server = app.listen(PORT, () => {
  console.log('server online');
});

const io = socket(server);
let autoScan = false;

io.on('connection', async (socket) => {
  console.log('client connected');
  socket.on('executeAuto', async function (data) {
    console.log('data', data);

    autoScan = data.autoScan;
    while (autoScan) {
      await executeAuto(data, data.links[0]);
      console.log(autoScan, 'AutoScan');
      await sleep(35000);
    }
  });

  socket.on('disconnect', (data) => {
    autoScan = false;
  });

  socket.on('stopAuto', () => {
    autoScan = false;
  });
});

async function executeAuto(data, url) {
  const time = new Date().toLocaleString();
  let pickupOp = true;
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--proxy-server="direct://"',
      '--proxy-bypass-list=*',
    ],
  });
  ///
  try {
    const page = await browser.newPage();

    const blockedResourceTypes = [
      'image',
      'media',
      'font',
      'texttrack',
      'object',
      'beacon',
      'csp_report',
      'imageset',
    ];
    const skippedResources = [
      'quantserve',
      'adzerk',
      'doubleclick',
      'adition',
      'exelator',
      'sharethrough',
      'cdn.api.twitter',
      'google-analytics',
      'googletagmanager',
      'google',
      'fontawesome',
      'facebook',
      'analytics',
      'optimizely',
      'clicktale',
      'mixpanel',
      'zedo',
      'clicksor',
      'tiqcdn',
    ];

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const requestUrl = request._url.split('?')[0].split('#')[0];
      if (
        blockedResourceTypes.indexOf(request.resourceType()) !== -1 ||
        skippedResources.some((resource) => requestUrl.indexOf(resource) !== -1)
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.goto(url);

    await page.waitForSelector('[data-test="storeFulfillmentAggregator"]');

    await page.waitForSelector(
      '.Link__StyledLink-zyll5o-0.ggRyRP.h-text-sm.h-text-underline'
    );
    await page.click(
      '.Link__StyledLink-zyll5o-0.ggRyRP.h-text-sm.h-text-underline'
    );

    await page.waitForSelector('[data-test="storeSearchLink"]');
    await page.click('[data-test="storeSearchLink"]');
    const location = await page.$('[data-test="fiatsLocationInput"]');
    await location.click({ clickCount: 3 });
    await location.type(`${data.zipcode}`);
    await page.click('[data-test="fiatsUpdateLocationSubmitButton"]');
    await sleep(1000);
    const availableItems = await page.$$('[data-test="pickUpHereFIATS"]');

    if (availableItems.length === 0) {
      io.emit('result', { msg: `${time}: Not Found: ${url}` });
      await browser.close();
      autoScan = true;
      return;
    }
    await availableItems[availableItems.length - 1].click();

    await page.waitForSelector('[data-test="addToCartModal"]');

    const declineBtn = await page.$(
      '[data-test="espModalContent-declineCoverageButton"]'
    );

    if (declineBtn && declineBtn.textContent !== '') {
      await page.click('[data-test="espModalContent-declineCoverageButton"]');
    }

    await page.click('[data-test="addToCartModalViewCartCheckout"]');

    await page.waitForSelector('[id="checkout-spinner"]', {
      hidden: true,
    });
    // Go to checkout
    await page.waitForSelector('[data-test="checkout-button"]');
    await page.click('[data-test="checkout-button"]');

    // Login
    await page.waitForSelector('[id="username"]', { visible: true });
    await page.focus('[id="username"]');
    await page.keyboard.type(data.email);

    await page.focus('[id="password"]');
    await page.keyboard.type(data.password);

    await page.click('[id="login"]');

    await page.waitForSelector('[id="checkout-spinner"]', {
      hidden: true,
    });

    if (pickupOp) {
      // Check out
      await page.waitForSelector('[id="creditCardInput-cvv"]');
      await page.type('[id="creditCardInput-cvv"]', `${data.ccv}`);
      await page.waitForSelector('[data-test="placeOrderButton"]');
      await page.click('[data-test="placeOrderButton"]');
    } else {
      // await page.waitForSelector('[data-test="payment-credit-card-section"]', {
      //   visible: true,
      // });
      // const addNewCard = await page.$(
      //   '[data-test="add-new-credit-card-button"]'
      // );
      // if (addNewCard && addNewCard.textContent !== '') {
      //   await page.waitForSelector('[id="creditCardInput-cardNumber"]');
      //   await page.type('[id="creditCardInput-cardNumber"]', `${data.cardNum}`);
      //   await page.click('[data-test="verify-card-button"]');
      //   await page.waitForSelector('[id="creditCardInput-cvv"]');
      //   await page.type('[id="creditCardInput-cvv"]', `${data.ccv}`);
      // }
      // await page.click('[data-test="save-and-continue-button"]');
      // await page.waitForSelector('[id="checkout-spinner"]', {
      //   hidden: true,
      // });
      // await page.waitForSelector('[data-test="placeOrderButton"]');
      // await page.click('[data-test="placeOrderButton"]');
    }

    await sleep(4000);
    await browser.close();
    autoScan = false;
    io.emit('result', { msg: `${time}: Auto Checkout Successfully: ${url}` });
    return;
  } catch (error) {
    io.emit('result', { msg: 'Error from Target.com' });
    console.log(error);
    autoScan = true;
    return;
  } finally {
    await browser.close();
    return;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
