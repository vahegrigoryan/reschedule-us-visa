import * as dotenv from 'dotenv'
import * as pt from 'puppeteer';
import moment from "moment";
import Audic from 'audic';

let config, browser, page;
const ALARM = new Audic('alarm.mp3');

async function runSession() {
  try {
    log('Starting a fresh session');
    await initSession();
    await login();
    await continueTheApplication();
    await goToRescheduleScreen();
    await openDatePicker();
    const nextAvailableDate = await findNextAvailableDate();
    await winOrRetry(nextAvailableDate);
  } catch (error) {
    log(`ERROR: ${error.message || error}`);
    await browser.close();
    retry();
  }
}

async function initSession() {
  browser = await pt.launch({headless: config.runInBackground});
  page = await browser.newPage();
  await page.setViewport({width: 1366, height: 768});
  await page.goto(config.loginURL, {waitUntil: 'networkidle2'});
}

async function login() {
  await page.focus('#user_email');
  await page.keyboard.type(config.email, {delay: 100});
  await page.focus('#user_password');
  await page.keyboard.type(config.password, {delay: 100});
  const termsCheckbox = await page.waitForSelector("#policy_confirmed");
  await termsCheckbox.click();
  await sleep(1000);
  const submitButton = await page.waitForSelector('input[type="submit"]');
  await submitButton.click();
}

async function continueTheApplication() {
  const continueLink = await page.waitForSelector('ul.actions > li > a');
  await sleep(2000);
  await continueLink.click();
}

async function goToRescheduleScreen() {
  const rescheduleButton = await page.waitForSelector('.fa-calendar-minus');
  await sleep(1000);
  await rescheduleButton.click();
  await sleep(1000);
  const rescheduleLink = await page.$x("//a[contains(text(), 'Reschedule Appointment')]");
  await rescheduleLink[0].click();
}

async function openDatePicker() {
  await sleep(2000);
  const dateInput = await page.waitForSelector('#appointments_consulate_appointment_date');
  await dateInput.click();
}

async function findNextAvailableDate() {
  let availableDayFound;
  while (!availableDayFound) {
    try {
      availableDayFound = await page.waitForSelector('a.ui-state-default', {timeout: 1000});
    } catch (error) {
      const nextLink = await page.waitForSelector('a.ui-datepicker-next');
      await nextLink.click();
    }
  }
  return await page.evaluate(() => {
    const availableLink = document.querySelector('a.ui-state-default');
    const parent = availableLink.parentElement;
    const year = +parent.getAttribute('data-year');
    const month = +parent.getAttribute('data-month') + 1;
    const date = +availableLink.innerText;
    return {year, month, date};
  });
}

async function winOrRetry(dateObj) {
  const formattedDate = formatDate(dateObj);
  if (moment(config.registeredDate).diff(moment(formattedDate), 'day') > 0) {
    log(`!!!FOUND A BETTER DATE!!! ${formattedDate} HURRY UP!!!!`);
    await ALARM.play();
    ALARM.addEventListener('ended', async () => {
      ALARM.currentTime = 0;
      await ALARM.play();
    });
  } else {
    log(`The next available date ${formattedDate} is not earlier than the current, will retry in ${config.retryInterval} minutes`);
    await browser.close();
    retry();
  }
}

function retry() {
  setTimeout(runSession, config.retryInterval * 60 * 1000);
}

async function sleep(milliseconds) {
  return new Promise(r => setTimeout(r, milliseconds));
}

function formatDate(date) {
  return `${date.year}-${date.month.toString().padStart(2, '0')}-${date.date.toString().padStart(2, '0')}`
}

function loadConfig() {
  dotenv.config();
  config = {
    email: process.env.EMAIL,
    password: process.env.PASSWORD,
    registeredDate: process.env.REGISTERED_DATE,
    loginURL: process.env.LOGIN_URL || 'https://ais.usvisa-info.com/en-ca/niv/users/sign_in',
    retryInterval: process.env.RETRY_INTERVAL || 10, // minutes
    runInBackground: process.env.RUN_IN_BACKGROUND === 'true',
  }
  log(config.runInBackground);
}

async function main() {
  loadConfig();
  if (!config.email || !config.password || !config.loginURL || !config.registeredDate) {
    return log('ERROR: Missing environment variables');
  }
  await runSession();
}

function log(msg) {
  console.log(`[${new Date().toLocaleString()}] ${msg}`);
}

await main();
