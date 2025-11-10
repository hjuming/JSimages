/* * =================================================================
 * == 寵兒共和國-商品圖庫管理系統 v2.2 (CRUD 完整版) ==
 * * =================================================================
 */

export default {
  /**
   * 1. 處理 HTTP 請求
   */
  async fetch(request, env) {
    const { searchParams, pathname } = new URL(request.url);
    const domain = env.DOMAIN;
    const DATABASE = env.DATABASE;
    const USERNAME = env.USERNAME;
    const PASSWORD = env.PASSWORD;
    const adminPath = env.ADMIN_PATH; // 舊的媒體庫路徑
    const enableAuth = env.ENABLE_AUTH === 'true';
    const R2_BUCKET = env.R2_BUCKET;
    const maxSizeMB = env.MAX_SIZE_MB ? parseInt(env.MAX_SIZE_MB, 10) : 10;
    const maxSize = maxSizeMB * 1024 * 1024;
    const sku = searchParams.get('sku'); // 用於 Edit 和 Delete

    // --- 認證 ---
    // 保護所有頁面
    if (enableAuth && !authenticate(request, USERNAME, PASSWORD)) {
      return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Admin"' } });
    }

    // --- 路由 ---
    switch (pathname) {
      // 根目錄：顯示商品列表
      case '/':
        return await generateProductListPage(DATABASE);

      // 新增商品頁面
      case '/add-product':
        return generateAddProductPage(request);
      
      // 編輯商品頁面
      case '/edit':
        if (!sku) return new Response('缺少 SKU', { status: 400 });
        return await generateEditProductPage(DATABASE, sku);

      // 處理「新增商品」的 POST 請求
      case '/upload':
        return request.method === 'POST' ? await handleAddProductRequest(request, DATABASE, domain, R2_BUCKET, maxSize) : new Response('Method Not Allowed', { status: 405 });

      // 處理「編輯商品」的 POST 請求
      case '/update':
        return request.method === 'POST' ? await handleUpdateProductRequest(request, DATABASE, domain, R2_BUCKET, maxSize) : new Response('Method Not Allowed', { status: 405 });

      // 處理「刪除商品」的 GET 請求
      case '/delete':
        if (!sku) return new Response('缺少 SKU', { status: 400 });
        return await handleDeleteProductRequest(DATABASE, R2_BUCKET, sku, domain);

      // (保留) 舊的媒體庫
      case `/${adminPath}`:
        return await generateMediaListPage(DATABASE);
      case '/delete-images':
        return await handleDeleteImagesRequest(request, DATABASE, R2_BUCKET);
      case '/bing-images':
        return handleBingImagesRequest();

      // 預設：處理 R2 圖片請求 (支援 SKU 資料夾)
      default:
        return await handleImageRequest(request, R2_BUCKET);
    }
  }
}; // --- export default 結束 ---


// --- 認證函式 ---
function authenticate(request, USERNAME, PASSWORD) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = atob(base64Credentials).split(':');
  const username = credentials[0];
  const password = credentials[1];
  return username === USERNAME && password === PASSWORD;
}

// --- 輔助函式：基本 HTML 模板 ---
function getHTMLTemplate(title, bodyContent) {
  return `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - 寵兒共和國</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.6.1/css/bootstrap.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
    <style>
      body { background-color: #f8f9fa; }
      .navbar { box-shadow: 0 2px 4px rgba(0,0,0,.05); }
      .container { max-width: 1200px; }
      .card { margin-bottom: 1.5rem; }
      .product-image {
        width: 100px;
        height: 100px;
        object-fit: cover;
        margin-right: 15px;
        border-radius: 4px;
        background-color: #eee;
      }
      .table td, .table th { vertical-align: middle; }
    </style>
  </head>
  <body>
    <nav class="navbar navbar-expand-lg navbar-light bg-white mb-4">
      <div class="container">
        <a class="navbar-brand" href="/">
          <i class="fas fa-paw"></i> 寵兒共和國-商品圖庫
        </a>
        <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarNav">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav ml-auto">
            <li class="nav-item">
              <a class="nav-link" href="/">商品列表</a>
            </li>
            <li class="nav-item">
              <a class="btn btn-primary" href="/add-product">
                <i class="fas fa-plus"></i> 新增商品
              </a>
            </li>
          </ul>
        </div>
      </div>
    </nav>
    <main class="container">
      ${bodyContent}
    </main>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.6.1/js/bootstrap.bundle.min.js"></script>
  </body>
  </html>
  `;
}

