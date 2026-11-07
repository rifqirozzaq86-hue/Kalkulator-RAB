/**
 * RAB PRO MASTER v2.0 - Client Application Logic
 * Comprehensive Real-time Construction Estimator
 * Integrated with:
 * 1. DJBK No. 47 Tahun 2026 - AHSP Cipta Karya (1.932 items)
 * 2. HSD 35 Kabupaten/Kota Jawa Tengah 2026 (Simulasi Lengkap)
 * 3. Work Breakdown Structure (WBS Standar Konstruksi)
 */

class RabApp {
  constructor() {
    this.projects = [];
    this.currentProject = null;
    this.regions = [];
    this.currentWilayah = 'Kota Semarang';
    this.currentFactor = 1.05;
    this.wbsTree = [];
    this.catalogData = { items: [], total: 0, page: 1, totalPages: 1 };
    this.catalogPage = 1;
    this.catalogSearch = '';
    this.catalogDivisi = 'ALL';
    this.hsdCategoryFilter = 'ALL';
    this.currentHsdDetail = null;

    this.currentFilterCategory = 'ALL';
    this.searchQuery = '';
    this.viewMode = localStorage.getItem('rab_view_mode') || (window.innerWidth <= 768 ? 'card' : 'table');
    this.networkInfo = null;

    this.chartColors = [
      '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
      '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6'
    ];

    this.init();
  }

  async init() {
    this.bindEvents();
    this.initTheme();
    await this.fetchNetworkInfo();
    await this.fetchRegions();
    await this.fetchWbs();
    await this.fetchCatalog(1);
    await this.fetchProjects();
    this.setupQuickCostCalculator();
    this.setupVolumeCalculatorListeners();
  }

  // ================= 1. REGIONS & HSD 35 KAB/KOTA JATENG =================
  async fetchRegions() {
    try {
      const res = await fetch('/api/regions');
      if (!res.ok) throw new Error('Gagal mengambil data wilayah HSD');
      this.regions = await res.json();
      this.populateRegionSelectors();
      if (this.regions.length > 0) {
        await this.loadHsdRegionDetail(this.currentWilayah);
      }
    } catch (err) {
      console.error(err);
    }
  }

