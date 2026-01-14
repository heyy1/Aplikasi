
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase, ref, set, onValue, push, update, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { User, UserRole, Product, Transaction, TransactionType, Category, ProductType } from './types';
import BarcodeRenderer from './components/BarcodeRenderer';
import Scanner from './components/Scanner';

// ==========================================================
// PENTING: Ganti konfigurasi di bawah ini dengan milik Anda!
// ==========================================================
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
  const [productFilter, setProductFilter] = useState<'all' | 'low'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [printQuantities, setPrintQuantities] = useState<Record<string, number>>({});

  // Sinkronisasi Data Real-time dari Firebase
  useEffect(() => {
    // Referensi ke folder di database
    const categoriesRef = ref(db, 'categories');
    const typesRef = ref(db, 'types');
    const productsRef = ref(db, 'products');
    const transactionsRef = ref(db, 'transactions');

    // Listener otomatis: Jika data di Firebase berubah, UI langsung update
    const unsubCats = onValue(categoriesRef, (snap) => setCategories(snap.val() ? Object.values(snap.val()) : []));
    const unsubTypes = onValue(typesRef, (snap) => setTypes(snap.val() ? Object.values(snap.val()) : []));
    const unsubProds = onValue(productsRef, (snap) => setProducts(snap.val() ? Object.values(snap.val()) : []));
    const unsubTrans = onValue(transactionsRef, (snap) => {
      const data = snap.val();
      const list = data ? Object.values(data) as Transaction[] : [];
      setTransactions(list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    });

    return () => { unsubCats(); unsubTypes(); unsubProds(); unsubTrans(); };
  }, []);

  useEffect(() => {
    localStorage.setItem('inv_session', JSON.stringify(currentUser));
  }, [currentUser]);

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const u = formData.get('username') as string;
    const p = formData.get('password') as string;
    const user = INITIAL_USERS.find(user => user.username === u && user.password === p);
    if (user) setCurrentUser(user);
    else alert('Username atau password salah!');
  };

  const handleLogout = () => { if (window.confirm('Keluar?')) { setCurrentUser(null); setView('login'); } };

  const addProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const categoryId = formData.get('categoryId') as string;
    const typeId = formData.get('typeId') as string;
    const stock = parseInt(formData.get('stock') as string) || 0;

    if (!categoryId || !typeId) return alert("Pilih kategori & jenis!");

    const id = push(ref(db, 'products')).key || Math.random().toString(36).substr(2, 9);
    const newProduct: Product = {
      id,
      code: `BRG-${Date.now().toString().slice(-6)}`,
      name, categoryId, typeId, stock,
      updatedAt: new Date().toISOString()
    };

    await set(ref(db, `products/${id}`), newProduct);
    e.currentTarget.reset();
  };

  const updateProductStock = async (productCode: string, qty: number, type: TransactionType) => {
    const product = products.find(p => p.code.toUpperCase() === productCode.toUpperCase());
    if (!product) return alert("Barang tidak ditemukan!");
    if (type === TransactionType.OUT && (product.stock || 0) < qty) return alert("Stok kurang!");

    const newStock = type === TransactionType.IN ? (product.stock || 0) + qty : (product.stock || 0) - qty;
    const timestamp = new Date().toISOString();

    await update(ref(db, `products/${product.id}`), { stock: newStock, updatedAt: timestamp });

    const transId = push(ref(db, 'transactions')).key;
    await set(ref(db, `transactions/${transId}`), {
      id: transId, productId: product.id, productName: product.name,
      quantity: qty, type, timestamp, userId: currentUser?.id, userName: currentUser?.username
    });

    setShowScanner({ active: false, type: null });
  };

  // Views Components
  const DashboardView = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Cloud Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onClick={() => setShowScanner({ active: true, type: TransactionType.IN })} className="p-8 bg-green-50 border-2 border-green-200 rounded-2xl text-green-700 font-bold text-xl flex flex-col items-center">
          <span className="text-4xl mb-2">📥</span> Masuk
        </button>
        <button onClick={() => setShowScanner({ active: true, type: TransactionType.OUT })} className="p-8 bg-red-50 border-2 border-red-200 rounded-2xl text-red-700 font-bold text-xl flex flex-col items-center">
          <span className="text-4xl mb-2">📤</span> Keluar
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border text-center">
          <p className="text-gray-500 text-[10px] font-bold">STOK TOTAL</p>
          <p className="text-2xl font-black text-blue-600">{products.reduce((acc, p) => acc + (p.stock || 0), 0)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border text-center">
          <p className="text-gray-500 text-[10px] font-bold">ITEM</p>
          <p className="text-2xl font-black text-gray-800">{products.length}</p>
        </div>
      </div>
    </div>
  );

  const SettingsView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white p-6 rounded-xl border">
        <div className="flex justify-between mb-4">
          <h3 className="font-bold">Kategori</h3>
          <button onClick={async () => {
            const n = prompt("Nama:");
            if(n) { const id = 'c'+Date.now(); await set(ref(db, `categories/${id}`), {id, name: n}); }
          }} className="text-blue-600 font-bold text-sm">+ Tambah</button>
        </div>
        {categories.map(c => <div key={c.id} className="flex justify-between p-2 border-b text-sm"><span>{c.name}</span><button onClick={() => remove(ref(db, `categories/${c.id}`))} className="text-red-400">Hapus</button></div>)}
      </div>
      <div className="bg-white p-6 rounded-xl border">
        <div className="flex justify-between mb-4">
          <h3 className="font-bold">Jenis</h3>
          <button onClick={async () => {
            const n = prompt("Nama:");
            if(n) { const id = 't'+Date.now(); await set(ref(db, `types/${id}`), {id, name: n}); }
          }} className="text-purple-600 font-bold text-sm">+ Tambah</button>
        </div>
        {types.map(t => <div key={t.id} className="flex justify-between p-2 border-b text-sm"><span>{t.name}</span><button onClick={() => remove(ref(db, `types/${t.id}`))} className="text-red-400">Hapus</button></div>)}
      </div>
    </div>
  );

  if (!currentUser) return (
    <div className="min-h-screen flex items-center justify-center bg-blue-600 p-6">
      <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-bold mb-6 text-center">Cloud Inventory</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input name="username" type="text" placeholder="Username" required className="w-full px-4 py-2 border rounded-lg" />
          <input name="password" type="password" placeholder="Password" required className="w-full px-4 py-2 border rounded-lg" />
          <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">Login</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-white border-r p-6 space-y-2 no-print">
        <div className="font-bold text-xl text-blue-600 mb-8 flex items-center gap-2">☁️ Cloud Stock</div>
        <nav className="space-y-1">
          <button onClick={() => setView('dashboard')} className={`w-full text-left p-3 rounded-xl ${view === 'dashboard' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500'}`}>📊 Dashboard</button>
          <button onClick={() => setView('products')} className={`w-full text-left p-3 rounded-xl ${view === 'products' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500'}`}>📦 Data Stok</button>
          <button onClick={() => setView('transactions')} className={`w-full text-left p-3 rounded-xl ${view === 'transactions' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500'}`}>📜 Riwayat</button>
          {currentUser.role === UserRole.ADMIN && <button onClick={() => setView('settings')} className={`w-full text-left p-3 rounded-xl ${view === 'settings' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500'}`}>⚙️ Atribut</button>}
          <button onClick={handleLogout} className="w-full text-left p-3 text-red-500 font-medium mt-10">🚪 Keluar</button>
        </nav>
      </aside>

      <main className="flex-1 p-4 md:p-8 no-print">
        {view === 'dashboard' && <DashboardView />}
        {view === 'settings' && <SettingsView />}
        {view === 'products' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Data Barang</h2>
              {selectedIds.size > 0 && <button onClick={() => setIsPrintMode(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">🖨️ Cetak ({selectedIds.size})</button>}
            </div>
            {currentUser.role === UserRole.ADMIN && (
              <form onSubmit={addProduct} className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-white p-4 rounded-xl border">
                <input name="name" required placeholder="Nama" className="border p-2 rounded-lg text-sm" />
                <select name="categoryId" required className="border p-2 rounded-lg text-sm">{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <select name="typeId" required className="border p-2 rounded-lg text-sm">{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                <input name="stock" type="number" defaultValue="0" className="border p-2 rounded-lg text-sm" />
                <button type="submit" className="bg-blue-600 text-white rounded-lg font-bold">Simpan</button>
              </form>
            )}
            <div className="bg-white rounded-xl border overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b"><tr><th className="p-4 w-10"></th><th className="p-4">Produk</th><th className="p-4">Stok</th><th className="p-4 text-right">Aksi</th></tr></thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} className="border-b">
                      <td className="p-4"><input type="checkbox" onChange={() => {
                        const s = new Set(selectedIds);
                        if(s.has(p.id)) s.delete(p.id); else { s.add(p.id); if(!printQuantities[p.id]) setPrintQuantities({...printQuantities, [p.id]:1}); }
                        setSelectedIds(s);
                      }} checked={selectedIds.has(p.id)} /></td>
                      <td className="p-4">
                        <div className="font-bold">{p.name}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{p.code}</div>
                      </td>
                      <td className="p-4 font-black">{p.stock}</td>
                      <td className="p-4 text-right">{currentUser.role === UserRole.ADMIN && <button onClick={() => remove(ref(db, `products/${p.id}`))} className="text-red-400">🗑️</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {view === 'transactions' && (
          <div className="bg-white rounded-xl border overflow-hidden">
            {transactions.map(t => (
              <div key={t.id} className="p-4 border-b flex justify-between items-center">
                <div><p className="font-bold">{t.productName}</p><p className="text-[10px] text-gray-400 uppercase">{new Date(t.timestamp).toLocaleString()}</p></div>
                <div className={`text-lg font-black ${t.type === TransactionType.IN ? 'text-green-600' : 'text-red-600'}`}>{t.type === TransactionType.IN ? '+' : '-'}{t.quantity}</div>
              </div>
            ))}
          </div>
        )}
      </main>

      {isPrintMode && (
        <div className="fixed inset-0 z-50 bg-white md:bg-black/80 flex items-center justify-center no-print">
          <div className="bg-white w-full h-full md:max-w-4xl md:h-[90vh] md:rounded-2xl flex flex-col p-6">
            <div className="flex justify-between mb-4"><h3 className="font-bold">Konfigurasi Cetak</h3><button onClick={() => setIsPrintMode(false)}>Tutup</button></div>
            <div className="flex-1 overflow-y-auto space-y-4">
              {products.filter(p => selectedIds.has(p.id)).map(p => (
                <div key={p.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <p className="font-bold">{p.name}</p>
                  <input type="number" value={printQuantities[p.id] || 1} onChange={(e) => setPrintQuantities({...printQuantities, [p.id]: parseInt(e.target.value) || 1})} className="w-16 p-1 border rounded text-center" />
                </div>
              ))}
            </div>
            <button onClick={() => window.print()} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold mt-4">Print Sekarang</button>
          </div>
        </div>
      )}

      <div className="print-only p-4 grid grid-cols-3 gap-4">
        {products.filter(p => selectedIds.has(p.id)).map(p => (
          Array.from({length: printQuantities[p.id] || 1}).map((_, i) => (
            <div key={`${p.id}-${i}`} className="flex flex-col items-center border p-2">
              <p className="text-[9px] font-bold text-center mb-1">{p.name}</p>
              <BarcodeRenderer value={p.code} width={1} height={40} />
              <p className="text-[8px] mt-1">{p.code}</p>
            </div>
          ))
        ))}
      </div>

      {showScanner.active && (
        <Scanner 
          onScan={(code) => {
            const product = products.find(p => p.code.toUpperCase() === code.toUpperCase());
            if (!product) return alert(`Kode ${code} tidak ada!`);
            const q = prompt(`${product.name}\nStok: ${product.stock}\n\nJumlah:`, "1");
            if(q && !isNaN(parseInt(q))) updateProductStock(code, parseInt(q), showScanner.type!);
          }}
          onClose={() => setShowScanner({ active: false, type: null })} 
        />
      )}
    </div>
  );
};

export default App;
