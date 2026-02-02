import puppeteer, { Browser, Page, ElementHandle } from 'puppeteer';

interface CrawlResult {
  id: number;
  name: string;
  jibunAddress?: string;
  roadAddress?: string;
  category?: string;
}

const WAIT_TIMEOUT = 3000;

export async function crawlNaverMap(keyword: string, limit: number): Promise<CrawlResult[]> {
  let browser: Browser | null = null;
  const results: CrawlResult[] = [];

  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,1024'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024 });

    // 1. Navigate to Naver Map Search
    const url = `https://map.naver.com/p/search/${encodeURIComponent(keyword)}`;
    await page.goto(url, { waitUntil: 'networkidle2' });

    // 2. Wait for searchIframe
    const searchIframeElement = await page.waitForSelector('#searchIframe', { timeout: 10000 });
    if (!searchIframeElement) throw new Error('Search iframe not found');

    const searchFrame = await searchIframeElement.contentFrame();
    if (!searchFrame) throw new Error('Search frame content not accessible');

    // 3. Wait for list to load
    await searchFrame.waitForSelector('ul > li', { timeout: 10000 });

    let previousCount = 0;
    let failCount = 0;

    while (results.length < limit) {
      // Find all items
      const items = await searchFrame.$$('ul > li');

      if (items.length === previousCount) {
        failCount++;
        if (failCount > 5) break;
        await searchFrame.evaluate(() => {
          const container = document.querySelector('#_pcmap_list_scroll_container') || document.body;
          container.scrollTop = container.scrollHeight;
        });
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      previousCount = items.length;

      for (let i = results.length; i < items.length && results.length < limit; i++) {
        const item = items[i];

        try {
          await item.scrollIntoView();

          // Name
          const nameEl = await item.$('.place_bluelink');
          let name = 'Unknown';
          if (nameEl) {
            name = await nameEl.evaluate(el => {
              const clone = el.cloneNode(true) as HTMLElement;
              Array.from(clone.querySelectorAll('span')).forEach(s => s.remove());
              return clone.textContent?.trim() || el.textContent?.trim() || '';
            });
          } else {
            const text = await item.evaluate(el => el.innerText);
            name = text.split('\n')[0];
          }

          // Address Expand Button
          let addressButton: ElementHandle<HTMLButtonElement> | null = null;

          // Find Button
          const spans = await item.$$('span, div');
          let addressContainer = null;

          for (const span of spans) {
            const text = await span.evaluate(el => el.textContent || '');
            if (text.match(/^(서울|경기|인천|강원|충청|전라|경상|제주|부산|대구|광주|대전|울산|세종)/)) {
              addressContainer = span;
              const parent = await span.evaluateHandle(el => el.parentElement);
              const parentEl = parent.asElement();
              if (parentEl) {
                const siblingBtn = await parentEl.$('button');
                if (siblingBtn) {
                  addressButton = siblingBtn;
                } else {
                  const grandParent = await parentEl.evaluateHandle(el => el.parentElement);
                  const grandParentEl = grandParent.asElement();
                  if (grandParentEl) {
                    const uncleBtn = await grandParentEl.$('button');
                    if (uncleBtn) addressButton = uncleBtn;
                  }
                }
              }
              break;
            }
          }

          if (!addressButton) {
            const spanElements = await item.$$('span');
            for (const span of spanElements) {
              const txt = await span.evaluate(el => el.innerText);
              if (txt === '상세주소 열기') {
                const parent = await span.evaluateHandle(el => el.parentElement);
                const parentEl = parent.asElement();
                if (parentEl) addressButton = parentEl as ElementHandle<HTMLButtonElement>;
                break;
              }
            }
          }

          // Step 1: Capture Basic Address (Before Click)
          let basicAddress = '';
          if (addressContainer) {
            const rawText = await addressContainer.evaluate(el => el.textContent?.trim() || '');
            const regionMatch = rawText.match(/(서울|경기|인천|강원|충청|전라|경상|제주|부산|대구|광주|대전|울산|세종).*/);
            if (regionMatch) {
              basicAddress = regionMatch[0].replace('상세주소 열기', '').trim();
            } else {
              basicAddress = rawText.replace('상세주소 열기', '').trim();
            }
          }

          // Click Expansion
          if (addressButton) {
            try {
              await addressButton.click();
              await new Promise(r => setTimeout(r, 800)); // Wait for expansion
            } catch (e) {
              console.log('Failed to click address button', e);
            }
          }

          // Step 2: Capture Detail Address (Popup) & Merge
          let jibunAddress = '';
          let jibunDetail = '';

          try {
            // Re-evaluate full text
            const fullText = await item.evaluate(el => el.innerText);
            const cleanText = fullText.replace(/\n/g, ' ');

            // Extract Jibun Detail
            const jibunMatch = cleanText.match(/지번(.*?)(?=복사)/);
            if (jibunMatch) {
              jibunDetail = jibunMatch[1].trim();
            }

            // Step 3: Merge Basic + Detail -> Jibun
            if (basicAddress && jibunDetail) {
              const basicTokens = basicAddress.split(/\s+/);
              const lastBasicToken = basicTokens[basicTokens.length - 1];

              if (jibunDetail.startsWith(lastBasicToken)) {
                // Check overlap. e.g. Basic: "...신천동", Detail: "신천동 20-6"
                const cleanDetail = jibunDetail.substring(lastBasicToken.length).trim();
                jibunAddress = `${basicAddress} ${cleanDetail}`.trim();
              } else if (jibunDetail.startsWith(basicAddress)) {
                // Detail contains full basic, e.g. "Seoul Songpa-gu Sincheon-dong 20-6"
                jibunAddress = jibunDetail;
              } else {
                jibunAddress = `${basicAddress} ${jibunDetail}`.trim();
                // One last check: if detail already contains basic
                if (jibunDetail.includes(basicAddress)) jibunAddress = jibunDetail;
              }
            } else if (jibunDetail) {
              jibunAddress = jibunDetail;
            } else {
              jibunAddress = basicAddress;
            }

          } catch (e) {
            console.log('Parsing detail error', e);
          }

          // Step 4: Final Output
          // Jibun Field = Merged Address
          // Road Field = Empty (per user request)

          results.push({
            id: i + 1,
            name,
            jibunAddress: jibunAddress,
            roadAddress: '', // Explicitly empty 
          });

        } catch (e) {
          console.error(`Error processing item ${i}:`, e);
        }
      }

      if (results.length < limit) {
        await searchFrame.evaluate(() => {
          const scrollContainer = document.querySelector('#_pcmap_list_scroll_container');
          if (scrollContainer) {
            scrollContainer.scrollBy(0, 1000);
          } else {
            window.scrollBy(0, 1000);
          }
        });
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    return results;

  } catch (error) {
    console.error('Crawler failed:', error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}
