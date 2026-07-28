(() => {
  'use strict';

  const BUSINESS_KEY = 'hapycurePartnerBusiness';
  const PRODUCTS_KEY = 'hapycurePartnerProducts';
  const $ = selector => document.querySelector(selector);
  const businessForm = $('#businessForm');
  const productForm = $('#productForm');
  let business = read(BUSINESS_KEY, null);
  let products = read(PRODUCTS_KEY, []);

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function save() {
    localStorage.setItem(BUSINESS_KEY, JSON.stringify(business));
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[character]);
  }

  function showModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove('show'), 2200);
  }

  function openBusinessForm() {
    businessForm.reset();
    if (business) {
      ['name', 'type', 'foodType', 'address', 'phone', 'hours'].forEach(key => {
        businessForm.elements[key].value = business[key] || '';
      });
      businessForm.elements.open.checked = business.open;
    }
    showModal('businessModal');
  }

  function openProductForm(product = null) {
    if (!business) {
      toast('List your business before adding products');
      openBusinessForm();
      return;
    }
    productForm.reset();
    productForm.elements.available.checked = true;
    $('#productFormTitle').textContent = product ? 'Edit product' : 'Add product';
    if (product) {
      ['id', 'name', 'category', 'price', 'description', 'image'].forEach(key => {
        productForm.elements[key].value = product[key] || '';
      });
      productForm.elements.available.checked = product.available;
    }
    showModal('productModal');
  }

  function renderBusiness() {
    const card = $('#businessCard');
    if (!business) {
      card.classList.add('empty');
      $('#businessName').textContent = 'No business listed yet';
      $('#businessMeta').textContent = 'Add your restaurant or mess to get started.';
      return;
    }
    card.classList.remove('empty');
    $('#businessName').textContent = business.name;
    $('#businessMeta').textContent = `${business.type} • ${business.foodType} • ${business.open ? 'Accepting orders' : 'Temporarily closed'}`;
  }

  function renderFilters() {
    const current = $('#categoryFilter').value;
    const categories = [...new Set(products.map(item => item.category).filter(Boolean))].sort();
    $('#categoryFilter').innerHTML = '<option value="all">All</option>' +
      categories.map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
    if (categories.includes(current)) $('#categoryFilter').value = current;
  }

  function renderProducts() {
    const query = $('#productSearch').value.trim().toLowerCase();
    const category = $('#categoryFilter').value;
    const visible = products.filter(product =>
      (!query || `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query)) &&
      (category === 'all' || product.category === category)
    );

    $('#productList').innerHTML = visible.map(product => `
      <article class="product-card">
        <div class="product-image">${product.image
          ? `<img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" onerror="this.parentElement.innerHTML='🍽️'">`
          : '🍽️'}</div>
        <div class="product-info">
          <div class="product-top">
            <h3>${escapeHTML(product.name)}</h3>
            <span class="product-price">₹${Number(product.price).toLocaleString('en-IN')}</span>
          </div>
          <span class="product-category">${escapeHTML(product.category)}</span>
          <p>${escapeHTML(product.description || 'Freshly prepared by your kitchen.')}</p>
          <div class="product-actions">
            <div class="availability ${product.available ? '' : 'off'}">
              <button data-action="toggle" data-id="${product.id}" aria-label="Toggle availability"></button>
              ${product.available ? 'Available' : 'Unavailable'}
            </div>
            <div class="item-buttons">
              <button data-action="edit" data-id="${product.id}">Edit</button>
              <button class="delete" data-action="delete" data-id="${product.id}">Delete</button>
            </div>
          </div>
        </div>
      </article>
    `).join('');

    const noProducts = products.length === 0;
    $('#emptyState').classList.toggle('hidden', !noProducts);
    if (!noProducts && visible.length === 0) {
      $('#productList').innerHTML = '<div class="empty-state"><h3>No matching products</h3><p>Try another search or category.</p></div>';
    }
    $('#productCount').textContent = products.length;
    $('#availableCount').textContent = products.filter(item => item.available).length;
    const prices = products.map(item => Number(item.price)).filter(Number.isFinite);
    $('#lowestPrice').textContent = prices.length ? `₹${Math.min(...prices).toLocaleString('en-IN')}` : '₹0';
  }

  businessForm.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(businessForm);
    business = Object.fromEntries(data.entries());
    business.open = businessForm.elements.open.checked;
    save();
    renderBusiness();
    closeModal('businessModal');
    toast('Business details saved');
  });

  productForm.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(productForm);
    const item = Object.fromEntries(data.entries());
    item.available = productForm.elements.available.checked;
    item.id = item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const index = products.findIndex(product => product.id === item.id);
    if (index >= 0) products[index] = item;
    else products.unshift(item);
    save();
    renderFilters();
    renderProducts();
    closeModal('productModal');
    toast(index >= 0 ? 'Product updated' : 'Product added');
  });

  $('#productList').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const product = products.find(item => item.id === button.dataset.id);
    if (!product) return;
    if (button.dataset.action === 'edit') openProductForm(product);
    if (button.dataset.action === 'toggle') {
      product.available = !product.available;
      save();
      renderProducts();
      toast(product.available ? 'Product is now available' : 'Product marked unavailable');
    }
    if (button.dataset.action === 'delete' && confirm(`Delete "${product.name}"?`)) {
      products = products.filter(item => item.id !== product.id);
      save();
      renderFilters();
      renderProducts();
      toast('Product deleted');
    }
  });

  $('#openBusinessForm').addEventListener('click', openBusinessForm);
  $('#editBusiness').addEventListener('click', openBusinessForm);
  $('#profileButton').addEventListener('click', openBusinessForm);
  $('#openProductForm').addEventListener('click', () => openProductForm());
  $('#emptyAddProduct').addEventListener('click', () => openProductForm());
  $('#productSearch').addEventListener('input', renderProducts);
  $('#categoryFilter').addEventListener('change', renderProducts);
  document.querySelectorAll('[data-close]').forEach(button =>
    button.addEventListener('click', () => closeModal(button.dataset.close))
  );
  document.querySelectorAll('.modal').forEach(modal =>
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal(modal.id);
    })
  );
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelectorAll('.modal.show').forEach(modal => closeModal(modal.id));
  });

  renderBusiness();
  renderFilters();
  renderProducts();
})();