  populateRegionSelectors() {
    const selects = ['headerWilayahSelect', 'inpWilayah', 'npWilayah', 'hsdViewerRegionSelect'];
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = '';
      this.regions.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.nama;
        opt.textContent = `${r.nama} (${r.faktor}x)`;
        if (r.nama.toLowerCase() === this.currentWilayah.toLowerCase()) {
          opt.selected = true;
        }
        el.appendChild(opt);
      });
    });
  }

  async loadHsdRegionDetail(regionName) {
    try {
      const res = await fetch(`/api/regions/${encodeURIComponent(regionName)}/hsd`);
      if (!res.ok) throw new Error('Gagal mengambil rincian HSD wilayah');
      this.currentHsdDetail = await res.json();
      this.renderHsdViewer();
    } catch (err) {
      console.error(err);
    }
  }

  renderHsdViewer() {
    if (!this.currentHsdDetail) return;
    const reg = this.regions.find(r => r.nama.toLowerCase() === this.currentHsdDetail.nama.toLowerCase()) || { faktor: 1.0, ringkasan: {} };

    document.getElementById('hsdStatRegionName').textContent = this.currentHsdDetail.nama;
    document.getElementById('hsdStatFactor').textContent = `Faktor: ${reg.faktor}x`;

    const rk = reg.ringkasan || {};
    document.getElementById('hsdStatTukang').textContent = this.formatRupiah(rk.tukang || 135000 * reg.faktor);
    document.getElementById('hsdStatMandor').textContent = this.formatRupiah(rk.mandor || 160000 * reg.faktor);
    document.getElementById('hsdStatPekerja').textContent = this.formatRupiah(rk.pekerja || 110000 * reg.faktor);
    document.getElementById('hsdStatKepala').textContent = this.formatRupiah(Math.round(145000 * reg.faktor));
    document.getElementById('hsdStatSemen').textContent = `${this.formatRupiah(rk.semen || 78500 * reg.faktor)} / zak`;
    document.getElementById('hsdStatPasir').textContent = `${this.formatRupiah(rk.pasir || 290000 * reg.faktor)} / m³`;

    this.renderHsdDetailTable();
  }

  filterHsdCategory(cat) {
    this.hsdCategoryFilter = cat;
    document.querySelectorAll('#hsdCategoryPills .pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.startsWith(cat) || (cat === 'ALL' && btn.textContent === 'Semua'));
    });
    this.renderHsdDetailTable();
  }

  renderHsdDetailTable() {
    const tbody = document.getElementById('hsdDetailTableBody');
    if (!tbody || !this.currentHsdDetail) return;
    tbody.innerHTML = '';

    let items = this.currentHsdDetail.items || [];
    if (this.hsdCategoryFilter !== 'ALL') {
      items = items.filter(i => i.kategori.toLowerCase() === this.hsdCategoryFilter.toLowerCase());
    }

    items.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align: center; color: var(--text-muted);">${index + 1}</td>
        <td><span class="badge-accent">${item.kategori}</span></td>
        <td><strong>${item.uraian}</strong></td>
        <td style="text-align: center;">${item.satuan}</td>
        <td style="text-align: right; color: var(--text-muted);">${this.formatRupiah(item.hargaMin)}</td>
        <td style="text-align: right; color: var(--text-muted);">${this.formatRupiah(item.hargaMax)}</td>
        <td style="text-align: right; font-weight: 700; color: var(--accent);">${this.formatRupiah(item.hargaTengah)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ================= 2. WBS HIERARCHY TREE =================
  async fetchWbs() {
    try {
      const res = await fetch('/api/wbs');
      if (!res.ok) throw new Error('Gagal mengambil struktur WBS');
      this.wbsTree = await res.json();
      this.renderWbsTree();
    } catch (err) {
      console.error(err);
    }
  }

  renderWbsTree() {
    const container = document.getElementById('wbsTreeContainer');
    if (!container) return;
    container.innerHTML = '';

    const search = (document.getElementById('wbsSearchInput')?.value || '').toLowerCase();
    let list = this.wbsTree;

    if (search.trim()) {
      list = list.filter(w => w.kode.toLowerCase().includes(search) || w.uraian.toLowerCase().includes(search) || (w.keterangan || '').toLowerCase().includes(search));
    }

    list.forEach(node => {
      const div = document.createElement('div');
      div.className = `wbs-node level-${node.level}`;
      div.innerHTML = `
        <div class="wbs-node-info">
          <h4>
            <span class="wbs-code-tag">${node.kode}</span>
            <span>${node.uraian}</span>
          </h4>
          ${node.keterangan ? `<p class="wbs-node-desc">${node.keterangan}</p>` : ''}
        </div>
        <div class="wbs-node-action">
          <button class="btn btn-sm btn-secondary" onclick="app.addItemForWbs('${node.kode}', '${node.uraian}')">
            + Tambah ke RAB
          </button>
        </div>
      `;
      container.appendChild(div);
    });
  }

  filterWbsTree() {
    this.renderWbsTree();
  }

  applyWbsTemplate() {
    if (!confirm('Terapkan seluruh kerangka paket pekerjaan WBS Rumah 2 Lantai ke RAB proyek saat ini?')) return;
    if (!this.currentProject) return;

    // Filter level 3 leaf items
    const leafItems = this.wbsTree.filter(w => w.level >= 3);
    leafItems.forEach((w, idx) => {
      const existing = this.currentProject.items.find(i => i.kode === w.kode || i.nama.toLowerCase() === w.uraian.toLowerCase());
      if (!existing) {
        this.currentProject.items.push({
          id: 'item-wbs-' + Date.now() + '-' + idx,
          kode: w.kode,
          kategori: w.parentKode ? (this.wbsTree.find(p => p.kode === w.parentKode)?.uraian || 'Pekerjaan Struktur') : 'Pekerjaan Umum',
          nama: w.uraian,
          satuan: 'ls',
          volume: 1,
          hargaSatuan: 1000000
        });
      }
    });

    this.renderAll();
    this.showToast('Kerangka WBS berhasil diterapkan ke proyek RAB!', 'success');
  }

  addItemForWbs(kode, uraian) {
    if (!this.currentProject) return;
    this.currentProject.items.push({
      id: 'item-' + Date.now(),
      kode: kode,
      kategori: 'Pekerjaan WBS ' + kode,
      nama: uraian,
      satuan: 'ls',
      volume: 1,
      hargaSatuan: 500000
    });
    this.renderAll();
    this.showToast(`Item WBS [${kode}] ${uraian} ditambahkan ke RAB!`, 'success');
  }

  // ================= 3. DJBK NO. 47 TAHUN 2026 CATALOG =================
  async fetchCatalog(page = 1) {
    try {
      this.catalogPage = page;
      const url = `/api/catalog?wilayah=${encodeURIComponent(this.currentWilayah)}&page=${page}&limit=24&search=${encodeURIComponent(this.catalogSearch)}&divisi=${encodeURIComponent(this.catalogDivisi)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Gagal mengambil katalog DJBK');
      this.catalogData = await res.json();
      this.renderCatalogCards();
      this.renderCatalogPagination();
      this.renderPickerItems();

      const totalCountEl = document.getElementById('catalogTotalCount');
      if (totalCountEl) totalCountEl.textContent = `${this.catalogData.total} Item`;
      const activeWilayahEl = document.getElementById('catalogActiveWilayah');
      if (activeWilayahEl) activeWilayahEl.textContent = `${this.catalogData.wilayah} (${this.catalogData.faktor}x)`;
      const pickerWilayahEl = document.getElementById('pickerWilayahText');
      if (pickerWilayahEl) pickerWilayahEl.textContent = `${this.catalogData.wilayah} (${this.catalogData.faktor}x)`;
    } catch (err) {
      console.error('Error fetching catalog:', err);
    }
  }

  renderCatalogCards() {
    const container = document.getElementById('catalogCardsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!this.catalogData.items || this.catalogData.items.length === 0) {
      container.innerHTML = '<p style="text-align: center; grid-column: 1/-1; padding: 3rem; color: var(--text-muted);">Tidak ada item pekerjaan yang cocok dengan pencarian.</p>';
      return;
    }

    this.catalogData.items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'catalog-card';
      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
            <span class="cat-badge">${item.kode || 'AHSP'}</span>
            <span style="font-size: 0.72rem; color: var(--text-muted);">${item.kategori}</span>
          </div>
          <h4 class="cat-item-name">${item.nama}</h4>
          <p class="cat-item-desc">${item.subKategori ? item.subKategori + ' • ' : ''}${item.keterangan || 'Permen PUPR / DJBK No. 47 Tahun 2026'}</p>
        </div>
        <div class="cat-item-footer">
          <div>
            <div class="cat-price-val">${this.formatRupiah(item.hargaSatuan)}</div>
            <span class="cat-price-unit">per ${item.satuan} <small style="color: var(--accent); font-weight: 700;">(${this.catalogData.faktor}x HSD)</small></span>
          </div>
          <button class="btn btn-sm btn-accent" onclick="app.addItemFromCatalogPrompt('${item.id}', '${item.nama.replace(/'/g, "\\'")}', '${item.satuan}', ${item.hargaSatuan}, '${item.kode || ''}', '${item.kategori || ''}')">
            + Tambah ke RAB
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  renderCatalogPagination() {
    const container = document.getElementById('catalogPagination');
    if (!container) return;
    container.innerHTML = '';

    const { page, totalPages } = this.catalogData;
    if (totalPages <= 1) return;

    // Previous Button
    const btnPrev = document.createElement('button');
    btnPrev.className = 'page-btn';
    btnPrev.textContent = '« Sebelumnya';
    btnPrev.disabled = page <= 1;
    btnPrev.onclick = () => this.fetchCatalog(page - 1);
    container.appendChild(btnPrev);

    // Page numbers
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);

    for (let p = start; p <= end; p++) {
      const btn = document.createElement('button');
      btn.className = `page-btn ${p === page ? 'active' : ''}`;
      btn.textContent = p;
      btn.onclick = () => this.fetchCatalog(p);
      container.appendChild(btn);
    }

    // Next Button
    const btnNext = document.createElement('button');
    btnNext.className = 'page-btn';
    btnNext.textContent = 'Berikutnya »';
    btnNext.disabled = page >= totalPages;
    btnNext.onclick = () => this.fetchCatalog(page + 1);
    container.appendChild(btnNext);
  }

  addItemFromCatalogPrompt(id, nama, satuan, hargaSatuan, kode, kategori) {
    const volStr = prompt(`Masukkan Volume Pekerjaan untuk:\n"${nama}"\nSatuan: ${satuan}\nHarga Satuan: ${this.formatRupiah(hargaSatuan)}`, '1');
    if (volStr === null) return;
    const volume = parseFloat(volStr) || 1;

    this.currentProject.items.push({
      id: 'item-' + Date.now() + Math.floor(Math.random() * 50),
      kode: kode || 'DJBK',
      kategori: kategori || 'Pekerjaan Struktur',
      nama,
      satuan,
      volume,
      hargaSatuan
    });

    this.renderAll();
    this.showToast(`Berhasil menambahkan "${nama}" (${volume} ${satuan}) ke RAB!`, 'success');
  }

  renderPickerItems() {
    const listContainer = document.getElementById('pickerItemList');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const search = (document.getElementById('pickerSearch')?.value || '').toLowerCase();
    const catFilter = document.getElementById('pickerCategoryFilter')?.value || 'ALL';

    let list = this.catalogData.items || [];
    if (catFilter !== 'ALL') {
      list = list.filter(it => (it.divisiLengkap && it.divisiLengkap.toUpperCase().includes(catFilter)) || (it.kategori && it.kategori.toUpperCase().includes(catFilter)));
    }
    if (search.trim()) {
      list = list.filter(it => (it.nama || '').toLowerCase().includes(search) || (it.kode || '').toLowerCase().includes(search));
    }

    list.forEach(item => {
      const row = document.createElement('div');
      row.className = 'picker-item';
      row.innerHTML = `
        <div class="picker-item-info">
          <h4><span class="wbs-code-tag">${item.kode || 'AHSP'}</span> ${item.nama}</h4>
          <span>${item.kategori} • ${this.formatRupiah(item.hargaSatuan)} / ${item.satuan}</span>
        </div>
        <button class="btn btn-sm btn-primary" onclick="app.addItemFromCatalogPrompt('${item.id}', '${item.nama.replace(/'/g, "\\'")}', '${item.satuan}', ${item.hargaSatuan}, '${item.kode || ''}', '${item.kategori || ''}')">
          + Pilih
        </button>
      `;
      listContainer.appendChild(row);
    });
  }

  filterPickerItems() {
    this.renderPickerItems();
  }

  // ================= 4. PROJECT CRUD & REGION SWITCHING =================
  async fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Gagal mengambil daftar proyek');
      this.projects = await res.json();
      this.renderProjectSelector();

      if (this.projects.length > 0) {
        await this.loadProject(this.projects[0].id);
      } else {
        // Tidak ada proyek — tampilkan layar kosong & buka modal buat proyek baru
        this.currentProject = null;
        this.renderEmptyState();
        this.openModal('modalNewProject');
      }
    } catch (err) {
      console.error(err);
      this.showToast('Gagal memuat proyek dari server. Menggunakan mode lokal.', 'error');
    }
  }

  async loadProject(id) {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Gagal mengambil data proyek');
      this.currentProject = await res.json();
      this.currentWilayah = this.currentProject.wilayah || 'Kota Semarang';
      this.currentFactor = this.currentProject.faktorWilayah || 1.05;
      this.syncProjectFormValues();
      await this.fetchCatalog(1);
      this.renderAll();
    } catch (err) {
      console.error(err);
      this.showToast('Gagal memuat detail proyek.', 'error');
    }
  }

  async saveCurrentProject(showNotification = true) {
    if (!this.currentProject) {
      this.showToast('Harap buat atau pilih proyek terlebih dahulu!', 'warning');
      return;
    }
    const namaProyek = (document.getElementById('inpNamaProyek')?.value || '').trim();
    const luasBangunan = Number(document.getElementById('inpLuasBangunan')?.value);
    const luasTanah = Number(document.getElementById('inpLuasTanah')?.value);

    if (!namaProyek) {
      this.showToast('Nama Proyek wajib diisi sebelum menyimpan!', 'warning');
      document.getElementById('inpNamaProyek')?.focus();
      return;
    }
    if (!luasBangunan || luasBangunan <= 0) {
      this.showToast('Luas Bangunan wajib diisi (minimal 1 m²) sebelum menyimpan!', 'warning');
      document.getElementById('inpLuasBangunan')?.focus();
      return;
    }
    if (!luasTanah || luasTanah <= 0) {
      this.showToast('Luas Tanah wajib diisi (minimal 1 m²) sebelum menyimpan!', 'warning');
      document.getElementById('inpLuasTanah')?.focus();
      return;
    }

    this.syncFormValuesToProject();

    try {
      const res = await fetch(`/api/projects/${this.currentProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.currentProject)
      });
      if (!res.ok) throw new Error('Gagal menyimpan proyek');
      const updated = await res.json();
      this.currentProject = updated;

      const idx = this.projects.findIndex(p => p.id === updated.id);
      if (idx !== -1) {
        this.projects[idx].namaProyek = updated.namaProyek;
      }
      this.renderProjectSelector();

      if (showNotification) {
        this.showToast('Data RAB proyek berhasil disimpan ke database!', 'success');
      }
    } catch (err) {
      console.error(err);
      this.showToast('Gagal menyimpan ke server.', 'error');
    }
  }

  async switchProjectRegion(newWilayah, recalculateItems = false) {
    const regObj = this.regions.find(r => r.nama.toLowerCase() === newWilayah.toLowerCase());
    if (!regObj) return;

    this.currentWilayah = regObj.nama;
    this.currentFactor = regObj.faktor;

    // Update UI elements
    document.getElementById('headerWilayahSelect').value = regObj.nama;
    document.getElementById('inpWilayah').value = regObj.nama;
    document.getElementById('headerFactorBadge').textContent = `${regObj.faktor}x`;
    document.getElementById('badgeFaktorWilayah').textContent = `Faktor: ${regObj.faktor}x`;

    if (this.currentProject) {
      this.currentProject.wilayah = regObj.nama;
      this.currentProject.faktorWilayah = regObj.faktor;

      if (recalculateItems && this.currentProject.items) {
        await fetch(`/api/projects/${this.currentProject.id}/apply-region`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wilayah: regObj.nama, recalculateItems: true })
        });
        await this.loadProject(this.currentProject.id);
        this.showToast(`Seluruh harga item disesuaikan dengan HSD ${regObj.nama} (Faktor: ${regObj.faktor}x)`, 'success');
        return;
      }
    }

    await this.fetchCatalog(1);
    this.renderAll();
    this.showToast(`Wilayah HSD aktif diubah ke: ${regObj.nama} (Faktor: ${regObj.faktor}x)`, 'success');
  }

  // ================= 5. CALCULATIONS & MATH ENGINE =================
  calculateTotals() {
    if (!this.currentProject) return { rawTotal: 0, margin: 0, contingency: 0, ppn: 0, grandTotal: 0, perM2: 0, categorySums: {} };

    const items = this.currentProject.items || [];
    let rawTotal = 0;
    const categorySums = {};

    items.forEach(item => {
      const vol = Number(item.volume) || 0;
      const harga = Number(item.hargaSatuan) || 0;
      const sub = vol * harga;
      rawTotal += sub;

      const cat = item.kategori || 'Pekerjaan Umum';
      categorySums[cat] = (categorySums[cat] || 0) + sub;
    });

    const marginPct = Number(this.currentProject.marginPersen) || 0;
    const contPct = Number(this.currentProject.biayaTakTerdugaPersen) || 0;
    const ppnPct = Number(this.currentProject.ppnPersen) || 0;

    const margin = rawTotal * (marginPct / 100);
    const totalPlusMargin = rawTotal + margin;
    const contingency = rawTotal * (contPct / 100);
    const subtotalTaxable = totalPlusMargin + contingency;
    const ppn = subtotalTaxable * (ppnPct / 100);
    const grandTotal = Math.round(subtotalTaxable + ppn);

    const luas = Number(this.currentProject.luasBangunan) || 1;
    const perM2 = Math.round(grandTotal / luas);

    return {
      rawTotal: Math.round(rawTotal),
      margin: Math.round(margin),
      contingency: Math.round(contingency),
      ppn: Math.round(ppn),
      grandTotal,
      perM2,
      categorySums
    };
  }

  // ================= 6. RENDERING & UI UPDATES =================
  renderEmptyState() {
    // Kosongkan semua KPI dan tabel RAB — tampilkan petunjuk buat proyek baru
    const kpiEls = ['kpiTotalRab','kpiJumlahItem','kpiTotalPpn','kpiCostPerM2'];
    kpiEls.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = 'Rp 0'; });
    const jumlahEl = document.getElementById('kpiJumlahItem');
    if (jumlahEl) jumlahEl.textContent = '0';
    const tbody = document.querySelector('#rabTable tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem;color:var(--text-muted);">
      <div style="font-size:1.5rem;margin-bottom:0.5rem;">📋</div>
      <strong>Belum ada proyek</strong><br>
      <small>Klik <b>"+ Baru"</b> di atas untuk membuat proyek RAB pertama Anda.</small>
    </td></tr>`;
    const cardsEl = document.getElementById('rabCards');
    if (cardsEl) cardsEl.innerHTML = '';
    const selEl = document.getElementById('projectSelect');
    if (selEl) { selEl.innerHTML = '<option value="">-- Buat Proyek Baru --</option>'; }
  }

  renderAll() {
    this.renderKPIs();
    this.renderRabTable();
    this.renderRabCards();
    this.applyViewMode();
    this.renderSummaryBreakdown();
    this.renderCategoryBreakdown();
    this.renderDonutChart();
    this.syncPrintPreview();
  }

  renderKPIs() {
    const totals = this.calculateTotals();
    const items = this.currentProject?.items || [];
    const luas = this.currentProject?.luasBangunan || 0;
    const wil = this.currentWilayah;
    const fac = this.currentFactor;

    document.getElementById('kpiGrandTotal').textContent = this.formatRupiah(totals.grandTotal);
    document.getElementById('kpiTerbilang').textContent = this.terbilang(totals.grandTotal) + ' Rupiah';
    document.getElementById('kpiPerMeter').textContent = `${this.formatRupiah(totals.perM2)} / m²`;
    document.getElementById('kpiLuasBadge').textContent = `${luas} m²`;
    document.getElementById('kpiSubtotalRiil').textContent = this.formatRupiah(totals.rawTotal);
    document.getElementById('kpiItemCount').textContent = `${items.length} Item Pekerjaan`;

    document.getElementById('kpiTagWilayah').textContent = `${wil} (${fac}x)`;
    document.getElementById('kpiCityName').textContent = wil.replace(/^Kabupaten\s+/i, '').replace(/^Kota\s+/i, '');

    const reg = this.regions.find(r => r.nama.toLowerCase() === wil.toLowerCase());
    if (reg && reg.ringkasan) {
      document.getElementById('kpiUpahTukang').textContent = this.formatRupiah(reg.ringkasan.tukang);
      document.getElementById('kpiUpahPekerja').textContent = this.formatRupiah(reg.ringkasan.pekerja);
    }

    const mobTotal = document.getElementById('mobileBottomGrandTotal');
    if (mobTotal) mobTotal.textContent = this.formatRupiah(totals.grandTotal);

    const marginPlusTax = totals.margin + totals.contingency + totals.ppn;
    document.getElementById('kpiTotalMarginPajak').textContent = this.formatRupiah(marginPlusTax);
    document.getElementById('kpiMarginTaxTags').textContent = 
      `${this.currentProject?.marginPersen || 0}% Jasa + ${this.currentProject?.ppnPersen || 0}% PPN`;

    const gradeElem = document.getElementById('kpiStandardGrade');
    if (totals.perM2 < 3500000) {
      gradeElem.textContent = 'Estimasi: Standar Ekonomis';
    } else if (totals.perM2 <= 5500000) {
      gradeElem.textContent = 'Estimasi: Standar Menengah';
    } else {
      gradeElem.textContent = 'Estimasi: Standar Premium / Mewah';
    }
  }

  renderRabTable() {
    const tbody = document.getElementById('rabTableBody');
    const emptyState = document.getElementById('tableEmptyState');
    tbody.innerHTML = '';

    if (!this.currentProject || !this.currentProject.items || this.currentProject.items.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    let items = [...this.currentProject.items];

    if (this.currentFilterCategory !== 'ALL') {
      items = items.filter(it => it.kategori === this.currentFilterCategory);
    }

    if (this.searchQuery.trim() !== '') {
      const q = this.searchQuery.toLowerCase();
      items = items.filter(it => 
        (it.nama || '').toLowerCase().includes(q) || 
        (it.kode || '').toLowerCase().includes(q) || 
        (it.kategori || '').toLowerCase().includes(q)
      );
    }

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-muted);">Tidak ada item pekerjaan yang cocok dengan pencarian / filter.</td></tr>`;
      return;
    }

    const grouped = {};
    items.forEach(it => {
      const cat = it.kategori || 'Pekerjaan Umum';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(it);
    });

    let overallIndex = 1;

    Object.keys(grouped).forEach(cat => {
      const catSubtotal = grouped[cat].reduce((acc, it) => acc + ((Number(it.volume) || 0) * (Number(it.hargaSatuan) || 0)), 0);
      const catRow = document.createElement('tr');
      catRow.className = 'category-row';
      catRow.innerHTML = `
        <td colspan="7"><strong>📁 ${cat}</strong> (${grouped[cat].length} item)</td>
        <td style="text-align: right; font-weight: 700;">${this.formatRupiah(catSubtotal)}</td>
        <td></td>
      `;
      tbody.appendChild(catRow);

      grouped[cat].forEach(item => {
        const subtotal = (Number(item.volume) || 0) * (Number(item.hargaSatuan) || 0);
        const tr = document.createElement('tr');
        tr.dataset.itemId = item.id;

        tr.innerHTML = `
          <td style="text-align: center; color: var(--text-muted);">${overallIndex++}</td>
          <td><span class="wbs-code-tag">${item.kode || 'DJBK'}</span></td>
          <td>
            <span style="font-size: 0.8rem; color: var(--text-secondary);">${item.kategori}</span>
          </td>
          <td>
            <input type="text" class="table-input" value="${item.nama}" 
              onchange="app.updateItemField('${item.id}', 'nama', this.value)" 
              placeholder="Uraian Pekerjaan">
          </td>
          <td>
            <input type="number" class="table-input align-right" value="${item.volume}" min="0" step="0.01" 
              oninput="app.updateItemField('${item.id}', 'volume', this.value)">
          </td>
          <td style="text-align: center;">
            <span class="kpi-badge neutral">${item.satuan || 'm²'}</span>
          </td>
          <td>
            <input type="number" class="table-input align-right" value="${item.hargaSatuan}" min="0" step="500" 
              oninput="app.updateItemField('${item.id}', 'hargaSatuan', this.value)">
          </td>
          <td style="text-align: right;" class="cell-subtotal" id="cell-sub-${item.id}">
            ${this.formatRupiah(subtotal)}
          </td>
          <td style="text-align: center;">
            <div class="table-action-btns">
              <button class="btn-icon-xs" title="Duplikat Item" onclick="app.duplicateItem('${item.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
              <button class="btn-icon-xs delete" title="Hapus Item" onclick="app.deleteItem('${item.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    });
  }

  renderRabCards() {
    const container = document.getElementById('rabCardsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!this.currentProject || !this.currentProject.items || this.currentProject.items.length === 0) return;

    let items = [...this.currentProject.items];

    if (this.currentFilterCategory !== 'ALL') {
      items = items.filter(it => it.kategori === this.currentFilterCategory);
    }
    if (this.searchQuery.trim() !== '') {
      const q = this.searchQuery.toLowerCase();
      items = items.filter(it => (it.nama || '').toLowerCase().includes(q) || (it.kode || '').toLowerCase().includes(q));
    }

    const grouped = {};
    items.forEach(it => {
      const cat = it.kategori || 'Pekerjaan Umum';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(it);
    });

    let overallIndex = 1;

    Object.keys(grouped).forEach(cat => {
      const catGroup = document.createElement('div');
      catGroup.className = 'mobile-card-cat-group';
      const catSubtotal = grouped[cat].reduce((acc, it) => acc + ((Number(it.volume) || 0) * (Number(it.hargaSatuan) || 0)), 0);

      const catTitle = document.createElement('div');
      catTitle.className = 'mobile-card-cat-title';
      catTitle.innerHTML = `
        <span>📁 ${cat} (${grouped[cat].length})</span>
        <span>${this.formatRupiah(catSubtotal)}</span>
      `;
      catGroup.appendChild(catTitle);

      grouped[cat].forEach(item => {
        const subtotal = (Number(item.volume) || 0) * (Number(item.hargaSatuan) || 0);
        const card = document.createElement('div');
        card.className = 'rab-mobile-card';
        card.innerHTML = `
          <div class="m-card-header">
            <span class="m-card-index">#${overallIndex++}</span>
            <input type="text" class="table-input m-card-name" value="${item.nama}" 
              onchange="app.updateItemField('${item.id}', 'nama', this.value)" 
              placeholder="Uraian Pekerjaan">
          </div>

          <div class="m-card-inputs-grid">
            <div>
              <label class="m-input-label">Volume (${item.satuan || 'm²'})</label>
              <input type="number" class="table-input align-right" value="${item.volume}" min="0" step="0.01" 
                oninput="app.updateItemField('${item.id}', 'volume', this.value)">
            </div>
            <div>
              <label class="m-input-label">Harga Satuan (Rp)</label>
              <input type="number" class="table-input align-right" value="${item.hargaSatuan}" min="0" step="500" 
                oninput="app.updateItemField('${item.id}', 'hargaSatuan', this.value)">
            </div>
          </div>

          <div class="m-card-subtotal-bar">
            <span style="font-size: 0.78rem; color: var(--text-secondary); font-weight: 600;">Subtotal Biaya:</span>
            <span class="m-subtotal-val" id="card-sub-${item.id}">${this.formatRupiah(subtotal)}</span>
          </div>

          <div class="m-card-actions">
            <button class="btn btn-sm btn-secondary" onclick="app.duplicateItem('${item.id}')">
              📋 Duplikat
            </button>
            <button class="btn btn-sm btn-danger" onclick="app.deleteItem('${item.id}')">
              🗑️ Hapus
            </button>
          </div>
        `;
        catGroup.appendChild(card);
      });

      container.appendChild(catGroup);
    });
  }

  applyViewMode() {
    const tableWrapper = document.getElementById('rabTableWrapper');
    const cardsContainer = document.getElementById('rabCardsContainer');
    const btnTable = document.getElementById('btnViewTable');
    const btnCard = document.getElementById('btnViewCard');

    if (this.viewMode === 'card') {
      tableWrapper?.classList.add('hidden');
      cardsContainer?.classList.remove('hidden');
      btnTable?.classList.remove('active');
      btnCard?.classList.add('active');
    } else {
      tableWrapper?.classList.remove('hidden');
      cardsContainer?.classList.add('hidden');
      btnTable?.classList.add('active');
      btnCard?.classList.remove('active');
    }
  }

  setViewMode(mode) {
    this.viewMode = mode;
    localStorage.setItem('rab_view_mode', mode);
    this.applyViewMode();
  }

  updateItemField(itemId, field, value) {
    if (!this.currentProject) return;
    const item = this.currentProject.items.find(i => i.id === itemId);
    if (!item) return;

    if (field === 'volume' || field === 'hargaSatuan') {
      item[field] = Number(value) || 0;
      const subtotal = item.volume * item.hargaSatuan;
      const cell = document.getElementById(`cell-sub-${itemId}`);
      if (cell) cell.textContent = this.formatRupiah(subtotal);
      const cardSub = document.getElementById(`card-sub-${itemId}`);
      if (cardSub) cardSub.textContent = this.formatRupiah(subtotal);
    } else {
      item[field] = value;
    }

    this.renderKPIs();
    this.renderSummaryBreakdown();
    this.renderCategoryBreakdown();
    this.renderDonutChart();
    this.syncPrintPreview();
  }

  deleteItem(itemId) {
    if (!confirm('Hapus item pekerjaan ini dari RAB?')) return;
    this.currentProject.items = this.currentProject.items.filter(i => i.id !== itemId);
    this.renderAll();
    this.showToast('Item berhasil dihapus.', 'success');
  }

  duplicateItem(itemId) {
    const item = this.currentProject.items.find(i => i.id === itemId);
    if (!item) return;

    const copy = {
      ...item,
      id: 'item-' + Date.now(),
      nama: item.nama + ' (Copy)'
    };

    const idx = this.currentProject.items.findIndex(i => i.id === itemId);
    this.currentProject.items.splice(idx + 1, 0, copy);
    this.renderAll();
    this.showToast('Item berhasil diduplikasi.', 'success');
  }

  renderSummaryBreakdown() {
    const totals = this.calculateTotals();
    const p = this.currentProject;

    document.getElementById('sumBiayaRiil').textContent = this.formatRupiah(totals.rawTotal);
    document.getElementById('sumMargin').textContent = this.formatRupiah(totals.margin);
    document.getElementById('sumContingency').textContent = this.formatRupiah(totals.contingency);
    document.getElementById('sumPpn').textContent = this.formatRupiah(totals.ppn);
    document.getElementById('sumGrandTotal').textContent = this.formatRupiah(totals.grandTotal);
    document.getElementById('sumBiayaPerM2').textContent = `${this.formatRupiah(totals.perM2)} / m²`;

    document.getElementById('labelSumMargin').textContent = `Jasa Kontraktor (${p?.marginPersen || 0}%)`;
    document.getElementById('labelSumContingency').textContent = `Biaya Tak Terduga (${p?.biayaTakTerdugaPersen || 0}%)`;
    document.getElementById('labelSumPpn').textContent = `PPN (${p?.ppnPersen || 0}%)`;
    document.getElementById('grandSubAcuan').textContent = `Acuan DJBK 2026 & HSD ${this.currentWilayah} (${this.currentFactor}x)`;
  }

  renderCategoryBreakdown() {
    const totals = this.calculateTotals();
    const container = document.getElementById('categoryBreakdownList');
    if (!container) return;

    container.innerHTML = '';
    const catSums = totals.categorySums;
    const totalRaw = totals.rawTotal || 1;
    const sortedCats = Object.keys(catSums).sort((a, b) => catSums[b] - catSums[a]);

    if (sortedCats.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">Belum ada data pekerjaan.</p>';
      return;
    }

    sortedCats.forEach((cat, idx) => {
      const amount = catSums[cat];
      const pct = ((amount / totalRaw) * 100).toFixed(1);
      const color = this.chartColors[idx % this.chartColors.length];

      const item = document.createElement('div');
      item.className = 'cat-bar-item';
      item.innerHTML = `
        <div class="cat-bar-labels">
          <span style="font-weight: 600;">${cat}</span>
          <span><strong>${this.formatRupiah(amount)}</strong> (${pct}%)</span>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width: ${pct}%; background: ${color};"></div>
        </div>
      `;
      container.appendChild(item);
    });
  }

  renderDonutChart() {
    const canvas = document.getElementById('costDistributionCanvas');
    const legend = document.getElementById('chartLegendContainer');
    if (!canvas || !legend) return;

    const ctx = canvas.getContext('2d');
    const totals = this.calculateTotals();
    const catSums = totals.categorySums;
    const totalRaw = totals.rawTotal;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    legend.innerHTML = '';

    const sortedCats = Object.keys(catSums).sort((a, b) => catSums[b] - catSums[a]);

    if (sortedCats.length === 0 || totalRaw === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText('Tidak ada data biaya', canvas.width / 2, canvas.height / 2);
      return;
    }

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 15;
    const innerRadius = radius * 0.62;

    let startAngle = -0.5 * Math.PI;

    sortedCats.forEach((cat, idx) => {
      const amount = catSums[cat];
      const sliceAngle = (amount / totalRaw) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;
      const color = this.chartColors[idx % this.chartColors.length];

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      if (idx < 6) {
        const pct = ((amount / totalRaw) * 100).toFixed(1);
        const legItem = document.createElement('div');
        legItem.className = 'chart-legend-item';
        legItem.innerHTML = `
          <div>
            <span class="legend-color-dot" style="background: ${color};"></span>
            <span>${cat}</span>
          </div>
          <strong>${pct}%</strong>
        `;
        legend.appendChild(legItem);
      }

      startAngle = endAngle;
    });

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText('TOTAL HPP', centerX, centerY - 6);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 13px Plus Jakarta Sans';
    ctx.fillText(this.formatCompact(totalRaw), centerX, centerY + 14);
  }

  // ================= 7. MANUAL ITEM & PROJECT FORM SYNC =================
  openManualItemModal(editItemId = null) {
    const modal = document.getElementById('modalItemManual');
    const form = document.getElementById('formManualItem');
    form.reset();

    if (editItemId) {
      const item = this.currentProject.items.find(i => i.id === editItemId);
      if (item) {
        document.getElementById('modalItemTitle').textContent = 'Edit Item Pekerjaan';
        document.getElementById('itemEditId').value = item.id;
        document.getElementById('mItemKode').value = item.kode || '';
        document.getElementById('mItemKategori').value = item.kategori;
        document.getElementById('mItemNama').value = item.nama;
        document.getElementById('mItemVolume').value = item.volume;
        document.getElementById('mItemSatuan').value = item.satuan;
        document.getElementById('mItemHargaSatuan').value = item.hargaSatuan;
      }
    } else {
      document.getElementById('modalItemTitle').textContent = 'Tambah Item Pekerjaan Baru';
      document.getElementById('itemEditId').value = '';
    }

    modal.classList.add('active');
  }

  handleSaveManualItem(e) {
    e.preventDefault();
    const editId = document.getElementById('itemEditId').value;
    const kode = document.getElementById('mItemKode').value;
    const kategori = document.getElementById('mItemKategori').value;
    const nama = document.getElementById('mItemNama').value;
    const volume = Number(document.getElementById('mItemVolume').value) || 1;
    const satuan = document.getElementById('mItemSatuan').value;
    const hargaSatuan = Number(document.getElementById('mItemHargaSatuan').value) || 0;

    if (editId) {
      const item = this.currentProject.items.find(i => i.id === editId);
      if (item) {
        item.kode = kode;
        item.kategori = kategori;
        item.nama = nama;
        item.volume = volume;
        item.satuan = satuan;
        item.hargaSatuan = hargaSatuan;
      }
    } else {
      this.currentProject.items.push({
        id: 'item-' + Date.now(),
        kode: kode || 'MANUAL',
        kategori,
        nama,
        volume,
        satuan,
        hargaSatuan
      });
    }

    this.closeModal('modalItemManual');
    this.renderAll();
    this.showToast('Item pekerjaan berhasil disimpan ke RAB!', 'success');
  }

  syncProjectFormValues() {
    if (!this.currentProject) return;
    const p = this.currentProject;

    document.getElementById('inpNamaProyek').value = p.namaProyek || '';
    document.getElementById('inpKlien').value = p.klien || '';
    document.getElementById('inpLokasi').value = p.lokasi || '';
    document.getElementById('inpKontraktor').value = p.kontraktor || '';
    document.getElementById('inpLuasBangunan').value = p.luasBangunan > 0 ? p.luasBangunan : '';
    document.getElementById('inpLuasTanah').value = p.luasTanah > 0 ? p.luasTanah : '';
    document.getElementById('inpTanggal').value = p.tanggal || new Date().toISOString().split('T')[0];
    document.getElementById('inpCatatan').value = p.catatan || '';

    // Wilayah
    const wil = p.wilayah || 'Kota Semarang';
    this.currentWilayah = wil;
    const regObj = this.regions.find(r => r.nama.toLowerCase() === wil.toLowerCase());
    this.currentFactor = regObj ? regObj.faktor : (p.faktorWilayah || 1.05);

    document.getElementById('headerWilayahSelect').value = wil;
    document.getElementById('inpWilayah').value = wil;
    document.getElementById('headerFactorBadge').textContent = `${this.currentFactor}x`;
    document.getElementById('badgeFaktorWilayah').textContent = `Faktor: ${this.currentFactor}x`;

    const margin = p.marginPersen ?? 10;
    const contingency = p.biayaTakTerdugaPersen ?? 5;
    const ppn = p.ppnPersen ?? 11;

    document.getElementById('rngMargin').value = margin;
    document.getElementById('valMargin').textContent = `${margin}%`;
    document.getElementById('rngContingency').value = contingency;
    document.getElementById('valContingency').textContent = `${contingency}%`;
    document.getElementById('rngPpn').value = ppn;
    document.getElementById('valPpn').textContent = `${ppn}%`;
  }

  syncFormValuesToProject() {
    if (!this.currentProject) return;
    this.currentProject.namaProyek = document.getElementById('inpNamaProyek').value;
    this.currentProject.klien = document.getElementById('inpKlien').value;
    this.currentProject.lokasi = document.getElementById('inpLokasi').value;
    this.currentProject.wilayah = this.currentWilayah;
    this.currentProject.faktorWilayah = this.currentFactor;
    this.currentProject.kontraktor = document.getElementById('inpKontraktor').value;
    this.currentProject.luasBangunan = Number(document.getElementById('inpLuasBangunan').value) || 0;
    this.currentProject.luasTanah = Number(document.getElementById('inpLuasTanah').value) || 0;
    this.currentProject.tanggal = document.getElementById('inpTanggal').value;
    this.currentProject.catatan = document.getElementById('inpCatatan').value;

    this.currentProject.marginPersen = Number(document.getElementById('rngMargin').value) || 0;
    this.currentProject.biayaTakTerdugaPersen = Number(document.getElementById('rngContingency').value) || 0;
    this.currentProject.ppnPersen = Number(document.getElementById('rngPpn').value) || 0;
  }

  renderProjectSelector() {
    const select = document.getElementById('projectSelect');
    if (!select) return;
    select.innerHTML = '';

    this.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.namaProyek} (${p.wilayah || 'Semarang'})`;
      if (this.currentProject && this.currentProject.id === p.id) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  }

  async handleCreateNewProject(e) {
    e.preventDefault();
    const namaProyek = document.getElementById('npNama').value;
    const klien = document.getElementById('npKlien').value;
    const wilayah = document.getElementById('npWilayah').value;
    const luasBangunan = Number(document.getElementById('npLuas').value) || 60;
    const luasTanah = Number(document.getElementById('npLuasTanah').value) || 90;
    const templateChoice = document.getElementById('npTemplate').value;

    const regObj = this.regions.find(r => r.nama.toLowerCase() === wilayah.toLowerCase());
    const factor = regObj ? regObj.faktor : 1.0;

    let items = [];
    if (templateChoice === 'standar') {
      items = this.getDefaultTemplateItems(luasBangunan, factor);
    }

    const payload = {
      namaProyek,
      klien,
      lokasi: wilayah,
      wilayah,
      faktorWilayah: factor,
      luasBangunan,
      luasTanah,
      kontraktor: '',
      marginPersen: 10,
      ppnPersen: 11,
      biayaTakTerdugaPersen: 5,
      items
    };

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Gagal membuat proyek baru');
      const created = await res.json();
      this.closeModal('modalNewProject');
      await this.fetchProjects();
      await this.loadProject(created.id);
      this.showToast(`Proyek "${namaProyek}" di ${wilayah} berhasil dibuat!`, 'success');
    } catch (err) {
      console.error(err);
      this.showToast('Gagal membuat proyek baru.', 'error');
    }
  }

  getDefaultTemplateItems(luas, factor = 1.0) {
    const mult = (base) => Math.round(base * factor);
    return [
      { id: 'it-1', kode: '1.1.1', kategori: 'Persiapan Lapangan', nama: 'Pembersihan dan Perataan Lapangan', volume: Math.round(luas * 1.3), satuan: 'm²', hargaSatuan: mult(18500) },
      { id: 'it-2', kode: '1.1.2', kategori: 'Persiapan Lapangan', nama: 'Pengukuran & Pemasangan Bouwplank', volume: Math.round(Math.sqrt(luas) * 4), satuan: "m'", hargaSatuan: mult(42000) },
      { id: 'it-3', kode: '1.2.1', kategori: 'Pekerjaan Struktur', nama: 'Galian Tanah Pondasi sedalam 1 meter', volume: Math.round(luas * 0.45), satuan: 'm³', hargaSatuan: mult(85000) },
      { id: 'it-4', kode: '1.3.2', kategori: 'Pekerjaan Struktur', nama: 'Pasangan Pondasi Batu Kali Campuran 1:4', volume: Math.round(luas * 0.35), satuan: 'm³', hargaSatuan: mult(980000) },
      { id: 'it-5', kode: '1.4.1', kategori: 'Pekerjaan Struktur', nama: 'Beton Sloof Bertulang 15/20 cm', volume: Math.round(luas * 0.9), satuan: "m'", hargaSatuan: mult(195000) },
      { id: 'it-6', kode: '1.4.2', kategori: 'Pekerjaan Struktur', nama: 'Kolom Praktis Beton Bertulang 15/15 cm', volume: Math.round(luas * 0.8), satuan: "m'", hargaSatuan: mult(165000) },
      { id: 'it-7', kode: '2.1.1', kategori: 'Pekerjaan Arsitektur', nama: 'Pasangan Dinding Bata Ringan (Hebel) tebal 10 cm', volume: Math.round(luas * 2.8), satuan: 'm²', hargaSatuan: mult(135000) },
      { id: 'it-8', kode: '2.1.2', kategori: 'Pekerjaan Arsitektur', nama: 'Plesteran Dinding Tebal 15 mm Campuran 1:4', volume: Math.round(luas * 5.6), satuan: 'm²', hargaSatuan: mult(65000) },
      { id: 'it-9', kode: '2.1.3', kategori: 'Pekerjaan Arsitektur', nama: 'Acian Dinding Semen Instan / PC', volume: Math.round(luas * 5.6), satuan: 'm²', hargaSatuan: mult(38000) },
      { id: 'it-10', kode: '3.1.1', kategori: 'Pekerjaan Arsitektur', nama: 'Rangka Atap Baja Ringan Truss C75 t=0.75mm', volume: Math.round(luas * 1.25), satuan: 'm²', hargaSatuan: mult(165000) },
      { id: 'it-11', kode: '3.1.2', kategori: 'Pekerjaan Arsitektur', nama: 'Penutup Atap Genteng Metal Pasir', volume: Math.round(luas * 1.25), satuan: 'm²', hargaSatuan: mult(115000) },
      { id: 'it-12', kode: '3.2.1', kategori: 'Pekerjaan Arsitektur', nama: 'Plafon Gypsum Board 9mm Rangka Hollow Galvanis 4x4', volume: luas, satuan: 'm²', hargaSatuan: mult(125000) },
      { id: 'it-13', kode: '4.1.1', kategori: 'Pekerjaan Arsitektur', nama: 'Lantai Granit Tile (HT) 60x60 cm Polished', volume: Math.round(luas * 0.85), satuan: 'm²', hargaSatuan: mult(265000) },
      { id: 'it-14', kode: '5.1.1', kategori: 'Pekerjaan Arsitektur', nama: 'Pengecatan Dinding Interior Dulux Catylac', volume: Math.round(luas * 5.6), satuan: 'm²', hargaSatuan: mult(34000) }
    ];
  }

  // ================= 8. PRINT & PREVIEW =================
  syncPrintPreview() {
    if (!this.currentProject) return;
    const p = this.currentProject;
    const totals = this.calculateTotals();

    document.getElementById('pNamaProyek').textContent = p.namaProyek || '-';
    document.getElementById('pKlien').textContent = p.klien || '-';
    document.getElementById('pLokasi').textContent = p.lokasi || '-';
    document.getElementById('pWilayah').textContent = `${this.currentWilayah} (Faktor: ${this.currentFactor}x)`;
    document.getElementById('pKontraktor').textContent = p.kontraktor || '-';
    document.getElementById('pLuasBangunan').textContent = `${p.luasBangunan || 0} m²`;
    document.getElementById('pTanggal').textContent = p.tanggal || '-';

    document.getElementById('pSigKlien').textContent = `( ${p.klien || 'Pemilik Proyek'} )`;
    document.getElementById('pSigKontraktor').textContent = `( ${p.kontraktor || 'Pelaksana'} )`;

    const printTbody = document.getElementById('printTableBody');
    if (!printTbody) return;
    printTbody.innerHTML = '';

    const items = p.items || [];
    const grouped = {};
    items.forEach(it => {
      const cat = it.kategori || 'Umum';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(it);
    });

    let counter = 1;

    Object.keys(grouped).forEach(cat => {
      const catSubtotal = grouped[cat].reduce((acc, it) => acc + ((Number(it.volume) || 0) * (Number(it.hargaSatuan) || 0)), 0);
      const catTr = document.createElement('tr');
      catTr.className = 'print-cat-row';
      catTr.innerHTML = `
        <td colspan="7"><strong>${cat}</strong></td>
        <td style="text-align: right; font-weight: 700;">${this.formatRupiah(catSubtotal)}</td>
      `;
      printTbody.appendChild(catTr);

      grouped[cat].forEach(item => {
        const subtotal = (Number(item.volume) || 0) * (Number(item.hargaSatuan) || 0);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="text-align: center;">${counter++}</td>
          <td style="font-size: 8pt; color: #4b5563;">${item.kode || 'DJBK'}</td>
          <td>${item.kategori}</td>
          <td>${item.nama}</td>
          <td style="text-align: right;">${item.volume}</td>
          <td style="text-align: center;">${item.satuan}</td>
          <td style="text-align: right;">${this.formatRupiah(item.hargaSatuan)}</td>
          <td style="text-align: right;">${this.formatRupiah(subtotal)}</td>
        `;
        printTbody.appendChild(tr);
      });
    });

    document.getElementById('pSubtotalRiil').textContent = this.formatRupiah(totals.rawTotal);
    document.getElementById('pLabelMargin').textContent = `Jasa Kontraktor (${p.marginPersen}%)`;
    document.getElementById('pMargin').textContent = this.formatRupiah(totals.margin);
    document.getElementById('pLabelContingency').textContent = `Biaya Tak Terduga (${p.biayaTakTerdugaPersen}%)`;
    document.getElementById('pContingency').textContent = this.formatRupiah(totals.contingency);
    document.getElementById('pLabelPpn').textContent = `PPN (${p.ppnPersen}%)`;
    document.getElementById('pPpn').textContent = this.formatRupiah(totals.ppn);
    document.getElementById('pGrandTotal').textContent = this.formatRupiah(totals.grandTotal);
    document.getElementById('pTerbilangText').textContent = this.terbilang(totals.grandTotal) + ' Rupiah';
  }

  // ================= 9. VOLUME CALCULATORS =================
  setupVolumeCalculatorListeners() {
    const updateWall = () => {
      const kel = Number(document.getElementById('vDindingKeliling').value) || 0;
      const t = Number(document.getElementById('vDindingTinggi').value) || 0;
      const pintu = Number(document.getElementById('vDindingPintu').value) || 0;
      const jendela = Number(document.getElementById('vDindingJendela').value) || 0;

      const luasDindingKotor = kel * t;
      const luasBersih = Math.max(0, luasDindingKotor - (pintu + jendela));
      const luasPlesteran = luasBersih * 2;

      document.getElementById('resLuasDinding').textContent = luasBersih.toFixed(2) + ' m²';
      document.getElementById('resLuasPlesteran').textContent = luasPlesteran.toFixed(2) + ' m²';
    };

    ['vDindingKeliling', 'vDindingTinggi', 'vDindingPintu', 'vDindingJendela'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateWall);
    });

    const updateFoundation = () => {
      const p = Number(document.getElementById('vPondasiPanjang').value) || 0;
      const la = Number(document.getElementById('vPondasiLebarAtas').value) || 0;
      const lb = Number(document.getElementById('vPondasiLebarBawah').value) || 0;
      const t = Number(document.getElementById('vPondasiTinggi').value) || 0;

      const luasProfil = ((la + lb) / 2) * t;
      const volPondasi = p * luasProfil;
      const volGalian = volPondasi * 1.25;

      document.getElementById('resVolumePondasi').textContent = volPondasi.toFixed(2) + ' m³';
      document.getElementById('resVolumeGalian').textContent = volGalian.toFixed(2) + ' m³';
    };

    ['vPondasiPanjang', 'vPondasiLebarAtas', 'vPondasiLebarBawah', 'vPondasiTinggi'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateFoundation);
    });

    const updateStructure = () => {
      const pSloof = Number(document.getElementById('vSloofPanjang').value) || 0;
      const pKolom = Number(document.getElementById('vKolomJumlah').value) || 0;
      const w = (Number(document.getElementById('vDimensiLebar').value) || 15) / 100;
      const h = (Number(document.getElementById('vDimensiTinggi').value) || 20) / 100;

      const totalLari = pSloof + pKolom;
      const volBeton = totalLari * (w * h);

      document.getElementById('resPanjangStruktur').textContent = totalLari.toFixed(2) + " m'";
      document.getElementById('resVolumeBeton').textContent = volBeton.toFixed(2) + ' m³';
    };

    ['vSloofPanjang', 'vKolomJumlah', 'vDimensiLebar', 'vDimensiTinggi'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateStructure);
    });

    const updateFloorRoof = () => {
      const p = Number(document.getElementById('vRuangPanjang').value) || 0;
      const l = Number(document.getElementById('vRuangLebar').value) || 0;
      const overstek = Number(document.getElementById('vOverstekAtap').value) || 0;
      const sudut = Number(document.getElementById('vSudutAtap').value) || 30;

      const luasLantai = p * l;
      const pAtap = p + (2 * overstek);
      const lAtap = l + (2 * overstek);
      const cosSudut = Math.cos((sudut * Math.PI) / 180);
      const luasAtap = (pAtap * lAtap) / (cosSudut || 0.866);

      document.getElementById('resLuasLantai').textContent = luasLantai.toFixed(2) + ' m²';
      document.getElementById('resLuasAtap').textContent = luasAtap.toFixed(2) + ' m²';
    };

    ['vRuangPanjang', 'vRuangLebar', 'vOverstekAtap', 'vSudutAtap'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateFloorRoof);
    });
  }

  applyWallVolume() {
    if (!this.currentProject) { this.showToast('Harap buat atau pilih proyek terlebih dahulu!', 'warning'); return; }
    const luasDinding = parseFloat(document.getElementById('resLuasDinding').textContent) || 0;
    const luasPlesteran = parseFloat(document.getElementById('resLuasPlesteran').textContent) || 0;
    if (luasDinding <= 0 && luasPlesteran <= 0) { this.showToast('Harap isi ukuran dinding terlebih dahulu (Wajib diisi)!', 'warning'); return; }
    const f = this.currentFactor;

    this.addOrUpdateProjectItem('Pekerjaan Arsitektur', 'Pasangan Dinding Bata Ringan (Hebel) tebal 10 cm', 'm²', luasDinding, Math.round(135000 * f), '2.1.1');
    this.addOrUpdateProjectItem('Pekerjaan Arsitektur', 'Plesteran Dinding Tebal 15 mm Campuran 1:4', 'm²', luasPlesteran, Math.round(65000 * f), '2.1.2');
    this.addOrUpdateProjectItem('Pekerjaan Arsitektur', 'Acian Dinding Semen Instan / PC', 'm²', luasPlesteran, Math.round(38000 * f), '2.1.3');

    this.renderAll();
    this.showToast('Volume dinding, plesteran, dan acian berhasil diterapkan ke RAB!', 'success');
  }

  applyFoundationVolume() {
    if (!this.currentProject) { this.showToast('Harap buat atau pilih proyek terlebih dahulu!', 'warning'); return; }
    const volPondasi = parseFloat(document.getElementById('resVolumePondasi').textContent) || 0;
    const volGalian = parseFloat(document.getElementById('resVolumeGalian').textContent) || 0;
    if (volPondasi <= 0 && volGalian <= 0) { this.showToast('Harap isi ukuran pondasi terlebih dahulu (Wajib diisi)!', 'warning'); return; }
    const f = this.currentFactor;

    this.addOrUpdateProjectItem('Pekerjaan Struktur', 'Pasangan Pondasi Batu Kali Campuran 1:4', 'm³', volPondasi, Math.round(980000 * f), '1.3.2');
    this.addOrUpdateProjectItem('Pekerjaan Struktur', 'Galian Tanah Pondasi sedalam 1 meter', 'm³', volGalian, Math.round(85000 * f), '1.2.1');

    this.renderAll();
    this.showToast('Volume pondasi dan galian tanah berhasil diterapkan ke RAB!', 'success');
  }

  applyStructureVolume() {
    if (!this.currentProject) { this.showToast('Harap buat atau pilih proyek terlebih dahulu!', 'warning'); return; }
    const pSloof = Number(document.getElementById('vSloofPanjang').value) || 0;
    const pKolom = Number(document.getElementById('vKolomJumlah').value) || 0;
    if (pSloof <= 0 && pKolom <= 0) { this.showToast('Harap isi ukuran struktur terlebih dahulu (Wajib diisi)!', 'warning'); return; }
    const f = this.currentFactor;

    this.addOrUpdateProjectItem('Pekerjaan Struktur', 'Beton Sloof Bertulang 15/20 cm', "m'", pSloof, Math.round(195000 * f), '1.4.1');
    this.addOrUpdateProjectItem('Pekerjaan Struktur', 'Kolom Praktis Beton Bertulang 15/15 cm', "m'", pKolom, Math.round(165000 * f), '1.4.2');

    this.renderAll();
    this.showToast('Volume struktur sloof dan kolom berhasil diterapkan ke RAB!', 'success');
  }

  applyFloorRoofVolume() {
    if (!this.currentProject) { this.showToast('Harap buat atau pilih proyek terlebih dahulu!', 'warning'); return; }
    const luasLantai = parseFloat(document.getElementById('resLuasLantai').textContent) || 0;
    const luasAtap = parseFloat(document.getElementById('resLuasAtap').textContent) || 0;
    if (luasLantai <= 0 && luasAtap <= 0) { this.showToast('Harap isi ukuran denah dan atap terlebih dahulu (Wajib diisi)!', 'warning'); return; }
    const f = this.currentFactor;

    this.addOrUpdateProjectItem('Pekerjaan Arsitektur', 'Lantai Granit Tile (HT) 60x60 cm Polished', 'm²', luasLantai, Math.round(265000 * f), '4.1.1');
    this.addOrUpdateProjectItem('Pekerjaan Arsitektur', 'Plafon Gypsum Board 9mm Rangka Hollow Galvanis 4x4', 'm²', luasLantai, Math.round(125000 * f), '3.2.1');
    this.addOrUpdateProjectItem('Pekerjaan Arsitektur', 'Rangka Atap Baja Ringan Truss C75 t=0.75mm', 'm²', luasAtap, Math.round(165000 * f), '3.1.1');
    this.addOrUpdateProjectItem('Pekerjaan Arsitektur', 'Penutup Atap Genteng Metal Pasir', 'm²', luasAtap, Math.round(115000 * f), '3.1.2');

    this.renderAll();
    this.showToast('Volume lantai, plafon, dan atap berhasil diterapkan ke RAB!', 'success');
  }

  addOrUpdateProjectItem(kategori, nama, satuan, volume, defaultHarga, kode = 'AHSP') {
    if (!this.currentProject) return;
    const existing = this.currentProject.items.find(i => i.nama.toLowerCase() === nama.toLowerCase());
    if (existing) {
      existing.volume = volume;
    } else {
      this.currentProject.items.push({
        id: 'item-' + Date.now() + Math.floor(Math.random() * 50),
        kode,
        kategori,
        nama,
        satuan,
        volume,
        hargaSatuan: defaultHarga
      });
    }
  }

  // ================= 10. QUICK COST ESTIMATOR =================
  setupQuickCostCalculator() {
    const qcLuas = document.getElementById('qcLuas');
    const qcLantai = document.getElementById('qcLantai');

    const updateQuickEstimates = () => {
      const luas = Number(qcLuas.value) || 0;
      if (luas <= 0) {
        document.getElementById('qcTotalSederhana').textContent = 'Rp 0';
        document.getElementById('qcTotalMenengah').textContent = 'Rp 0';
        document.getElementById('qcTotalMewah').textContent = 'Rp 0';
        document.getElementById('qcTotalRuko').textContent = 'Rp 0';
        return;
      }
      const lantaiFactor = Number(qcLantai.value) === 2 ? 1.15 : (Number(qcLantai.value) === 3 ? 1.25 : 1.0);
      const regFactor = this.currentFactor || 1.0;

      const totalSederhana = Math.round(luas * 3200000 * lantaiFactor * regFactor);
      const totalMenengah = Math.round(luas * 4200000 * lantaiFactor * regFactor);
      const totalMewah = Math.round(luas * 6000000 * lantaiFactor * regFactor);
      const totalRuko = Math.round(luas * 4500000 * lantaiFactor * regFactor);

      document.getElementById('qcTotalSederhana').textContent = this.formatRupiah(totalSederhana);
      document.getElementById('qcTotalMenengah').textContent = this.formatRupiah(totalMenengah);
      document.getElementById('qcTotalMewah').textContent = this.formatRupiah(totalMewah);
      document.getElementById('qcTotalRuko').textContent = this.formatRupiah(totalRuko);
    };

    qcLuas?.addEventListener('input', updateQuickEstimates);
    qcLantai?.addEventListener('change', updateQuickEstimates);
    updateQuickEstimates();
  }

  // ================= 11. EVENT BINDINGS & MOBILE =================
  bindEvents() {
    // Project Select
    document.getElementById('projectSelect')?.addEventListener('change', (e) => {
      this.loadProject(e.target.value);
    });

    // Wilayah Header Selector
    document.getElementById('headerWilayahSelect')?.addEventListener('change', (e) => {
      this.switchProjectRegion(e.target.value, false);
    });

    // Wilayah Form Selector
    document.getElementById('inpWilayah')?.addEventListener('change', (e) => {
      this.switchProjectRegion(e.target.value, false);
    });

    // Button Apply Wilayah Prices to All Items
    document.getElementById('btnApplyWilayahPrices')?.addEventListener('click', () => {
      if (!confirm(`Sesuaikan harga seluruh item di RAB proyek ini dengan HSD ${this.currentWilayah} (Faktor: ${this.currentFactor}x)?`)) return;
      this.switchProjectRegion(this.currentWilayah, true);
    });

    // Project Form inputs
    ['inpNamaProyek', 'inpKlien', 'inpLokasi', 'inpKontraktor', 'inpLuasBangunan', 'inpLuasTanah', 'inpTanggal', 'inpCatatan'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        this.syncFormValuesToProject();
        this.renderKPIs();
        this.renderSummaryBreakdown();
        this.syncPrintPreview();
      });
    });

    // Sliders
    ['rngMargin', 'rngContingency', 'rngPpn'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', (e) => {
        const valId = id.replace('rng', 'val');
        document.getElementById(valId).textContent = `${e.target.value}%`;
        this.syncFormValuesToProject();
        this.renderKPIs();
        this.renderSummaryBreakdown();
        this.syncPrintPreview();
      });
    });

    // Main Tabs navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabTarget = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(tabTarget)?.classList.add('active');

        if (tabTarget === 'tab-rekap') {
          this.renderDonutChart();
          this.renderCategoryBreakdown();
        } else if (tabTarget === 'tab-ahsp-catalog') {
          this.fetchCatalog(1);
        } else if (tabTarget === 'tab-wbs') {
          this.renderWbsTree();
        } else if (tabTarget === 'tab-hsd') {
          this.renderHsdViewer();
        }
      });
    });

    // View Mode toggles
    document.getElementById('btnViewTable')?.addEventListener('click', () => this.setViewMode('table'));
    document.getElementById('btnViewCard')?.addEventListener('click', () => this.setViewMode('card'));

    // Buttons
    document.getElementById('btnQuickSave')?.addEventListener('click', () => this.saveCurrentProject(true));
    document.getElementById('btnSaveBottom')?.addEventListener('click', () => this.saveCurrentProject(true));
    document.getElementById('btnNewProject')?.addEventListener('click', () => this.openModal('modalNewProject'));
    document.getElementById('btnAddNewManualItem')?.addEventListener('click', () => this.openManualItemModal());
    document.getElementById('btnOpenAhspPicker')?.addEventListener('click', () => {
      this.fetchCatalog(1);
      this.openModal('modalAhspPicker');
    });
    document.getElementById('btnPrintPreview')?.addEventListener('click', () => {
      this.syncPrintPreview();
      this.openModal('printDocumentModal');
    });
    document.getElementById('btnExportCSV')?.addEventListener('click', () => {
      if (this.currentProject?.id) {
        window.location.href = `/api/export-csv/${this.currentProject.id}`;
      }
    });

    // Search and Filters
    document.getElementById('rabSearchInput')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.renderRabTable();
      this.renderRabCards();
    });

    document.getElementById('rabCategoryFilter')?.addEventListener('change', (e) => {
      this.currentFilterCategory = e.target.value;
      this.renderRabTable();
      this.renderRabCards();
    });

    // Catalog search & filter with debounce
    let catalogTimer = null;
    document.getElementById('catalogSearchInput')?.addEventListener('input', (e) => {
      clearTimeout(catalogTimer);
      catalogTimer = setTimeout(() => {
        this.catalogSearch = e.target.value;
        this.fetchCatalog(1);
      }, 300);
    });

    document.getElementById('catalogDivisiFilter')?.addEventListener('change', (e) => {
      this.catalogDivisi = e.target.value;
      this.fetchCatalog(1);
    });

    // Theme toggle
    document.getElementById('btnThemeToggle')?.addEventListener('click', () => this.toggleTheme());
  }

  async fetchNetworkInfo() {
    try {
      const res = await fetch('/api/network-info');
      if (res.ok) {
        this.networkInfo = await res.json();
      }
    } catch (err) {
      console.warn('Network info unavailable:', err);
    }
  }

  openMobileQRModal() {
    const primaryUrl = this.networkInfo?.primaryUrl || `${window.location.protocol}//${window.location.hostname}:3000`;
    const input = document.getElementById('mobileUrlInput');
    const img = document.getElementById('mobileQrImg');

    if (input) input.value = primaryUrl;
    if (img) {
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(primaryUrl)}`;
    }

    this.openModal('modalMobileQR');
  }

  copyMobileUrl() {
    const input = document.getElementById('mobileUrlInput');
    if (!input) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value)
        .then(() => this.showToast('Alamat URL HP berhasil disalin ke clipboard!', 'success'))
        .catch(() => this.fallbackCopy(input));
    } else {
      this.fallbackCopy(input);
    }
  }

  fallbackCopy(input) {
    input.select();
    input.setSelectionRange(0, 99999);
    document.execCommand('copy');
    this.showToast('Alamat URL HP berhasil disalin!', 'success');
  }

  initTheme() {
    const savedTheme = localStorage.getItem('rab_theme') || 'dark';
    if (savedTheme === 'light') {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
    }
  }

  toggleTheme() {
    const isDark = document.body.classList.contains('theme-dark');
    if (isDark) {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      localStorage.setItem('rab_theme', 'light');
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      localStorage.setItem('rab_theme', 'dark');
    }
    this.renderDonutChart();
  }

  openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
    document.body.classList.add('modal-open');
  }

  closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
    if (!document.querySelector('.modal-backdrop.active')) {
      document.body.classList.remove('modal-open');
    }
  }

  showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${type === 'success' 
          ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' 
          : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
      </svg>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  formatRupiah(num) {
    if (isNaN(num)) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(num);
  }

  formatCompact(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + ' Milyar';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + ' Juta';
    if (num >= 1000) return (num / 1000).toFixed(0) + ' Ribu';
    return num.toString();
  }

  terbilang(nilai) {
    nilai = Math.floor(Math.abs(Number(nilai) || 0));
    const huruf = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
    let bagi = 0;

    if (nilai < 12) {
      return huruf[nilai];
    } else if (nilai < 20) {
      return this.terbilang(nilai - 10) + ' Belas';
    } else if (nilai < 100) {
      bagi = Math.floor(nilai / 10);
      return this.terbilang(bagi) + ' Puluh ' + this.terbilang(nilai % 10);
    } else if (nilai < 200) {
      return 'Seratus ' + this.terbilang(nilai - 100);
    } else if (nilai < 1000) {
      bagi = Math.floor(nilai / 100);
      return this.terbilang(bagi) + ' Ratus ' + this.terbilang(nilai % 100);
    } else if (nilai < 2000) {
      return 'Seribu ' + this.terbilang(nilai - 1000);
    } else if (nilai < 1000000) {
      bagi = Math.floor(nilai / 1000);
      return this.terbilang(bagi) + ' Ribu ' + this.terbilang(nilai % 1000);
    } else if (nilai < 1000000000) {
      bagi = Math.floor(nilai / 1000000);
      return this.terbilang(bagi) + ' Juta ' + this.terbilang(nilai % 1000000);
    } else if (nilai < 1000000000000) {
      bagi = Math.floor(nilai / 1000000000);
      return this.terbilang(bagi) + ' Milyar ' + this.terbilang(nilai % 1000000000);
    } else if (nilai < 1000000000000000) {
      bagi = Math.floor(nilai / 1000000000000);
      return this.terbilang(bagi) + ' Triliun ' + this.terbilang(nilai % 1000000000000);
    }
    return '';
  }

  getEmptyProjectTemplate() {
    return {
      id: 'proj-' + Date.now(),
      namaProyek: '',
      klien: '',
      lokasi: '',
      wilayah: this.regions?.[0]?.nama || 'Kota Semarang',
      faktorWilayah: this.regions?.[0]?.faktor || 1.0,
      luasBangunan: 0,
      luasTanah: 0,
      tanggal: new Date().toISOString().split('T')[0],
      kontraktor: '',
      marginPersen: 10,
      ppnPersen: 11,
      biayaTakTerdugaPersen: 5,
      items: []
    };
  }
}

// Instantiate global app
window.app = new RabApp();
