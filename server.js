const express = require('express');
const app = express();
const socket = require('socket.io');
const puppeteer = require('puppeteer');
const PORT = process.env.PORT || 5000;

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
  let pickupOp = false;
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
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36'
    );
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

    await page.waitForSelector('[data-test="flexible-fulfillment"]');

    const orderBtn = await page.$$(
      '.Button__ButtonWithStyles-y45r97-0.styles__StyledButton-sc-1f2lsll-0.eLsRDh.iyUhph'
    );

    if (orderBtn.length === 0) {
      io.emit('result', { msg: `${time}: Not Found: ${url}` });
      await browser.close();
      autoScan = true;
      return;
    } else {
      for (let i = 0; i < orderBtn.length; i++) {
        let text = await page.evaluate((el) => el.innerText, orderBtn[i]);
        if (text === 'Pick up here') {
          await orderBtn[i].click();
          pickupOp = true;
          break;
        } else {
          pickupOp = true;
          await orderBtn[orderBtn.length - 1].click();
          break;
        }
      }
    }

    await sleep(500);
    const errorBtn = await page.$('[data-test="errorContent-okButton"]');
    if (errorBtn && errorBtn.textContent !== '') {
      io.emit('result', { msg: `${time}: Not Found: ${url}` });
      await browser.close();
      autoScan = true;
      return;
    }

    await page.waitForSelector('[data-test="addToCartModal"]');

    const declineBtn = await page.$(
      '[data-test="espModalContent-declineCoverageButton"]'
    );

    if (declineBtn && declineBtn.textContent !== '') {
      await page.click('[data-test="espModalContent-declineCoverageButton"]');
    }

    await page.click('[data-test="addToCartModalViewCartCheckout"]');

    await page.waitForSelector('[data-test="checkout-button"]');
    await page.click('[data-test="checkout-button"]');

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
      await page.waitForSelector('[id="creditCardInput-cvv"]');
      await page.type('[id="creditCardInput-cvv"]', `${data.ccv}`);
      await page.waitForSelector('[data-test="placeOrderButton"]');
      await page.click('[data-test="placeOrderButton"]');
    } else {
      await page.waitForSelector('[data-test="payment-credit-card-section"]', {
        visible: true,
      });

      const addNewCard = await page.$(
        '[data-test="add-new-credit-card-button"]'
      );

      if (addNewCard && addNewCard.textContent !== '') {
        await page.waitForSelector('[id="creditCardInput-cardNumber"]');
        await page.type('[id="creditCardInput-cardNumber"]', `${data.cardNum}`);
        await page.click('[data-test="verify-card-button"]');
        await page.waitForSelector('[id="creditCardInput-cvv"]');
        await page.type('[id="creditCardInput-cvv"]', `${data.ccv}`);
      }

      await page.click('[data-test="save-and-continue-button"]');

      await page.waitForSelector('[id="checkout-spinner"]', {
        hidden: true,
      });
      await page.waitForSelector('[data-test="placeOrderButton"]');
      await page.click('[data-test="placeOrderButton"]');
    }

    await sleep(3000);
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
