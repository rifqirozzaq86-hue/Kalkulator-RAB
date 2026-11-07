const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const CATALOG_FILE = path.join(DATA_DIR, 'ahsp_catalog.json');
const WBS_FILE = path.join(DATA_DIR, 'wbs_tree.json');
const REGIONS_FILE = path.join(DATA_DIR, 'hsd_regions.json');
const HSD_DETAIL_FILE = path.join(DATA_DIR, 'hsd_detail_by_region.json');

function readJsonFile(filePath, defaultData = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
      return defaultData;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content || '[]');
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return defaultData;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    return false;
  }
}

// Cache static data in memory for sub-millisecond responses
let catalogCache = readJsonFile(CATALOG_FILE, []);
let wbsCache = readJsonFile(WBS_FILE, []);
let regionsCache = readJsonFile(REGIONS_FILE, []);
let hsdDetailCache = null;

// ================= API ENDPOINTS =================

// 1. Get all projects
app.get('/api/projects', (req, res) => {
  const projects = readJsonFile(PROJECTS_FILE, []);
  const summaries = projects.map(p => {
    const rawTotal = (p.items || []).reduce((acc, item) => acc + ((Number(item.volume) || 0) * (Number(item.hargaSatuan) || 0)), 0);
    const margin = rawTotal * ((Number(p.marginPersen) || 0) / 100);
    const subtotal = rawTotal + margin;
    const contingency = rawTotal * ((Number(p.biayaTakTerdugaPersen) || 0) / 100);
    const ppn = (subtotal + contingency) * ((Number(p.ppnPersen) || 0) / 100);
    const grandTotal = subtotal + contingency + ppn;

    return {
      id: p.id,
      namaProyek: p.namaProyek,
      klien: p.klien,
      lokasi: p.lokasi,
      wilayah: p.wilayah || 'Kota Semarang',
      faktorWilayah: p.faktorWilayah || 1.05,
      luasBangunan: p.luasBangunan,
      tanggal: p.tanggal,
      itemCount: (p.items || []).length,
      grandTotal: Math.round(grandTotal)
    };
  });
  res.json(summaries);
});

// 2. Get single project
app.get('/api/projects/:id', (req, res) => {
  const projects = readJsonFile(PROJECTS_FILE, []);
  const project = projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Proyek tidak ditemukan' });
  }
  res.json(project);
});

// 3. Create new project
app.post('/api/projects', (req, res) => {
  const projects = readJsonFile(PROJECTS_FILE, []);
  const regionName = req.body.wilayah || 'Kota Semarang';
  const regionObj = regionsCache.find(r => r.nama.toLowerCase() === regionName.toLowerCase());
  const factor = regionObj ? regionObj.faktor : 1.0;

  const newProject = {
    id: 'proj-' + Date.now(),
    namaProyek: req.body.namaProyek || 'Proyek Baru',
    klien: req.body.klien || 'Pemilik Proyek',
    lokasi: req.body.lokasi || regionName,
    wilayah: regionName,
    faktorWilayah: factor,
    luasBangunan: Number(req.body.luasBangunan) || 60,
    luasTanah: Number(req.body.luasTanah) || 90,
    tanggal: req.body.tanggal || new Date().toISOString().split('T')[0],
    kontraktor: req.body.kontraktor || 'PT Griya Karya Mandiri',
    marginPersen: Number(req.body.marginPersen) ?? 10,
    ppnPersen: Number(req.body.ppnPersen) ?? 11,
    biayaTakTerdugaPersen: Number(req.body.biayaTakTerdugaPersen) ?? 5,
    catatan: req.body.catatan || '',
    standarAcuan: 'DJBK No. 47 Tahun 2026 - Cipta Karya & HSD Jateng 2026',
    items: req.body.items || []
  };

  projects.push(newProject);
  writeJsonFile(PROJECTS_FILE, projects);
  res.status(201).json(newProject);
});

// 4. Update project
app.put('/api/projects/:id', (req, res) => {
  const projects = readJsonFile(PROJECTS_FILE, []);
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Proyek tidak ditemukan' });
  }

  const current = projects[index];
  const updated = {
    ...current,
    ...req.body,
    id: current.id
  };

  projects[index] = updated;
  writeJsonFile(PROJECTS_FILE, projects);
  res.json(updated);
});

// 5. Delete project
app.delete('/api/projects/:id', (req, res) => {
  let projects = readJsonFile(PROJECTS_FILE, []);
  const filtered = projects.filter(p => p.id !== req.params.id);
  if (filtered.length === projects.length) {
    return res.status(404).json({ error: 'Proyek tidak ditemukan' });
  }
  writeJsonFile(PROJECTS_FILE, filtered);
  res.json({ success: true, message: 'Proyek berhasil dihapus' });
});

