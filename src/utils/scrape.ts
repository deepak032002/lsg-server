import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { generateText } from './bot';
import logger from './logger';
import { PrismaService } from 'src/prisma.service';
// import { faker } from "@faker-js/faker";

const loadData = async (link: string) => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const url = link;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const html = await page.content();

  const $ = cheerio.load(html);

  browser.close();
  return $;
};

export const getListOfEditorials = async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const url =
    'https://www.drishtiias.com/current-affairs-news-analysis-editorials';
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const html = await page.content();

  const $ = cheerio.load(html);

  const dailyNewsLinks = $(
    'article .row .column:first .box-slide .box-hide ul li a',
  )
    .toArray()
    .map((el) => $(el).attr('href'));

  browser.close();
  return dailyNewsLinks;
};

export const getEditorialByDate = async (link: string | undefined) => {
  if (!link) return [];
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  // await page.setUserAgent(faker.internet.userAgent());

  await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 0 });
  const html = await page.content();

  const $ = cheerio.load(html);

  const list = $('article .article-detail h2 a')
    .toArray()
    .map((el) => $(el).attr('href'));

  browser.close();
  return list;
};

const getHinduEditorialContent = async (
  link: string,
  prisma: PrismaService,
) => {
  const $ = await loadData(link);

  logger.info('get editorial content.');
  const [title, content] = await Promise.all([
    generateText($('.editorial .title').text().trim(), 'title'),
    generateText(
      $('.editorial .articlebodycontent > p').text().trim(),
      'content',
    ),
  ]);

  logger.info('save editorial.');
  await prisma.editorial.create({
    data: {
      title,
      content,
      source: {
        create: {
          link,
          title: 'the hindu',
        },
      },
    },
  });

  logger.info('saved editorial content.');
  return { title, link, content, source: 'the hindu' };
};

export const getListOfHinduEditorials = async (prisma: PrismaService) => {
  logger.info('Fetching hindu editorial list');
  const $ = await loadData('https://www.thehindu.com/opinion/editorial/');

  logger.info('Fetching hindu editorial content');

  const links = $('.editorial-section .element.wide-row-element .title a')
    .toArray()
    .map((el) => $(el).attr('href'));

  const promise = links.map(async (link) => {
    const isFetchedLink = await prisma.source.findFirst({
      where: { link },
    });
    if (isFetchedLink) return [];
    return getHinduEditorialContent(link, prisma);
  });
  const editorials = await Promise.all(promise);
  logger.info('done');
  return editorials.flat();
};
