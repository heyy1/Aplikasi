
import React, { useEffect, useRef, useState } from 'react';

interface ScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

const Scanner: React.FC<ScannerProps> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      setLoading(true);
      setError(null);
      try {
        // Mencoba mendapatkan akses kamera belakang
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Pastikan video mulai diputar
          await videoRef.current.play();
        }
        setLoading(false);
      } catch (err: any) {
        setLoading(false);
        console.error("Camera error:", err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError("Izin kamera ditolak. Mohon aktifkan izin kamera di pengaturan browser Anda.");
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError("Kamera tidak ditemukan di perangkat ini.");
        } else {
          setError("Gagal mengakses kamera. Pastikan Anda menggunakan HTTPS atau localhost.");
        }
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleManualInput = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const code = formData.get('code') as string;
    if (code) onScan(code);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-md aspect-square border-2 border-white/30 rounded-lg overflow-hidden bg-gray-900">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            <span className="ml-3">Menghubungkan kamera...</span>
          </div>
        )}
        
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted
          className={`w-full h-full object-cover ${loading ? 'opacity-0' : 'opacity-100'}`} 
        />
        
        <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
           <div className="w-full h-full border-2 border-green-500 rounded-md shadow-[0_0_15px_rgba(34,197,94,0.5)]"></div>
        </div>
      </div>
      
      <div className="mt-6 w-full max-w-md text-center">
        {!error && <p className="text-white mb-4 text-sm opacity-80">Arahkan kotak hijau ke barcode barang</p>}
        
        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-200 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleManualInput} className="flex gap-2 mb-6">
          <input 
            name="code"
            type="text" 
            placeholder="Ketik kode barang manual..." 
            className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
            autoFocus
          />
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold transition-colors">Input</button>
        </form>

        <button 
          onClick={onClose}
          className="bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-xl font-medium transition-colors"
        >
          Tutup Scanner
        </button>
      </div>
    </div>
  );
};

export default Scanner;
