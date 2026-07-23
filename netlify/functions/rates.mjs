// Carriage Capital — daily market-rate fetcher (Netlify Function, classic handler format)
// FREE public sources only: NY Fed (SOFR + 30/90-day Average SOFR) and U.S. Treasury (5Y/10Y).
// The 10-year swap is ESTIMATED from the 10Y Treasury plus SWAP_SPREAD_10Y below.
const SWAP_SPREAD_10Y = -0.30; // indicative 10Y SOFR swap spread (percentage points)

export const handler = async () => {
  const rates = [];

  // --- NY Fed: SOFR (overnight) ---
  try {
    const j = await (await fetch('https://markets.newyorkfed.org/api/rates/secured/sofr/last/2.json')).json();
    const o = j.refRates || [];
    if (o.length) {
      const v = Number(o[0].percentRate), p = o[1] ? Number(o[1].percentRate) : v;
      rates.push({ label: 'SOFR (Overnight)', value: v, change: +(v - p).toFixed(2) });
    }
  } catch (e) {}

  // --- NY Fed: 30- & 90-day Average SOFR ---
  try {
    const j = await (await fetch('https://markets.newyorkfed.org/api/rates/secured/sofrai/last/2.json')).json();
    const o = j.refRates || [];
    if (o.length) {
      const cur = o[0], prev = o[1] || o[0];
      const a30 = Number(cur.average30day), p30 = Number(prev.average30day);
      const a90 = Number(cur.average90day), p90 = Number(prev.average90day);
      if (!isNaN(a30)) rates.push({ label: '30-Day Avg SOFR', value: a30, change: +(a30 - p30).toFixed(2) });
      if (!isNaN(a90)) rates.push({ label: '90-Day Avg SOFR', value: a90, change: +(a90 - p90).toFixed(2) });
    }
  } catch (e) {}

  // --- U.S. Treasury: daily par yield curve CSV ---
  try {
    const year = new Date().getFullYear();
    const url = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/'
      + year + '/all?type=daily_treasury_yield_curve&field_tdr_date_value=' + year + '&_format=csv';
    const txt = await (await fetch(url)).text();
    const lines = txt.trim().split(/\r?\n/).map((l) => l.split(','));
    const head = lines[0];
    const row = lines[1], prev = lines[2] || lines[1];
    const num = (r, name) => { const i = head.indexOf(name); return i >= 0 ? parseFloat(r[i]) : NaN; };
    const add = (label, col) => {
      const v = num(row, col);
      if (!isNaN(v)) rates.push({ label, value: v, change: +(v - num(prev, col)).toFixed(2) });
    };
    add('UST 5-Year', '5 Yr');
    add('UST 10-Year', '10 Yr');
  } catch (e) {}

  // --- Derived: 10-year swap estimate ---
  const ust10 = rates.find((r) => r.label === 'UST 10-Year');
  if (ust10) rates.push({ label: '10-Yr Swap (≈)', value: +(ust10.value + SWAP_SPREAD_10Y).toFixed(2), change: ust10.change });

  const asOf = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
    body: JSON.stringify({ asOf, rates }),
  };
};
