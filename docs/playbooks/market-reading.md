# A ticker reading on Markets

What starts it: a person opens a share, fund, index or coin on /markets/, or asks the stocks card for a price. The quote comes back with a reading: Buy, Sell, or Watch.

How it is worked out (`lib/markets-verdict.js`, attached in `functions/api/markets.js`):

- The recent move, from the close 63 sessions ago and the close 21 sessions ago.
- The last price against the average of the last 50 sessions and the last 200.
- The usual size of a daily move over the last 60 sessions.
- Where the price sits between the high and the low of the last year, when a year of closes is there.
- A trailing price-to-earnings number only when the free US filings return an annual diluted earnings per share. The two URLs are fixed (`www.sec.gov/files/company_tickers.json` and one `data.sec.gov` companyconcept path). A coin, an index, a currency pair and a non-US ticker never ask.

Buy needs the 63-session move and the averages to agree up, the daily move to be ordinary, the price not to be sitting on the 52-week high, and the multiple not to be above 35 when a filing answered. Sell is the mirror, and a multiple under 15 keeps it a Watch. Anything else, including a thin history, is Watch or Unavailable. Unavailable is also what a currency pair gets. No number is filled in when a source does not answer.

Commands: `node --test tools/markets.test.mjs tools/stocks.test.mjs`. The page check is `node tools/test_void.mjs --only "ticker reading"`.

How to tell it worked: the quote shows the word Buy, Sell, Watch or Unavailable, three to five sentences that each contain a measured number (or, when Unavailable, a sentence that says the number was not guessed), and the line that it is not financial advice.

It does not forecast, set a target, place a trade, or read news.
