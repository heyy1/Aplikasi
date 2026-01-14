
import React, { useEffect, useRef } from 'react';

interface BarcodeRendererProps {
  value: string;
  width?: number;
  height?: number;
}

const BarcodeRenderer: React.FC<BarcodeRendererProps> = ({ value, width = 2, height = 40 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      // @ts-ignore - JsBarcode is loaded via CDN
      window.JsBarcode(canvasRef.current, value, {
        format: "CODE128",
        width: width,
        height: height,
        displayValue: true
      });
    }
  }, [value, width, height]);

  return <canvas ref={canvasRef} className="max-w-full h-auto" />;
};

export default BarcodeRenderer;