// 6. Apply Region (35 Kab/Kota Jateng) to a Project
app.post('/api/projects/:id/apply-region', (req, res) => {
  const projects = readJsonFile(PROJECTS_FILE, []);
  const project = projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Proyek tidak ditemukan' });
  }

  const targetWilayah = req.body.wilayah;
  const regionObj = regionsCache.find(r => r.nama.toLowerCase() === targetWilayah.toLowerCase());
  if (!regionObj) {
    return res.status(400).json({ error: 'Wilayah tidak valid' });
  }

  const oldFactor = project.faktorWilayah || 1.0;
  const newFactor = regionObj.faktor;
  const ratio = newFactor / oldFactor;

  project.wilayah = regionObj.nama;
  project.faktorWilayah = newFactor;

  // Recalculate item prices based on new regional factor
  if (req.body.recalculateItems && project.items && project.items.length > 0) {
    project.items = project.items.map(item => {
      const currentPrice = Number(item.hargaSatuan) || 0;
      return {
        ...item,
        hargaSatuan: Math.round(currentPrice * ratio)
      };
    });
  }

  writeJsonFile(PROJECTS_FILE, projects);
  res.json({
    success: true,
    message: `Wilayah berhasil diubah ke ${regionObj.nama} (Faktor: ${newFactor})`,
    project
  });
});

// 7. Get 35 Central Java Regions (HSD 2026)
app.get('/api/regions', (req, res) => {
  res.json(regionsCache);
});

// 8. Get HSD Detailed Items for a specific region
app.get('/api/regions/:name/hsd', (req, res) => {
  if (!hsdDetailCache) {
    hsdDetailCache = readJsonFile(HSD_DETAIL_FILE, {});
  }
  const regName = req.params.name;
  const found = Object.keys(hsdDetailCache).find(k => k.toLowerCase() === regName.toLowerCase());
  if (!found) {
    return res.status(404).json({ error: 'Data HSD wilayah tidak ditemukan' });
  }
  res.json(hsdDetailCache[found]);
});

// 9. Get WBS Tree Structure
app.get('/api/wbs', (req, res) => {
  res.json(wbsCache);
});

// 10. Get AHSP Catalog (DJBK No. 47 Tahun 2026) with Region Factor Adjustment
app.get('/api/catalog', (req, res) => {
  const { wilayah, search, divisi, limit = 100, page = 1 } = req.query;

  let factor = 1.0;
  let wilayahName = 'Standar DJBK (Nasional)';

  if (wilayah) {
    const regObj = regionsCache.find(r => r.nama.toLowerCase() === wilayah.toLowerCase());
    if (regObj) {
      factor = regObj.faktor;
      wilayahName = regObj.nama;
    }
  }

  let results = catalogCache.map(item => ({
    ...item,
    hargaDasar: item.hargaSatuan,
    hargaSatuan: Math.round(item.hargaSatuan * factor),
    faktorWilayah: factor,
    wilayahAcuan: wilayahName
  }));

  // Filter by Divisi / Kategori
  if (divisi && divisi !== 'ALL') {
    results = results.filter(i => 
      (i.kategori && i.kategori.toLowerCase() === divisi.toLowerCase()) ||
      (i.divisiLengkap && i.divisiLengkap.toLowerCase().includes(divisi.toLowerCase()))
    );
  }

  // Filter by Search Query
  if (search && search.trim() !== '') {
    const q = search.toLowerCase();
    results = results.filter(i =>
      (i.nama && i.nama.toLowerCase().includes(q)) ||
      (i.kode && i.kode.toLowerCase().includes(q)) ||
      (i.subKategori && i.subKategori.toLowerCase().includes(q)) ||
      (i.kategori && i.kategori.toLowerCase().includes(q))
    );
  }

  const total = results.length;
  const parsedLimit = limit === 'all' ? total : parseInt(limit, 10) || 100;
  const parsedPage = parseInt(page, 10) || 1;
  const offset = (parsedPage - 1) * parsedLimit;
  const pagedItems = results.slice(offset, offset + parsedLimit);

  res.json({
    total,
    page: parsedPage,
    limit: parsedLimit,
    totalPages: Math.ceil(total / parsedLimit),
    wilayah: wilayahName,
    faktor: factor,
    items: pagedItems
  });
});

