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
      headless: true,
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

    let processedIndex = 0; // Items processed on CURRENT PAGE
    let noScrollCount = 0; // Count of times scrolling didn't yield new content

    while (results.length < limit) {
      const items = await searchFrame.$$('ul > li');

      // Process new items
      for (let i = processedIndex; i < items.length && results.length < limit; i++) {
        const item = items[i];
        processedIndex++; // Mark handled

        try {
          await item.scrollIntoView();

          // START EXTRACTION

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

          // Address Button
          let addressButton: ElementHandle<HTMLButtonElement> | null = null;
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
                if (siblingBtn) addressButton = siblingBtn;
                else {
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

          // 1. Basic Address
          let basicAddress = '';
          if (addressContainer) {
            const rawText = await addressContainer.evaluate(el => el.textContent?.trim() || '');
            const regionMatch = rawText.match(/(서울|경기|인천|강원|충청|전라|경상|제주|부산|대구|광주|대전|울산|세종).*/);
            if (regionMatch) basicAddress = regionMatch[0].replace('상세주소 열기', '').trim();
            else basicAddress = rawText.replace('상세주소 열기', '').trim();
          }

          // Click Expand
          if (addressButton) {
            try {
              await addressButton.click();
              await new Promise(r => setTimeout(r, 500));
            } catch (e) {
              // console.log('Failed to click address button', e); // Suppress frequent logs
            }
          }

          // 2. Detail & Merge
          let jibunAddress = '';
          let jibunDetail = '';
          let fullText = '';
          let cleanText = '';

          try {
            fullText = await item.evaluate(el => el.innerText);
            cleanText = fullText.replace(/\n/g, ' ');
            const jibunMatch = cleanText.match(/지번(.*?)(?=복사)/);
            if (jibunMatch) jibunDetail = jibunMatch[1].trim();

            if (basicAddress && jibunDetail) {
              const basicTokens = basicAddress.split(/\s+/);
              const lastBasicToken = basicTokens[basicTokens.length - 1];
              if (jibunDetail.startsWith(lastBasicToken)) {
                const cleanDetail = jibunDetail.substring(lastBasicToken.length).trim();
                jibunAddress = `${basicAddress} ${cleanDetail}`.trim();
              } else if (jibunDetail.startsWith(basicAddress)) {
                jibunAddress = jibunDetail;
              } else {
                jibunAddress = `${basicAddress} ${jibunDetail}`.trim();
                if (jibunDetail.includes(basicAddress)) jibunAddress = jibunDetail;
              }
            } else if (jibunDetail) jibunAddress = jibunDetail;
            else jibunAddress = basicAddress;

            // 3. Road Address
            let siGuPrefix = '';
            let roadDetail = '';
            if (basicAddress) {
              const tokens = basicAddress.split(/\s+/);
              if (tokens.length >= 2) {
                if (tokens.length >= 3 && tokens[1].endsWith('시') && tokens[2].endsWith('구')) {
                  siGuPrefix = tokens.slice(0, 3).join(' ');
                } else {
                  siGuPrefix = tokens.slice(0, 2).join(' ');
                }
              } else siGuPrefix = basicAddress;
            }
            const roadMatch = cleanText.match(/도로명(.*?)(?=복사)/);
            if (roadMatch) roadDetail = roadMatch[1].trim();

            let roadAddress = '';
            if (siGuPrefix && roadDetail) {
              if (roadDetail.startsWith(siGuPrefix)) roadAddress = roadDetail;
              else {
                const prefixTokens = siGuPrefix.split(/\s+/);
                const lastPrefixToken = prefixTokens[prefixTokens.length - 1];
                if (roadDetail.startsWith(lastPrefixToken)) {
                  const cleanRoadDetail = roadDetail.substring(lastPrefixToken.length).trim();
                  roadAddress = `${siGuPrefix} ${cleanRoadDetail}`.trim();
                } else roadAddress = `${siGuPrefix} ${roadDetail}`.trim();
              }
            } else if (roadDetail) roadAddress = roadDetail;

            results.push({ id: results.length + 1, name, jibunAddress, roadAddress });

          } catch (e) {
            // console.log('Parsing detail error', e); // Suppress frequent logs
          }
          // END EXTRACTION
        } catch (e) {
          console.error(`Error processing item ${i}:`, e);
        }
      }

      // Check Limits
      if (results.length >= limit) break;

      // Scrolling
      const prevHeight = await searchFrame.evaluate(() => document.querySelector('#_pcmap_list_scroll_container')?.scrollHeight || 0);
      await searchFrame.evaluate(() => {
        const c = document.querySelector('#_pcmap_list_scroll_container') || document.body;
        c.scrollTop = c.scrollHeight;
      });
      await new Promise(r => setTimeout(r, 1000));
      const newHeight = await searchFrame.evaluate(() => document.querySelector('#_pcmap_list_scroll_container')?.scrollHeight || 0);

      if (newHeight === prevHeight) {
        noScrollCount++;
      } else {
        noScrollCount = 0;
      }

      // Pagination Trigger (if no scroll change for 2 iterations, try page)
      if (noScrollCount > 2) {
        // Look for Next Button
        const nextBtnHandle = await searchFrame.evaluateHandle(() => {
          const spans = Array.from(document.querySelectorAll('span'));
          const nextSpan = spans.find(s => s.textContent?.includes('다음페이지'));
          if (nextSpan) {
            return nextSpan.closest('a') || nextSpan.closest('button');
          }
          // Alternative: look for aria-disabled="false" and right arrow icon
          const buttons = Array.from(document.querySelectorAll('a, button'));
          // Naver often uses <a ... aria-disabled="false"> <span class="blind">다음페이지</span> ... </a>
          return buttons.find(b => b.textContent?.includes('다음') || b.querySelector('span')?.textContent?.includes('다음페이지'));
        });

        // Check if valid element handle
        const nextBtn = nextBtnHandle.asElement() as ElementHandle<Element> | null;

        if (nextBtn) {
          // Check if disabled
          const isDisabled = await nextBtn.evaluate((el) => {
            const element = el as HTMLElement; // Explicit cast
            return element.getAttribute('aria-disabled') === 'true' || element.classList.contains('disabled');
          });

          if (!isDisabled) {
            await nextBtn.click();
            await new Promise(r => setTimeout(r, 2000)); // Wait for page load
            processedIndex = 0; // Reset for new page items
            noScrollCount = 0;
            // Wait for list to have items
            try {
              await searchFrame.waitForSelector('ul > li', { timeout: 5000 });
            } catch (e) {
              // If timeout, maybe no items or slow load
            }
            continue; // Continue loop
          }
        }

        // If we couldn't scroll AND couldn't find/click Next Page -> Stop
        break;
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
