const topicInput = document.getElementById('topicInput');
const searchBtn = document.getElementById('searchBtn');
const statusArea = document.getElementById('statusArea');
const spinner = document.getElementById('spinner');
const statusText = document.getElementById('statusText');
const productGrid = document.getElementById('productGrid');

// Replace this with the actual deployed Cloudflare worker URL
const WORKER_URL = 'https://your-amazon-worker.workers.dev/api/search';

searchBtn.addEventListener('click', async () => {
  const topic = topicInput.value.trim();
  if (!topic) return;

  // Reset UI state
  searchBtn.disabled = true;
  productGrid.innerHTML = '';
  statusArea.style.display = 'block';
  spinner.style.display = 'block';
  statusText.innerHTML = 'Consulting the Amazon proxy worker...';
  statusText.className = '';

  try {
    const res = await fetch(`${WORKER_URL}?q=${encodeURIComponent(topic)}`);

    if (!res.ok) {
      throw new Error(`Worker returned ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    
    // Assume data is an array of 8 product objects: { title, image, price, link }
    if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error("No products found for this topic.");
    }

    // Render cards
    renderProducts(data);
    
    spinner.style.display = 'none';
    statusText.innerHTML = `Successfully curated items for "<strong>${escapeHtml(topic)}</strong>".`;
    statusText.style.color = "#10b981";

  } catch (err) {
    console.error(err);
    spinner.style.display = 'none';
    statusText.innerHTML = `Error: Cannot connect to proxy. Ensure your Amazon CF Worker is live at <code>${WORKER_URL}</code>.`;
    statusText.className = 'error';
    
    // For DEMO PURPOSES ONLY to show the UI if the backend isn't ready:
    renderMockData();
  } finally {
    searchBtn.disabled = false;
  }
});

function renderProducts(products) {
    productGrid.innerHTML = '';
    
    // Slice to ensure max 8 items as requested
    const items = products.slice(0, 8);
    
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        card.innerHTML = `
            <img src="${escapeHtml(item.image)}" alt="Product Image" class="product-img" onerror="this.src='https://via.placeholder.com/150?text=No+Image'">
            <div class="product-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            <div class="product-price">${escapeHtml(item.price || 'Check on Amazon')}</div>
            <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="product-link">View Product</a>
        `;
        productGrid.appendChild(card);
    });
}

// Fallback mock data purely to show off the frontend UI before backend is configured
function renderMockData() {
    statusText.innerHTML += '<br><strong style="color:var(--text-main)">[Showing mock data below to demonstrate UI layout]</strong>';
    const mocks = Array(8).fill(null).map((_, i) => ({
        title: `Example Product ${i+1}: ${topicInput.value}`,
        image: `https://picsum.photos/seed/${Math.random()}/200/200`,
        price: `$${(Math.random() * 100).toFixed(2)}`,
        link: 'https://amazon.com'
    }));
    renderProducts(mocks);
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
