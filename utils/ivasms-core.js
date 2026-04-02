const https = require("https");
const zlib = require("zlib");

const BASE_URL = "https://www.ivasms.com";
const TERMINATION_ID = "1029603";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36";

// Cookies will come from environment variables
function getCookies() {
  return {
    "XSRF-TOKEN": process.env.XSRF_TOKEN || "eyJpdiI6Im8zSlpibFFLZmN3YVVtY3g1QXhQM1E9PSIsInZhbHVlIjoiYW41TG93dDk1U09oWEZKUXh6LzBZeE1FTlA2ajdFNU43a3lwUlhzWlRHOGpJZDJUMWtSalpOTk5scmgxdEJwNm5ybjZJekJKZFZHUnd5OEZwUFFPRStZY3M1WU40QTJ3bUQzMUxtRElSTUdmOEVVYnVRQjBicmlRQnhBT3NhMWEiLCJtYWMiOiIxMTk0ZTI1YzJmM2Y2MWEzZGE5NmZlNzIzNWRjNDI3ZGE1ODM4ZTBjNWViZWFhOTRmMDUwNDAxYzIzYzJkYzBlIiwidGFnIjoiIn0%3D",
    "ivas_sms_session": process.env.IVAS_SESSION || "eyJpdiI6InM0dHpIdTBCcnoxblMyRFBHTE9aQlE9PSIsInZhbHVlIjoiTTNNR2E2VGtFTldCaGgxWVhxOUN6T3JiNDMwMXBLd01nTHJ3amJhNlh0TXlCd3NaT0kyUUJjckJUZ3E0Z0ZJOHlJSXg0Z3Q5bFFBTUZ5bGtkaVZnVlFYeUVldjZpR2d2UGJ5L0I4eTE1enFoUzlDTjRlaGJxeDdnR3hxajlGWFciLCJtYWMiOiI2MDliMmNmZmEzMDk1MmQ1MWZhYzM1MmI5YTc3MmUwNGQxY2E2NTA4YWU4MTQxNDhmMTczMDI3YWY3ZjNlMmMyIiwidGFnIjoiIn0%3D"
  };
}

function setCookies(xsrf, session) {
  // In serverless, we can't persist - but we can update env vars via API
  // For now, just return; use /update-session endpoint to get new values
  console.log("Cookies would be updated but need persistence layer");
}

function cookieString() {
  const cookies = getCookies();
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

function getXsrf() {
  try {
    const xsrf = getCookies()["XSRF-TOKEN"] || "";
    return decodeURIComponent(xsrf);
  } catch {
    return getCookies()["XSRF-TOKEN"] || "";
  }
}

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function safeJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: "Invalid JSON", preview: text.substring(0, 300) };
  }
}

