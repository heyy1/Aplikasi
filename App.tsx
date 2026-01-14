
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase, ref, set, onValue, push, update, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { User, UserRole, Product, Transaction, TransactionType, Category, ProductType } from './types';
import BarcodeRenderer from './components/BarcodeRenderer';
import Scanner from './components/Scanner';

// KONFIGURASI FIREBASE (Gunakan Try-Catch agar tidak crash jika diblokir browser)
const firebaseConfig = {
    apiKey: "AIzaSyDSaagRovaFU_7WCSLea2YWJ51al3oDGA0",
    authDomain: "smart-inventory-15882.firebaseapp.com",
    projectId: "smart-inventory-15882",
    storageBucket: "smart-inventory-15882.firebasestorage.app",
    messagingSenderId: "883769007127",
    appId: "1:883769007127:web:425762eab6565c4ce59052",
    measurementId: "G-E7J61RF3GX"
};

let db: any = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.warn("Firebase gagal inisialisasi, beralih ke mode Lokal.");
}

const INITIAL_USERS: User[] = [
  { id: 'u1', username: 'admin', password: 'password', role: UserRole.ADMIN },
  { id: 'u2', username: 'staff1', password: 'password', role: UserRole.STAFF },
];

const App: React.FC = () => {
  // State Utama
  const [categories, setCategories] = useState<Category[]>(() => JSON.parse(localStorage.getItem('local_cats') || '[]'));
  const [types, setTypes] = useState<ProductType[]>(() => JSON.parse(localStorage.getItem('local_types') || '[]'));
  const [products, setProducts] = useState<Product[]>(() => JSON.parse(localStorage.getItem('local_prods') || '[]'));
  const [transactions, setTransactions] = useState<Transaction[]>(() => JSON.parse(localStorage.getItem('local_trans') || '[]'));
  
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('inv_session');
    return saved ? JSON.parse(saved) : null;
  });

  const [view, setView] = useState<'login' | 'dashboard' | 'products' | 'transactions' | 'settings'>('login');
  const [showScanner, setShowScanner] = useState<{ active: boolean, type: TransactionType | null }>({ active: false, type: null });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [printQuantities, setPrintQuantities] = useState<Record<string, number>>({});
  const [isOnline, setIsOnline] = useState(false);

  // Sync dengan Firebase (Jika tersedia)
  useEffect(() => {
    if (!db) return;

    const unsubCats = onValue(ref(db, 'categories'), (snap) => {
      const data = snap.val();
      if (data) {
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setCategories(list);
        localStorage.setItem('local_cats', JSON.stringify(list));
      }
      setIsOnline(true);
    });

    const unsubTypes = onValue(ref(db, 'types'), (snap) => {
      const data = snap.val();
      if (data) {
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setTypes(list);
        localStorage.setItem('local_types', JSON.stringify(list));
      }
    });

    const unsubProds = onValue(ref(db, 'products'), (snap) => {
      const data = snap.val();
      if (data) {
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setProducts(list);
        localStorage.setItem('local_prods', JSON.stringify(list));
      }
    });

    const unsubTrans = onValue(ref(db, 'transactions'), (snap) => {
      const data = snap.val();
      if (data) {
        const list = (Object.values(data) as Transaction[]).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setTransactions(list);
        localStorage.setItem('local_trans', JSON.stringify(list));
      }
    });

    return () => { unsubCats(); unsubTypes(); unsubProds(); unsubTrans(); };
  }, []);

  // Simpan Sesi
  useEffect(() => {
    localStorage.setItem('inv_session', JSON.stringify(currentUser));
  }, [currentUser]);

  // Actions
  const handleAddCategory = async () => {
    const name = prompt("Nama Kategori:");
    if (!name) return;
    const newCat = { id: Date.now().toString(), name };
    
    if (db) {
      try { await set(push(ref(db, 'categories')), { name }); } catch(e) { console.error(e); }
    }
    // Update local state segera agar dropdown terisi
    setCategories(prev => [...prev, newCat]);
    localStorage.setItem('local_cats', JSON.stringify([...categories, newCat]));
  };

  const handleAddType = async () => {
    const name = prompt("Nama Jenis:");
    if (!name) return;
    const newType = { id: Date.now().toString(), name };
    
    if (db) {
      try { await set(push(ref(db, 'types')), { name }); } catch(e) { console.error(e); }
    }
    setTypes(prev => [...prev, newType]);
    localStorage.setItem('local_types', JSON.stringify([...types, newType]));
  };

  const addProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const productData = {
      name: formData.get('name') as string,
      categoryId: formData.get('categoryId') as string,
      typeId: formData.get('typeId') as string,
      stock: parseInt(formData.get('stock') as string) || 0,
      code: `BRG-${Date.now().toString().slice(-6)}`,
      updatedAt: new Date().toISOString()
    };

    if (!productData.categoryId || !productData.typeId) {
      alert("Pilih Kategori & Jenis! Jika kosong, tambah dulu di menu Atribut.");
      return;
    }

    if (db) {
      try {
        const newRef = push(ref(db, 'products'));
        await set(newRef, { ...productData, id: newRef.key });
      } catch (e) { console.error(e); }
    }

    const newProdWithId = { ...productData, id: Date.now().toString() };
    setProducts(prev => [...prev, newProdWithId]);
    localStorage.setItem('local_prods', JSON.stringify([...products, newProdWithId]));
    e.currentTarget.reset();
    alert("Berhasil!");
  };

  const updateStock = async (code: string, qty: number, type: TransactionType) => {
    const prod = products.find(p => p.code.toUpperCase() === code.toUpperCase());
    if (!prod) return alert("Barang tidak ada!");

    const newStock = type === TransactionType.IN ? (prod.stock + qty) : (prod.stock - qty);
    if (newStock < 0) return alert("Stok kurang!");

    const trans = {
      id: Date.now().toString(),
      productId: prod.id,
      productName: prod.name,
      quantity: qty,
      type,
      timestamp: new Date().toISOString(),
      userId: currentUser?.id || 'u0',
      userName: currentUser?.username || 'System'
    };

    if (db) {
      try {
        await update(ref(db, `products/${prod.id}`), { stock: newStock });
        await set(push(ref(db, 'transactions')), trans);
      } catch(e) { console.error(e); }
    }

    setProducts(prev => prev.map(p => p.id === prod.id ? {...p, stock: newStock} : p));
    setTransactions(prev => [trans, ...prev]);
    setShowScanner({ active: false, type: null });
  };

  if (!currentUser) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-600 p-6">
      <div className="bg-white w-full max-w-md p-10 rounded-[3rem] shadow-2xl animate-in zoom-in duration-500">
        <div className="text-6xl mb-4 text-center">📦</div>
        <h1 className="text-3xl font-black text-center text-gray-800 mb-2">Smart Inventory</h1>
        <p className="text-gray-400 text-center mb-10 font-bold uppercase tracking-tighter">Fast & Reliable</p>
        <form onSubmit={(e) => {
          e.preventDefault();
          const u = (e.currentTarget.elements[0] as HTMLInputElement).value;
          const p = (e.currentTarget.elements[1] as HTMLInputElement).value;
          const user = INITIAL_USERS.find(x => x.username === u && x.password === p);
          if(user) setCurrentUser(user); else alert("Gagal Login");
        }} className="space-y-4">
          <input placeholder="Username" required className="w-full p-4 bg-gray-50 border-2 rounded-2xl focus:border-blue-500 outline-none" />
          <input type="password" placeholder="Password" required className="w-full p-4 bg-gray-50 border-2 rounded-2xl focus:border-blue-500 outline-none" />
          <button className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black shadow-lg shadow-blue-200">MASUK</button>
        </form>
        <div className="mt-8 text-center text-[10px] text-gray-300 font-bold">Admin: admin | Password: password</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r p-6 no-print">
        <div className="text-2xl font-black text-blue-600 mb-10">📦 PRO STOCK</div>
        <nav className="space-y-2">
          {['dashboard', 'products', 'transactions', 'settings'].map((v) => (
            <button key={v} onClick={() => setView(v as any)} className={`w-full text-left p-4 rounded-2xl capitalize font-bold transition-all ${view === v ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-100'}`}>
              {v === 'settings' ? '⚙️ Atribut' : v === 'products' ? '📦 Produk' : v === 'transactions' ? '📜 Riwayat' : '📊 Beranda'}
            </button>
          ))}
          <button onClick={() => setCurrentUser(null)} className="w-full text-left p-4 text-red-500 font-bold mt-10">🚪 Keluar</button>
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 md:p-10">
        {view === 'dashboard' && (
          <div className="space-y-10">
            <h2 className="text-4xl font-black">Halo, {currentUser.username}!</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button onClick={() => setShowScanner({ active: true, type: TransactionType.IN })} className="p-10 bg-green-500 text-white rounded-[2.5rem] font-black text-2xl shadow-xl shadow-green-100 hover:scale-[1.02] transition-all">📥 Masuk</button>
              <button onClick={() => setShowScanner({ active: true, type: TransactionType.OUT })} className="p-10 bg-red-500 text-white rounded-[2.5rem] font-black text-2xl shadow-xl shadow-red-100 hover:scale-[1.02] transition-all">📤 Keluar</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-8 rounded-3xl border shadow-sm">
                <p className="text-xs font-black text-gray-400 uppercase">Total Stok</p>
                <p className="text-4xl font-black text-blue-600">{products.reduce((a,b) => a+b.stock, 0)}</p>
              </div>
              <div className="bg-white p-8 rounded-3xl border shadow-sm">
                <p className="text-xs font-black text-gray-400 uppercase">Item Unik</p>
                <p className="text-4xl font-black">{products.length}</p>
              </div>
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="grid md:grid-cols-2 gap-8 animate-in slide-in-from-bottom duration-500">
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-xl">Daftar Kategori</h3>
                <button onClick={handleAddCategory} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black">+ TAMBAH</button>
              </div>
              <div className="space-y-2">
                {categories.map(c => (
                  <div key={c.id} className="p-4 bg-gray-50 rounded-xl flex justify-between">
                    <span className="font-bold">{c.name}</span>
                    <button onClick={() => setCategories(prev => prev.filter(x => x.id !== c.id))} className="text-red-300">🗑️</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-xl">Jenis Barang</h3>
                <button onClick={handleAddType} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-xs font-black">+ TAMBAH</button>
              </div>
              <div className="space-y-2">
                {types.map(t => (
                  <div key={t.id} className="p-4 bg-gray-50 rounded-xl flex justify-between">
                    <span className="font-bold">{t.name}</span>
                    <button onClick={() => setTypes(prev => prev.filter(x => x.id !== t.id))} className="text-red-300">🗑️</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'products' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <h2 className="text-3xl font-black">Gudang Barang</h2>
            
            <form onSubmit={addProduct} className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-white p-6 rounded-[2rem] border shadow-md">
              <input name="name" required placeholder="Nama Barang" className="bg-gray-50 p-4 rounded-2xl outline-none" />
              <select name="categoryId" required className="bg-gray-50 p-4 rounded-2xl">
                <option value="">Kategori...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select name="typeId" required className="bg-gray-50 p-4 rounded-2xl">
                <option value="">Jenis...</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input name="stock" type="number" placeholder="Stok" className="bg-gray-50 p-4 rounded-2xl" />
              <button className="bg-blue-600 text-white font-black rounded-2xl">SIMPAN</button>
            </form>

            <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-[10px] font-black uppercase text-gray-400">
                    <th className="p-5">Pilih</th>
                    <th className="p-5">Informasi Produk</th>
                    <th className="p-5">Stok</th>
                    <th className="p-5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {products.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="p-5">
                        <input type="checkbox" className="w-6 h-6 rounded-lg accent-blue-600" onChange={() => {
                          const s = new Set(selectedIds);
                          if(s.has(p.id)) s.delete(p.id); else s.add(p.id);
                          setSelectedIds(s);
                        }} />
                      </td>
                      <td className="p-5">
                        <p className="font-black">{p.name}</p>
                        <p className="text-[9px] font-mono text-blue-500 mt-1 uppercase tracking-widest">{p.code}</p>
                      </td>
                      <td className="p-5"><span className="bg-gray-100 px-3 py-1 rounded-lg font-black">{p.stock}</span></td>
                      <td className="p-5 text-right"><button onClick={() => setProducts(prev => prev.filter(x => x.id !== p.id))} className="text-red-200 hover:text-red-500">🗑️</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {products.length === 0 && <div className="p-20 text-center text-gray-300 font-bold italic">KOSONG. TAMBAHKAN BARANG DI ATAS.</div>}
            </div>
            
            {selectedIds.size > 0 && (
              <div className="fixed bottom-10 left-1/2 -translate-x-1/2 no-print">
                <button onClick={() => setIsPrintMode(true)} className="bg-blue-600 text-white px-10 py-5 rounded-full font-black shadow-2xl animate-bounce">🖨️ CETAK {selectedIds.size} LABEL</button>
              </div>
            )}
          </div>
        )}

        {view === 'transactions' && (
          <div className="space-y-6">
            <h2 className="text-3xl font-black">Log Aktivitas</h2>
            <div className="bg-white rounded-[2rem] border divide-y overflow-hidden shadow-sm">
              {transactions.map(t => (
                <div key={t.id} className="p-6 flex justify-between items-center hover:bg-gray-50">
                  <div className="flex gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-[10px] ${t.type === 'IN' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {t.type}
                    </div>
                    <div>
                      <p className="font-bold">{t.productName}</p>
                      <p className="text-[10px] text-gray-400 font-bold">{new Date(t.timestamp).toLocaleString()} • {t.userName}</p>
                    </div>
                  </div>
                  <p className={`text-xl font-black ${t.type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'IN' ? '+' : '-'}{t.quantity}
                  </p>
                </div>
              ))}
              {transactions.length === 0 && <div className="p-20 text-center text-gray-300 font-bold">BELUM ADA TRANSAKSI</div>}
            </div>
          </div>
        )}
      </main>

      {/* Printer Modal */}
      {isPrintMode && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 no-print">
          <div className="bg-white w-full max-w-xl rounded-[3rem] p-10 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black">Pratinjau Cetak</h3>
              <button onClick={() => setIsPrintMode(false)} className="text-4xl text-gray-300">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {products.filter(p => selectedIds.has(p.id)).map(p => (
                <div key={p.id} className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl">
                  <span className="font-black">{p.name}</span>
                  <div className="flex gap-2 items-center">
                    <button onClick={() => setPrintQuantities(v => ({...v, [p.id]: Math.max(1, (v[p.id]||1)-1)}))} className="w-8 h-8 bg-white border rounded-lg">-</button>
                    <span className="w-6 text-center font-black">{printQuantities[p.id] || 1}</span>
                    <button onClick={() => setPrintQuantities(v => ({...v, [p.id]: (v[p.id]||1)+1}))} className="w-8 h-8 bg-white border rounded-lg">+</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => window.print()} className="mt-8 bg-blue-600 text-white py-6 rounded-3xl font-black text-xl">PRINT SEKARANG</button>
          </div>
        </div>
      )}

      {/* Print Layer */}
      <div className="print-only">
        <div className="grid grid-cols-4 gap-2">
          {products.filter(p => selectedIds.has(p.id)).map(p => (
            Array.from({length: printQuantities[p.id] || 1}).map((_, i) => (
              <div key={`${p.id}-${i}`} className="flex flex-col items-center border p-2 text-center h-[120px] justify-center">
                <p className="text-[7px] font-black uppercase mb-1">{p.name}</p>
                <BarcodeRenderer value={p.code} width={1.2} height={40} />
                <p className="text-[6px] mt-1 font-mono">{p.code}</p>
              </div>
            ))
          ))}
        </div>
      </div>

      {showScanner.active && (
        <Scanner 
          onScan={(code) => {
            const prod = products.find(p => p.code.toUpperCase() === code.toUpperCase());
            if(!prod) return alert("Barang tidak terdaftar!");
            const q = prompt(`PRODUK: ${prod.name}\nStok: ${prod.stock}\n\nMasukkan Jumlah ${showScanner.type}:`, "1");
            if(q) updateStock(code, parseInt(q), showScanner.type!);
          }}
          onClose={() => setShowScanner({ active: false, type: null })} 
        />
      )}
    </div>
  );
};

export default App;