// 11. Add Custom Item to Catalog
app.post('/api/catalog', (req, res) => {
  const newItem = {
    id: 'custom-' + Date.now(),
    kode: 'CUSTOM-' + Math.floor(Math.random() * 900 + 100),
    kategori: req.body.kategori || 'Pekerjaan Umum',
    divisiLengkap: req.body.kategori || 'Pekerjaan Umum',
    subKategori: req.body.subKategori || req.body.kategori || 'Pekerjaan Umum',
    nama: req.body.nama || 'Item Pekerjaan Baru',
    satuan: req.body.satuan || 'm²',
    hargaSatuan: Number(req.body.hargaSatuan) || 0,
    keterangan: req.body.keterangan || 'Item manual'
  };

  catalogCache.unshift(newItem);
  writeJsonFile(CATALOG_FILE, catalogCache);
  res.status(201).json(newItem);
});

// 12. Export CSV for Excel with WBS & Regional Info
app.get('/api/export-csv/:id', (req, res) => {
  const projects = readJsonFile(PROJECTS_FILE, []);
  const project = projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).send('Proyek tidak ditemukan');
  }

  let csv = 'RENCANA ANGGARAN BIAYA (RAB)\n';
  csv += 'STANDAR PERMEN PUPR / DJBK NO. 47 TAHUN 2026 & HSD JAWA TENGAH\n\n';
  csv += `Nama Proyek,"${project.namaProyek}"\n`;
  csv += `Klien,"${project.klien}"\n`;
  csv += `Lokasi Proyek,"${project.lokasi}"\n`;
  csv += `Wilayah Acuan HSD,"${project.wilayah || 'Kota Semarang'} (Faktor: ${project.faktorWilayah || 1.05})"\n`;
  csv += `Luas Bangunan,"${project.luasBangunan} m²"\n`;
  csv += `Tanggal,"${project.tanggal}"\n\n`;

  csv += 'No,Kode WBS / AHSP,Kategori Pekerjaan,Uraian Pekerjaan,Volume,Satuan,Harga Satuan (Rp),Subtotal (Rp)\n';

  let totalKotor = 0;
  (project.items || []).forEach((item, index) => {
    const subtotal = (Number(item.volume) || 0) * (Number(item.hargaSatuan) || 0);
    totalKotor += subtotal;
    csv += `${index + 1},"${item.kode || '-'}","${item.kategori || ''}","${(item.nama || '').replace(/"/g, '""')}",${item.volume},"${item.satuan}",${item.hargaSatuan},${subtotal}\n`;
  });

  const margin = totalKotor * ((Number(project.marginPersen) || 0) / 100);
  const totalPlusMargin = totalKotor + margin;
  const contingency = totalKotor * ((Number(project.biayaTakTerdugaPersen) || 0) / 100);
  const ppn = (totalPlusMargin + contingency) * ((Number(project.ppnPersen) || 0) / 100);
  const grandTotal = totalPlusMargin + contingency + ppn;

  csv += `\n,,,,,Subtotal Biaya Riil (HPP),,${Math.round(totalKotor)}\n`;
  csv += `,,,,,Jasa Kontraktor (${project.marginPersen}%),,${Math.round(margin)}\n`;
  csv += `,,,,,Biaya Tak Terduga (${project.biayaTakTerdugaPersen}%),,${Math.round(contingency)}\n`;
  csv += `,,,,,PPN (${project.ppnPersen}%),,${Math.round(ppn)}\n`;
  csv += `,,,,,TOTAL ESTIMASI RAB,,${Math.round(grandTotal)}\n`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="RAB_${(project.namaProyek || 'proyek').replace(/\s+/g, '_')}.csv"`);
  res.send('\uFEFF' + csv);
});

// 13. Network Info for Mobile Phones
app.get('/api/network-info', (req, res) => {
  const ips = getLocalIpAddresses();
  const mobileUrls = ips.map(ip => `http://${ip}:${PORT}`);
  res.json({
    port: PORT,
    localIps: ips,
    mobileUrls: mobileUrls.length > 0 ? mobileUrls : [`http://localhost:${PORT}`],
    primaryUrl: mobileUrls.length > 0 ? mobileUrls[0] : `http://localhost:${PORT}`
  });
});

// Fallback to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log(`=======================================================`);
  console.log(`  RAB PRO MASTER v2.0 - Node.js & Express`);
  console.log(`  Database Terpadu:`);
  console.log(`  • DJBK No. 47 Th 2026: ${catalogCache.length} Item AHSP`);
  console.log(`  • HSD Jawa Tengah 2026: ${regionsCache.length} Kab/Kota`);
  console.log(`  • WBS Konstruksi:       ${wbsCache.length} Hierarki`);
  console.log(`  -----------------------------------------------------`);
  console.log(`  • Akses Komputer: http://localhost:${PORT}`);
  if (ips.length > 0) {
    ips.forEach(ip => console.log(`  • Akses HP/Smart: http://${ip}:${PORT}`));
  }
  console.log(`=======================================================`);
});