// --- 路由 1: 商品列表頁面 (/) [v2.2] ---
async function generateProductListPage(DATABASE) {
  let products = [];
  try {
    const { results } = await DATABASE.prepare("SELECT sku, title, brand, category, image_file, in_stock FROM products ORDER BY sku ASC").all();
    products = results || [];
  } catch (e) {
    return new Response(`資料庫查詢失敗: ${e.message}`, { status: 500 });
  }

  let tableRows = products.map(p => `
    <tr>
      <td>
        ${p.image_file ? `<img src="/${p.sku}/${p.image_file.replace(/\s+/g, '_')}" class="product-image" alt="${p.title}">` : '<div class="product-image"></div>'}
      </td>
      <td>${p.sku}</td>
      <td>${p.title}</td>
      <td>${p.brand}</td>
      <td>${p.category}</td>
      <td>${p.in_stock === 'Y' ? '<span class="badge badge-success">Y</span>' : '<span class="badge badge-secondary">N</span>'}</td>
      <td>
        <a href="/edit?sku=${p.sku}" class="btn btn-sm btn-info">
          <i class="fas fa-edit"></i> 編輯
        </a>
        <a href="/delete?sku=${p.sku}" class="btn btn-sm btn-danger" onclick="return confirm('確定要刪除商品 ${p.sku} 嗎？此操作會刪除 D1 資料和 R2 上的所有圖片！');">
          <i class="fas fa-trash"></i> 刪除
        </a>
      </td>
    </tr>
  `).join('');

  if (products.length === 0) {
    tableRows = '<tr><td colspan="7" class="text-center">尚未新增任何商品。 <a href="/add-product">點此新增</a></td></tr>';
  }

  const bodyContent = `
    <div class="card">
      <div class="card-header">
        <h5><i class="fas fa-list-ul"></i> 商品列表 (${products.length} 筆)</h5>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead class="thead-light">
              <tr>
                <th>圖片</th>
                <th>商品貨號 (SKU)</th>
                <th>產品名稱</th>
                <th>品牌</th>
                <th>類別</th>
                <th>現貨</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  return new Response(getHTMLTemplate('商品列表', bodyContent), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

// --- 路由 2: 新增商品頁面 (/add-product) [v2.1] ---
function generateAddProductPage(request) {
  const bodyContent = `
    <div class="card">
      <div class="card-header">
        <h5><i class="fas fa-plus-circle"></i> 新增商品</h5>
      </div>
      <div class="card-body">
        <form action="/upload" method="POST" enctype="multipart/form-data">
          <div class="row">
            <div class="col-md-6">
              <div class="form-group">
                <label for="sku"><strong>商品貨號 (SKU) *</strong></label>
                <input type="text" class="form-control" id="sku" name="sku" required>
                <small class="form-text text-muted">這將作為圖片資料夾名稱，請勿使用特殊字元。</small>
              </div>
            </div>
            <div class="col-md-6">
              <div class="form-group">
                <label for="title"><strong>產品名稱 *</strong></label>
                <input type="text" class="form-control" id="title" name="title" required>
              </div>
            </div>
          </div>
          
          <div class="row">
            <div class="col-md-6">
              <div class="form-group">
                <label for="brand">品牌名稱</label>
                <input type="text" class="form-control" id="brand" name="brand">
              </div>
            </div>
            <div class="col-md-6">
              <div class="form-group">
                <label for="category">類別</label>
                <input type="text" class="form-control" id="category" name="category">
              </div>
            </div>
          </div>

          <div class="form-group">
            <label for="file"><strong>商品圖檔 *</strong> (僅限一張主圖)</label>
            <input type="file" class="form-control-file" id="file" name="file" required>
            <small class="form-text text-muted">上傳的檔名將被儲存。</small>
          </div>
          
          <hr>
          
          <div class="row">
            <div class="col-md-6">
              <div class="form-group">
                <label for="title_en">英文品名</label>
                <input type="text" class="form-control" id="title_en" name="title_en">
              </div>
            </div>
             <div class="col-md-3">
              <div class="form-group">
                <label for="case_pack_size">箱入數</label>
                <input type="number" class="form-control" id="case_pack_size" name="case_pack_size">
              </div>
            </div>
            <div class="col-md-3">
              <div class="form-group">
                <label for="msrp">建議售價</label>
                <input type="number" step="0.01" class="form-control" id="msrp" name="msrp">
              </div>
            </div>
          </div>

          <div class="form-group">
            <label for="description">商品介紹</label>
            <textarea class="form-control" id="description" name="description" rows="3"></textarea>
          </div>

          <div class="form-group">
            <label for="materials">成份/材質</label>
            <textarea class="form-control" id="materials" name="materials" rows="2"></textarea>
          </div>

          <div class="row">
            <div class="col-md-6">
              <div class="form-group">
                <label for="barcode">國際條碼</label>
                <input type="text" class="form-control" id="barcode" name="barcode">
              </div>
            </div>
            <div class="col-md-3">
              <div class="form-group">
                <label for="dimensions_cm">商品尺寸 (cm)</label>
                <input type="text" class="form-control" id="dimensions_cm" name="dimensions_cm">
              </div>
            </div>
            <div class="col-md-3">
              <div class="form-group">
                <label for="weight_g">重量 (g)</label>
                <input type="number" step="0.1" class="form-control" id="weight_g" name="weight_g">
              </div>
            </div>
          </div>

          <div class="row">
            <div class="col-md-6">
              <div class="form-group">
                <label for="origin">產地</label>
                <input type="text" class="form-control" id="origin" name="origin">
              </div>
            </div>
            <div class="col-md-6">
              <div class="form-group">
                <label>現貨商品</label>
                <select class="form-control" name="in_stock">
                  <option value="Y">Y (是)</option>
                  <option value="N" selected>N (否)</option>
                </select>
              </div>
            </div>
          </div>
          
          <button type="submit" class="btn btn-success">
            <i class="fas fa-check"></i> 儲存商品
          </button>
        </form>
      </div>
    </div>
  `;
  return new Response(getHTMLTemplate('新增商品', bodyContent), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

// --- 路由 3: 編輯商品頁面 (/edit) [v2.2] ---
async function generateEditProductPage(DATABASE, sku) {
  let product;
  try {
    product = await DATABASE.prepare("SELECT * FROM products WHERE sku = ?").bind(sku).first();
  } catch (e) {
    return new Response(`資料庫查詢失敗: ${e.message}`, { status: 500 });
  }

  if (!product) {
    return new Response('找不到商品', { status: 404 });
  }
  
  // 輔助函式，避免 'null' 顯示在輸入框
  const val = (field) => product[field] || '';
  const isChecked = (field, value) => product[field] === value ? 'selected' : '';

  const bodyContent = `
    <div class="card">
      <div class="card-header">
        <h5><i class="fas fa-edit"></i> 編輯商品: ${val('title')} (SKU: ${val('sku')})</h5>
      </div>
      <div class="card-body">
        <form action="/update" method="POST" enctype="multipart/form-data">
          <div class="row">
            <div class="col-md-6">
              <div class="form-group">
                <label for="sku"><strong>商品貨號 (SKU) *</strong></label>
                <input type="text" class="form-control" id="sku" name="sku" value="${val('sku')}" readonly>
              </div>
            </div>
            <div class="col-md-6">
              <div class="form-group">
                <label for="title"><strong>產品名稱 *</strong></label>
                <input type="text" class="form-control" id="title" name="title" value="${val('title')}" required>
              </div>
            </div>
          </div>
          
          <div class="row">
            <div class="col-md-6">
              <div class="form-group">
                <label for="brand">品牌名稱</label>
                <input type="text" class="form-control" id="brand" name="brand" value="${val('brand')}">
              </div>
            </div>
            <div class="col-md-6">
              <div class="form-group">
                <label for="category">類別</label>
                <input type="text" class="form-control" id="category" name="category" value="${val('category')}">
              </div>
            </div>
          </div>

          <div class="form-group">
            <label for="file"><strong>商品圖檔</strong> (上傳新圖片以覆蓋)</label>
            <br>
            ${val('image_file') ? `<img src="/${val('sku')}/${val('image_file').replace(/\s+/g, '_')}" class="product-image mb-2" alt="Current Image">` : '<p class="text-muted">目前沒有主圖</p>'}
            <input type="file" class="form-control-file" id="file" name="file">
            <input type="hidden" name="existing_image_file" value="${val('image_file')}">
            <small class="form-text text-muted">如不更換，請保持此欄位空白。</small>
          </div>
          
          <hr>
          
          <div class="row">
            <div class="col-md-6">
              <div class="form-group">
                <label for="title_en">英文品名</label>
                <input type="text" class="form-control" id="title_en" name="title_en" value="${val('title_en')}">
              </div>
            </div>
             <div class="col-md-3">
              <div class="form-group">
                <label for="case_pack_size">箱入數</label>
                <input type="number" class="form-control" id="case_pack_size" name="case_pack_size" value="${val('case_pack_size')}">
              </div>
            </div>
            <div class="col-md-3">
              <div class="form-group">
                <label for="msrp">建議售價</label>
                <input type="number" step="0.01" class="form-control" id="msrp" name="msrp" value="${val('msrp')}">
              </div>
            </div>
          </div>

          <div class="form-group">
            <label for="description">商品介紹</label>
            <textarea class="form-control" id="description" name="description" rows="3">${val('description')}</textarea>
          </div>

          <div class="form-group">
            <label for="materials">成份/材質</label>
            <textarea class="form-control" id="materials" name="materials" rows="2">${val('materials')}</textarea>
          </div>

          <div class="row">
            <div class="col-md-6">
              <div class="form-group">
                <label for="barcode">國際條碼</label>
                <input type="text" class="form-control" id="barcode" name="barcode" value="${val('barcode')}">
              </div>
            </div>
            <div class="col-md-3">
              <div class="form-group">
                <label for="dimensions_cm">商品尺寸 (cm)</label>
                <input type="text" class="form-control" id="dimensions_cm" name="dimensions_cm" value="${val('dimensions_cm')}">
              </div>
            </div>
            <div class="col-md-3">
              <div class="form-group">
                <label for="weight_g">重量 (g)</label>
                <input type="number" step="0.1" class="form-control" id="weight_g" name="weight_g" value="${val('weight_g')}">
              </div>
            </div>
          </div>

          <div class="row">
            <div class="col-md-6">
              <div class="form-group">
                <label for="origin">產地</label>
                <input type="text" class="form-control" id="origin" name="origin" value="${val('origin')}">
              </div>
            </div>
            <div class="col-md-6">
              <div class="form-group">
                <label>現貨商品</label>
                <select class="form-control" name="in_stock">
                  <option value="Y" ${isChecked('in_stock', 'Y')}>Y (是)</option>
                  <option value="N" ${isChecked('in_stock', 'N')}>N (否)</option>
                </select>
              </div>
            </div>
          </div>
          
          <button type="submit" class="btn btn-success">
            <i class="fas fa-check"></i> 更新商品
          </button>
          <a href="/" class="btn btn-secondary">取消</a>
        </form>
      </div>
    </div>
  `;
  return new Response(getHTMLTemplate(`編輯 ${val('title')}`, bodyContent), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}


// --- 路由 4: 處理「新增」商品 (/upload) [v2.2] ---
async function handleAddProductRequest(request, DATABASE, domain, R2_BUCKET, maxSize) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const sku = formData.get('sku');

    if (!file || !sku) {
      return new Response(JSON.stringify({ error: '缺少 商品貨號 (SKU) 或 檔案' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    
    // 檢查 SKU 是否已存在
    const existing = await DATABASE.prepare("SELECT sku FROM products WHERE sku = ?").bind(sku).first();
    if (existing) {
      const html = `SKU 已存在: ${sku}。請 <a href="/edit?sku=${sku}">使用「編輯」功能</a> 或 <a href="/add-product">返回</a> 使用新的 SKU。`;
      return new Response(getHTMLTemplate('SKU 已存在', `<div class="alert alert-danger">${html}</div>`), { status: 409, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    if (file.size > maxSize) {
      return new Response(JSON.stringify({ error: `文件大小超过${maxSize / (1024 * 1024)}MB限制` }), { status: 413, headers: { 'Content-Type': 'application/json' } });
    }

    const cleanFileName = file.name.replace(/\s+/g, '_');
    const r2Key = `${sku}/${cleanFileName}`; 

    await R2_BUCKET.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type }
    });

    const sql = `
      INSERT INTO products (
        sku, title, title_en, brand, category, description, materials, 
        image_file, case_pack_size, msrp, barcode, dimensions_cm, 
        weight_g, origin, in_stock, airtable_image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    
    await DATABASE.prepare(sql).bind(
      sku,
      formData.get('title'),
      formData.get('title_en'),
      formData.get('brand'),
      formData.get('category'),
      formData.get('description'),
      formData.get('materials'),
      cleanFileName, // 只儲存檔名
      formData.get('case_pack_size') ? parseInt(formData.get('case_pack_size'), 10) : null,
      formData.get('msrp') ? parseFloat(formData.get('msrp')) : null,
      formData.get('barcode'),
      formData.get('dimensions_cm'),
      formData.get('weight_g') ? parseFloat(formData.get('weight_g')) : null,
      formData.get('origin'),
      formData.get('in_stock'),
      null // airtable_image_url 設為 null
    ).run();

    return Response.redirect(`https://${domain}/`, 303);

  } catch (error) {
    console.error('上傳或資料庫錯誤:', error);
    return new Response(getHTMLTemplate('錯誤', `<div class="alert alert-danger">${error.message}</div>`), { status: 500, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }
}

// --- 路由 5: 處理「更新」商品 (/update) [v2.2] ---
async function handleUpdateProductRequest(request, DATABASE, domain, R2_BUCKET, maxSize) {
  try {
    const formData = await request.formData();
    const sku = formData.get('sku');
    const file = formData.get('file');
    let image_file = formData.get('existing_image_file'); // 取得舊檔名

    if (!sku) {
      return new Response(JSON.stringify({ error: '缺少 SKU' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 檢查是否有「新」圖片被上傳
    if (file && file.size > 0) {
      if (file.size > maxSize) {
        return new Response(JSON.stringify({ error: `文件大小超过${maxSize / (1024 * 1024)}MB限制` }), { status: 413, headers: { 'Content-Type': 'application/json' } });
      }
      
      const cleanFileName = file.name.replace(/\s+/g, '_');
      const r2Key = `${sku}/${cleanFileName}`;
      
      // 上傳新圖片
      await R2_BUCKET.put(r2Key, file.stream(), {
        httpMetadata: { contentType: file.type }
      });
      
      // 更新要寫入 D1 的檔名
      image_file = cleanFileName;
      
      // (可選) 刪除舊圖片
      if (formData.get('existing_image_file') && formData.get('existing_image_file') !== 'null') {
          const oldR2Key = `${sku}/${formData.get('existing_image_file')}`;
          if (oldR2Key !== r2Key) {
             await R2_BUCKET.delete(oldR2Key);
          }
      }
    }

    const sql = `
      UPDATE products SET
        title = ?, title_en = ?, brand = ?, category = ?, description = ?, materials = ?, 
        image_file = ?, case_pack_size = ?, msrp = ?, barcode = ?, dimensions_cm = ?, 
        weight_g = ?, origin = ?, in_stock = ?
      WHERE sku = ?;
    `;
    
    await DATABASE.prepare(sql).bind(
      formData.get('title'),
      formData.get('title_en'),
      formData.get('brand'),
      formData.get('category'),
      formData.get('description'),
      formData.get('materials'),
      image_file, // 使用新檔名或舊檔名
      formData.get('case_pack_size') ? parseInt(formData.get('case_pack_size'), 10) : null,
      formData.get('msrp') ? parseFloat(formData.get('msrp')) : null,
      formData.get('barcode'),
      formData.get('dimensions_cm'),
      formData.get('weight_g') ? parseFloat(formData.get('weight_g')) : null,
      formData.get('origin'),
      formData.get('in_stock'),
      sku // WHERE 條件
    ).run();

    return Response.redirect(`https://${domain}/`, 303);

  } catch (error) {
    console.error('更新或資料庫錯誤:', error);
    return new Response(getHTMLTemplate('錯誤', `<div class="alert alert-danger">${error.message}</div>`), { status: 500, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }
}

// --- 路由 6: 處理「刪除」商品 (/delete) [v2.2] ---
async function handleDeleteProductRequest(DATABASE, R2_BUCKET, sku, domain) {
  try {
    // 1. 刪除 D1 資料
    await DATABASE.prepare("DELETE FROM products WHERE sku = ?").bind(sku).run();

    // 2. 刪除 R2 上的整個資料夾 (批次刪除)
    const list = await R2_BUCKET.list({ prefix: `${sku}/` });
    if (list.objects.length > 0) {
      const keysToDelete = list.objects.map(obj => obj.key);
      await R2_BUCKET.delete(keysToDelete);
    }

    // 3. 重導向回首頁
    return Response.redirect(`https://${domain}/`, 303);
    
  } catch (error) {
    console.error('刪除錯誤:', error);
    return new Response(getHTMLTemplate('錯誤', `<div class="alert alert-danger">${error.message}</div>`), { status: 500, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }
}


// --- 路由 7: 處理圖片請求 (v2.1) ---
async function handleImageRequest(request, R2_BUCKET) {
  const cache = caches.default;
  const cacheKey = new Request(request.url);
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) return cachedResponse;

  const { pathname } = new URL(request.url);
  // 路徑現在是 /SKU/filename.jpg 或舊的 /timestamp.ext
  // 我們需要移除開頭的 '/'
  const r2Key = pathname.substring(1);

  // 從 R2 獲取物件
  const object = await R2_BUCKET.get(r2Key);
  if (!object) {
    // 檢查是否是「舊格式」的圖片 (沒有資料夾)
    const legacyKey = r2Key.split('.')[0];
    const legacyObject = await R2_BUCKET.get(legacyKey);
    if (!legacyObject) {
      const notFoundResponse = new Response('資源不存在', { status: 404 });
      await cache.put(cacheKey, notFoundResponse.clone());
      return notFoundResponse;
    }
    // 如果是舊格式，就回傳舊物件
    const headers = new Headers();
    legacyObject.writeHttpMetadata(headers);
    headers.set('etag', legacyObject.httpEtag);
    headers.set('Content-Disposition', 'inline');
    const responseToCache = new Response(legacyObject.body, { headers });
    await cache.put(cacheKey, responseToCache.clone());
    return responseToCache;
  }

  // 如果是新格式 (有資料夾)，回傳新物件
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Content-Disposition', 'inline');

  const responseToCache = new Response(object.body, { headers });
  await cache.put(cacheKey, responseToCache.clone());
  return responseToCache;
}


// --- [保留] 舊的媒體庫頁面 (v2.1) ---
async function generateMediaListPage(DATABASE) {
  const mediaData = await fetchMediaData(DATABASE);
  const mediaHtml = mediaData.map(({ url, brand, category }) => { // 這裡的 media 表可能還有舊資料
    const fileExtension = url.split('.').pop().toLowerCase();
    const timestamp = url.split('/').pop().split('.')[0];
    const mediaType = fileExtension;
    const isVideo = ['mp4', 'webm', 'mov'].includes(fileExtension);
    
    return `
    <div class="media-container" data-key="${url}" onclick="toggleImageSelection(this)">
      <div class="media-type">${mediaType}</div>
      ${isVideo ? 
        `<video preload="none" style="width: 100%; height: 100%; object-fit: contain;" controls><source data-src="${url}" type="video/${fileExtension}"></video>` :
        `<img class="gallery-image lazy" data-src="${url}" alt="Image">`
      }
      <div class="upload-time">上傳於: ${new Date(parseInt(timestamp)).toLocaleString('zh-CN')}</div>
      ${brand ? `<div class="media-info">${brand} / ${category}</div>` : ''}
    </div>
    `;
  }).join('');
  
  const bodyContent = `
    <div class="card">
      <div class="card-header">
        <h5><i class="fas fa-images"></i> 舊媒體庫 (非商品)</h5>
        <small class="text-muted">這裡是舊的 /admin 頁面，用於管理非商品圖片。商品圖片請到「商品列表」管理。</small>
      </div>
      <div class="card-body">
        <div class="gallery">${mediaHtml}</div>
      </div>
    </div>
    <style>
      .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
      .media-container { position: relative; aspect-ratio: 1/1; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
      .gallery-image, .gallery video { width: 100%; height: 100%; object-fit: cover; }
      .media-type, .upload-time, .media-info { position: absolute; background: rgba(0,0,0,0.6); color: white; padding: 2px 5px; font-size: 12px; }
      .media-type { top: 5px; left: 5px; }
      .upload-time { bottom: 5px; left: 5px; display: none; }
      .media-info { top: 5px; right: 5px; }
      .media-container.selected { border: 2px solid #007bff; }
      .media-container:hover .upload-time { display: block; }
    </style>
    <script>
    // 舊的刪除和選擇 JS 邏輯沒有包含在這裡
    // 需要的話可以從 v1 程式碼中移植過來
    </script>
  `;
  return new Response(getHTMLTemplate('舊媒體庫', bodyContent), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

// --- [保留] 獲取舊媒體庫資料 (v2.1) ---
async function fetchMediaData(DATABASE) {
  try {
    const { results } = await DATABASE.prepare('SELECT url, brand, category FROM media').all();
    const mediaData = (results || []).map(row => {
      const timestamp = parseInt(row.url.split('/').pop().split('.')[0]);
      return { url: row.url, brand: row.brand, category: row.category, timestamp: timestamp };
    });
    mediaData.sort((a, b) => b.timestamp - a.timestamp);
    return mediaData.map(({ url, brand, category }) => ({ url, brand, category }));
  } catch (e) {
    if (e.message.includes("no such table")) { return []; }
    throw e;
  }
}

// --- [保留] 刪除舊媒體庫圖片 (v2.1) ---
async function handleDeleteImagesRequest(request, DATABASE, R2_BUCKET) {
  // 注意：這個函式只刪除 media 表的圖片，不會刪除 products 的
  try {
    const keysToDelete = await request.json();
    if (!Array.isArray(keysToDelete) || keysToDelete.length === 0) {
      return new Response(JSON.stringify({ message: '沒有要删除的项' }), { status: 400 });
    }
    const placeholders = keysToDelete.map(() => '?').join(',');
    await DATABASE.prepare(`DELETE FROM media WHERE url IN (${placeholders})`).bind(...keysToDelete).run();
    
    const cache = caches.default;
    for (const url of keysToDelete) {
      await cache.delete(new Request(url));
      const urlParts = url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const r2Key = fileName.split('.')[0]; // 假設舊格式是 r2Key.ext
      await R2_BUCKET.delete(r2Key);
    }
    return new Response(JSON.stringify({ message: '删除成功' }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: '删除失败', details: error.message }), { status: 500 });
  }
}

// --- [保留] Bing 背景圖 (v2.1) ---
async function handleBingImagesRequest(request) {
  const cache = caches.default;
  const cacheKey = new Request('https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=5');
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) return cachedResponse;
  const res = await fetch(cacheKey);
  if (!res.ok) {
    return new Response('请求 Bing API 失败', { status: res.status });
  }
  const bingData = await res.json();
  const images = bingData.images.map(image => ({ url: `https://cn.bing.com${image.url}` }));
  const returnData = { status: true, message: "操作成功", data: images };
  const response = new Response(JSON.stringify(returnData), { status: 200, headers: { 'Content-Type': 'application/json' } });
  await cache.put(cacheKey, response.clone());
  return response;
}
