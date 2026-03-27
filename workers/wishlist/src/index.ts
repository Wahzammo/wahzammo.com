/**
 * Wishlist Worker — Amazon product search proxy for wahzammo.com
 *
 * Scrapes Amazon search results and returns structured JSON.
 * Frontend has mock-data fallback, so graceful degradation on scrape failures.
 */

const ALLOWED_ORIGINS = [
  'https://wahzammo.com',
  'https://www.wahzammo.com',
];

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}

interface Product {
  title: string;
  image: string;
  price: string;
  link: string;
}

/**
 * Parse Amazon search results HTML using regex.
 * Amazon's search pages embed product data in structured HTML with
 * data-component-type="s-search-result" divs. We extract from those.
 */
function parseProducts(html: string): Product[] {
  const products: Product[] = [];

  // Match each search result block
  const resultPattern = /data-component-type="s-search-result"[^>]*data-asin="([A-Z0-9]+)"([\s\S]*?)(?=data-component-type="s-search-result"|<\/div>\s*<\/div>\s*<\/div>\s*<\/span>\s*<!--)/g;
  let match: RegExpExecArray | null;

  while ((match = resultPattern.exec(html)) !== null && products.length < 12) {
    const asin = match[1];
    const block = match[2];

    // Extract title from h2 > a > span
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/);
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';

    // Extract image URL
    const imgMatch = block.match(/<img[^>]*class="[^"]*s-image[^"]*"[^>]*src="([^"]+)"/);
    const image = imgMatch ? imgMatch[1] : '';

    // Extract price from a-offscreen span (the accessible price text)
    const priceMatch = block.match(/<span class="a-offscreen">([\$£€][\d,.]+)<\/span>/);
    const price = priceMatch ? priceMatch[1] : '';

    // Build product link from ASIN
    const link = asin ? `https://www.amazon.com/dp/${asin}` : '';

    if (title && link) {
      products.push({ title, image, price: price || 'See price', link });
    }
  }

  return products;
}

/**
 * Fallback parser — tries to extract from Amazon's inline JSON data
 * if the HTML structure doesn't match the primary regex.
 */
function parseProductsFallback(html: string): Product[] {
  const products: Product[] = [];

  // Amazon sometimes embeds product data as JSON in script tags
  const asinPattern = /data-asin="([A-Z0-9]{10})"/g;
  const asins: string[] = [];
  let asinMatch: RegExpExecArray | null;

  while ((asinMatch = asinPattern.exec(html)) !== null && asins.length < 12) {
    if (!asins.includes(asinMatch[1])) {
      asins.push(asinMatch[1]);
    }
  }

  // For each ASIN, try to find associated title and image nearby in the HTML
  for (const asin of asins) {
    const asinIndex = html.indexOf(`data-asin="${asin}"`);
    if (asinIndex === -1) continue;

    // Look at the ~5000 chars after the ASIN declaration
    const chunk = html.substring(asinIndex, asinIndex + 5000);

    const titleMatch = chunk.match(/<span[^>]*>([\s\S]{10,200}?)<\/span>[\s\S]*?<\/a>[\s\S]*?<\/h2>/);
    const imgMatch = chunk.match(/src="(https:\/\/m\.media-amazon\.com\/images\/[^"]+)"/);
    const priceMatch = chunk.match(/<span class="a-offscreen">([\$£€][\d,.]+)<\/span>/);

    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';

    if (title) {
      products.push({
        title,
        image: imgMatch ? imgMatch[1] : '',
        price: priceMatch ? priceMatch[1] : 'See price',
        link: `https://www.amazon.com/dp/${asin}`,
      });
    }
  }

  return products;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/<[^>]+>/g, '') // strip any remaining HTML tags
    .trim();
}

export default {
  async fetch(request: Request): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);

    // Only handle /api/search
    if (url.pathname !== '/api/search') {
      return jsonResponse({ error: 'Not found' }, 404, request);
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405, request);
    }

    const query = url.searchParams.get('q');
    if (!query || !query.trim()) {
      return jsonResponse({ error: 'Missing search query parameter: q' }, 400, request);
    }

    try {
      const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query.trim())}`;

      const response = await fetch(amazonUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      });

      if (!response.ok) {
        return jsonResponse(
          { error: `Amazon returned status ${response.status}` },
          502,
          request,
        );
      }

      const html = await response.text();

      // Try primary parser first, fall back to secondary
      let products = parseProducts(html);
      if (products.length === 0) {
        products = parseProductsFallback(html);
      }

      if (products.length === 0) {
        return jsonResponse(
          { error: 'No products found. Amazon may have changed their page structure.' },
          502,
          request,
        );
      }

      return jsonResponse(products, 200, request);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return jsonResponse({ error: `Scrape failed: ${message}` }, 502, request);
    }
  },
};
