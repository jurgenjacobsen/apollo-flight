import React, { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface QrCodeViewProps {
    value: string;
    size?: number;
    className?: string;
    darkColor?: string;
    lightColor?: string;
}

export const QrCodeView: React.FC<QrCodeViewProps> = ({
    value,
    size = 200,
    className = "",
    darkColor = "#000000",
    lightColor = "#ffffff",
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!canvasRef.current || !value) return;

        QRCode.toCanvas(
            canvasRef.current,
            value,
            {
                width: size,
                margin: 2,
                color: {
                    dark: darkColor,
                    light: lightColor,
                },
                errorCorrectionLevel: "M",
            },
            (error) => {
                if (error) {
                    console.error("QR Code generation error:", error);
                }
            },
        );
    }, [value, size, darkColor, lightColor]);

    if (!value) {
        return null;
    }

    return (
        <canvas
            ref={canvasRef}
            className={`rounded-xl shadow-md border border-neutral-200 dark:border-neutral-800 ${className}`}
            style={{ width: size, height: size }}
        />
    );
};
