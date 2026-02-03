import { Browser, Page, ElementHandle } from 'puppeteer-core';

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
    if (process.env.NODE_ENV === 'production') {
      console.log('[Crawler] Running in PRODUCTION mode');
      // @ts-ignore
      const chromium = await import('@sparticuz/chromium').then(mod => mod.default);
      const puppeteerCore = await import('puppeteer-core').then(mod => mod.default);

      browser = await puppeteerCore.launch({
        args: [...chromium.args, '--hide-scrollbars', '--disable-web-security'],
        defaultViewport: { width: 1280, height: 1024 },
        executablePath: await chromium.executablePath(),
        headless: true,
        ignoreHTTPSErrors: true,
      } as any);
    } else {
      console.log('[Crawler] Running in DEVELOPMENT mode');
      const puppeteer = await import('puppeteer').then(mod => mod.default);
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,1024'],
      }) as unknown as Browser;
    }
    console.log('[Crawler] Browser launched successfully');

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
              // Fix: Name is often in the first span, and Category in the second.
              // <span class="YwYLL">Name</span><span class="YzBgS">Category</span>
              const nameSpan = el.querySelector('span');
              if (nameSpan) {
                return nameSpan.textContent?.trim() || '';
              }
              // Fallback: if no span, take full text but be careful
              return el.textContent?.trim() || '';
            });
          } else {
            const text = await item.evaluate(el => el.innerText);
            name = text.split('\n')[0];
          }

          // Address Button & Basic Address Extraction
          let addressButton: ElementHandle<HTMLButtonElement> | null = null;
          let addressContainer = null;
          let basicAddress = '';

          const spans = await item.$$('span, div');

          // Priority 1: Search for distance info (e.g. "11km")
          for (const span of spans) {
            const text = await span.evaluate(el => el.textContent || '');
            if (text.match(/\d+km/)) {
              // Found distance info. usage: "11km · Basic Address V"
              const parent = await span.evaluateHandle(el => el.parentElement);
              const parentEl = parent.asElement();

              if (parentEl) {
                // Get full text from parent (contains "11km · Address 상세주소 열기 ...")
                const fullText = await parentEl.evaluate(el => (el as HTMLElement).innerText);

                // 1. Extract text AFTER 'km'
                // Regex to match "11km" or "1.5km" etc.
                const kmMatch = fullText.match(/(\d+(?:\.\d+)?km)/);
                if (kmMatch && kmMatch.index !== undefined) {
                  let afterKm = fullText.substring(kmMatch.index + kmMatch[0].length);

                  // 2. Remove known "garbage" suffixes (buttons/labels)
                  // Common garbage: "상세주소 열기", "출발", "도착", "예약"
                  // We split by the first occurrence of any of these
                  const garbageMatch = afterKm.match(/(상세주소|출발|도착|예약)/);
                  if (garbageMatch && garbageMatch.index !== undefined) {
                    afterKm = afterKm.substring(0, garbageMatch.index);
                  }

                  // 3. Clean up generic delimiters (whitespace, dots)
                  basicAddress = afterKm.replace(/^[\s·\.]+/g, '').trim();

                  // 4. Find Address Button (Expand)
                  // Strategy: The button often WRAPS the address text.
                  // So we search for a button/a tag that contains the 'basicAddress' we just found.
                  // If not found, fallback to "상세주소" text.
                  const expandButton = await parentEl.evaluateHandle((node, addrText) => {
                    const el = node as HTMLElement;
                    const targetText = addrText.replace(/\s+/g, ''); // Remove spaces for looser matching

                    // Helper to check if element contains address text
                    const hasAddress = (element: Element) => {
                      const text = (element.textContent || '').replace(/\s+/g, '');
                      return text.includes(targetText);
                    };

                    const allElements = el.querySelectorAll('*');
                    for (const child of allElements) {
                      // Check for button/a that contains address text
                      // Note: tagName is usually uppercase in HTML DOM
                      if ((child.tagName === 'BUTTON' || child.getAttribute('role') === 'button' || child.tagName === 'A') && hasAddress(child)) {
                        return child;
                      }
                    }

                    // Fallback 1: Look for "상세주소"
                    for (const child of allElements) {
                      if (child.textContent?.includes('상세주소')) {
                        return child.closest('button') || child.closest('a') || child;
                      }
                    }

                    // Fallback 2: first button or link
                    return el.querySelector('button') || el.querySelector('a[role="button"]');
                  }, basicAddress);

                  if (expandButton.asElement()) {
                    addressButton = expandButton.asElement() as ElementHandle<HTMLButtonElement>;
                  }
                }
                addressContainer = span; // Keep reference
                break;
              }
            }
          }

          // Priority 2: Fallback to Region Regex if Priority 1 failed
          if (!basicAddress) {
            for (const span of spans) {
              const text = await span.evaluate(el => el.textContent || '');
              if (text.match(/^(서울|경기|인천|강원|충청|전라|경상|제주|부산|대구|광주|대전|울산|세종)/)) {
                addressContainer = span;
                const parent = await span.evaluateHandle(el => el.parentElement);
                const parentEl = parent.asElement();
                if (parentEl) {
                  // Try to find button widely
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

                // Extract Basic Address
                const rawText = await span.evaluate(el => el.textContent?.trim() || '');
                const regionMatch = rawText.match(/(서울|경기|인천|강원|충청|전라|경상|제주|부산|대구|광주|대전|울산|세종).*/);
                if (regionMatch) basicAddress = regionMatch[0].replace('상세주소 열기', '').trim();
                else basicAddress = rawText.replace('상세주소 열기', '').trim();

                break;
              }
            }
          }

          // Fallback: If address button still missing, try generic search
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
