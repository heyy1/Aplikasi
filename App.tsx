
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase, ref, set, onValue, push, update, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { User, UserRole, Product, Transaction, TransactionType, Category, ProductType } from './types';
import BarcodeRenderer from './components/BarcodeRenderer';
import Scanner from './components/Scanner';

// KONFIGURASI FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyDSaagRovaFU_7WCSLea2YWJ51al3oDGA0",
    authDomain: "smart-inventory-15882.firebaseapp.com",
    projectId: "smart-inventory-15882",
    storageBucket: "smart-inventory-15882.firebasestorage.app",
    messagingSenderId: "883769007127",
    appId: "1:883769007127:web:425762eab6565c4ce59052",
    measurementId: "G-E7J61RF3GX"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const INITIAL_USERS: User[] = [
  { id: 'u1', username: 'admin', password: 'password', role: UserRole.ADMIN },
  { id: 'u2', username: 'staff1', password: 'password', role: UserRole.STAFF },
];

const App: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [types, setTypes] = useState<ProductType[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('inv_session');
    return saved ? JSON.parse(saved) : null;
  });

  const [view, setView] = useState<'login' | 'dashboard' | 'products' | 'transactions' | 'settings'>('login');
  const [showScanner, setShowScanner] = useState<{ active: boolean, type: TransactionType | null }>({ active: false, type: null });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [printQuantities, setPrintQuantities] = useState<Record<string, number>>({});
  const [isOnline, setIsOnline] = useState(true);

  // Sync Data Real-time
  useEffect(() => {
    if (!db) return;

    // Load Categories
    const unsubCats = onValue(ref(db, 'categories'), (snap) => {
      const data = snap.val();
      const list = data ? Object.values(data) as Category[] : [];
      setCategories(list);
      setIsOnline(true);
    }, (err) => {
      console.error("Firebase Auth/Permission Error:", err);
      setIsOnline(false);
    });

    // Load Types
    const unsubTypes = onValue(ref(db, 'types'), (snap) => {
      const data = snap.val();
      setTypes(data ? Object.values(data) as ProductType[] : []);
    });

    // Load Products
    const unsubProds = onValue(ref(db, 'products'), (snap) => {
      const data = snap.val();
      setProducts(data ? Object.values(data) as Product[] : []);
    });

    // Load Transactions
    const unsubTrans = onValue(ref(db, 'transactions'), (snap) => {
      const data = snap.val();
      const list = data ? Object.values(data) as Transaction[] : [];
      setTransactions(list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    });

    return () => { unsubCats(); unsubTypes(); unsubProds(); unsubTrans(); };
  }, []);

  useEffect(() => {
    localStorage.setItem('inv_session', JSON.stringify(currentUser));
  }, [currentUser]);

  // Handler Tambah Atribut (Kategori/Jenis)
  const handleAddCategory = async () => {
    const name = prompt("Masukkan Nama Kategori Baru:");
    if (!name || name.trim() === "") return;
    
    try {
      const newRef = push(ref(db, 'categories'));
      await set(newRef, { id: newRef.key, name: name.trim() });
    } catch (err) {
      alert("EROR: Gagal simpan ke Firebase. \n\nPastikan di Firebase Console -> Realtime Database -> Rules sudah diset ke: \n{ \".read\": true, \".write\": true }");
    }
  };

  const handleAddType = async () => {
    const name = prompt("Masukkan Nama Jenis Barang Baru:");
    if (!name || name.trim() === "") return;
    
    try {
      const newRef = push(ref(db, 'types'));
      await set(newRef, { id: newRef.key, name: name.trim() });
    } catch (err) {
      alert("Gagal menambah jenis. Periksa koneksi atau izin database.");
    }
  };

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const u = formData.get('username') as string;
    const p = formData.get('password') as string;
    const user = INITIAL_USERS.find(user => user.username === u && user.password === p);
    if (user) setCurrentUser(user);
    else alert('Username atau password salah!');
  };

  const addProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const categoryId = formData.get('categoryId') as string;
    const typeId = formData.get('typeId') as string;
    const stockStr = formData.get('stock') as string;
    const stock = parseInt(stockStr) || 0;

    if (!categoryId) return alert("EROR: Kategori belum dipilih! Tambah kategori dulu di menu 'Atribut'.");
    if (!typeId) return alert("EROR: Jenis belum dipilih! Tambah jenis dulu di menu 'Atribut'.");

    try {
      const newRef = push(ref(db, 'products'));
      const id = newRef.key;
      const newProduct: Product = {
        id: id!,
        code: `BRG-${Date.now().toString().slice(-6)}`,
        name, categoryId, typeId, stock,
        updatedAt: new Date().toISOString()
      };
      await set(newRef, newProduct);
      e.currentTarget.reset();
      alert("Produk berhasil disimpan!");
    } catch (err) {
      alert("Gagal menyimpan produk.");
    }
  };

  const updateProductStock = async (productCode: string, qty: number, type: TransactionType) => {
    const product = products.find(p => p.code.toUpperCase() === productCode.toUpperCase());
    if (!product) return alert("Barang tidak ditemukan!");
    
    try {
      const newStock = type === TransactionType.IN ? (product.stock || 0) + qty : (product.stock || 0) - qty;
      if (newStock < 0) return alert("Stok tidak boleh minus!");

      const timestamp = new Date().toISOString();
      await update(ref(db, `products/${product.id}`), { stock: newStock, updatedAt: timestamp });

      const transRef = push(ref(db, 'transactions'));
      await set(transRef, {
        id: transRef.key, productId: product.id, productName: product.name,
        quantity: qty, type, timestamp, userId: currentUser?.id, userName: currentUser?.username
      });
      setShowScanner({ active: false, type: null });
    } catch (err) {
      alert("Gagal update stok.");
    }
  };

  if (!currentUser) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-600 p-6">
      <div className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl">
        <div className="flex justify-center mb-6 text-5xl">📦</div>
        <h1 className="text-3xl font-black mb-1 text-center text-gray-800">Smart Stock</h1>
        <p className="text-gray-400 text-sm text-center mb-8 uppercase tracking-widest font-bold">Cloud Inventory</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input name="username" type="text" placeholder="Username" required className="w-full px-5 py-3 border-2 rounded-2xl focus:border-blue-500 outline-none transition-all" />
          <input name="password" type="password" placeholder="Password" required className="w-full px-5 py-3 border-2 rounded-2xl focus:border-blue-500 outline-none transition-all" />
          <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">MASUK</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-white border-r p-6 no-print flex-shrink-0">
        <div className="font-black text-2xl text-blue-600 mb-10 flex items-center gap-2">📦 SMART INV</div>
        <nav className="space-y-2">
          <button onClick={() => setView('dashboard')} className={`w-full text-left px-5 py-4 rounded-2xl transition-all ${view === 'dashboard' ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-100' : 'text-gray-500 hover:bg-gray-100'}`}>📊 Dashboard</button>
          <button onClick={() => setView('products')} className={`w-full text-left px-5 py-4 rounded-2xl transition-all ${view === 'products' ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-100' : 'text-gray-500 hover:bg-gray-100'}`}>📦 Data Stok</button>
          <button onClick={() => setView('transactions')} className={`w-full text-left px-5 py-4 rounded-2xl transition-all ${view === 'transactions' ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-100' : 'text-gray-500 hover:bg-gray-100'}`}>📜 Riwayat</button>
          {currentUser.role === UserRole.ADMIN && (
            <button onClick={() => setView('settings')} className={`w-full text-left px-5 py-4 rounded-2xl transition-all ${view === 'settings' ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-100' : 'text-gray-500 hover:bg-gray-100'}`}>⚙️ Atribut</button>
          )}
          <div className="pt-20 border-t mt-10">
            <button onClick={() => { if(confirm('Keluar?')) { setCurrentUser(null); setView('login'); } }} className="w-full text-left px-5 py-4 text-red-500 font-bold hover:bg-red-50 rounded-2xl transition-all">🚪 Log Out</button>
          </div>
        </nav>
      </aside>

      <main className="flex-1 p-4 md:p-10 no-print overflow-x-hidden">
        {view === 'dashboard' && (
           <div className="space-y-8 animate-in fade-in duration-500">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-3xl font-black text-gray-800">Ringkasan Hari Ini</h2>
                {!isOnline && <span className="bg-red-100 text-red-600 px-4 py-1 rounded-full text-xs font-bold animate-pulse">OFFLINE: Periksa Izin Firebase</span>}
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <button onClick={() => setShowScanner({ active: true, type: TransactionType.IN })} className="group p-10 bg-white border-2 border-green-100 rounded-[2.5rem] text-green-600 font-black text-2xl flex flex-col items-center hover:bg-green-600 hover:text-white transition-all shadow-xl shadow-green-50">
                  <span className="text-6xl mb-4 group-hover:scale-110 transition-transform">📥</span> Barang Masuk
                </button>
                <button onClick={() => setShowScanner({ active: true, type: TransactionType.OUT })} className="group p-10 bg-white border-2 border-red-100 rounded-[2.5rem] text-red-600 font-black text-2xl flex flex-col items-center hover:bg-red-600 hover:text-white transition-all shadow-xl shadow-red-50">
                  <span className="text-6xl mb-4 group-hover:scale-110 transition-transform">📤</span> Barang Keluar
                </button>
             </div>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               <div className="bg-white p-6 rounded-3xl border shadow-sm">
                 <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">Total Stok</p>
                 <p className="text-3xl font-black text-blue-600">{products.reduce((acc, p) => acc + (p.stock || 0), 0)}</p>
               </div>
               <div className="bg-white p-6 rounded-3xl border shadow-sm">
                 <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">Varian Item</p>
                 <p className="text-3xl font-black text-gray-800">{products.length}</p>
               </div>
             </div>
           </div>
        )}

        {view === 'settings' && (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom duration-500">
             <div className="bg-white p-8 rounded-[2rem] border shadow-sm">
               <div className="flex justify-between mb-6 items-center">
                 <h3 className="font-black text-xl text-gray-800">Kategori</h3>
                 <button onClick={handleAddCategory} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg shadow-blue-100">+ TAMBAH</button>
               </div>
               <div className="space-y-2">
                 {categories.map(c => (
                   <div key={c.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl text-sm border border-transparent hover:border-gray-200 transition-all">
                     <span className="font-bold text-gray-700">{c.name}</span>
                     <button onClick={() => { if(confirm('Hapus kategori?')) remove(ref(db, `categories/${c.id}`)) }} className="text-red-200 hover:text-red-500">🗑️</button>
                   </div>
                 ))}
                 {categories.length === 0 && <div className="text-center py-10 bg-blue-50/50 rounded-3xl border-2 border-dashed border-blue-100 text-blue-400 text-xs font-bold">BELUM ADA KATEGORI.<br/>SILAKAN TAMBAH BARU.</div>}
               </div>
             </div>
             
             <div className="bg-white p-8 rounded-[2rem] border shadow-sm">
               <div className="flex justify-between mb-6 items-center">
                 <h3 className="font-black text-xl text-gray-800">Jenis Barang</h3>
                 <button onClick={handleAddType} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg shadow-purple-100">+ TAMBAH</button>
               </div>
               <div className="space-y-2">
                 {types.map(t => (
                   <div key={t.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl text-sm border border-transparent hover:border-gray-200 transition-all">
                     <span className="font-bold text-gray-700">{t.name}</span>
                     <button onClick={() => { if(confirm('Hapus jenis barang?')) remove(ref(db, `types/${t.id}`)) }} className="text-red-200 hover:text-red-500">🗑️</button>
                   </div>
                 ))}
                 {types.length === 0 && <div className="text-center py-10 bg-purple-50/50 rounded-3xl border-2 border-dashed border-purple-100 text-purple-400 text-xs font-bold">BELUM ADA JENIS BARANG.<br/>SILAKAN TAMBAH BARU.</div>}
               </div>
             </div>
           </div>
        )}

        {view === 'products' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-black text-gray-800">Daftar Barang</h2>
              {selectedIds.size > 0 && <button onClick={() => setIsPrintMode(true)} className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-sm font-black shadow-xl shadow-blue-200 animate-bounce">🖨️ CETAK LABEL ({selectedIds.size})</button>}
            </div>
            
            {currentUser.role === UserRole.ADMIN && (
              <form onSubmit={addProduct} className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-white p-6 rounded-[2rem] border shadow-sm">
                <input name="name" required placeholder="Nama Produk" className="bg-gray-50 p-3.5 rounded-2xl text-sm outline-none focus:ring-2 ring-blue-500/20 border border-transparent focus:border-blue-500" />
                <select name="categoryId" required className="bg-gray-50 p-3.5 rounded-2xl text-sm outline-none border border-transparent focus:border-blue-500">
                    <option value="">-- Kategori --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select name="typeId" required className="bg-gray-50 p-3.5 rounded-2xl text-sm outline-none border border-transparent focus:border-blue-500">
                    <option value="">-- Jenis --</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input name="stock" type="number" defaultValue="0" className="bg-gray-50 p-3.5 rounded-2xl text-sm outline-none border border-transparent focus:border-blue-500" />
                <button type="submit" className="bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-50">SIMPAN</button>
              </form>
            )}

            <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/50 border-b">
                  <tr>
                    <th className="p-5 w-10"></th>
                    <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Produk</th>
                    <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Stok</th>
                    <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="p-5">
                        <input type="checkbox" className="w-6 h-6 rounded-lg accent-blue-600 cursor-pointer" onChange={() => {
                          const s = new Set(selectedIds);
                          if(s.has(p.id)) s.delete(p.id); else { s.add(p.id); if(!printQuantities[p.id]) setPrintQuantities(prev => ({...prev, [p.id]:1})); }
                          setSelectedIds(s);
                        }} checked={selectedIds.has(p.id)} />
                      </td>
                      <td className="p-5">
                        <div className="font-bold text-gray-800">{p.name}</div>
                        <div className="flex gap-2 mt-1.5">
                          <span className="text-[8px] text-gray-400 font-black bg-gray-100 px-2 py-0.5 rounded-lg uppercase">{p.code}</span>
                          <span className="text-[8px] text-blue-500 bg-blue-50 px-2 py-0.5 rounded-lg font-black uppercase">
                            {categories.find(c => c.id === p.categoryId)?.name || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="p-5"><span className={`px-3 py-1.5 rounded-xl font-black text-sm ${p.stock <= 5 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-700'}`}>{p.stock}</span></td>
                      <td className="p-5 text-right">{currentUser.role === UserRole.ADMIN && <button onClick={() => { if(confirm('Hapus?')) remove(ref(db, `products/${p.id}`)) }} className="text-red-200 hover:text-red-500 transition-colors text-xl">🗑️</button>}</td>
                    </tr>
                  ))}
                  {products.length === 0 && <tr><td colSpan={4} className="p-20 text-center text-gray-400 italic font-medium">GUDANG KOSONG</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === 'transactions' && (
          <div className="space-y-6 animate-in slide-in-from-right duration-500">
            <h2 className="text-3xl font-black text-gray-800">Riwayat</h2>
            <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden divide-y">
                {transactions.map(t => (
                <div key={t.id} className="p-6 flex justify-between items-center hover:bg-gray-50">
                    <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-[10px] shadow-sm ${t.type === TransactionType.IN ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                            {t.type === TransactionType.IN ? 'MASUK' : 'KELUAR'}
                        </div>
                        <div>
                            <p className="font-black text-gray-800">{t.productName}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">{new Date(t.timestamp).toLocaleString('id-ID')} • {t.userName}</p>
                        </div>
                    </div>
                    <div className={`text-2xl font-black ${t.type === TransactionType.IN ? 'text-green-600' : 'text-red-600'}`}>{t.type === TransactionType.IN ? '+' : '-'}{t.quantity}</div>
                </div>
                ))}
                {transactions.length === 0 && <p className="p-20 text-center text-gray-400 italic">BELUM ADA AKTIVITAS</p>}
            </div>
          </div>
        )}
      </main>

      {/* MODAL PRINT BARCODE */}
      {isPrintMode && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center no-print p-4">
          <div className="bg-white w-full max-w-2xl h-[85vh] rounded-[3rem] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <div className="p-10 border-b flex justify-between items-center bg-gray-50/50">
                <div>
                    <h3 className="font-black text-3xl text-gray-800">Cetak Label</h3>
                    <p className="text-sm text-gray-400 font-bold mt-1">Siapkan printer label thermal</p>
                </div>
                <button onClick={() => setIsPrintMode(false)} className="text-gray-400 hover:text-red-500 text-4xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 space-y-4">
              {products.filter(p => selectedIds.has(p.id)).map(p => (
                <div key={p.id} className="flex justify-between items-center p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                  <div>
                    <p className="font-black text-gray-800">{p.name}</p>
                    <p className="text-[10px] text-blue-500 font-black font-mono mt-1">{p.code}</p>
                  </div>
                  <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm">
                    <button onClick={() => setPrintQuantities(prev => ({...prev, [p.id]: Math.max(1, (prev[p.id] || 1) - 1)}))} className="w-10 h-10 bg-gray-50 border rounded-xl font-black text-xl">-</button>
                    <input type="number" readOnly value={printQuantities[p.id] || 1} className="w-8 text-center bg-transparent font-black" />
                    <button onClick={() => setPrintQuantities(prev => ({...prev, [p.id]: (prev[p.id] || 1) + 1}))} className="w-10 h-10 bg-gray-50 border rounded-xl font-black text-xl">+</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-10 border-t bg-gray-50/50">
                <button onClick={() => window.print()} className="w-full bg-blue-600 text-white py-6 rounded-3xl font-black text-xl shadow-2xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all">MULAI CETAK</button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT AREA */}
      <div className="print-only">
        <div className="grid grid-cols-4 gap-2 p-2">
          {products.filter(p => selectedIds.has(p.id)).map(p => (
            Array.from({length: printQuantities[p.id] || 1}).map((_, i) => (
              <div key={`${p.id}-${i}`} className="flex flex-col items-center border p-2 text-center h-[120px] justify-center overflow-hidden">
                <p className="text-[8px] font-black leading-none mb-1 uppercase truncate w-full">{p.name}</p>
                <BarcodeRenderer value={p.code} width={1.2} height={40} />
                <p className="text-[7px] mt-1 font-mono">{p.code}</p>
              </div>
            ))
          ))}
        </div>
      </div>

      {showScanner.active && (
        <Scanner 
          onScan={(code) => {
            const product = products.find(p => p.code.toUpperCase() === code.toUpperCase());
            if (!product) return alert(`KODE TIDAK DIKENAL: ${code}`);
            const q = prompt(`BARANG: ${product.name}\nStok: ${product.stock}\n\nJumlah ${showScanner.type === TransactionType.IN ? 'Masuk (+)' : 'Keluar (-)'}:`, "1");
            if(q && !isNaN(parseInt(q)) && parseInt(q) > 0) updateProductStock(code, parseInt(q), showScanner.type!);
          }}
          onClose={() => setShowScanner({ active: false, type: null })} 
        />
      )}
    </div>
  );
};

export default App;
