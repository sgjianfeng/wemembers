import QRCode from "qrcode";

export async function generateQrCodeSvg(text: string, size: number = 200): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    width: size,
    margin: 2,
    color: { dark: "#1A6EFF", light: "#FFFFFF" },
  });
}