function makeRequest(method, path, body, contentType, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": USER_AGENT,
      "Accept": "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-PK,en;q=0.9",
      "Cookie": cookieString(),
      "X-Requested-With": "XMLHttpRequest",
      "X-XSRF-TOKEN": getXsrf(),
      "X-CSRF-TOKEN": getXsrf(),
      "Origin": BASE_URL,
      "Referer": `${BASE_URL}/portal`,
      ...extraHeaders
    };

    if (method === "POST" && body) {
      headers["Content-Type"] = contentType;
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = https.request(BASE_URL + path, { method, headers, timeout: 8000 }, res => {
      let chunks = [];
      res.on("data", d => chunks.push(d));
      res.on("end", () => {
        let buf = Buffer.concat(chunks);
        try {
          const enc = res.headers["content-encoding"];
          if (enc === "gzip") buf = zlib.gunzipSync(buf);
          else if (enc === "br") buf = zlib.brotliDecompressSync(buf);
        } catch { }

        const text = buf.toString("utf-8");

        if (res.statusCode === 401 || res.statusCode === 419 ||
          text.includes('"message":"Unauthenticated"')) {
          return reject(new Error("SESSION_EXPIRED"));
        }

        resolve({ status: res.statusCode, body: text });
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("REQUEST_TIMEOUT"));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function fetchToken() {
  const resp = await makeRequest("GET", "/portal", null, null, {
    "Accept": "text/html,application/xhtml+xml,*/*"
  });
  const match = resp.body.match(/name="_token"\s+value="([^"]+)"/) ||
    resp.body.match(/"csrf-token"\s+content="([^"]+)"/);
  return match ? match[1] : null;
}

async function getNumbers(token) {
  const ts = Date.now();
  const path = `/portal/numbers?draw=1`
    + `&columns[0][data]=number_id&columns[0][name]=id&columns[0][orderable]=false`
    + `&columns[1][data]=Number`
    + `&columns[2][data]=range`
    + `&columns[3][data]=A2P`
    + `&columns[4][data]=LimitA2P`
    + `&columns[5][data]=limit_cli_a2p`
    + `&columns[6][data]=limit_cli_did_a2p`
    + `&columns[7][data]=action&columns[7][searchable]=false&columns[7][orderable]=false`
    + `&order[0][column]=1&order[0][dir]=desc`
    + `&start=0&length=5000&search[value]=&_=${ts}`;

  const resp = await makeRequest("GET", path, null, null, {
    "Referer": `${BASE_URL}/portal/numbers`,
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-CSRF-TOKEN": token
  });

  return safeJSON(resp.body);
}

async function getSMS(token) {
  const today = getToday();
  const boundary = "----WebKitFormBoundary6I2Js7TBhcJuwIqw";

  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="from"\r\n\r\n${today}`,
    `--${boundary}\r\nContent-Disposition: form-data; name="to"\r\n\r\n${today}`,
    `--${boundary}\r\nContent-Disposition: form-data; name="_token"\r\n\r\n${token}`,
    `--${boundary}--`
  ].join("\r\n");

  const r1 = await makeRequest(
    "POST", "/portal/sms/received/getsms", parts,
    `multipart/form-data; boundary=${boundary}`,
    {
      "Referer": `${BASE_URL}/portal/sms/received`,
      "Accept": "text/html, */*; q=0.01",
      "User-Agent": USER_AGENT
    }
  );

  const rangeMatches = [...r1.body.matchAll(/toggleRange\('([^']+)'/g)];
  const ranges = rangeMatches.map(m => m[1]);

  if (ranges.length === 0) {
    return { aaData: [], iTotalRecords: "0", iTotalDisplayRecords: "0" };
  }

  // Take only first 2 ranges to avoid timeout on Vercel (10s limit)
  const limitedRanges = ranges.slice(0, 2);
  const allRows = [];

  for (const range of limitedRanges) {
    try {
      const body = new URLSearchParams({
        _token: token,
        start: today,
        end: today,
        range: range
      }).toString();

      const r2 = await makeRequest(
        "POST", "/portal/sms/received/getsms/number", body,
        "application/x-www-form-urlencoded",
        {
          "Referer": `${BASE_URL}/portal/sms/received`,
          "Accept": "text/html, */*; q=0.01",
          "User-Agent": USER_AGENT
        }
      );

      const rows = parseNumberRows(r2.body, range);
      allRows.push(...rows.slice(0, 5)); // Limit per range
    } catch (e) {
      console.warn(`Range ${range} failed:`, e.message);
    }
  }

  return {
    sEcho: 1,
    iTotalRecords: String(allRows.length),
    iTotalDisplayRecords: String(allRows.length),
    aaData: allRows
  };
}

function parseNumberRows(html, range) {
  const rows = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const row = rowMatch[1];
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
      m[1].replace(/<[^>]+>/g, "").trim()
    );

    if (tds.length >= 2) {
      const number = tds.find(t => /^\d{7,15}$/.test(t.replace(/\s/, ""))) || "";
      const message = tds.find(t => t.length > 5 && !/^\d+$/.test(t) && t !== number) || "";

      if (number || message) {
        rows.push([
          new Date().toISOString().replace("T", " ").substring(0, 19),
          range,
          number,
          "SMS",
          message,
          "$",
          0
        ]);
      }
    }
  }

  return rows;
}

module.exports = {
  fetchToken,
  getNumbers,
  getSMS,
  getToday,
  getCookies,
  setCookies
};
