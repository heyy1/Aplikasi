
import React, { useState, useEffect, useCallback } from 'react';
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

// Inisialisasi satu kali di luar komponen
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

  // Listener Real-time
  useEffect(() => {
    if (!db) return;

    // Listen Kategori
    const unsubCats = onValue(ref(db, 'categories'), (snap) => {
      const data = snap.val();
      setCategories(data ? Object.values(data) as Category[] : []);
      setIsOnline(true);
    }, (err) => {
      console.error("Firebase Read Error:", err);
      setIsOnline(false);
    });

    // Listen Jenis
    const unsubTypes = onValue(ref(db, 'types'), (snap) => {
      const data = snap.val();
      setTypes(data ? Object.values(data) as ProductType[] : []);
    });

    // Listen Produk
    const unsubProds = onValue(ref(db, 'products'), (snap) => {
      const data = snap.val();
      setProducts(data ? Object.values(data) as Product[] : []);
    });

    // Listen Transaksi
    const unsubTrans = onValue(ref(db, 'transactions'), (snap) => {
      const data = snap.val();
      const list = data ? Object.values(data) as Transaction[] : [];
      setTransactions(list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    });

    return () => {
      unsubCats();
      unsubTypes();
      unsubProds();
      unsubTrans();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('inv_session', JSON.stringify(currentUser));
  }, [currentUser]);

  // Fungsi Tambah Atribut
  const handleAddCategory = async () => {
    const name = prompt("Masukkan Nama Kategori Baru:");
    if (!name || name.trim() === "") return;
    
    try {
      const categoriesRef = ref(db, 'categories');
      const newCategoryRef = push(categoriesRef);
      const newId = newCategoryRef.key;
      
      if (!newId) throw new Error("Gagal generate ID");

      await set(newCategoryRef, {
        id: newId,
        name: name.trim()
      });
      console.log("Kategori berhasil ditambah");
    } catch (err) {
      console.error("Error adding category:", err);
      alert("Gagal menambah kategori. Pastikan Database Rules di Firebase sudah diatur ke 'public' atau '.write: true'.");
    }
  };

  const handleAddType = async () => {
    const name = prompt("Masukkan Nama Jenis Barang Baru:");
    if (!name || name.trim() === "") return;
    
    try {
      const typesRef = ref(db, 'types');
      const newTypeRef = push(typesRef);
      const newId = newTypeRef.key;

      if (!newId) throw new Error("Gagal generate ID");

      await set(newTypeRef, {
        id: newId,
        name: name.trim()
      });
      console.log("Jenis berhasil ditambah");
    } catch (err) {
      console.error("Error adding type:", err);
      alert("Gagal menambah jenis barang.");
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

  const handleLogout = () => { if (window.confirm('Keluar dari aplikasi?')) { setCurrentUser(null); setView('login'); } };

  const addProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const categoryId = formData.get('categoryId') as string;
    const typeId = formData.get('typeId') as string;
    const stock = parseInt(formData.get('stock') as string) || 0;

    if (!categoryId || !typeId) return alert("Pilih kategori & jenis terlebih dahulu!");

    try {
      const productsRef = ref(db, 'products');
      const newProductRef = push(productsRef);
      const id = newProductRef.key || Math.random().toString(36).substr(2, 9);
      
      const newProduct: Product = {
        id,
        code: `BRG-${Date.now().toString().slice(-6)}`,
        name, 
        categoryId, 
        typeId, 
        stock,
        updatedAt: new Date().toISOString()
      };

      await set(ref(db, `products/${id}`), newProduct);
      e.currentTarget.reset();
    } catch (err) {
      console.error("Error adding product:", err);
      alert("Gagal menyimpan produk.");
    }
  };

  const updateProductStock = async (productCode: string, qty: number, type: TransactionType) => {
    const product = products.find(p => p.code.toUpperCase() === productCode.toUpperCase());
    if (!product) return alert("Barang tidak ditemukan!");
    if (type === TransactionType.OUT && (product.stock || 0) < qty) return alert("Stok tidak mencukupi!");

    try {
      const newStock = type === TransactionType.IN ? (product.stock || 0) + qty : (product.stock || 0) - qty;
      const timestamp = new Date().toISOString();

      await update(ref(db, `products/${product.id}`), { 
        stock: newStock, 
        updatedAt: timestamp 
      });

      const transactionsRef = ref(db, 'transactions');
      const newTransRef = push(transactionsRef);
      const transId = newTransRef.key;

      await set(newTransRef, {
        id: transId, 
        productId: product.id, 
        productName: product.name,
        quantity: qty, 
        type, 
        timestamp, 
        userId: currentUser?.id, 
        userName: currentUser?.username
      });

      setShowScanner({ active: false, type: null });
    } catch (err) {
      console.error("Error updating stock:", err);
      alert("Gagal memperbarui stok.");
    }
  };

  if (!currentUser) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-600 p-6">
      <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-xl">
        <div className="flex justify-center mb-4 text-4xl">📦</div>
        <h1 className="text-2xl font-bold mb-2 text-center">Cloud Inventory</h1>
        <p className="text-gray-400 text-sm text-center mb-6">v1.4 - Secured Connection</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input name="username" type="text" placeholder="Username" required className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          <input name="password" type="password" placeholder="Password" required className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-lg">Login</button>
        </form>
      </div>
      {!isOnline && (
        <div className="mt-4 text-white bg-red-500/40 backdrop-blur-md px-6 py-3 rounded-2xl text-xs border border-white/20 text-center max-w-xs animate-pulse">
          ⚠️ Terputus dari Database. Periksa aturan keamanan (Rules) di Firebase Console.
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-white border-r p-6 space-y-2 no-print flex-shrink-0">
        <div className="font-bold text-xl text-blue-600 mb-8 flex items-center gap-2">☁️ Cloud Stock</div>
        <nav className="space-y-1">
          <button onClick={() => setView('dashboard')} className={`w-full text-left p-3 rounded-xl transition-all ${view === 'dashboard' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>📊 Dashboard</button>
          <button onClick={() => setView('products')} className={`w-full text-left p-3 rounded-xl transition-all ${view === 'products' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>📦 Data Stok</button>
          <button onClick={() => setView('transactions')} className={`w-full text-left p-3 rounded-xl transition-all ${view === 'transactions' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>📜 Riwayat</button>
          {currentUser.role === UserRole.ADMIN && <button onClick={() => setView('settings')} className={`w-full text-left p-3 rounded-xl transition-all ${view === 'settings' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>⚙️ Atribut</button>}
          <div className="pt-10">
            <button onClick={handleLogout} className="w-full text-left p-3 text-red-500 font-medium hover:bg-red-50 rounded-xl transition-all">🚪 Keluar</button>
          </div>
        </nav>
      </aside>

      <main className="flex-1 p-4 md:p-8 no-print overflow-hidden">
        {view === 'dashboard' && (
           <div className="space-y-6">
           <h2 className="text-2xl font-bold">Ringkasan Gudang</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <button onClick={() => setShowScanner({ active: true, type: TransactionType.IN })} className="p-8 bg-green-50 border-2 border-green-200 rounded-2xl text-green-700 font-bold text-xl flex flex-col items-center hover:bg-green-100 transition-all shadow-sm">
               <span className="text-4xl mb-2">📥</span> Barang Masuk
             </button>
             <button onClick={() => setShowScanner({ active: true, type: TransactionType.OUT })} className="p-8 bg-red-50 border-2 border-red-200 rounded-2xl text-red-700 font-bold text-xl flex flex-col items-center hover:bg-red-100 transition-all shadow-sm">
               <span className="text-4xl mb-2">📤</span> Barang Keluar
             </button>
           </div>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <div className="bg-white p-4 rounded-xl border text-center shadow-sm">
               <p className="text-gray-400 text-[10px] font-bold">STOK TOTAL</p>
               <p className="text-2xl font-black text-blue-600">{products.reduce((acc, p) => acc + (p.stock || 0), 0)}</p>
             </div>
             <div className="bg-white p-4 rounded-xl border text-center shadow-sm">
               <p className="text-gray-400 text-[10px] font-bold">JUMLAH ITEM</p>
               <p className="text-2xl font-black text-gray-800">{products.length}</p>
             </div>
           </div>
         </div>
        )}

        {view === 'settings' && (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="bg-white p-6 rounded-xl border shadow-sm">
             <div className="flex justify-between mb-4 items-center">
               <h3 className="font-bold text-gray-700">Kategori</h3>
               <button onClick={handleAddCategory} className="text-blue-600 font-bold text-xs bg-blue-50 px-4 py-2 rounded-full hover:bg-blue-100 transition-colors">+ Tambah Baru</button>
             </div>
             <div className="space-y-2 max-h-[400px] overflow-y-auto">
               {categories.map(c => (
                 <div key={c.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl text-sm border border-transparent hover:border-gray-200 transition-all">
                   <span className="font-medium text-gray-700">{c.name}</span>
                   <button onClick={() => { if(confirm('Hapus kategori ini?')) remove(ref(db, `categories/${c.id}`)) }} className="text-red-300 hover:text-red-500 p-1">🗑️</button>
                 </div>
               ))}
               {categories.length === 0 && <p className="text-gray-400 text-xs text-center py-8 italic">Belum ada kategori. Klik "Tambah Baru".</p>}
             </div>
           </div>
           
           <div className="bg-white p-6 rounded-xl border shadow-sm">
             <div className="flex justify-between mb-4 items-center">
               <h3 className="font-bold text-gray-700">Jenis Barang</h3>
               <button onClick={handleAddType} className="text-purple-600 font-bold text-xs bg-purple-50 px-4 py-2 rounded-full hover:bg-purple-100 transition-colors">+ Tambah Baru</button>
             </div>
             <div className="space-y-2 max-h-[400px] overflow-y-auto">
               {types.map(t => (
                 <div key={t.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl text-sm border border-transparent hover:border-gray-200 transition-all">
                   <span className="font-medium text-gray-700">{t.name}</span>
                   <button onClick={() => { if(confirm('Hapus jenis barang ini?')) remove(ref(db, `types/${t.id}`)) }} className="text-red-300 hover:text-red-500 p-1">🗑️</button>
                 </div>
               ))}
               {types.length === 0 && <p className="text-gray-400 text-xs text-center py-8 italic">Belum ada jenis barang. Klik "Tambah Baru".</p>}
             </div>
           </div>
         </div>
        )}

        {view === 'products' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Daftar Barang</h2>
              {selectedIds.size > 0 && <button onClick={() => setIsPrintMode(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-200 animate-pulse">🖨️ Cetak Label ({selectedIds.size})</button>}
            </div>
            
            {currentUser.role === UserRole.ADMIN && (
              <form onSubmit={addProduct} className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-white p-5 rounded-2xl border shadow-sm">
                <input name="name" required placeholder="Nama Produk" className="border p-2.5 rounded-xl text-sm outline-none focus:ring-2 ring-blue-500/20" />
                <select name="categoryId" required className="border p-2.5 rounded-xl text-sm bg-white">
                    <option value="">-- Kategori --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select name="typeId" required className="border p-2.5 rounded-xl text-sm bg-white">
                    <option value="">-- Jenis --</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input name="stock" type="number" defaultValue="0" className="border p-2.5 rounded-xl text-sm" />
                <button type="submit" className="bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100">Simpan</button>
              </form>
            )}

            <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-4 w-10"></th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Produk</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Stok</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <input type="checkbox" className="w-5 h-5 rounded-lg accent-blue-600 cursor-pointer" onChange={() => {
                          const s = new Set(selectedIds);
                          if(s.has(p.id)) s.delete(p.id); 
                          else { 
                            s.add(p.id); 
                            if(!printQuantities[p.id]) setPrintQuantities(prev => ({...prev, [p.id]:1})); 
                          }
                          setSelectedIds(s);
                        }} checked={selectedIds.has(p.id)} />
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-gray-800">{p.name}</div>
                        <div className="flex gap-2 mt-1">
                          <span className="text-[9px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded uppercase">{p.code}</span>
                          <span className="text-[9px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded font-medium">
                            {categories.find(c => c.id === p.categoryId)?.name || 'Tanpa Kategori'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-lg font-black text-sm ${p.stock <= 5 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-700'}`}>
                          {p.stock}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {currentUser.role === UserRole.ADMIN && (
                          <button onClick={() => { if(confirm('Hapus produk ini secara permanen?')) remove(ref(db, `products/${p.id}`)) }} className="text-red-200 hover:text-red-500 transition-colors p-2">
                            🗑️
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-12 text-center">
                        <div className="text-4xl mb-2 opacity-20">📦</div>
                        <p className="text-gray-400 italic text-sm">Gudang masih kosong. Tambahkan produk pertama Anda!</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === 'transactions' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Riwayat Transaksi</h2>
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden divide-y">
                {transactions.map(t => (
                <div key={t.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[10px] ${t.type === TransactionType.IN ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                            {t.type === TransactionType.IN ? 'MASUK' : 'KELUAR'}
                        </div>
                        <div>
                            <p className="font-bold text-gray-800 text-sm">{t.productName}</p>
                            <p className="text-[10px] text-gray-400 font-medium">
                              {new Date(t.timestamp).toLocaleDateString('id-ID')} {new Date(t.timestamp).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})} • Oleh: {t.userName}
                            </p>
                        </div>
                    </div>
                    <div className={`text-lg font-black ${t.type === TransactionType.IN ? 'text-green-600' : 'text-red-600'}`}>
                      {t.type === TransactionType.IN ? '+' : '-'}{t.quantity}
                    </div>
                </div>
                ))}
                {transactions.length === 0 && <p className="p-12 text-center text-gray-400 italic text-sm">Belum ada aktivitas transaksi.</p>}
            </div>
          </div>
        )}
      </main>

      {/* MODAL PRINT BARCODE */}
      {isPrintMode && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center no-print p-4">
          <div className="bg-white w-full max-w-2xl h-[85vh] rounded-[2rem] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-8 border-b flex justify-between items-center bg-gray-50">
                <div>
                    <h3 className="font-black text-2xl text-gray-800">Cetak Label</h3>
                    <p className="text-sm text-gray-400 font-medium">Tentukan jumlah copy untuk setiap item</p>
                </div>
                <button onClick={() => setIsPrintMode(false)} className="bg-white text-gray-400 hover:text-red-500 w-10 h-10 rounded-full flex items-center justify-center border shadow-sm transition-all">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-4">
              {products.filter(p => selectedIds.has(p.id)).map(p => (
                <div key={p.id} className="flex justify-between items-center p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
                  <div>
                    <p className="font-black text-gray-800">{p.name}</p>
                    <p className="text-xs text-blue-500 font-mono mt-1 tracking-widest">{p.code}</p>
                  </div>
                  <div className="flex items-center gap-4 bg-gray-50 p-2 rounded-xl">
                    <button onClick={() => setPrintQuantities(prev => ({...prev, [p.id]: Math.max(1, (prev[p.id] || 1) - 1)}))} className="w-10 h-10 bg-white border rounded-lg font-bold shadow-sm hover:bg-gray-100 active:scale-95 transition-all text-xl">-</button>
                    <input type="number" readOnly value={printQuantities[p.id] || 1} className="w-8 text-center bg-transparent font-black text-blue-600" />
                    <button onClick={() => setPrintQuantities(prev => ({...prev, [p.id]: (prev[p.id] || 1) + 1}))} className="w-10 h-10 bg-white border rounded-lg font-bold shadow-sm hover:bg-gray-100 active:scale-95 transition-all text-xl">+</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-8 border-t bg-gray-50">
                <button onClick={() => window.print()} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-[0.98] transition-all">
                  MULAI CETAK
                </button>
            </div>
          </div>
        </div>
      )}

      {/* AREA KHUSUS CETAK (HIDDEN DI LAYAR) */}
      <div className="print-only">
        <div className="grid grid-cols-4 gap-2 p-2">
          {products.filter(p => selectedIds.has(p.id)).map(p => (
            Array.from({length: printQuantities[p.id] || 1}).map((_, i) => (
              <div key={`${p.id}-${i}`} className="flex flex-col items-center border border-gray-200 p-2 text-center h-[120px] justify-center overflow-hidden break-inside-avoid">
                <p className="text-[8px] font-black leading-none mb-1 uppercase truncate w-full">{p.name}</p>
                <BarcodeRenderer value={p.code} width={1.2} height={40} />
                <p className="text-[7px] mt-1 font-mono tracking-wider">{p.code}</p>
              </div>
            ))
          ))}
        </div>
      </div>

      {/* SCANNER CAMERA */}
      {showScanner.active && (
        <Scanner 
          onScan={(code) => {
            const product = products.find(p => p.code.toUpperCase() === code.toUpperCase());
            if (!product) return alert(`Barang dengan kode "${code}" tidak ditemukan di database!`);
            
            const q = prompt(`PRODUK: ${product.name}\nStok Saat Ini: ${product.stock}\n\nMasukkan Jumlah ${showScanner.type === TransactionType.IN ? 'Masuk (+)' : 'Keluar (-)'}:`, "1");
            if(q && !isNaN(parseInt(q)) && parseInt(q) > 0) {
                updateProductStock(code, parseInt(q), showScanner.type!);
            }
          }}
          onClose={() => setShowScanner({ active: false, type: null })} 
        />
      )}
    </div>
  );
};

export default App;
